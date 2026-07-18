import { describe, expect, it } from "vitest";
import { Summarizer } from "../src/summary.js";

describe("Summarizer", () => {
  it("falls back to an excerpt without OpenAI credentials", async () => {
    const summarizer = new Summarizer({ model: "gpt-4o-mini", timeoutMs: 30000, maxRetries: 2 });
    const result = await summarizer.summarize({
      key: "1",
      title: "Fallback title",
      contentText: "This is feed text that should be used as an excerpt."
    });

    expect(result.source).toBe("excerpt");
    expect(result.english).toContain("feed text");
    expect(result.chinese).toContain("OpenAI summary unavailable");
  });
});
