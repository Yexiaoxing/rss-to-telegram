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
});
