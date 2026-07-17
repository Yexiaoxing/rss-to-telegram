import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { stripHtml, truncate } from "./ids.js";

export type ArticleContent = {
  title?: string;
  text: string;
};

export async function extractArticle(url: string, timeoutMs = 12000): Promise<ArticleContent | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "rss-to-telegram/0.1 (+https://github.com/self-hosted/rss-to-telegram)",
        accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) return undefined;

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const text = stripHtml(article?.textContent || "");

    if (!text) return undefined;
    return {
      title: article?.title || undefined,
      text: truncate(text, 12000)
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
