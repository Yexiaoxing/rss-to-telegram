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
      "/addchannel <@channel_or_id> <feed_url>",
      "/remove <feed_url_or_id>",
      "/removechannel <@channel_or_id> <feed_url_or_id>",
      "/list",
      "/listchannel <@channel_or_id>",
      "/status",
      "/preview <feed_url>"
    ].join("\n"))
  );

  bot.command("add", async (ctx) => {
    const urlArg = commandArgs(ctx.message.text);
    if (!urlArg) return ctx.reply("Usage: /add <feed_url>");

    try {
      const now = new Date().toISOString();
      const { feed, title } = await upsertFeedFromUrl(store, urlArg, now);

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

      return ctx.reply(`Subscribed this chat to ${title || feed.url}.`);
    } catch (error) {
      return ctx.reply(`Could not add feed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  bot.command("addchannel", async (ctx) => {
    const args = commandParts(ctx.message.text);
    if (args.length < 2) return ctx.reply("Usage: /addchannel <@channel_or_id> <feed_url>");

    try {
      const target = normalizeTelegramTarget(args[0]);
      const feedUrl = args.slice(1).join(" ");
      const channel = await ctx.telegram.getChat(target);
      const channelId = String(channel.id);
      const channelTitle = "title" in channel ? channel.title : target;
      const now = new Date().toISOString();
      const { feed, title } = await upsertFeedFromUrl(store, feedUrl, now);

      await store.upsertSubscription({
        id: stableId(feed.id, channelId),
        feedId: feed.id,
        chatId: channelId,
        chatTitle: channelTitle,
        targetType: "channel",
        createdBy: ctx.from.id,
        createdAt: now,
        active: true
      });

      return ctx.reply(`Subscribed ${channelTitle || channelId} to ${title || feed.url}.`);
    } catch (error) {
      return ctx.reply(`Could not add channel feed: ${error instanceof Error ? error.message : String(error)}`);
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

  bot.command("removechannel", async (ctx) => {
    const args = commandParts(ctx.message.text);
    if (args.length < 2) return ctx.reply("Usage: /removechannel <@channel_or_id> <feed_url_or_id>");

    try {
      const channel = await ctx.telegram.getChat(normalizeTelegramTarget(args[0]));
      const chatId = String(channel.id);
      const selector = args.slice(1).join(" ").trim();
      const normalized = tryNormalizeUrl(selector);
      const state = store.snapshot();
      const subscription = store.activeSubscriptionsForChat(chatId).find((candidate) => {
        const feed = state.feeds[candidate.feedId];
        return candidate.id === selector || candidate.feedId === selector || feed?.url === normalized || feed?.url === selector;
      });

      if (!subscription) return ctx.reply("No matching active subscription found for that channel.");
      await store.deactivateSubscription(subscription.id);
      return ctx.reply("Channel subscription removed.");
    } catch (error) {
      return ctx.reply(`Could not remove channel feed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  bot.command("listchannel", async (ctx) => {
    const target = commandArgs(ctx.message.text);
    if (!target) return ctx.reply("Usage: /listchannel <@channel_or_id>");

    try {
      const channel = await ctx.telegram.getChat(normalizeTelegramTarget(target));
      const subscriptions = store.activeSubscriptionsForChat(String(channel.id));
      if (subscriptions.length === 0) return ctx.reply("That channel has no active feed subscriptions.");

      const state = store.snapshot();
      const channelTitle = "title" in channel ? channel.title : String(channel.id);
      const lines = subscriptions.map((subscription) => {
        const feed = state.feeds[subscription.feedId];
        return `${feed?.title || feed?.url || subscription.feedId}\nID: ${subscription.id}`;
      });
      return ctx.reply([`Channel: ${channelTitle}`, "", ...lines].join("\n"));
    } catch (error) {
      return ctx.reply(`Could not list channel feeds: ${error instanceof Error ? error.message : String(error)}`);
    }
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

function commandParts(text: string): string[] {
  return commandArgs(text).split(/\s+/).filter(Boolean);
}

function normalizeTelegramTarget(value: string): string {
  const target = value.trim();
  if (/^@[A-Za-z0-9_]{5,}$/.test(target) || /^-?\d+$/.test(target)) return target;
  throw new Error("Channel must be a @username or numeric channel ID. The bot must be an admin in that channel.");
}

async function upsertFeedFromUrl(
  store: JsonStore,
  rawUrl: string,
  now: string
): Promise<{ feed: FeedRecord; title?: string }> {
  const url = normalizeUrl(rawUrl);
  const parsed = await parseFeed(url);
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

  return { feed, title: parsed.title };
}

function tryNormalizeUrl(value: string): string | undefined {
  try {
    return normalizeUrl(value);
  } catch {
    return undefined;
  }
}
