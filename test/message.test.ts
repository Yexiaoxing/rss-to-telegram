import { describe, expect, it } from "vitest";
import { stableId } from "../src/ids.js";
import { formatTelegramMessage } from "../src/message.js";

describe("message formatting", () => {
  it("escapes HTML and includes bilingual summary", () => {
    const message = formatTelegramMessage(
      { id: "feed", url: "https://example.com/rss", title: "Example <Feed>", createdAt: "now" },
      {
        key: "item",
        title: "A <headline>",
        link: "https://example.com/post?a=1&b=2",
        publishedAt: "2026-07-17T00:00:00.000Z",
        contentText: "body"
      },
      { english: "English <summary>", chinese: "中文摘要", source: "openai" }
    );

    expect(message).toContain("A &lt;headline&gt;");
    expect(message).toContain("Example &lt;Feed&gt;");
    expect(message).toContain("English &lt;summary&gt;");
    expect(message).toContain("中文摘要");
    expect(message).toContain("https://example.com/post?a=1&amp;b=2");
  });
});

describe("stableId", () => {
  it("is deterministic", () => {
    expect(stableId("a", "b")).toBe(stableId("a", "b"));
    expect(stableId("a", "b")).not.toBe(stableId("a", "c"));
  });
});
