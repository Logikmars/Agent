export const logger = {
  info: (message: string, meta?: unknown) => console.log(format("info", message, meta)),
  warn: (message: string, meta?: unknown) => console.warn(format("warn", message, meta)),
  error: (message: string, meta?: unknown) => console.error(format("error", message, meta))
};

function format(level: string, message: string, meta?: unknown): string {
  const suffix = meta === undefined ? "" : ` ${safeJson(meta)}`;
  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
