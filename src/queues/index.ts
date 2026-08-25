import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { ulid } from "ulid";
import { env } from "../config/env";

export const queueNames = {
  plans: "estudyai-plans",
  materials: "estudyai-materials",
  rag: "estudyai-rag",
  simulations: "estudyai-simulations",
} as const;

function connection() {
  if (!env.REDIS_URL) throw new Error("Defina REDIS_URL para usar o message broker.");
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
    keepAlive: 30_000,
    noDelay: true,
    retryStrategy: (attempt: number) => Math.min(attempt * 1_000, 30_000),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

const queues = new Map<string, Queue>();

export function getQueue(name: string) {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: connection() });
  queues.set(name, queue);
  return queue;
}

export function enqueue(queueName: string, jobId: string, options: JobsOptions = {}) {
  return getQueue(queueName).add("process", { jobId }, {
    jobId: `db-${jobId}`,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    ...options,
  });
}

export function createWorker<T>(queueName: string, processor: Processor<T>, options: { concurrency?: number; attempts?: number } = {}) {
  return new Worker<T>(queueName, processor, {
    connection: connection(),
    concurrency: options.concurrency ?? 1,
    autorun: true,
  });
}

export function enqueuePlanGeneration(jobId: string) {
  return enqueue(queueNames.plans, jobId, { attempts: 3, backoff: { type: "exponential", delay: 15_000 } });
}

export function enqueueMaterialGeneration(jobId: string) {
  return enqueue(queueNames.materials, jobId, { attempts: 5, backoff: { type: "exponential", delay: 15_000 } });
}

export function enqueueRagIngestion(jobId = ulid()) {
  return enqueue(queueNames.rag, jobId, { attempts: 3, backoff: { type: "exponential", delay: 30_000 } });
}

export function enqueueSimulationGeneration(jobId: string) {
  return enqueue(queueNames.simulations, jobId, { attempts: 3, backoff: { type: "exponential", delay: 15_000 } });
}
