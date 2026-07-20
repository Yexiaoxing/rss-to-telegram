export type FeedRecord = {
  id: string;
  url: string;
  title?: string;
  siteUrl?: string;
  createdAt: string;
  lastCheckedAt?: string;
  lastError?: string;
  lastCheckStatus?: "ok" | "failed";
  lastCheckDurationMs?: number;
  lastCheckItemCount?: number;
  lastCheckSent?: number;
  lastCheckFailed?: number;
  lastCheckSkipped?: number;
  lastCheckTargetCount?: number;
};

export type Subscription = {
  id: string;
  feedId: string;
  chatId: string;
  chatTitle?: string;
  targetType?: "chat" | "channel";
  createdBy: number;
  createdAt: string;
  active: boolean;
};

export type Delivery = {
  id: string;
  feedId: string;
  subscriptionId: string;
  chatId: string;
  itemKey: string;
  title: string;
  link?: string;
  deliveredAt: string;
  status: "sent" | "failed";
  error?: string;
};

export type AppState = {
  version: 1;
  feeds: Record<string, FeedRecord>;
  subscriptions: Record<string, Subscription>;
  seen: Record<string, Record<string, string>>;
  deliveries: Delivery[];
  settings: {
    telegraphAccessToken?: string;
  };
};

export type FeedItem = {
  key: string;
  title: string;
  link?: string;
  author?: string;
  publishedAt?: string;
  contentText?: string;
  imageUrl?: string;
};

export type ParsedFeed = {
  title?: string;
  siteUrl?: string;
  items: FeedItem[];
};

export type SummaryResult = {
  english: string;
  chinese: string;
  chineseTitle?: string;
  chineseArticle?: string;
  source: "openai" | "excerpt";
};

export type PollResult = {
  feedId: string;
  sent: number;
  failed: number;
  skipped: number;
};
