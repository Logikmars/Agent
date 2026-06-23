import fs from "node:fs/promises";
import path from "node:path";
import type { FilesRepository } from "../db/repositories/files.repository.js";
import type { ChunksRepository } from "../db/repositories/chunks.repository.js";
import { PathGuard, normalizeRelative } from "../safety/pathGuard.js";
import { env } from "../config/env.js";
import { getMimeType } from "../utils/mime.js";
import { classifyPath, shouldIgnoreName } from "./fileClassifier.js";
import { extractText } from "./extractText.js";
import { chunkText } from "./chunkText.js";
import { logger } from "../utils/logger.js";

export type ScannerDeps = {
  files: FilesRepository;
  chunks: ChunksRepository;
  guard: PathGuard;
};

export async function scanFolder(deps: ScannerDeps, startRelativePath = "."): Promise<void> {
  const start = deps.guard.resolveInside(startRelativePath);
  const seen = new Set<string>();
  await scanEntry(deps, start, seen);
  if (startRelativePath === ".") {
    for (const file of deps.files.list(100000)) {
      if (!seen.has(file.relative_path)) deps.files.markDeleted(file.relative_path);
    }
  }
}

export async function indexPath(deps: ScannerDeps, absolutePath: string): Promise<void> {
  if (!deps.guard.isInside(absolutePath)) return;
  await scanEntry(deps, absolutePath, new Set<string>());
}

async function scanEntry(deps: ScannerDeps, absolutePath: string, seen: Set<string>): Promise<void> {
  const name = path.basename(absolutePath);
  if (shouldIgnoreName(name)) return;

  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch (error) {
    logger.warn("Cannot stat path", { path: absolutePath, error: String(error) });
    return;
  }

  const relativePath = normalizeRelative(path.relative(deps.guard.getRoot(), absolutePath)) || ".";
  seen.add(relativePath);
  const classification = classifyPath(absolutePath);
  const isDirectory = stat.isDirectory();
  const tooLarge = stat.isFile() && stat.size > (classification.isImage ? env.maxImageSizeBytes : env.maxFileSizeBytes);
  const now = new Date().toISOString();

  const record = deps.files.upsert({
    relative_path: relativePath,
    absolute_path: absolutePath,
    name,
    extension: isDirectory ? "" : classification.extension,
    mime_type: isDirectory ? "inode/directory" : getMimeType(absolutePath),
    size_bytes: stat.size,
    file_type: isDirectory ? "directory" : "file",
    is_text: classification.isText ? 1 : 0,
    is_image: classification.isImage ? 1 : 0,
    status: "pending",
    error_message: null,
    created_at: stat.birthtime.toISOString(),
    modified_at: stat.mtime.toISOString(),
    indexed_at: now
  });

  if (isDirectory) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(absolutePath);
    } catch (error) {
      deps.files.upsert({ ...record, status: "error", error_message: String(error), indexed_at: now });
      return;
    }
    for (const entry of entries) {
      await scanEntry(deps, path.join(absolutePath, entry), seen);
    }
    const updated = deps.files.upsert({ ...record, status: "indexed", error_message: null, indexed_at: new Date().toISOString() });
    deps.files.replaceSearchTerms(updated.id);
    return;
  }

  if (tooLarge || classification.isImage || !classification.isText) {
    deps.chunks.replaceForFile(record.id, []);
    const updated = deps.files.upsert({
      ...record,
      status: "indexed",
      error_message: tooLarge ? "Content extraction skipped because file is larger than configured limit" : null,
      indexed_at: new Date().toISOString()
    });
    deps.files.replaceSearchTerms(updated.id);
    return;
  }

  try {
    const text = await extractText(absolutePath);
    deps.chunks.replaceForFile(record.id, chunkText(text));
    const updated = deps.files.upsert({ ...record, status: "indexed", error_message: null, indexed_at: new Date().toISOString() });
    deps.files.replaceSearchTerms(updated.id, text);
  } catch (error) {
    deps.chunks.replaceForFile(record.id, []);
    const updated = deps.files.upsert({ ...record, status: "error", error_message: String(error), indexed_at: new Date().toISOString() });
    deps.files.replaceSearchTerms(updated.id);
  }
}
