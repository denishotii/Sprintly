import chalk from "chalk";
import { AgentRunner } from "../../agent/runner.js";
import { logger } from "../../utils/logger.js";
import {
  getConfig,
  isRegistered,
  validateConfig,
} from "../../config/index.js";

interface RetryJobOptions {
  jobId?: string;
  list?: boolean;
}

export async function retryJobCommand(options: RetryJobOptions): Promise<void> {
  // Pre-flight checks
  const config = getConfig();
  const configErrors = validateConfig(config);

  if (configErrors.length > 0) {
    console.log(chalk.red("\n✗ Configuration errors:"));
    for (const error of configErrors) {
      console.log(chalk.red(`  • ${error}`));
    }
    console.log(chalk.gray("\nPlease check your .env file"));
    process.exit(1);
  }

  if (!isRegistered()) {
    console.log(chalk.red("\n✗ Agent is not registered"));
    console.log(chalk.gray("  Run `npm run register` first"));
    process.exit(1);
  }

  const runner = new AgentRunner();

  // If --list flag, show failed jobs
  if (options.list) {
    const failedJobs = runner.getFailedJobs();

    if (failedJobs.length === 0) {
      console.log(chalk.green("\n✓ No failed jobs in history\n"));
      return;
    }

    console.log(chalk.cyan("\n📋 Failed Jobs Available for Retry:\n"));
    console.log(chalk.gray("ID".padEnd(20) + "Retries".padEnd(10) + "Last Error"));
    console.log(chalk.gray("─".repeat(80)));

    for (const job of failedJobs) {
      const errorPreview = job.error.substring(0, 40) + (job.error.length > 40 ? "..." : "");
      console.log(
        chalk.dim(job.id.padEnd(20)) +
        chalk.yellow(job.retryCount.toString().padEnd(10)) +
        chalk.red(errorPreview)
      );
    }
    console.log();
    return;
  }

  // Retry specific job
  if (!options.jobId) {
    console.log(chalk.red("\n✗ Please provide a job ID or use --list to see available jobs"));
    console.log(chalk.gray("  Usage: npm run retry-job -- <jobId>"));
    console.log(chalk.gray("         npm run retry-job -- --list\n"));
    process.exit(1);
  }

  try {
    const failedJob = runner.getFailedJob(options.jobId);
    if (!failedJob) {
      console.log(chalk.red(`\n✗ Job ${options.jobId} not found in failed jobs history\n`));
      console.log(chalk.gray("Use --list to see available failed jobs\n"));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n🔄 Retrying job ${options.jobId}...\n`));

    let isProcessing = true;
    let successCount = 0;
    let errorCount = 0;

    runner.on("event", (event) => {
      switch (event.type) {
        case "job_processing":
          console.log(chalk.blue(`▶ Processing: ${event.job.prompt.substring(0, 60)}...`));
          break;
        case "response_generated":
          console.log(chalk.green(`✓ Response generated (${event.preview?.substring(0, 40)}...)`));
          break;
        case "response_submitted":
          console.log(chalk.green(`✓ Response submitted (ID: ${event.responseId})`));
          successCount++;
          isProcessing = false;
          break;
        case "error":
          console.log(chalk.red(`✗ Error: ${event.message}`));
          errorCount++;
          isProcessing = false;
          break;
      }
    });

    await runner.retryFailedJob(options.jobId);

    // Wait for processing to complete
    let timeout = 0;
    while (isProcessing && timeout < 300000) {
      // 5 minute timeout
      await new Promise((r) => setTimeout(r, 100));
      timeout += 100;
    }

    if (successCount > 0) {
      console.log(chalk.green(`\n✓ Job retry completed successfully`));
      runner.clearFailedJob(options.jobId);
    } else {
      console.log(chalk.yellow(`\n⚠ Job retry completed but failed. Check logs for details`));
    }
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`\n✗ Failed to retry job: ${message}\n`));
    process.exit(1);
  }
}
