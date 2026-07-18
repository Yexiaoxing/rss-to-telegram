import type { Telegraf } from "telegraf";
import { extractArticle } from "./article.js";
import type { AppConfig } from "./config.js";
import { parseFeed } from "./feed.js";
import { stableId } from "./ids.js";
import { errorData, type Logger } from "./logger.js";
import { formatTelegramMessage } from "./message.js";
import { JsonStore } from "./storage.js";
import { Summarizer } from "./summary.js";
import type { FeedItem, FeedRecord, PollResult, Subscription } from "./types.js";

const MAX_ITEMS_PER_POLL = 5;

export class Poller {
  private timer?: NodeJS.Timeout;
  private running = false;
  private nextScheduledPollAt?: string;
  private stopped = true;

  constructor(
    private readonly store: JsonStore,
    private readonly bot: Telegraf,
    private readonly summarizer: Summarizer,
    private readonly config: AppConfig,
    private readonly logger?: Logger
  ) {}

  start(): void {
    this.stopped = false;
    this.logger?.info("poller started", { pollIntervalSeconds: this.config.pollIntervalSeconds });
    this.scheduleNextPoll(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.nextScheduledPollAt = undefined;
    this.logger?.info("poller stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  nextScheduledAt(): string | undefined {
    return this.nextScheduledPollAt;
  }

  async pollAll(): Promise<PollResult[]> {
    if (this.running) {
      this.logger?.warn("scheduled poll skipped because another poll is running");
      return [];
    }
    this.running = true;

    try {
      this.logger?.info("scheduled poll started");
      const state = this.store.snapshot();
      const subscriptions = Object.values(state.subscriptions).filter((subscription) => subscription.active);
      const results = await this.pollSubscriptionSet(subscriptions);
      this.logger?.info("scheduled poll finished", pollTotals(results));
      return results;
    } finally {
      this.running = false;
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);

    const scheduledFor = new Date(Date.now() + delayMs);
    this.nextScheduledPollAt = scheduledFor.toISOString();
    this.logger?.info("scheduled poll queued", { nextScheduledPollAt: this.nextScheduledPollAt, delayMs });

    this.timer = setTimeout(() => void this.runScheduledPoll(), delayMs);
  }

  private async runScheduledPoll(): Promise<void> {
    if (this.stopped) return;
    this.nextScheduledPollAt = undefined;

    try {
      await this.pollAll();
    } catch (error) {
      this.logger?.error("scheduled poll runner failed", errorData(error));
    } finally {
      if (!this.stopped) {
        this.scheduleNextPoll(this.config.pollIntervalSeconds * 1000);
      }
    }
  }

  async pollSubscriptions(subscriptions: Subscription[]): Promise<PollResult[]> {
    if (this.running) {
      this.logger?.warn("manual poll skipped because another poll is running");
      return [];
    }
    this.running = true;

    try {
      const activeSubscriptions = subscriptions.filter((subscription) => subscription.active);
      this.logger?.info("manual poll started", { subscriptions: activeSubscriptions.length });
      const results = await this.pollSubscriptionSet(activeSubscriptions);
      this.logger?.info("manual poll finished", pollTotals(results));
      return results;
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
      this.logger?.debug("feed poll started", { feedId: feed.id, feedUrl: feed.url, subscriptions: subscriptions.length });
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
      this.logger?.info("feed poll finished", {
        feedId: feed.id,
        feedUrl: feed.url,
        durationMs: Date.now() - startedAt,
        itemCount: parsed.items.length,
        subscriptions: subscriptions.length,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed
      });
    } catch (error) {
      result.failed += 1;
      this.logger?.error("feed poll failed", { feedId: feed.id, feedUrl: feed.url, ...errorData(error) });
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
      this.logger?.debug("feed item delivered", {
        feedId: feed.id,
        subscriptionId: subscription.id,
        chatId: subscription.chatId,
        itemKey: item.key
      });
    } catch (error) {
      this.logger?.error("feed item delivery failed", {
        feedId: feed.id,
        subscriptionId: subscription.id,
        chatId: subscription.chatId,
        itemKey: item.key,
        ...errorData(error)
      });
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

function pollTotals(results: PollResult[]): { feeds: number; sent: number; skipped: number; failed: number } {
  const totals = results.reduce(
    (acc, result) => ({
      sent: acc.sent + result.sent,
      skipped: acc.skipped + result.skipped,
      failed: acc.failed + result.failed
    }),
    { sent: 0, skipped: 0, failed: 0 }
  );
  return { feeds: results.length, ...totals };
}
