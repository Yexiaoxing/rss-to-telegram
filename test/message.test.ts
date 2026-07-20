import { describe, expect, it } from "vitest";
import { stableId } from "../src/ids.js";
import { formatTelegramMessage } from "../src/message.js";

describe("message formatting", () => {
  it("escapes MarkdownV2 and includes bilingual summary", () => {
    const message = formatTelegramMessage(
      { id: "feed", url: "https://example.com/rss", title: "Example *Feed*", createdAt: "now" },
      {
        key: "item",
        title: "A *headline* (draft)",
        link: "https://example.com/post?a=1&b=2)",
        publishedAt: "2026-07-17T00:00:00.000Z",
        contentText: "body"
      },
      { english: "English _summary_.", chinese: "中文摘要", source: "openai" }
    );

    expect(message).toContain("A \\*headline\\* \\(draft\\)");
    expect(message).toContain("Example \\*Feed\\*");
    expect(message).toContain("English \\_summary\\_\\.");
    expect(message).toContain("中文摘要");
    expect(message).toContain("https://example.com/post?a=1&b=2\\)");
  });

  it("includes a Telegraph Instant View link when provided", () => {
    const message = formatTelegramMessage(
      { id: "feed", url: "https://example.com/rss", createdAt: "now" },
      { key: "item", title: "Headline", link: "https://example.com/post" },
      { english: "English summary", chinese: "中文摘要", source: "openai" },
      "https://telegra.ph/headline-01-01"
    );

    expect(message).toContain("Instant View");
    expect(message).toContain("https://telegra.ph/headline-01-01");
    expect(message).toContain("\\|");
  });

  it("uses the Chinese title when OpenAI provides one", () => {
    const message = formatTelegramMessage(
      { id: "feed", url: "https://example.com/rss", createdAt: "now" },
      { key: "item", title: "Original Title" },
      { english: "English summary", chinese: "中文摘要", chineseTitle: "中文标题", source: "openai" }
    );

    expect(message).toContain("*中文标题*");
    expect(message).toContain("_Original Title_");
  });
});

describe("stableId", () => {
  it("is deterministic", () => {
    expect(stableId("a", "b")).toBe(stableId("a", "b"));
    expect(stableId("a", "b")).not.toBe(stableId("a", "c"));
  });
});
