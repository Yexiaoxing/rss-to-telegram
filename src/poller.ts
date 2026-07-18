import type { Telegraf } from "telegraf";
import { extractArticle } from "./article.js";
import type { AppConfig } from "./config.js";
import { parseFeed } from "./feed.js";
import { stableId } from "./ids.js";
import { formatTelegramMessage } from "./message.js";
import { JsonStore } from "./storage.js";
import { Summarizer } from "./summary.js";
import type { FeedItem, FeedRecord, PollResult, Subscription } from "./types.js";

const MAX_ITEMS_PER_POLL = 5;

export class Poller {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly store: JsonStore,
    private readonly bot: Telegraf,
    private readonly summarizer: Summarizer,
    private readonly config: AppConfig
  ) {}

  start(): void {
    void this.pollAll();
    this.timer = setInterval(() => void this.pollAll(), this.config.pollIntervalSeconds * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  isRunning(): boolean {
    return this.running;
  }

  async pollAll(): Promise<PollResult[]> {
    if (this.running) return [];
    this.running = true;

    try {
      const state = this.store.snapshot();
      const subscriptions = Object.values(state.subscriptions).filter((subscription) => subscription.active);
      return await this.pollSubscriptionSet(subscriptions);
    } finally {
      this.running = false;
    }
  }

  async pollSubscriptions(subscriptions: Subscription[]): Promise<PollResult[]> {
    if (this.running) return [];
    this.running = true;

    try {
      return await this.pollSubscriptionSet(subscriptions.filter((subscription) => subscription.active));
    } finally {
      this.running = false;
    }
  }

  async pollFeed(feed: FeedRecord): Promise<PollResult> {
    return await this.pollFeedForSubscriptions(feed, this.store.activeSubscriptionsForFeed(feed.id));
  }

  private async pollSubscriptionSet(subscriptions: Subscription[]): Promise<PollResult[]> {
    const state = this.store.snapshot();
    const subscriptionsByFeed = new Map<string, Subscription[]>();

    for (const subscription of subscriptions) {
      const group = subscriptionsByFeed.get(subscription.feedId) ?? [];
      group.push(subscription);
      subscriptionsByFeed.set(subscription.feedId, group);
    }

    const results: PollResult[] = [];
    for (const [feedId, feedSubscriptions] of subscriptionsByFeed) {
      const feed = state.feeds[feedId];
      if (feed) results.push(await this.pollFeedForSubscriptions(feed, feedSubscriptions));
    }

    return results;
  }

  private async pollFeedForSubscriptions(feed: FeedRecord, subscriptions: Subscription[]): Promise<PollResult> {
    const startedAt = Date.now();
    const result: PollResult = { feedId: feed.id, sent: 0, failed: 0, skipped: 0 };

    try {
      const parsed = await parseFeed(feed.url);
      const items = parsed.items.slice(0, MAX_ITEMS_PER_POLL).reverse();
      for (const subscription of subscriptions) {
        for (const item of items) {
          if (this.store.hasSeen(subscription.id, item.key)) {
            result.skipped += 1;
            continue;
          }
          await this.deliver(feed, subscription, item, result);
        }
      }

      await this.store.updateFeed(feed.id, {
        title: parsed.title || feed.title,
        siteUrl: parsed.siteUrl || feed.siteUrl,
        lastCheckedAt: new Date().toISOString(),
        lastError: result.failed > 0 ? `${result.failed} delivery failed during last check` : undefined,
        lastCheckStatus: result.failed > 0 ? "failed" : "ok",
        lastCheckDurationMs: Date.now() - startedAt,
        lastCheckItemCount: parsed.items.length,
        lastCheckSent: result.sent,
        lastCheckFailed: result.failed,
        lastCheckSkipped: result.skipped,
        lastCheckTargetCount: subscriptions.length
      });
    } catch (error) {
      result.failed += 1;
      await this.store.updateFeed(feed.id, {
        lastCheckedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
        lastCheckStatus: "failed",
        lastCheckDurationMs: Date.now() - startedAt,
        lastCheckItemCount: 0,
        lastCheckSent: result.sent,
        lastCheckFailed: result.failed,
        lastCheckSkipped: result.skipped,
        lastCheckTargetCount: subscriptions.length
      });
    }

    return result;
  }

  private async deliver(
    feed: FeedRecord,
    subscription: Subscription,
    item: FeedItem,
    result: PollResult
  ): Promise<void> {
    const article = item.link ? await extractArticle(item.link) : undefined;
    const summary = await this.summarizer.summarize(item, article?.text || item.contentText);
    const message = formatTelegramMessage(feed, item, summary);

    try {
      if (item.imageUrl && message.length < 1024) {
        await this.bot.telegram.sendPhoto(subscription.chatId, item.imageUrl, {
          caption: message,
          parse_mode: "HTML"
        });
      } else {
        await this.bot.telegram.sendMessage(subscription.chatId, message, {
          parse_mode: "HTML"
        });
      }
      await this.store.markSeen(subscription.id, item.key);
      await this.store.addDelivery({
        id: stableId(subscription.id, item.key, Date.now()),
        feedId: feed.id,
        subscriptionId: subscription.id,
        chatId: subscription.chatId,
        itemKey: item.key,
        title: item.title,
        link: item.link,
        deliveredAt: new Date().toISOString(),
        status: "sent"
      });
      result.sent += 1;
    } catch (error) {
      await this.store.addDelivery({
        id: stableId(subscription.id, item.key, Date.now()),
        feedId: feed.id,
        subscriptionId: subscription.id,
        chatId: subscription.chatId,
        itemKey: item.key,
        title: item.title,
        link: item.link,
        deliveredAt: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
      result.failed += 1;
    }
  }
}
