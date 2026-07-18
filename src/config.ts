import "dotenv/config";
import { parseLogLevel, type LogLevel } from "./logger.js";

export type AppConfig = {
  telegramBotToken: string;
  telegramAdminIds: Set<number>;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  dataFile: string;
  pollIntervalSeconds: number;
  webHost: string;
  webPort: number;
  logLevel: LogLevel;
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
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
    dataFile: process.env.DATA_FILE?.trim() || "./data/rss-to-telegram.json",
    pollIntervalSeconds: numberEnv("POLL_INTERVAL_SECONDS", 300),
    webHost: process.env.WEB_HOST?.trim() || "127.0.0.1",
    webPort: numberEnv("WEB_PORT", 3000),
    logLevel: parseLogLevel(process.env.LOG_LEVEL?.trim())
  };
}
