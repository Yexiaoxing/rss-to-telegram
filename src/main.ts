import { createServer } from "node:http";
import { createBot, registerBotCommands, registerManualCheckCommands } from "./bot.js";
import { loadConfig } from "./config.js";
import { errorData, Logger, parseLogLevel } from "./logger.js";
import { Poller } from "./poller.js";
import { JsonStore } from "./storage.js";
import { Summarizer } from "./summary.js";
import { createWebApp } from "./web.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const store = new JsonStore(config.dataFile);
  await store.load();
  logger.info("state loaded", { dataFile: config.dataFile });

  const bot = createBot(config, store, logger.child({ component: "telegram" }));
  const summarizer = new Summarizer(
    {
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      baseURL: config.openaiBaseUrl,
      timeoutMs: config.openaiTimeoutMs,
      maxRetries: config.openaiMaxRetries
    },
    logger.child({ component: "openai" })
  );
  summarizer.logConfiguration();
  const poller = new Poller(store, bot, summarizer, config, logger.child({ component: "poller" }));
  registerManualCheckCommands(bot, store, poller, logger.child({ component: "telegram" }));
  const app = createWebApp(store, poller, logger.child({ component: "web" }));
  const server = createServer(app);
  let botRunning = false;

  server.listen(config.webPort, config.webHost, () => {
    logger.info("dashboard listening", { url: `http://${config.webHost}:${config.webPort}` });
  });

  poller.start();
  void summarizer.testIntegration();
  void startTelegramBot();

  const shutdown = async (signal: string) => {
    logger.info("shutdown requested", { signal });
    poller.stop();
    if (botRunning) bot.stop(signal);
    server.close(() => process.exit(0));
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  async function startTelegramBot(): Promise<void> {
    try {
      await registerBotCommands(bot);
      await bot.launch();
      botRunning = true;
      logger.info("telegram bot launched", { pollIntervalSeconds: config.pollIntervalSeconds });
    } catch (error) {
      logger.error("telegram bot launch failed", errorData(error));
    }
  }
}

main().catch((error) => {
  const logger = new Logger(parseLogLevel(process.env.LOG_LEVEL?.trim()));
  logger.error("fatal startup error", errorData(error));
  process.exit(1);
});
