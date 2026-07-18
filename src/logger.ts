export type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class Logger {
  constructor(private readonly minLevel: LogLevel = "info", private readonly context: Record<string, unknown> = {}) {}

  child(context: Record<string, unknown>): Logger {
    return new Logger(this.minLevel, { ...this.context, ...context });
  }

  debug(message: string, data: Record<string, unknown> = {}): void {
    this.write("debug", message, data);
  }

  info(message: string, data: Record<string, unknown> = {}): void {
    this.write("info", message, data);
  }

  warn(message: string, data: Record<string, unknown> = {}): void {
    this.write("warn", message, data);
  }

  error(message: string, data: Record<string, unknown> = {}): void {
    this.write("error", message, data);
  }

  private write(level: LogLevel, message: string, data: Record<string, unknown>): void {
    if (levelPriority[level] < levelPriority[this.minLevel]) return;

    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...serialize(data)
    };

    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value;
  return "info";
}

export function errorData(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error: error.message,
      stack: error.stack
    };
  }
  return { error: String(error) };
}

function serialize(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (value instanceof Error) return [key, { message: value.message, stack: value.stack }];
      return [key, value];
    })
  );
}
