import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppState, Delivery, FeedRecord, Subscription } from "./types.js";

const MAX_DELIVERIES = 200;

function emptyState(): AppState {
  return {
    version: 1,
    feeds: {},
    subscriptions: {},
    seen: {},
    deliveries: [],
    settings: {}
  };
}

export class JsonStore {
  private state: AppState = emptyState();

  constructor(private readonly filePath: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as AppState;
      this.state = {
        ...emptyState(),
        ...parsed,
        feeds: parsed.feeds ?? {},
        subscriptions: parsed.subscriptions ?? {},
        seen: parsed.seen ?? {},
        deliveries: parsed.deliveries ?? [],
        settings: parsed.settings ?? {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = emptyState();
      await this.save();
    }

    return this.snapshot();
  }

  snapshot(): AppState {
    return JSON.parse(JSON.stringify(this.state)) as AppState;
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }

  async upsertFeed(feed: FeedRecord): Promise<void> {
    this.state.feeds[feed.id] = feed;
    await this.save();
  }

  async upsertSubscription(subscription: Subscription): Promise<void> {
    this.state.subscriptions[subscription.id] = subscription;
    this.state.seen[subscription.id] ??= {};
    await this.save();
  }

  async deactivateSubscription(subscriptionId: string): Promise<boolean> {
    const subscription = this.state.subscriptions[subscriptionId];
    if (!subscription) return false;
    subscription.active = false;
    await this.save();
    return true;
  }

  async updateFeed(feedId: string, updates: Partial<FeedRecord>): Promise<void> {
    const feed = this.state.feeds[feedId];
    if (!feed) return;
    this.state.feeds[feedId] = { ...feed, ...updates };
    await this.save();
  }

  hasSeen(subscriptionId: string, itemKey: string): boolean {
    return Boolean(this.state.seen[subscriptionId]?.[itemKey]);
  }

  async markSeen(subscriptionId: string, itemKey: string): Promise<void> {
    this.state.seen[subscriptionId] ??= {};
    this.state.seen[subscriptionId][itemKey] = new Date().toISOString();
    await this.save();
  }

  async addDelivery(delivery: Delivery): Promise<void> {
    this.state.deliveries.unshift(delivery);
    this.state.deliveries = this.state.deliveries.slice(0, MAX_DELIVERIES);
    await this.save();
  }

  findFeedByUrl(url: string): FeedRecord | undefined {
    return Object.values(this.state.feeds).find((feed) => feed.url === url);
  }

  activeSubscriptionsForFeed(feedId: string): Subscription[] {
    return Object.values(this.state.subscriptions).filter(
      (subscription) => subscription.feedId === feedId && subscription.active
    );
  }

  activeSubscriptionsForChat(chatId: string): Subscription[] {
    return Object.values(this.state.subscriptions).filter(
      (subscription) => subscription.chatId === chatId && subscription.active
    );
  }

  telegraphAccessToken(): string | undefined {
    return this.state.settings.telegraphAccessToken;
  }

  async setTelegraphAccessToken(accessToken: string): Promise<void> {
    this.state.settings.telegraphAccessToken = accessToken;
    await this.save();
  }
}
