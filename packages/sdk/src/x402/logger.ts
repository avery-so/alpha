export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

type LogSink = (message: string, details?: Record<string, unknown>) => void;

const priorities = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
} as const satisfies Record<LogLevel, number>;

const noop: LogSink = () => {};

export function createLogger(level: LogLevel = "info", logger?: Logger | undefined): Logger {
  const sink = logger ?? console;

  return {
    debug: enabled(level, "debug") ? sink.debug.bind(sink) : noop,
    info: enabled(level, "info") ? sink.info.bind(sink) : noop,
    warn: enabled(level, "warn") ? sink.warn.bind(sink) : noop,
    error: enabled(level, "error") ? sink.error.bind(sink) : noop,
  };
}

function enabled(level: LogLevel, method: Exclude<LogLevel, "silent">): boolean {
  return priorities[method] >= priorities[level];
}
