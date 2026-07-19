import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("loads an OpenAI-compatible base URL override", () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_ADMIN_IDS = "123";
    process.env.OPENAI_BASE_URL = "https://openai-compatible.example.com/v1";

    expect(loadConfig().openaiBaseUrl).toBe("https://openai-compatible.example.com/v1");
  });

  it("loads a configured log level", () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_ADMIN_IDS = "123";
    process.env.LOG_LEVEL = "debug";

    expect(loadConfig().logLevel).toBe("debug");
  });

  it("loads OpenAI timeout and retry settings", () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_ADMIN_IDS = "123";
    process.env.OPENAI_TIMEOUT_MS = "15000";
    process.env.OPENAI_MAX_RETRIES = "1";

    const config = loadConfig();

    expect(config.openaiTimeoutMs).toBe(15000);
    expect(config.openaiMaxRetries).toBe(1);
  });

  it("loads Telegraph settings", () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_ADMIN_IDS = "123";
    process.env.TELEGRAPH_ACCESS_TOKEN = "telegraph-token";
    process.env.TELEGRAPH_AUTHOR_NAME = "Feed Bot";
    process.env.TELEGRAPH_AUTHOR_URL = "https://example.com/";

    const config = loadConfig();

    expect(config.telegraphAccessToken).toBe("telegraph-token");
    expect(config.telegraphAuthorName).toBe("Feed Bot");
    expect(config.telegraphAuthorUrl).toBe("https://example.com");
  });
});
