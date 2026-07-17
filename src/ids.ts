import { createHash } from "node:crypto";

export function stableId(...parts: Array<string | number | undefined>): string {
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 16);
}

export function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  return url.toString();
}

export function truncate(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
