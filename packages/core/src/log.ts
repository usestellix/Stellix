// The one file allowed to write to the console (SECURITY §7); see eslint.config.mjs.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const satisfies Record<
  LogLevel,
  number
>;

export type LogSink = (level: LogLevel, message: string, fields?: LogFields) => void;

/**
 * Fields may hold only public data: public keys, tx hashes, Horizon status codes, error codes.
 * Never passwords, mnemonics, seeds, secret keys, session keys, vault plaintext, or signed XDR.
 */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  /** Messages below this level are dropped. Production shells pass "info". */
  minLevel: LogLevel;
  sink?: LogSink;
}

const consoleSink: LogSink = (level, message, fields) => {
  const args = fields === undefined ? [message] : [message, fields];
  switch (level) {
    case "debug":
      console.debug(...args);
      return;
    case "info":
      console.info(...args);
      return;
    case "warn":
      console.warn(...args);
      return;
    case "error":
      console.error(...args);
      return;
  }
};

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? consoleSink;
  const min = LEVEL_ORDER[options.minLevel];
  const emit = (level: LogLevel) => (message: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] >= min) sink(level, message, fields);
  };
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error") };
}
