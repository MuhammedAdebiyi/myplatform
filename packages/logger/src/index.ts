import pino from 'pino';

type LogMeta = Record<string, unknown>;

/**
 * pino wrapper with a console-style call signature: log.info(msg, meta?).
 * (Raw pino is log.info(meta, msg) — this wrapper keeps worker code readable
 * and matches the JSON-console convention the workers already used.)
 */
export function createLogger(service: string) {
  const pinoLogger = pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });

  function wrap(level: 'info' | 'warn' | 'error' | 'debug') {
    return (msg: string, meta?: LogMeta) => {
      if (meta === undefined) {
        pinoLogger[level](msg);
      } else {
        pinoLogger[level](meta, msg);
      }
    };
  }

  return {
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    debug: wrap('debug'),
    child: (bindings: LogMeta) => {
      const child = pinoLogger.child(bindings);
      return {
        info: (msg: string, meta?: LogMeta) => child.info(meta ?? {}, msg),
        warn: (msg: string, meta?: LogMeta) => child.warn(meta ?? {}, msg),
        error: (msg: string, meta?: LogMeta) => child.error(meta ?? {}, msg),
        debug: (msg: string, meta?: LogMeta) => child.debug(meta ?? {}, msg),
      };
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
