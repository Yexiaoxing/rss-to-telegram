import { createServer } from "node:http";
import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { Poller } from "./poller.js";
import { JsonStore } from "./storage.js";
import { Summarizer } from "./summary.js";
import { createWebApp } from "./web.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new JsonStore(config.dataFile);
  await store.load();

  const bot = createBot(config, store);
  const summarizer = new Summarizer(config.openaiApiKey, config.openaiModel);
  const poller = new Poller(store, bot, summarizer, config);
  const app = createWebApp(store);
  const server = createServer(app);

  server.listen(config.webPort, config.webHost, () => {
    console.log(`Dashboard listening on http://${config.webHost}:${config.webPort}`);
  });

  await bot.launch();
  poller.start();
  console.log(`Telegram bot launched. Polling every ${config.pollIntervalSeconds}s.`);

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down.`);
    poller.stop();
    bot.stop(signal);
    server.close(() => process.exit(0));
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
