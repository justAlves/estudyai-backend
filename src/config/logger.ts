import pino from "pino";

const prettyLogs = process.env.LOG_PRETTY === "true" || (process.env.LOG_PRETTY === undefined && process.stdout.isTTY);

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(prettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            levelFirst: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,worker",
            singleLine: true,
            messageFormat: "{worker} › {msg}",
          },
        },
      }
    : {}),
});

export const workerLogger = (worker: string) => logger.child({ worker });
