import OpenAI from "openai";
import { truncate } from "./ids.js";
import type { FeedItem, SummaryResult } from "./types.js";

export class Summarizer {
  private readonly client?: OpenAI;

  constructor(apiKey: string | undefined, private readonly model: string) {
    this.client = apiKey ? new OpenAI({ apiKey }) : undefined;
  }

  async summarize(item: FeedItem, articleText?: string): Promise<SummaryResult> {
    const sourceText = articleText || item.contentText || item.title;
    if (!this.client || !sourceText.trim()) return this.excerptSummary(item, sourceText);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Summarize RSS news for Telegram. Return strict JSON with keys english and chinese. Each value must be one concise sentence."
          },
          {
            role: "user",
            content: `Title: ${item.title}\nURL: ${item.link || ""}\nText:\n${truncate(sourceText, 10000)}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message.content;
      if (!content) return this.excerptSummary(item, sourceText);
      const parsed = JSON.parse(content) as Partial<SummaryResult>;

      if (!parsed.english || !parsed.chinese) return this.excerptSummary(item, sourceText);
      return {
        english: truncate(parsed.english, 450),
        chinese: truncate(parsed.chinese, 450),
        source: "openai"
      };
    } catch {
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
