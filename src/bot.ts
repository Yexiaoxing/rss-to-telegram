import { Telegraf } from "telegraf";
import type { AppConfig } from "./config.js";
import { parseFeed } from "./feed.js";
import { normalizeUrl, stableId, truncate } from "./ids.js";
import { JsonStore } from "./storage.js";
import type { FeedRecord, Subscription } from "./types.js";

export function createBot(config: AppConfig, store: JsonStore): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.telegramAdminIds.has(userId)) {
      if (ctx.message && "text" in ctx.message) {
        await ctx.reply("This bot is restricted to configured admins.");
      }
      return;
    }
    await next();
  });

  bot.start((ctx) =>
    ctx.reply([
      "RSS to Telegram is running.",
      "Commands:",
      "/add <feed_url>",
      "/remove <feed_url_or_id>",
      "/list",
      "/status",
      "/preview <feed_url>"
    ].join("\n"))
  );

  bot.command("add", async (ctx) => {
    const urlArg = commandArgs(ctx.message.text);
    if (!urlArg) return ctx.reply("Usage: /add <feed_url>");

    try {
      const url = normalizeUrl(urlArg);
      const parsed = await parseFeed(url);
      const now = new Date().toISOString();
      const existing = store.findFeedByUrl(url);
      const feed: FeedRecord = existing ?? {
        id: stableId(url),
        url,
        title: parsed.title,
        siteUrl: parsed.siteUrl,
        createdAt: now
      };

      await store.upsertFeed({
        ...feed,
        title: parsed.title || feed.title,
        siteUrl: parsed.siteUrl || feed.siteUrl,
        lastCheckedAt: now,
        lastError: undefined
      });

      const chat = ctx.chat;
      const chatTitle = "title" in chat ? chat.title : ctx.from?.username;
      const subscription: Subscription = {
        id: stableId(feed.id, chat.id),
        feedId: feed.id,
        chatId: String(chat.id),
        chatTitle,
        createdBy: ctx.from.id,
        createdAt: now,
        active: true
      };
      await store.upsertSubscription(subscription);

      return ctx.reply(`Subscribed this chat to ${parsed.title || url}.`);
    } catch (error) {
      return ctx.reply(`Could not add feed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  bot.command("remove", async (ctx) => {
    const arg = commandArgs(ctx.message.text);
    if (!arg) return ctx.reply("Usage: /remove <feed_url_or_id>");

    const chatId = String(ctx.chat.id);
    const normalized = tryNormalizeUrl(arg);
    const subscription = store.activeSubscriptionsForChat(chatId).find((candidate) => {
      const feed = store.snapshot().feeds[candidate.feedId];
      return candidate.id === arg || candidate.feedId === arg || feed?.url === normalized || feed?.url === arg;
    });

    if (!subscription) return ctx.reply("No matching active subscription found for this chat.");
    await store.deactivateSubscription(subscription.id);
    return ctx.reply("Subscription removed.");
  });

  bot.command("list", (ctx) => {
    const subscriptions = store.activeSubscriptionsForChat(String(ctx.chat.id));
    if (subscriptions.length === 0) return ctx.reply("This chat has no active feed subscriptions.");

    const state = store.snapshot();
    const lines = subscriptions.map((subscription) => {
      const feed = state.feeds[subscription.feedId];
      return `${feed?.title || feed?.url || subscription.feedId}\nID: ${subscription.id}`;
    });
    return ctx.reply(lines.join("\n\n"));
  });

  bot.command("status", (ctx) => {
    const state = store.snapshot();
    const subscriptions = store.activeSubscriptionsForChat(String(ctx.chat.id));
    const activeFeeds = new Set(subscriptions.map((subscription) => subscription.feedId));
    const errors = [...activeFeeds]
      .map((feedId) => state.feeds[feedId])
      .filter((feed) => feed?.lastError)
      .map((feed) => `${feed.title || feed.url}: ${feed.lastError}`);

    return ctx.reply(
      [
        `Active subscriptions: ${subscriptions.length}`,
        `Recent deliveries: ${state.deliveries.length}`,
        errors.length > 0 ? `Errors:\n${errors.join("\n")}` : "Errors: none"
      ].join("\n")
    );
  });

  bot.command("preview", async (ctx) => {
    const urlArg = commandArgs(ctx.message.text);
    if (!urlArg) return ctx.reply("Usage: /preview <feed_url>");

    try {
      const parsed = await parseFeed(normalizeUrl(urlArg));
      const latest = parsed.items[0];
      if (!latest) return ctx.reply("No items found.");
      return ctx.reply([parsed.title || "Feed preview", latest.title, latest.link, truncate(latest.contentText || "", 300)].filter(Boolean).join("\n"));
    } catch (error) {
      return ctx.reply(`Could not preview feed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  bot.catch((error) => {
    console.error("Telegram bot error", error);
  });

  return bot;
}

function commandArgs(text: string): string {
  return text.split(/\s+/).slice(1).join(" ").trim();
}

function tryNormalizeUrl(value: string): string | undefined {
  try {
    return normalizeUrl(value);
  } catch {
    return undefined;
  }
}
