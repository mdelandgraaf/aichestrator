import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { Subtask, SubtaskResult } from '../config/schema.js';
import { createLogger, Logger } from '../utils/logger.js';

export interface QueuedSubtask {
  subtask: Subtask;
  taskId: string;
  priority: number;
}

export interface TaskQueueConfig {
  redisUrl: string;
  concurrency: number;
}

export class TaskQueue {
  private queue: Queue<QueuedSubtask>;
  private worker: Worker<QueuedSubtask, SubtaskResult> | null = null;
  private events: QueueEvents;
  private connection: Redis;
  private logger: Logger;
  private isProcessing: boolean = false;

  constructor(config: TaskQueueConfig) {
    this.logger = createLogger('task-queue');
    this.connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

    this.queue = new Queue<QueuedSubtask>('aichestrator:subtasks', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000
        },
        removeOnFail: {
          age: 86400 // Keep failed jobs for 24 hours
        }
      }
    });

    this.events = new QueueEvents('aichestrator:subtasks', {
      connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null })
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.events.on('completed', ({ jobId }) => {
      this.logger.debug({ jobId }, 'Job completed');
    });

    this.events.on('failed', ({ jobId, failedReason }) => {
      this.logger.error({ jobId, reason: failedReason }, 'Job failed');
    });

    this.events.on('stalled', ({ jobId }) => {
      this.logger.warn({ jobId }, 'Job stalled');
    });
  }

  /**
   * Add a subtask to the queue
   */
  async enqueue(
    subtask: Subtask,
    taskId: string,
    options?: { priority?: number; delay?: number }
  ): Promise<Job<QueuedSubtask>> {
    const job = await this.queue.add(
      `subtask:${subtask.agentType}`,
      {
        subtask,
        taskId,
        priority: options?.priority ?? 0
      },
      {
        priority: options?.priority,
        delay: options?.delay,
        jobId: subtask.id
      }
    );

    this.logger.debug(
      { subtaskId: subtask.id, jobId: job.id },
      'Subtask enqueued'
    );

    return job;
  }

  /**
   * Add multiple subtasks to the queue
   */
  async enqueueBatch(
    items: Array<{ subtask: Subtask; taskId: string; priority?: number }>
  ): Promise<Job<QueuedSubtask>[]> {
    const jobs = await this.queue.addBulk(
      items.map((item) => ({
        name: `subtask:${item.subtask.agentType}`,
        data: {
          subtask: item.subtask,
          taskId: item.taskId,
          priority: item.priority ?? 0
        },
        opts: {
          priority: item.priority,
          jobId: item.subtask.id
        }
      }))
    );

    this.logger.info({ count: jobs.length }, 'Batch enqueued');
    return jobs;
  }

  /**
   * Start processing jobs with the given handler
   */
  startProcessing(
    handler: (job: Job<QueuedSubtask>) => Promise<SubtaskResult>,
    concurrency: number
  ): void {
    if (this.isProcessing) {
      this.logger.warn('Already processing');
      return;
    }

    this.worker = new Worker<QueuedSubtask, SubtaskResult>(
      'aichestrator:subtasks',
      async (job) => {
        this.logger.info(
          { jobId: job.id, subtaskId: job.data.subtask.id },
          'Processing job'
        );

        try {
          const result = await handler(job);
          return result;
        } catch (error) {
          this.logger.error(
            { jobId: job.id, error: String(error) },
            'Job processing failed'
          );
          throw error;
        }
      },
      {
        connection: new Redis(this.connection.options.host ?? 'localhost', {
          port: this.connection.options.port,
          maxRetriesPerRequest: null
        }),
        concurrency
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.debug({ jobId: job.id }, 'Worker completed job');
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { jobId: job?.id, error: error.message },
        'Worker job failed'
      );
    });

    this.worker.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Worker error');
    });

    this.isProcessing = true;
    this.logger.info({ concurrency }, 'Started processing');
  }

  /**
   * Stop processing jobs
   */
  async stopProcessing(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      this.isProcessing = false;
      this.logger.info('Stopped processing');
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job<QueuedSubtask> | undefined> {
    return await this.queue.getJob(jobId);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount()
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.info('Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.info('Queue resumed');
  }

  /**
   * Clear all jobs from the queue
   */
  async clear(): Promise<void> {
    await this.queue.obliterate({ force: true });
    this.logger.info('Queue cleared');
  }

  /**
   * Wait for a specific job to complete
   */
  async waitForJob(jobId: string, timeoutMs: number = 300000): Promise<SubtaskResult | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    try {
      const result = await job.waitUntilFinished(this.events, timeoutMs);
      return result;
    } catch (error) {
      this.logger.error({ jobId, error: String(error) }, 'Job wait failed');
      return null;
    }
  }

  /**
   * Clean up and close connections
   */
  async close(): Promise<void> {
    await this.stopProcessing();
    await this.events.close();
    await this.queue.close();
    await this.connection.quit();
    this.logger.info('Task queue closed');
  }
}
