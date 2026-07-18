import express from "express";
import type { Logger } from "./logger.js";
import type { JsonStore } from "./storage.js";
import type { FeedRecord, Subscription } from "./types.js";

export type SchedulerStatusProvider = {
  nextScheduledAt(): string | undefined;
  isRunning(): boolean;
};

export function createWebApp(store: JsonStore, scheduler: SchedulerStatusProvider, logger?: Logger): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger?.info("http request", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/state", (_req, res) => {
    res.json(store.snapshot());
  });

  app.get("/", (_req, res) => {
    const state = store.snapshot();
    const feeds = Object.values(state.feeds);
    const subscriptions = Object.values(state.subscriptions).filter((subscription) => subscription.active);
    const nextScheduledPollAt = scheduler.nextScheduledAt();
    const feedRows = feeds.map((feed) => renderFeedRow(feed, subscriptions.filter((subscription) => subscription.feedId === feed.id)));

    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RSS to Telegram</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #171923; }
    header { background: #ffffff; border-bottom: 1px solid #d9dee8; padding: 20px 28px; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: 0; }
    h2 { font-size: 17px; margin: 0 0 14px; }
    .muted { color: #5d6678; }
    .small { font-size: 12px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: 18px; }
    .panel { background: #ffffff; border: 1px solid #d9dee8; border-radius: 8px; padding: 16px; }
    .metric { font-size: 32px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #d9dee8; border-radius: 8px; overflow: hidden; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #e6e9ef; text-align: left; vertical-align: top; font-size: 14px; }
    th { background: #eef2f7; color: #2d3748; }
    tr:last-child td { border-bottom: 0; }
    code { background: #eef2f7; padding: 2px 5px; border-radius: 4px; }
    .error { color: #b42318; }
    .status-pill { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .status-ok { background: #dcfce7; color: #166534; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .status-pending { background: #eef2f7; color: #475569; }
    .detail-lines { display: grid; gap: 3px; }
    .target { display: inline-block; margin: 0 4px 4px 0; padding: 2px 6px; border: 1px solid #d9dee8; border-radius: 6px; background: #f8fafc; font-size: 12px; }
    @media (max-width: 720px) { main { padding: 14px; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <header>
    <h1>RSS to Telegram</h1>
    <div class="muted">Local dashboard for feed delivery status</div>
  </header>
  <main>
    <section class="grid">
      <div class="panel"><h2>Feeds</h2><div class="metric">${feeds.length}</div></div>
      <div class="panel"><h2>Active subscriptions</h2><div class="metric">${subscriptions.length}</div></div>
      <div class="panel"><h2>Recent deliveries</h2><div class="metric">${state.deliveries.length}</div></div>
      <div class="panel"><h2>Next scheduled poll</h2><div>${renderTimestamp(nextScheduledPollAt)}</div><div class="muted small">${scheduler.isRunning() ? "Poll running now" : "Poll queued"}</div></div>
    </section>
    <section class="panel">
      <h2>Feeds</h2>
      <table>
        <thead><tr><th>Feed</th><th>Active targets</th><th>Check timing</th><th>Check details</th><th>Status</th></tr></thead>
        <tbody>${feedRows.join("") || "<tr><td colspan=\"5\">No feeds yet. Use /add in Telegram.</td></tr>"}</tbody>
      </table>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>Recent deliveries</h2>
      <table>
        <thead><tr><th>Time</th><th>Title</th><th>Chat</th><th>Status</th></tr></thead>
        <tbody>${state.deliveries.slice(0, 25).map((delivery) => `<tr><td>${renderTimestamp(delivery.deliveredAt)}</td><td>${escape(delivery.title)}</td><td><code>${escape(delivery.chatId)}</code></td><td class="${delivery.status === "failed" ? "error" : ""}">${escape(delivery.error || delivery.status)}</td></tr>`).join("") || "<tr><td colspan=\"4\">No deliveries yet.</td></tr>"}</tbody>
      </table>
    </section>
  </main>
  <script>
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short"
    });

    document.querySelectorAll("time[data-timestamp]").forEach((element) => {
      const timestamp = element.getAttribute("data-timestamp");
      if (!timestamp) return;
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return;
      element.textContent = formatter.format(date);
      element.setAttribute("title", timestamp);
    });
  </script>
</body>
</html>`);
  });

  return app;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFeedRow(feed: FeedRecord, subscriptions: Subscription[]): string {
  const status = feed.lastCheckStatus || (feed.lastError ? "failed" : feed.lastCheckedAt ? "ok" : "pending");
  const statusClass = status === "ok" ? "status-ok" : status === "failed" ? "status-failed" : "status-pending";
  const statusText = status === "ok" ? "ok" : status === "failed" ? "failed" : "pending";
  const targets = subscriptions.map(renderTarget).join("") || "<span class=\"muted small\">No active targets</span>";

  return `<tr>
    <td><div><strong>${escape(feed.title || feed.id)}</strong></div><div class="small"><code>${escape(feed.url)}</code></div></td>
    <td>${targets}</td>
    <td>${renderCheckTiming(feed)}</td>
    <td>${renderCheckDetails(feed, subscriptions.length)}</td>
    <td><span class="status-pill ${statusClass}">${escape(statusText)}</span>${feed.lastError ? `<div class="error small">${escape(feed.lastError)}</div>` : ""}</td>
  </tr>`;
}

function renderCheckTiming(feed: FeedRecord): string {
  return `<div class="detail-lines">
    <div>Last: ${renderTimestamp(feed.lastCheckedAt)}</div>
    <div class="muted small">${escape(formatDuration(feed.lastCheckDurationMs))}</div>
  </div>`;
}

function renderTarget(subscription: Subscription): string {
  const type = subscription.targetType || "chat";
  const label = subscription.chatTitle || subscription.chatId;
  return `<span class="target">${escape(type)}: ${escape(label)}</span>`;
}

function renderCheckDetails(feed: FeedRecord, activeTargetCount: number): string {
  const itemCount = formatMetric(feed.lastCheckItemCount);
  const sent = formatMetric(feed.lastCheckSent);
  const failed = formatMetric(feed.lastCheckFailed);
  const skipped = formatMetric(feed.lastCheckSkipped);

  return `<div class="detail-lines">
    <div>Feed items: ${escape(itemCount)}</div>
    <div>Checked targets: ${escape(formatMetric(feed.lastCheckTargetCount))}</div>
    <div>Active targets: ${activeTargetCount}</div>
    <div>Sent: ${escape(sent)} | Skipped: ${escape(skipped)} | Failed: ${escape(failed)}</div>
  </div>`;
}

function formatMetric(value?: number): string {
  return typeof value === "number" ? String(value) : "-";
}

function formatDuration(value?: number): string {
  if (typeof value !== "number") return "Duration: -";
  if (value < 1000) return `Duration: ${value} ms`;
  return `Duration: ${(value / 1000).toFixed(1)} s`;
}

function renderTimestamp(value?: string): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const iso = date.toISOString();
  return `<time datetime="${escape(iso)}" data-timestamp="${escape(iso)}">${escape(iso)}</time>`;
}
