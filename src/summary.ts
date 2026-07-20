import OpenAI from "openai";
import { truncate } from "./ids.js";
import { errorData, type Logger } from "./logger.js";
import type { FeedItem, SummaryResult } from "./types.js";

const SUMMARY_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "rss_item_summary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        english: {
          type: "string",
          description: "A concise one-sentence English summary."
        },
        chinese: {
          type: "string",
          description: "A concise one-sentence Chinese summary."
        }
      },
      required: ["english", "chinese"]
    }
  }
} as const;

export type SummarizerOptions = {
  apiKey?: string;
  model: string;
  baseURL?: string;
  timeoutMs: number;
  maxRetries: number;
};

export class Summarizer {
  private readonly client?: OpenAI;
  private readonly model: string;
  private readonly baseURL?: string;

  constructor(private readonly options: SummarizerOptions, private readonly logger?: Logger) {
    this.model = options.model;
    this.baseURL = options.baseURL;
    this.client = options.apiKey
      ? new OpenAI({
          apiKey: options.apiKey,
          baseURL: options.baseURL,
          timeout: options.timeoutMs,
          maxRetries: options.maxRetries
        })
      : undefined;
  }

  logConfiguration(): void {
    this.logger?.info("openai summary configuration", {
      enabled: Boolean(this.client),
      model: this.model,
      baseURL: publicBaseURL(this.baseURL),
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries
    });
  }

  async testIntegration(): Promise<boolean> {
    const startedAt = Date.now();
    if (!this.client) {
      this.logger?.info("openai integration test skipped", { reason: "missing_api_key" });
      return false;
    }

    try {
      this.logger?.info("openai integration test started", { model: this.model, baseURL: publicBaseURL(this.baseURL) });
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: "Reply with only: ok" },
          { role: "user", content: "ok" }
        ]
      });
      const content = response.choices[0]?.message.content?.trim() || "";
      this.logger?.info("openai integration test finished", {
        model: this.model,
        baseURL: publicBaseURL(this.baseURL),
        durationMs: Date.now() - startedAt,
        responseReceived: Boolean(content)
      });
      return Boolean(content);
    } catch (error) {
      this.logger?.warn("openai integration test failed", {
        model: this.model,
        baseURL: publicBaseURL(this.baseURL),
        durationMs: Date.now() - startedAt,
        ...openAIErrorData(error)
      });
      return false;
    }
  }

  async summarize(item: FeedItem, articleText?: string): Promise<SummaryResult> {
    const startedAt = Date.now();
    const sourceText = articleText || item.contentText || item.title;
    const textLength = sourceText.trim().length;
    if (!this.client) {
      this.logger?.debug("openai summary skipped", { reason: "missing_api_key", itemKey: item.key, textLength });
      return this.excerptSummary(item, sourceText);
    }
    if (!textLength) {
      this.logger?.debug("openai summary skipped", { reason: "empty_text", itemKey: item.key, textLength });
      return this.excerptSummary(item, sourceText);
    }

    try {
      this.logger?.info("openai summary request started", {
        model: this.model,
        baseURL: publicBaseURL(this.baseURL),
        itemKey: item.key,
        textLength
      });
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Summarize RSS news for Telegram. Return only the structured summary requested by the response schema."
          },
          {
            role: "user",
            content: `Title: ${item.title}\nURL: ${item.link || ""}\nText:\n${truncate(sourceText, 10000)}`
          }
        ],
        response_format: SUMMARY_RESPONSE_FORMAT
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        this.logger?.warn("openai summary response missing content", {
          model: this.model,
          itemKey: item.key,
          durationMs: Date.now() - startedAt
        });
        return this.excerptSummary(item, sourceText);
      }
      const parsed = JSON.parse(content) as Partial<SummaryResult>;

      if (!parsed.english || !parsed.chinese) {
        this.logger?.warn("openai summary response missing required fields", {
          model: this.model,
          itemKey: item.key,
          durationMs: Date.now() - startedAt
        });
        return this.excerptSummary(item, sourceText);
      }
      this.logger?.info("openai summary request finished", {
        model: this.model,
        baseURL: publicBaseURL(this.baseURL),
        itemKey: item.key,
        durationMs: Date.now() - startedAt
      });
      return {
        english: truncate(parsed.english, 450),
        chinese: truncate(parsed.chinese, 450),
        source: "openai"
      };
    } catch (error) {
      this.logger?.warn("openai summary request failed; falling back to excerpt", {
        model: this.model,
        baseURL: publicBaseURL(this.baseURL),
        itemKey: item.key,
        durationMs: Date.now() - startedAt,
        ...openAIErrorData(error)
      });
      return this.excerptSummary(item, sourceText);
    }
  }

  private excerptSummary(item: FeedItem, text: string): SummaryResult {
    const excerpt = truncate(text || item.contentText || item.title, 350);
    return {
      english: excerpt,
      chinese: "OpenAI summary unavailable. Please open the original link for the Chinese summary.",
      source: "excerpt"
    };
  }
}

function openAIErrorData(error: unknown): Record<string, unknown> {
  const data = errorData(error, { includeStack: false });
  const cause = typeof error === "object" && error && "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  if (cause instanceof Error) {
    return {
      ...data,
      cause: cause.message,
      causeName: cause.name
    };
  }
  if (cause) return { ...data, cause: String(cause) };
  return data;
}

function publicBaseURL(value: string | undefined): string {
  return value || "https://api.openai.com/v1";
}
