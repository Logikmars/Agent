import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "./config/env.js";
import type { ToolContext } from "./tools/types.js";
import { scanFolder } from "./scanner/scanFolder.js";
import { askAgent } from "./agent/agent.js";
import { getFileTreeTool } from "./tools/getFileTree.tool.js";
import { analyzeImageTool } from "./tools/analyzeImage.tool.js";

const askSchema = z.object({
  question: z.string().min(1),
  maxFiles: z.number().int().positive().max(50).default(10)
});

const memoryCreateSchema = z.object({
  scope: z.enum(["important", "dialog"]).default("important"),
  kind: z.enum(["preference", "fact", "project_note", "rule", "event"]).default("fact"),
  content: z.string().min(3).max(2000),
  importance: z.number().min(0.1).max(5).default(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const memoryQuerySchema = z.object({
  scope: z.enum(["important", "dialog"]).optional()
});

const memoryParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

const analyzeImageSchema = z.object({
  path: z.string().min(1),
  question: z.string().min(1)
});

const publicDir = path.resolve(process.cwd(), "public", "admin");
const assetTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function createServer(ctx: ToolContext) {
  const app = Fastify({ logger: false });
  await app.register(cors);
  await app.register(sensible);

  app.get("/", async (_request, reply) => reply.redirect("/admin"));

  app.get("/admin", async (_request, reply) => {
    const html = await fs.readFile(path.join(publicDir, "index.html"), "utf8");
    reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/admin/", async (_request, reply) => {
    const html = await fs.readFile(path.join(publicDir, "index.html"), "utf8");
    reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/admin/*", async (request, reply) => {
    const asset = ((request.params as Record<string, string>)["*"] ?? "").replace(/\\/g, "/");
    if (!asset || asset.includes("..")) return reply.notFound();
    const filePath = path.resolve(publicDir, asset);
    if (!filePath.startsWith(publicDir + path.sep)) return reply.notFound();
    try {
      const content = await fs.readFile(filePath);
      reply.type(assetTypes[path.extname(filePath)] ?? "application/octet-stream").send(content);
    } catch {
      reply.notFound();
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/files", async () => ({
    files: ctx.files.list(5000).map((file) => ({
      path: file.relative_path,
      name: file.name,
      extension: file.extension,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      type: file.file_type,
      isText: Boolean(file.is_text),
      isImage: Boolean(file.is_image),
      status: file.status,
      errorMessage: file.error_message,
      createdAt: file.created_at,
      modifiedAt: file.modified_at,
      indexedAt: file.indexed_at
    }))
  }));

  app.get("/tree", async () => getFileTreeTool(ctx, { maxDepth: 20 }));

  app.post("/rescan", async () => {
    await scanFolder(ctx);
    return { status: "ok" };
  });

  app.post("/ask", async (request) => {
    const body = askSchema.parse(request.body);
    return askAgent(ctx, body.question, body.maxFiles);
  });

  app.post("/chat", async (request) => {
    const body = askSchema.parse(request.body);
    return askAgent(ctx, body.question, body.maxFiles);
  });

  app.get("/memories", async (request) => {
    const query = memoryQuerySchema.parse(request.query);
    return {
      memories: ctx.memories.list(200, query.scope).map((memory) => ({
      id: memory.id,
      scope: memory.scope,
      kind: memory.kind,
      content: memory.content,
      importance: memory.importance,
      source: memory.source,
      metadata: JSON.parse(memory.metadata_json || "{}"),
      createdAt: memory.created_at,
      updatedAt: memory.updated_at,
      lastUsedAt: memory.last_used_at
    }))
    };
  });

  app.post("/memories", async (request) => {
    const body = memoryCreateSchema.parse(request.body);
    const memory = ctx.memories.create(body.kind, body.content, body.metadata, body.importance, "user", body.scope);
    return {
      id: memory.id,
      scope: memory.scope,
      kind: memory.kind,
      content: memory.content,
      importance: memory.importance,
      source: memory.source,
      createdAt: memory.created_at
    };
  });

  app.delete("/memories/:id", async (request, reply) => {
    const params = memoryParamsSchema.parse(request.params);
    if (!ctx.memories.delete(params.id)) return reply.notFound("Memory not found");
    return { status: "ok" };
  });

  app.post("/analyze-image", async (request) => {
    const body = analyzeImageSchema.parse(request.body);
    return analyzeImageTool(ctx, { relativePath: body.path, question: body.question });
  });

  app.setErrorHandler((error, _request, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = typeof err.statusCode === "number" ? err.statusCode : 400;
    reply.status(statusCode).send({ error: err.message ?? "Unknown error" });
  });

  return app;
}

export async function startServer(ctx: ToolContext) {
  const app = await createServer(ctx);
  await app.listen({ port: env.port, host: "127.0.0.1" });
  return app;
}
