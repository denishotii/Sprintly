/**
 * Lightweight concurrency guard for in-flight job slots.
 *
 * Tracks which jobs are CURRENTLY BEING PROCESSED and enforces a max
 * concurrent limit. Replaces `processingJobs: Set<string>` in AgentRunner.
 *
 * Scope: active jobs only (in-flight right now).
 * Out of scope: `processedJobs` (the persisted Conf set that prevents
 * re-processing across restarts) — that remains a separate concern in runner.ts.
 *
 * Drop-in replacement mapping for runner.ts:
 *   processingJobs.add(id)                        → gate.tryEnter(id)  [also checks capacity]
 *   processingJobs.delete(id)                     → gate.exit(id)
 *   processingJobs.has(id)                        → gate.has(id)
 *   processingJobs.size >= config.maxConcurrentJobs → gate.atCapacity()
 *   processingJobs.size                           → gate.size()         [for getStats()]
 */
export class CapacityGate {
  private active = new Set<string>();

  constructor(private readonly limit: number) {}

  /** Number of jobs currently in flight. */
  size(): number {
    return this.active.size;
  }

  /** Whether a job id is currently being processed. */
  has(id: string): boolean {
    return this.active.has(id);
  }

  /** Whether the in-flight count has reached the configured limit. */
  atCapacity(): boolean {
    return this.active.size >= this.limit;
  }

  /**
   * Try to reserve a slot for the given job id.
   *
   * Returns false (without adding) if:
   *   - The id is already active (duplicate)
   *   - We're at max capacity
   *
   * Returns true and marks the id as active otherwise.
   *
   * Note: does NOT check processedJobs — callers must still guard against
   * already-completed jobs using the separate persistent set in runner.ts.
   */
  tryEnter(id: string): boolean {
    if (this.has(id) || this.atCapacity()) return false;
    this.active.add(id);
    return true;
  }

  /**
   * Release the slot for the given job id.
   * Safe to call even if the id was never entered (no-op).
   */
  exit(id: string): void {
    this.active.delete(id);
  }
}

export default CapacityGate;
