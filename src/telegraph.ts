import { JSDOM } from "jsdom";
import type { ArticleContent } from "./article.js";
import type { AppConfig } from "./config.js";
import { truncate } from "./ids.js";
import { errorData, type Logger } from "./logger.js";
import type { JsonStore } from "./storage.js";
import type { FeedItem, FeedRecord } from "./types.js";

type TelegraphNode = string | { tag: string; attrs?: Record<string, string>; children?: TelegraphNode[] };
type TelegraphTranslation = { title?: string; text?: string };

const CREATE_ACCOUNT_URL = "https://api.telegra.ph/createAccount";
const CREATE_PAGE_URL = "https://api.telegra.ph/createPage";
const ALLOWED_TAGS = new Set(["a", "b", "blockquote", "br", "code", "em", "figcaption", "figure", "h3", "h4", "hr", "i", "img", "li", "ol", "p", "pre", "s", "strong", "u", "ul"]);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export class TelegraphPublisher {
  constructor(
    private readonly store: JsonStore,
    private readonly config: AppConfig,
    private readonly logger?: Logger
  ) {}

  async publish(feed: FeedRecord, item: FeedItem, article: ArticleContent, translation?: TelegraphTranslation): Promise<string | undefined> {
    const startedAt = Date.now();
    const content = translation?.text ? textToTelegraphNodes(translation.text) : article.html ? htmlToTelegraphNodes(article.html) : textToTelegraphNodes(article.text);
    if (content.length === 0) return undefined;

    try {
      const accessToken = await this.accessToken();
      const title = truncate(translation?.title || article.title || item.title, 256);
      const pageUrl = await this.createPage(accessToken, title, content, item.link || feed.siteUrl);
      this.logger?.info("telegraph page created", {
        feedId: feed.id,
        itemKey: item.key,
        url: pageUrl,
        durationMs: Date.now() - startedAt
      });
      return pageUrl;
    } catch (error) {
      this.logger?.warn("telegraph page creation failed", {
        feedId: feed.id,
        itemKey: item.key,
        durationMs: Date.now() - startedAt,
        ...errorData(error, { includeStack: false })
      });
      return undefined;
    }
  }

  private async accessToken(): Promise<string> {
    const configured = this.config.telegraphAccessToken;
    if (configured) return configured;

    const stored = this.store.telegraphAccessToken();
    if (stored) return stored;

    const params = new URLSearchParams({
      short_name: "rss-to-telegram",
      author_name: this.config.telegraphAuthorName
    });
    if (this.config.telegraphAuthorUrl) params.set("author_url", this.config.telegraphAuthorUrl);

    const response = await fetch(CREATE_ACCOUNT_URL, { method: "POST", body: params });
    const payload = (await response.json()) as { ok: boolean; result?: { access_token?: string }; error?: string };
    if (!response.ok || !payload.ok || !payload.result?.access_token) {
      throw new Error(payload.error || `Telegraph account creation failed with HTTP ${response.status}`);
    }

    await this.store.setTelegraphAccessToken(payload.result.access_token);
    this.logger?.info("telegraph account created and stored");
    return payload.result.access_token;
  }

  private async createPage(accessToken: string, title: string, content: TelegraphNode[], sourceUrl?: string): Promise<string> {
    const params = new URLSearchParams({
      access_token: accessToken,
      title,
      author_name: this.config.telegraphAuthorName,
      content: JSON.stringify(appendSource(content, sourceUrl)),
      return_content: "false"
    });
    if (this.config.telegraphAuthorUrl) params.set("author_url", this.config.telegraphAuthorUrl);

    const response = await fetch(CREATE_PAGE_URL, { method: "POST", body: params });
    const payload = (await response.json()) as { ok: boolean; result?: { url?: string }; error?: string };
    if (!response.ok || !payload.ok || !payload.result?.url) {
      throw new Error(payload.error || `Telegraph page creation failed with HTTP ${response.status}`);
    }
    return payload.result.url;
  }
}

function htmlToTelegraphNodes(html: string): TelegraphNode[] {
  const dom = new JSDOM(`<main>${html}</main>`);
  return childrenToTelegraph(dom.window.document.querySelector("main")!);
}

function textToTelegraphNodes(text: string): TelegraphNode[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((paragraph) => ({ tag: "p", children: [paragraph] }));
}

function childrenToTelegraph(parent: Element): TelegraphNode[] {
  return Array.from(parent.childNodes).flatMap(nodeToTelegraph).slice(0, 200);
}

function nodeToTelegraph(node: ChildNode): TelegraphNode[] {
  if (node.nodeType === TEXT_NODE) {
    const value = node.textContent?.replace(/\s+/g, " ") || "";
    return value.trim() ? [value] : [];
  }
  if (node.nodeType !== ELEMENT_NODE) return [];

  const element = node as Element;
  const tag = normalizeTag(element.tagName.toLowerCase());
  const children = childrenToTelegraph(element);
  if (!tag) return children;

  const attrs: Record<string, string> = {};
  if (tag === "a") {
    const href = element.getAttribute("href");
    if (href?.startsWith("http")) attrs.href = href;
  }
  if (tag === "img") {
    const src = element.getAttribute("src");
    if (!src?.startsWith("http")) return [];
    attrs.src = src;
  }

  return [{ tag, attrs: Object.keys(attrs).length ? attrs : undefined, children: tag === "br" || tag === "hr" || tag === "img" ? undefined : children }];
}

function normalizeTag(tag: string): string | undefined {
  if (tag === "h1" || tag === "h2") return "h3";
  if (tag === "div" || tag === "section" || tag === "article") return undefined;
  return ALLOWED_TAGS.has(tag) ? tag : undefined;
}

function appendSource(content: TelegraphNode[], sourceUrl: string | undefined): TelegraphNode[] {
  if (!sourceUrl) return content;
  return [
    ...content,
    { tag: "hr" },
    { tag: "p", children: ["Source: ", { tag: "a", attrs: { href: sourceUrl }, children: [sourceUrl] }] }
  ];
}
