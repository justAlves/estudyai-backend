import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: undefined, timestamp: pino.stdTimeFunctions.isoTime });

export const workerLogger = (worker: string) => logger.child({ worker });
