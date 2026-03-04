import { EventEmitter } from "events";
import Conf from "conf";
import PusherClient from "pusher-js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { SeedstrClient } from "../api/client.js";
import { getConfig, configStore } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { cleanupProject } from "../tools/projectBuilder.js";
import { runPipeline } from "../pipeline/index.js";
import { estimateCost, checkBudgetSufficient } from "../config/modelCosts.js";
import type { PipelineStepName } from "../pipeline/types.js";
import type { Job, AgentEvent, TokenUsage, FileAttachment, WebSocketJobEvent } from "../types/index.js";

interface TypedEventEmitter {
  on(event: "event", listener: (event: AgentEvent) => void): this;
  emit(event: "event", data: AgentEvent): boolean;
}

// WebSocket job event validation schema
const WebSocketJobEventSchema = z.object({
  jobId: z.string(),
  prompt: z.string(),
  budget: z.number(),
  jobType: z.enum(["STANDARD", "SWARM"]),
  maxAgents: z.number().nullable(),
  budgetPerAgent: z.number().nullable(),
  requiredSkills: z.array(z.string()),
  expiresAt: z.string(),
});

// Exponential backoff delay calculator
function getRetryDelay(attempt: number, baseDelayMs: number = 1000, maxDelayMs: number = 30000): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  const jitter = delay * 0.1 * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

// Persistent storage for processed jobs with timestamps
const jobStore = new Conf<{ processedJobs: Array<{ id: string; timestamp: number }> }>({
  projectName: "seed-agent",
  projectVersion: "1.0.0",
  configName: "jobs",
  defaults: {
    processedJobs: [],
  },
});

// Persistent storage for failed jobs with retry tracking
const failedJobsStore = new Conf<{
  failedJobs: Array<{ id: string; jobData: Job; error: string; failedAt: number; retryCount: number }>;
}>({
  projectName: "seed-agent",
  projectVersion: "1.0.0",
  configName: "failed-jobs",
  defaults: {
    failedJobs: [],
  },
});

// Persistent storage for submitted responses to track feedback
const submittedResponsesStore = new Conf<{
  responses: Array<{
    jobId: string;
    responseId: string;
    submittedAt: number;
    status: "PENDING" | "ACCEPTED" | "REJECTED";
    lastChecked?: number;
  }>;
}>({
  projectName: "seed-agent",
  projectVersion: "1.0.0",
  configName: "submitted-responses",
  defaults: {
    responses: [],
  },
});

/**
 * Circuit breaker for API resilience - tracks errors and backs off if service is degraded
 */
class CircuitBreaker {
  private errorCount = 0;
  private lastErrorTime = 0;
  private consecutiveErrors = 0;
  private isOpen = false;
  private backoffMultiplier = 1;

  private readonly errorThreshold = 5; // Open circuit after 5 errors
  private readonly resetTimeout = 60000; // Reset after 1 minute
  private readonly maxBackoff = 30000; // Max 30 second backoff

  /**
   * Record an API error
   */
  recordError(): void {
    this.lastErrorTime = Date.now();
    this.errorCount++;
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.errorThreshold) {
      this.isOpen = true;
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, this.maxBackoff / 1000);
      logger.warn(`Circuit breaker OPEN after ${this.consecutiveErrors} consecutive errors`);
    }
  }

  /**
   * Record a successful API call (resets backoff)
   */
  recordSuccess(): void {
    if (this.consecutiveErrors > 0) {
      logger.info("Circuit breaker: API recovered, resetting error counter");
    }
    this.consecutiveErrors = 0;
    this.isOpen = false;
    this.backoffMultiplier = 1;
  }

  /**
   * Check if circuit is open and apply backoff if needed
   * @returns true if request should proceed, false if should wait
   */
  async checkAndWait(): Promise<boolean> {
    // Try to recover from open circuit if timeout has passed
    if (this.isOpen && Date.now() - this.lastErrorTime > this.resetTimeout) {
      logger.info("Circuit breaker: Attempting recovery after timeout");
      this.isOpen = false;
      this.consecutiveErrors = 0;
      this.backoffMultiplier = 1;
    }

    if (this.isOpen) {
      const backoffMs = 1000 * this.backoffMultiplier + Math.random() * 1000;
      logger.warn(
        `Circuit breaker: Backing off for ${Math.ceil(backoffMs)}ms (attempt ${this.consecutiveErrors})`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
      return false;
    }

    return true;
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    isOpen: boolean;
    errorCount: number;
    consecutiveErrors: number;
    backoffMultiplier: number;
  } {
    return {
      isOpen: this.isOpen,
      errorCount: this.errorCount,
      consecutiveErrors: this.consecutiveErrors,
      backoffMultiplier: this.backoffMultiplier,
    };
  }
}

// Global circuit breaker instance for API resilience
const apiCircuitBreaker = new CircuitBreaker();

/**
 * Main agent runner that polls for jobs and processes them.
 * Supports v2 API with WebSocket (Pusher) for real-time job notifications.
 */
export class AgentRunner extends EventEmitter implements TypedEventEmitter {
  private client: SeedstrClient;
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private wsRetryTimer: NodeJS.Timeout | null = null;
  private processingJobs: Set<string> = new Set();
  private processedJobs: Set<string>;
  private pusher: PusherClient | null = null;
  private wsConnected = false;
  private wsRetryAttempt = 0;
  private stats = {
    jobsProcessed: 0,
    jobsSkipped: 0,
    errors: 0,
    startTime: Date.now(),
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
  };

  constructor() {
    super();
    this.client = new SeedstrClient();

    // Load previously processed jobs from persistent storage (max 7 days old)
    const stored = jobStore.get("processedJobs") || [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Filter out jobs older than 7 days
    const validJobs = stored.filter((job) => job.timestamp > sevenDaysAgo);
    this.processedJobs = new Set(validJobs.map((job) => job.id));

    // Save cleaned up list back to store
    if (validJobs.length !== stored.length) {
      logger.info(`Cleaned up ${stored.length - validJobs.length} stale job records`);
      jobStore.set("processedJobs", validJobs);
    }

    logger.debug(`Loaded ${this.processedJobs.size} processed jobs from storage`);
  }

  private markJobProcessed(jobId: string): void {
    this.processedJobs.add(jobId);

    // Store with timestamp for time-based cleanup
    const stored = jobStore.get("processedJobs") || [];
    const updated = stored.filter((job) => job.id !== jobId); // Remove if exists
    updated.push({ id: jobId, timestamp: Date.now() });

    // Keep only the last 10000 jobs with timestamps (much more efficient than the old approach)
    if (updated.length > 10000) {
      const kept = updated.slice(-10000);
      jobStore.set("processedJobs", kept);
    } else {
      jobStore.set("processedJobs", updated);
    }
  }

  /**
   * Track a failed job for potential retry
   */
  private recordFailedJob(job: Job, error: string): void {
    const stored = failedJobsStore.get("failedJobs") || [];
    const existing = stored.find((j) => j.id === job.id);

    if (existing) {
      existing.retryCount++;
      existing.error = error;
      existing.failedAt = Date.now();
    } else {
      stored.push({
        id: job.id,
        jobData: job,
        error,
        failedAt: Date.now(),
        retryCount: 1,
      });
    }

    // Keep only last 100 failed jobs
    if (stored.length > 100) {
      failedJobsStore.set("failedJobs", stored.slice(-100));
    } else {
      failedJobsStore.set("failedJobs", stored);
    }

    logger.debug(`Recorded failed job ${job.id} for retry (attempt ${existing?.retryCount ?? 1})`);
  }

  /**
   * Get a failed job by ID for retry
   */
  getFailedJob(jobId: string): Job | undefined {
    const stored = failedJobsStore.get("failedJobs") || [];
    const failedJob = stored.find((j) => j.id === jobId);
    return failedJob?.jobData;
  }

  /**
   * Retry a previously failed job
   */
  async retryFailedJob(jobId: string): Promise<void> {
    const failedJobRecord = (failedJobsStore.get("failedJobs") || []).find((j) => j.id === jobId);

    if (!failedJobRecord) {
      throw new Error(`Failed job ${jobId} not found in history`);
    }

    logger.info(
      `Retrying job ${jobId} (previous attempt ${failedJobRecord.retryCount}, error: ${failedJobRecord.error.substring(0, 100)})`
    );

    this.emitEvent({
      type: "job_found",
      job: failedJobRecord.jobData,
    });

    await this.processJob(failedJobRecord.jobData, false);

    // Remove from failed list on success (will be re-added if it fails again)
  }

  /**
   * List all failed jobs available for retry
   */
  getFailedJobs(): Array<{ id: string; error: string; failedAt: number; retryCount: number }> {
    return (failedJobsStore.get("failedJobs") || []).map((j) => ({
      id: j.id,
      error: j.error,
      failedAt: j.failedAt,
      retryCount: j.retryCount,
    }));
  }

  /**
   * Clear a failed job from retry history
   */
  clearFailedJob(jobId: string): void {
    const stored = failedJobsStore.get("failedJobs") || [];
    const filtered = stored.filter((j) => j.id !== jobId);
    failedJobsStore.set("failedJobs", filtered);
    logger.debug(`Cleared failed job ${jobId} from retry history`);
  }

  /**
   * Track a submitted response for feedback monitoring
   */
  private recordSubmittedResponse(jobId: string, responseId: string): void {
    const stored = submittedResponsesStore.get("responses") || [];

    // Remove if already exists (to update)
    const filtered = stored.filter((r) => r.responseId !== responseId);

    filtered.push({
      jobId,
      responseId,
      submittedAt: Date.now(),
      status: "PENDING",
    });

    // Keep only last 500 responses
    if (filtered.length > 500) {
      submittedResponsesStore.set("responses", filtered.slice(-500));
    } else {
      submittedResponsesStore.set("responses", filtered);
    }

    logger.debug(`Recorded submitted response ${responseId} for job ${jobId}`);
  }

  /**
   * Check feedback status for all submitted responses
   * Updates cache and emits events for accepted/rejected responses
   */
  async checkResponseFeedback(): Promise<void> {
    const stored = submittedResponsesStore.get("responses") || [];
    const now = Date.now();

    for (const response of stored) {
      // Skip if checked recently (within 1 hour)
      if (response.lastChecked && now - response.lastChecked < 3600000) {
        continue;
      }

      try {
        const status = await this.client.getResponseStatus(response.jobId, response.responseId);

        if (status.status !== response.status) {
          response.status = status.status;
          response.lastChecked = now;

          if (status.status === "ACCEPTED") {
            logger.info(`Response ${response.responseId} was ACCEPTED by customer`);
            this.emitEvent({
              type: "response_accepted",
              message: `Response ${response.responseId} accepted`,
              metadata: { jobId: response.jobId, responseId: response.responseId },
            });
          } else if (status.status === "REJECTED") {
            logger.warn(`Response ${response.responseId} was REJECTED by customer`);
            this.emitEvent({
              type: "response_rejected",
              message: `Response ${response.responseId} rejected`,
              metadata: { jobId: response.jobId, responseId: response.responseId },
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.debug(`Failed to check response feedback for ${response.responseId}: ${msg}`);
        // Don't fail the entire check if one response fails
      }
    }

    // Save updated responses
    submittedResponsesStore.set("responses", stored);
  }

  /**
   * Get all submitted responses with their current feedback status
   */
  getSubmittedResponses(): Array<{
    jobId: string;
    responseId: string;
    submittedAt: number;
    status: "PENDING" | "ACCEPTED" | "REJECTED";
    ageDays: number;
  }> {
    const stored = submittedResponsesStore.get("responses") || [];
    const now = Date.now();

    return stored.map((r) => ({
      jobId: r.jobId,
      responseId: r.responseId,
      submittedAt: r.submittedAt,
      status: r.status,
      ageDays: Math.floor((now - r.submittedAt) / (1000 * 60 * 60 * 24)),
    }));
  }

  private emitEvent(event: AgentEvent): void {
    this.emit("event", event);
  }

  /**
   * Helper: Extract effective budget considering SWARM job type
   */
  private getEffectiveBudget(job: Job): number {
    return job.jobType === "SWARM" && job.budgetPerAgent ? job.budgetPerAgent : job.budget;
  }

  /**
   * Helper: Check if job meets budget minimum and emit appropriate events
   * @returns true if job should be processed, false if skipped
   */
  private checkJobBudget(job: Job): boolean {
    const config = getConfig();
    const effectiveBudget = this.getEffectiveBudget(job);

    if (effectiveBudget < config.minBudget) {
      this.emitEvent({
        type: "job_skipped",
        job,
        reason: `Budget $${effectiveBudget} below minimum $${config.minBudget}`,
      });
      this.markJobProcessed(job.id);
      this.stats.jobsSkipped++;
      return false;
    }

    // Check cost prediction (estimate if budget will be sufficient)
    const models = {
      planner: config.plannerModel ?? config.model,
      builder: config.builderModel ?? config.model,
      verifier: config.verifierModel ?? config.model,
    };

    const budgetCheck = checkBudgetSufficient(job.prompt, effectiveBudget, models);

    if (!budgetCheck.isAffordable) {
      this.emitEvent({
        type: "job_skipped",
        job,
        reason: `Estimated cost $${budgetCheck.estimatedCost.toFixed(4)} exceeds budget $${effectiveBudget.toFixed(2)}`,
      });
      this.markJobProcessed(job.id);
      this.stats.jobsSkipped++;
      return false;
    }

    if (budgetCheck.warningMessage) {
      logger.warn(`Job ${job.id}: ${budgetCheck.warningMessage}`);
    }

    return true;
  }

  // ─────────────────────────────────────────
  // WebSocket (Pusher) connection
  // ─────────────────────────────────────────

  private connectWebSocket(): void {
    const config = getConfig();

    if (!config.useWebSocket) {
      logger.info("WebSocket disabled by config, using polling only");
      return;
    }

    if (!config.pusherKey) {
      logger.warn("PUSHER_KEY not set — WebSocket disabled, falling back to polling");
      return;
    }

    const agentId = configStore.get("agentId") || process.env.AGENT_ID;
    if (!agentId) {
      logger.warn("Agent ID not found — cannot subscribe to WebSocket channel");
      return;
    }

    try {
      this.pusher = new PusherClient(config.pusherKey, {
        cluster: config.pusherCluster,
        channelAuthorization: {
          endpoint: `${config.seedstrApiUrlV2}/pusher/auth`,
          transport: "ajax",
          headers: {
            Authorization: `Bearer ${config.seedstrApiKey}`,
          },
        },
      });

      this.pusher.connection.bind("connected", () => {
        this.wsConnected = true;
        this.wsRetryAttempt = 0; // Reset retry counter on successful connection
        this.emitEvent({ type: "websocket_connected" });
        logger.info("WebSocket connected to Pusher");
      });

      this.pusher.connection.bind("disconnected", () => {
        this.wsConnected = false;
        this.emitEvent({ type: "websocket_disconnected", reason: "disconnected" });
        logger.warn("WebSocket disconnected");
        this.scheduleWebSocketReconnect();
      });

      this.pusher.connection.bind("error", (err: unknown) => {
        this.wsConnected = false;
        logger.error("WebSocket error:", err);
        this.emitEvent({ type: "websocket_disconnected", reason: "error" });
        this.scheduleWebSocketReconnect();
      });

      const channel = this.pusher.subscribe(`private-agent-${agentId}`);

      channel.bind("pusher:subscription_succeeded", () => {
        logger.info(`Subscribed to private-agent-${agentId}`);
      });

      channel.bind("pusher:subscription_error", (err: unknown) => {
        logger.error("Channel subscription error:", err);
        // Schedule retry instead of giving up
        this.scheduleWebSocketReconnect();
      });

      channel.bind("job:new", (data: unknown) => {
        // Validate incoming data against schema
        const validationResult = WebSocketJobEventSchema.safeParse(data);
        if (!validationResult.success) {
          logger.error(
            `Invalid WebSocket job event: ${JSON.stringify(validationResult.error.errors)}`
          );
          return;
        }

        const jobEvent = validationResult.data;
        logger.info(`[WS] New job received: ${jobEvent.jobId} ($${jobEvent.budget})`);
        this.emitEvent({ type: "websocket_job", jobId: jobEvent.jobId });
        this.handleWebSocketJob(jobEvent);
      });
    } catch (err) {
      logger.error("Failed to initialize Pusher:", err);
      logger.warn("Falling back to polling only");
      this.scheduleWebSocketReconnect();
    }
  }

  /**
   * Schedule WebSocket reconnection with exponential backoff
   */
  private scheduleWebSocketReconnect(): void {
    if (!this.running) return;

    // Clear any existing retry timer
    if (this.wsRetryTimer) {
      clearTimeout(this.wsRetryTimer);
    }

    const delay = getRetryDelay(this.wsRetryAttempt);
    this.wsRetryAttempt++;

    logger.info(
      `Scheduling WebSocket reconnection in ${delay}ms (attempt ${this.wsRetryAttempt})`
    );

    this.wsRetryTimer = setTimeout(() => {
      logger.info(`WebSocket reconnection attempt #${this.wsRetryAttempt}`);
      this.disconnectWebSocket();
      this.connectWebSocket();
    }, delay);
  }

  private async handleWebSocketJob(event: WebSocketJobEvent): Promise<void> {
    const config = getConfig();

    if (this.processingJobs.has(event.jobId) || this.processedJobs.has(event.jobId)) {
      return;
    }

    if (this.processingJobs.size >= config.maxConcurrentJobs) {
      logger.debug(`[WS] At capacity, skipping job ${event.jobId}`);
      return;
    }

    // Check budget on the event data before fetching full job
    const effectiveBudget = event.jobType === "SWARM" && event.budgetPerAgent ? event.budgetPerAgent : event.budget;
    if (effectiveBudget < config.minBudget) {
      logger.debug(`[WS] Job ${event.jobId} budget $${effectiveBudget} below minimum $${config.minBudget}`);
      this.markJobProcessed(event.jobId);
      this.stats.jobsSkipped++;
      return;
    }

    try {
      const job = await this.client.getJobV2(event.jobId);
      this.emitEvent({ type: "job_found", job });

      if (job.jobType === "SWARM") {
        await this.acceptAndProcessSwarmJob(job);
      } else {
        this.processJob(job).catch((error) => {
          this.emitEvent({
            type: "error",
            message: `Failed to process job ${job.id}`,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        });
      }
    } catch (error) {
      logger.error(`[WS] Failed to handle job ${event.jobId}:`, error);
      this.stats.errors++;
    }
  }

  private disconnectWebSocket(): void {
    if (this.wsRetryTimer) {
      clearTimeout(this.wsRetryTimer);
      this.wsRetryTimer = null;
    }
    if (this.pusher) {
      this.pusher.disconnect();
      this.pusher = null;
      this.wsConnected = false;
    }
  }

  // ─────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Agent is already running");
      return;
    }

    this.running = true;
    this.stats.startTime = Date.now();
    this.emitEvent({ type: "startup" });

    this.connectWebSocket();
    await this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.disconnectWebSocket();
    this.emitEvent({ type: "shutdown" });
  }

  // ─────────────────────────────────────────
  // Polling
  // ─────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running) return;

    const config = getConfig();

    try {
      // Check circuit breaker before attempting API call
      await apiCircuitBreaker.checkAndWait();

      this.emitEvent({ type: "polling", jobCount: this.processingJobs.size });

      const response = await this.client.listJobsV2(20, 0);
      this.recordAPISuccess(); // Mark as successful
      const jobs = response.jobs;

      for (const job of jobs) {
        if (this.processingJobs.has(job.id) || this.processedJobs.has(job.id)) {
          continue;
        }

        if (this.processingJobs.size >= config.maxConcurrentJobs) {
          break;
        }

        // Use extracted helper to check budget
        if (!this.checkJobBudget(job)) {
          continue;
        }

        this.emitEvent({ type: "job_found", job });

        if (job.jobType === "SWARM") {
          this.acceptAndProcessSwarmJob(job).catch((error) => {
            this.emitEvent({
              type: "error",
              message: `Failed to process swarm job ${job.id}`,
              error: error instanceof Error ? error : new Error(String(error)),
            });
            this.recordAPIError("acceptAndProcessSwarmJob", error instanceof Error ? error : new Error(String(error)));
          });
        } else {
          this.processJob(job).catch((error) => {
            this.emitEvent({
              type: "error",
              message: `Failed to process job ${job.id}`,
              error: error instanceof Error ? error : new Error(String(error)),
            });
            this.recordAPIError("processJob", error instanceof Error ? error : new Error(String(error)));
          });
        }
      }
    } catch (error) {
      this.recordAPIError("poll", error instanceof Error ? error : new Error(String(error)));
      this.emitEvent({
        type: "error",
        message: "Failed to poll for jobs",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.stats.errors++;
    }

    if (this.running) {
      const interval = this.wsConnected
        ? config.pollInterval * 3 * 1000
        : config.pollInterval * 1000;
      this.pollTimer = setTimeout(() => this.poll(), interval);
    }
  }

  // ─────────────────────────────────────────
  // Swarm job handling
  // ─────────────────────────────────────────

  private async acceptAndProcessSwarmJob(job: Job): Promise<void> {
    try {
      const result = await this.client.acceptJob(job.id);

      this.emitEvent({
        type: "job_accepted",
        job,
        budgetPerAgent: result.acceptance.budgetPerAgent,
      });

      logger.info(
        `Accepted swarm job ${job.id} — ${result.slotsRemaining} slots remaining, ` +
          `deadline: ${result.acceptance.responseDeadline}`
      );

      await this.processJob(job, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("job_full") || msg.includes("All agent slots")) {
        logger.debug(`Swarm job ${job.id} is full, skipping`);
        this.markJobProcessed(job.id);
        this.stats.jobsSkipped++;
      } else if (msg.includes("already accepted")) {
        logger.debug(`Already accepted swarm job ${job.id}`);
      } else {
        throw error;
      }
    }
  }

  // ─────────────────────────────────────────
  // Job processing
  // ─────────────────────────────────────────

  private async processJob(job: Job, useV2Submit = false): Promise<void> {
    this.processingJobs.add(job.id);
    this.emitEvent({ type: "job_processing", job });

    try {
      const config = getConfig();
      const effectiveBudget =
        job.jobType === "SWARM" && job.budgetPerAgent ? job.budgetPerAgent : job.budget;

      const result = await runPipeline({
        jobPrompt: job.prompt,
        budget: effectiveBudget,
        onStepComplete: (step: PipelineStepName, data) => {
          const { durationMs, fileCount, issuesCount } = data;
          if (step === "planner") {
            this.emitEvent({ type: "plan_complete", job, durationMs });
          } else if (step === "builder") {
            this.emitEvent({ type: "build_complete", job, durationMs, fileCount });
          } else if (step === "verifier") {
            this.emitEvent({ type: "verify_complete", job, durationMs, issuesCount });
          }
        },
      });

      // Cost tracking: text tasks use textResponseModel, everything else uses builderModel
      const modelForCost =
        result.mode === "text"
          ? config.textResponseModel ?? config.model
          : config.builderModel ?? config.model;

      let usage: TokenUsage | undefined;
      if (
        result.totalUsage &&
        (result.totalUsage.promptTokens > 0 || result.totalUsage.completionTokens > 0)
      ) {
        const cost = estimateCost(
          modelForCost,
          result.totalUsage.promptTokens,
          result.totalUsage.completionTokens
        );
        usage = {
          promptTokens: result.totalUsage.promptTokens,
          completionTokens: result.totalUsage.completionTokens,
          totalTokens: result.totalUsage.totalTokens,
          estimatedCost: cost,
        };
        this.stats.totalPromptTokens += result.totalUsage.promptTokens;
        this.stats.totalCompletionTokens += result.totalUsage.completionTokens;
        this.stats.totalTokens += result.totalUsage.totalTokens;
        this.stats.totalCost += cost;
      }

      this.emitEvent({
        type: "response_generated",
        job,
        preview: result.textResponse.substring(0, 200),
        usage,
      });

      // Upload and submit for any mode that produced files
      if (result.mode !== "text" && result.zipPath && result.projectDir) {
        const fileList = result.files?.map((f) => f.path) ?? [];
        this.emitEvent({
          type: "project_built",
          job,
          files: fileList,
          zipPath: result.zipPath,
        });

        try {
          // Retry upload up to 3 times with increasing delays (5s, 10s, 20s)
          let uploadedFile: FileAttachment | undefined;
          const uploadRetries = 3;
          for (let attempt = 1; attempt <= uploadRetries; attempt++) {
            try {
              this.emitEvent({ type: "files_uploading", job, fileCount: 1 });
              uploadedFile = await this.client.uploadFile(result.zipPath);
              this.emitEvent({ type: "files_uploaded", job, files: [uploadedFile] });
              break; // success
            } catch (uploadAttemptError) {
              const uploadAttemptMsg = uploadAttemptError instanceof Error ? uploadAttemptError.message : String(uploadAttemptError);
              if (uploadAttemptMsg.includes("already submitted")) {
                logger.debug(`Job ${job.id} was already submitted (detected during file upload), skipping`);
                uploadedFile = undefined;
                break;
              }
              if (attempt < uploadRetries) {
                const delayMs = 5000 * attempt; // 5s, 10s
                logger.warn(`Upload attempt ${attempt}/${uploadRetries} failed for job ${job.id}: ${uploadAttemptMsg}. Retrying in ${delayMs / 1000}s...`);
                await new Promise((r) => setTimeout(r, delayMs));
              } else {
                throw uploadAttemptError; // exhausted retries — fall through to text-only
              }
            }
          }

          if (!uploadedFile) {
            // Already-submitted case — nothing more to do
          } else {
            let submitResult;
            if (useV2Submit) {
              submitResult = await this.client.submitResponseV2(
                job.id,
                result.textResponse,
                "FILE",
                [uploadedFile]
              );
            } else {
              submitResult = await this.client.submitResponseWithFiles(job.id, {
                content: result.textResponse,
                responseType: "FILE",
                files: [uploadedFile],
              });
            }

            this.emitEvent({
              type: "response_submitted",
              job,
              responseId: submitResult.response.id,
              hasFiles: true,
            });
            this.recordSubmittedResponse(job.id, submitResult.response.id);
          }
        } catch (uploadError) {
          const uploadErrorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
          if (uploadErrorMsg.includes("already submitted")) {
            logger.debug(`Job ${job.id} was already submitted (detected during file upload), skipping`);
          } else {
            logger.warn(`All upload attempts failed for job ${job.id}, submitting text-only: ${uploadErrorMsg}`);
            const submitResult = useV2Submit
              ? await this.client.submitResponseV2(job.id, result.textResponse)
              : await this.client.submitResponse(job.id, result.textResponse);
            this.emitEvent({
              type: "response_submitted",
              job,
              responseId: submitResult.response.id,
              hasFiles: false,
            });
            this.recordSubmittedResponse(job.id, submitResult.response.id);
          }
        } finally {
          cleanupProject(result.projectDir, result.zipPath);
        }
      } else {
        const submitResult = useV2Submit
          ? await this.client.submitResponseV2(job.id, result.textResponse)
          : await this.client.submitResponse(job.id, result.textResponse);
        this.emitEvent({
          type: "response_submitted",
          job,
          responseId: submitResult.response.id,
          hasFiles: false,
        });
        this.recordSubmittedResponse(job.id, submitResult.response.id);
      }

      this.stats.jobsProcessed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("already submitted")) {
        logger.debug(`Already responded to job ${job.id}, skipping`);
      } else {
        // Record as failed job for potential retry
        this.recordFailedJob(job, errorMessage);

        this.emitEvent({
          type: "error",
          message: `Error processing job ${job.id}: ${errorMessage}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        this.stats.errors++;
      }
    } finally {
      this.processingJobs.delete(job.id);
      this.markJobProcessed(job.id);
    }
  }

  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      activeJobs: this.processingJobs.size,
      wsConnected: this.wsConnected,
      avgTokensPerJob:
        this.stats.jobsProcessed > 0
          ? Math.round(this.stats.totalTokens / this.stats.jobsProcessed)
          : 0,
      avgCostPerJob:
        this.stats.jobsProcessed > 0
          ? this.stats.totalCost / this.stats.jobsProcessed
          : 0,
    };
  }

  /**
   * Get circuit breaker status (API resilience)
   */
  getCircuitBreakerStatus() {
    return apiCircuitBreaker.getStatus();
  }

  /**
   * Record an API error for circuit breaker tracking
   */
  private recordAPIError(context: string, error: Error): void {
    apiCircuitBreaker.recordError();
    logger.error(`API error in ${context}: ${error.message}`);
  }

  /**
   * Record successful API call to reset circuit breaker
   */
  private recordAPISuccess(): void {
    apiCircuitBreaker.recordSuccess();
  }

  isRunning(): boolean {
    return this.running;
  }
}

export default AgentRunner;