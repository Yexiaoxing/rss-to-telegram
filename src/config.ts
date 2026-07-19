import "dotenv/config";
import { parseLogLevel, type LogLevel } from "./logger.js";

export type AppConfig = {
  telegramBotToken: string;
  telegramAdminIds: Set<number>;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  openaiTimeoutMs: number;
  openaiMaxRetries: number;
  dataFile: string;
  pollIntervalSeconds: number;
  webHost: string;
  webPort: number;
  logLevel: LogLevel;
  telegraphAccessToken?: string;
  telegraphAuthorName: string;
  telegraphAuthorUrl?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function nonNegativeNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function optionalHttpUrlEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must start with http:// or https://`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(): AppConfig {
  const adminIds = requireEnv("TELEGRAM_ADMIN_IDS")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));

  if (adminIds.length === 0) {
    throw new Error("TELEGRAM_ADMIN_IDS must include at least one numeric Telegram user ID");
  }

  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    telegramAdminIds: new Set(adminIds),
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    openaiBaseUrl: optionalHttpUrlEnv("OPENAI_BASE_URL"),
    openaiTimeoutMs: numberEnv("OPENAI_TIMEOUT_MS", 30000),
    openaiMaxRetries: nonNegativeNumberEnv("OPENAI_MAX_RETRIES", 2),
    dataFile: process.env.DATA_FILE?.trim() || "./data/rss-to-telegram.json",
    pollIntervalSeconds: numberEnv("POLL_INTERVAL_SECONDS", 300),
    webHost: process.env.WEB_HOST?.trim() || "127.0.0.1",
    webPort: numberEnv("WEB_PORT", 3000),
    logLevel: parseLogLevel(process.env.LOG_LEVEL?.trim()),
    telegraphAccessToken: process.env.TELEGRAPH_ACCESS_TOKEN?.trim() || undefined,
    telegraphAuthorName: process.env.TELEGRAPH_AUTHOR_NAME?.trim() || "RSS to Telegram",
    telegraphAuthorUrl: optionalHttpUrlEnv("TELEGRAPH_AUTHOR_URL")
  };
}
