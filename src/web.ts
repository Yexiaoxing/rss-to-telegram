import express from "express";
import type { JsonStore } from "./storage.js";

export function createWebApp(store: JsonStore): express.Express {
  const app = express();
  app.use(express.json());

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
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: 18px; }
    .panel { background: #ffffff; border: 1px solid #d9dee8; border-radius: 8px; padding: 16px; }
    .metric { font-size: 32px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #d9dee8; border-radius: 8px; overflow: hidden; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #e6e9ef; text-align: left; vertical-align: top; font-size: 14px; }
    th { background: #eef2f7; color: #2d3748; }
    tr:last-child td { border-bottom: 0; }
    code { background: #eef2f7; padding: 2px 5px; border-radius: 4px; }
    .error { color: #b42318; }
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
    </section>
    <section class="panel">
      <h2>Feeds</h2>
      <table>
        <thead><tr><th>Title</th><th>URL</th><th>Last checked</th><th>Status</th></tr></thead>
        <tbody>${feeds.map((feed) => `<tr><td>${escape(feed.title || feed.id)}</td><td><code>${escape(feed.url)}</code></td><td>${escape(feed.lastCheckedAt || "never")}</td><td class="${feed.lastError ? "error" : ""}">${escape(feed.lastError || "ok")}</td></tr>`).join("") || "<tr><td colspan=\"4\">No feeds yet. Use /add in Telegram.</td></tr>"}</tbody>
      </table>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>Recent deliveries</h2>
      <table>
        <thead><tr><th>Time</th><th>Title</th><th>Chat</th><th>Status</th></tr></thead>
        <tbody>${state.deliveries.slice(0, 25).map((delivery) => `<tr><td>${escape(delivery.deliveredAt)}</td><td>${escape(delivery.title)}</td><td><code>${escape(delivery.chatId)}</code></td><td class="${delivery.status === "failed" ? "error" : ""}">${escape(delivery.error || delivery.status)}</td></tr>`).join("") || "<tr><td colspan=\"4\">No deliveries yet.</td></tr>"}</tbody>
      </table>
    </section>
  </main>
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
