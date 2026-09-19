import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';
const logLevel = process.env['LOG_LEVEL'] ?? 'info';
const prettyPrint = process.env['LOG_PRETTY'] === 'true';

export const logger = pino({
  level: logLevel,
  ...(prettyPrint && !isProduction
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: {
    env: process.env['NODE_ENV'],
  },
});

export type Logger = typeof logger;

/**
 * Create a child logger with bound context fields.
 * Use for request-scoped or module-scoped logging.
 */
export function createLogger(context: Record<string, unknown>): Logger {
  return logger.child(context) as Logger;
}
