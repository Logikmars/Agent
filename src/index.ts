import fs from "node:fs/promises";
import { env } from "./config/env.js";
import { createAppContext } from "./app.js";
import { scanFolder } from "./scanner/scanFolder.js";
import { watchFolder } from "./scanner/watchFolder.js";
import { startServer } from "./server.js";
import { logger } from "./utils/logger.js";

async function main() {
  await fs.mkdir(env.watchDir, { recursive: true });
  const ctx = await createAppContext();
  logger.info(`WATCH_DIR: ${env.watchDir}`);
  await scanFolder(ctx);
  watchFolder(ctx);
  await startServer(ctx);
  logger.info(`Server started at http://127.0.0.1:${env.port}`);
}

main().catch((error) => {
  logger.error("Fatal error", String(error));
  process.exit(1);
});
