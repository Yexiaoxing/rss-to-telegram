import { truncate } from "./ids.js";
import type { FeedItem, FeedRecord, SummaryResult } from "./types.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function formatTelegramMessage(feed: FeedRecord, item: FeedItem, summary: SummaryResult, telegraphUrl?: string): string {
  const lines = [
    `<b>${escapeHtml(truncate(item.title, 180))}</b>`,
    feed.title ? `Source: ${escapeHtml(feed.title)}` : undefined,
    formatDate(item.publishedAt) ? `Published: ${formatDate(item.publishedAt)}` : undefined,
    "",
    `<b>English</b>: ${escapeHtml(summary.english)}`,
    `<b>中文</b>: ${escapeHtml(summary.chinese)}`,
    summary.source === "excerpt" ? "\n<i>AI summary was unavailable; showing feed excerpt.</i>" : undefined,
    telegraphUrl ? `\n<a href="${escapeHtml(telegraphUrl)}">Instant View</a>` : undefined,
    item.link ? `\n<a href="${escapeHtml(item.link)}">Open original</a>` : undefined
  ];

  return lines.filter(Boolean).join("\n");
}
