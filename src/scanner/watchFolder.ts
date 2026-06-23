import chokidar from "chokidar";
import { PathGuard } from "../safety/pathGuard.js";
import type { ScannerDeps } from "./scanFolder.js";
import { indexPath } from "./scanFolder.js";
import { logger } from "../utils/logger.js";

export function watchFolder(deps: ScannerDeps) {
  const guard = deps.guard;
  const watcher = chokidar.watch(guard.getRoot(), {
    ignoreInitial: true,
    ignored: /(^|[/\\])(\.git|node_modules|dist|build|\.next|\.cache|\.env|\.env\.local)([/\\]|$)/,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  });

  watcher
    .on("add", (filePath) => void indexPath(deps, filePath))
    .on("change", (filePath) => void indexPath(deps, filePath))
    .on("addDir", (dirPath) => void indexPath(deps, dirPath))
    .on("unlink", (filePath) => markDeleted(deps, filePath))
    .on("unlinkDir", (dirPath) => markDeleted(deps, dirPath))
    .on("error", (error) => logger.error("Watcher error", String(error)));

  return watcher;
}

function markDeleted(deps: ScannerDeps, absolutePath: string): void {
  try {
    deps.files.markDeleted(deps.guard.toRelative(absolutePath));
  } catch (error) {
    logger.warn("Ignored deletion outside WATCH_DIR", String(error));
  }
}
