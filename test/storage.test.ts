import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "../src/storage.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("JsonStore", () => {
  it("loads an empty state and persists subscriptions atomically", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rss-store-"));
    tempDirs.push(dir);
    const store = new JsonStore(path.join(dir, "state.json"));

    await store.load();
    await store.upsertFeed({ id: "feed1", url: "https://example.com/feed.xml", createdAt: "now" });
    await store.upsertSubscription({
      id: "sub1",
      feedId: "feed1",
      chatId: "42",
      createdBy: 1,
      createdAt: "now",
      active: true
    });
    await store.markSeen("sub1", "item1");

    const reloaded = new JsonStore(path.join(dir, "state.json"));
    const state = await reloaded.load();

    expect(state.feeds.feed1.url).toBe("https://example.com/feed.xml");
    expect(state.subscriptions.sub1.active).toBe(true);
    expect(reloaded.hasSeen("sub1", "item1")).toBe(true);
  });
});
