import Parser from "rss-parser";
import { stableId, stripHtml } from "./ids.js";
import type { FeedItem, ParsedFeed } from "./types.js";

type CustomFeed = {
  title?: string;
  link?: string;
};

type CustomItem = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  enclosure?: { url?: string; type?: string };
  [key: string]: unknown;
};

const parser = new Parser<CustomFeed, CustomItem>({
  customFields: {
    item: ["media:content", "media:thumbnail"]
  }
});

function mediaUrl(item: CustomItem): string | undefined {
  const mediaContent = item["media:content"];
  const mediaThumbnail = item["media:thumbnail"];

  for (const candidate of [item.enclosure, mediaContent, mediaThumbnail]) {
    if (candidate && typeof candidate === "object" && "url" in candidate) {
      const url = (candidate as { url?: unknown }).url;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  return undefined;
}

function itemKey(item: CustomItem): string {
  return item.guid || item.link || stableId(item.title, item.isoDate, item.pubDate, item.contentSnippet);
}

export async function parseFeed(feedUrl: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(feedUrl);
  const items: FeedItem[] = feed.items.map((item) => {
    const contentText = stripHtml(item.contentSnippet || item.content || "");
    return {
      key: itemKey(item),
      title: item.title?.trim() || "Untitled",
      link: item.link,
      author: item.creator || item.author,
      publishedAt: item.isoDate || item.pubDate,
      contentText,
      imageUrl: mediaUrl(item)
    };
  });

  return {
    title: feed.title,
    siteUrl: feed.link,
    items
  };
}
