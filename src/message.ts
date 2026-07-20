import { truncate } from "./ids.js";
import type { FeedItem, FeedRecord, SummaryResult } from "./types.js";

const MARKDOWN_V2_SPECIAL_CHARS = /[_*\[\]()~`>#+\-=|{}.!\\]/g;

function escapeMarkdown(value: string): string {
  return value.replace(MARKDOWN_V2_SPECIAL_CHARS, "\\$&");
}

function escapeMarkdownUrl(value: string): string {
  return value.replace(/[)\\]/g, "\\$&");
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function formatTelegramMessage(feed: FeedRecord, item: FeedItem, summary: SummaryResult, telegraphUrl?: string): string {
  const displayTitle = summary.chineseTitle || item.title;
  const originalTitle = summary.chineseTitle ? item.title : undefined;
  const meta = [feed.title, formatDate(item.publishedAt)].filter(Boolean).map((value) => escapeMarkdown(value!)).join(" · ");
  const links = [
    telegraphUrl ? `[Instant View](${escapeMarkdownUrl(telegraphUrl)})` : undefined,
    item.link ? `[Original](${escapeMarkdownUrl(item.link)})` : undefined
  ].filter(Boolean);

  const lines = [
    `*${escapeMarkdown(truncate(displayTitle, 180))}*`,
    originalTitle ? `_${escapeMarkdown(truncate(originalTitle, 180))}_` : undefined,
    meta ? `_${meta}_` : undefined,
    "",
    `*EN*\n${escapeMarkdown(summary.english)}`,
    "",
    `*ZH*\n${escapeMarkdown(summary.chinese)}`,
    summary.source === "excerpt" ? "\n_AI summary unavailable; feed excerpt shown\._" : undefined,
    links.length > 0 ? `\n${links.join("  \\|  ")}` : undefined
  ];

  return lines.filter(Boolean).join("\n");
}
