import { env } from "../config/env.js";
import { DEFAULT_MAX_FILES_FOR_ASK } from "../safety/limits.js";
import type { ToolContext, UsedFile } from "../tools/types.js";
import { getFileTreeTool } from "../tools/getFileTree.tool.js";
import { searchRelevantContextTool } from "../tools/searchRelevantContext.tool.js";
import { openAITools } from "./toolSchemas.js";
import { runTool } from "./tools.js";
import { systemPrompt } from "./systemPrompt.js";

export type AskResult = {
  answer: string;
  usedFiles: UsedFile[];
};

type MemoryCandidate = {
  scope?: "important" | "dialog";
  kind?: "preference" | "fact" | "project_note" | "rule" | "event";
  content?: string;
  importance?: number;
};

const MAX_TOOL_CALL_ROUNDS = 16;
const MAX_AUTO_IMPORTANT_MEMORIES = 3;
const sensitivePattern = /(api[_-]?key|token|password|парол|секрет|secret|private[_-]?key|sk-[a-z0-9_-]+)/i;

export async function askAgent(ctx: ToolContext, question: string, maxFiles = DEFAULT_MAX_FILES_FOR_ASK): Promise<AskResult> {
  if (!ctx.openai) {
    return localFallbackAnswer(ctx, question, maxFiles);
  }

  const usedFiles: UsedFile[] = [];
  const retrievalContext = searchRelevantContextTool(ctx, {
    query: question,
    memoryLimit: 6,
    importantMemoryLimit: 6,
    dialogMemoryLimit: 3,
    fileLimit: Math.max(maxFiles, 10),
    chunkLimit: 10
  });

  let response: any = await ctx.openai.responses.create({
    model: env.openaiModel,
    instructions: systemPrompt,
    tools: openAITools as any,
    input: [
      `Вопрос пользователя: ${question}`,
      `Максимум файлов для выбора: ${maxFiles}`,
      "Предварительно найденный контекст:",
      JSON.stringify(retrievalContext)
    ].join("\n")
  } as any);

  for (let i = 0; i < MAX_TOOL_CALL_ROUNDS; i += 1) {
    const calls = getFunctionCalls(response);
    if (!calls.length) {
      const answer = getOutputText(response);
      const uniqueFiles = uniqueUsedFiles(usedFiles);
      ctx.conversations.create(question, answer, uniqueFiles);
      await rememberConversation(ctx, question, answer, uniqueFiles);
      return { answer, usedFiles: uniqueFiles };
    }

    const toolOutputs = [];
    for (const call of calls) {
      const args = parseArgs(call.arguments);
      try {
        const output = await runTool(ctx, call.name, args);
        usedFiles.push(...extractUsedFiles(output, call.name));
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output)
        });
      } catch (error) {
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ error: String(error) })
        });
      }
    }

    response = await ctx.openai.responses.create({
      model: env.openaiModel,
      instructions: systemPrompt,
      tools: openAITools as any,
      previous_response_id: response.id,
      input: toolOutputs
    } as any);
  }

  const finalResponse: any = await ctx.openai.responses.create({
    model: env.openaiModel,
    instructions: [
      systemPrompt,
      "Больше не вызывай tools. Дай лучший возможный ответ только на основе уже найденного контекста и результатов предыдущих tools. Если данных мало, скажи это явно."
    ].join("\n\n"),
    previous_response_id: response.id,
    input: "Лимит tool-calling достигнут. Сформируй финальный ответ без дополнительных вызовов tools."
  } as any);

  const answer = getOutputText(finalResponse);
  const uniqueFiles = uniqueUsedFiles(usedFiles);
  ctx.conversations.create(question, answer, uniqueFiles);
  await rememberConversation(ctx, question, answer, uniqueFiles);
  return { answer, usedFiles: uniqueFiles };
}

function localFallbackAnswer(ctx: ToolContext, question: string, maxFiles: number): AskResult {
  const tree = getFileTreeTool(ctx, { maxDepth: 4 });
  const files = ctx.files.list(maxFiles);
  const retrievalContext = searchRelevantContextTool(ctx, {
    query: question,
    memoryLimit: 5,
    importantMemoryLimit: 5,
    dialogMemoryLimit: 2,
    fileLimit: Math.max(maxFiles, 10),
    chunkLimit: 8
  }) as {
    importantMemories: Array<{ kind: string; content: string }>;
    dialogMemories: Array<{ kind: string; content: string }>;
    files: Array<{ path: string; type: string; status: string }>;
  };
  const usedFiles = retrievalContext.files
    .filter((file) => file.type === "file" && file.status === "indexed")
    .slice(0, maxFiles)
    .map((file) => ({ path: file.path, reason: "найден в локальном индексе" }));
  const usedFileLines = usedFiles.length
    ? usedFiles.map((file) => `- ${file.path} - ${file.reason}`)
    : ["- нет, использовался только индекс/дерево папки"];
  const answer = [
    "OPENAI_API_KEY не задан, поэтому отвечаю локальным обзором без модели.",
    `Вопрос: ${question}`,
    `В индексе сейчас ${ctx.files.list(100000).length} записей. Первые элементы:`,
    ...files.map((file) => `- ${file.relative_path} (${file.file_type}, ${file.status})`),
    "",
    "Важная память:",
    ...(retrievalContext.importantMemories.length ? retrievalContext.importantMemories.map((memory) => `- [${memory.kind}] ${memory.content}`) : ["- нет"]),
    "",
    "Память диалогов:",
    ...(retrievalContext.dialogMemories.length ? retrievalContext.dialogMemories.map((memory) => `- [${memory.kind}] ${memory.content}`) : ["- нет"]),
    "",
    "Использованные файлы:",
    ...usedFileLines,
    "",
    `Дерево верхнего уровня: ${JSON.stringify(tree.children?.slice(0, 20) ?? [])}`
  ].join("\n");
  ctx.conversations.create(question, answer, usedFiles);
  rememberConversationEvent(ctx, question, answer, usedFiles);
  return { answer, usedFiles };
}

async function rememberConversation(ctx: ToolContext, question: string, answer: string, usedFiles: UsedFile[]): Promise<void> {
  rememberConversationEvent(ctx, question, answer, usedFiles);
  await rememberImportantInsights(ctx, question, answer, usedFiles);
}

function rememberConversationEvent(ctx: ToolContext, question: string, answer: string, usedFiles: UsedFile[]): void {
  const content = [
    `Вопрос: ${truncate(question, 500)}`,
    `Ответ: ${truncate(answer.replace(/\s+/g, " "), 900)}`,
    usedFiles.length ? `Файлы: ${usedFiles.map((file) => file.path).slice(0, 10).join(", ")}` : "Файлы: нет"
  ].join("\n");
  ctx.memories.create("event", content, {
    usedFiles: usedFiles.map((file) => file.path)
  }, 0.25, "conversation", "dialog");
  ctx.memories.pruneDialog(300);
}

async function rememberImportantInsights(ctx: ToolContext, question: string, answer: string, usedFiles: UsedFile[]): Promise<void> {
  if (!ctx.openai) return;
  if (sensitivePattern.test(`${question}\n${answer}`)) return;

  try {
    const response: any = await ctx.openai.responses.create({
      model: env.openaiModel,
      instructions: [
        "Ты извлекаешь долгосрочную память для локального файлового агента.",
        "Верни только валидный JSON без markdown.",
        "Формат: {\"memories\":[{\"scope\":\"important\",\"kind\":\"preference|fact|project_note|rule\",\"content\":\"...\",\"importance\":1-5}]}",
        "Сохраняй только устойчивые факты, правила, предпочтения пользователя, проектные заметки и подтвержденные решения.",
        "Не сохраняй обычный пересказ ответа, временные события, случайные вопросы, секреты, токены, ключи, пароли.",
        "Если сохранять нечего, верни {\"memories\":[]}."
      ].join("\n"),
      input: JSON.stringify({
        userQuestion: question,
        assistantAnswer: answer,
        usedFiles: usedFiles.map((file) => file.path).slice(0, 20)
      })
    } as any);

    const parsed = parseMemoryExtraction(getOutputText(response));
    for (const candidate of parsed.slice(0, MAX_AUTO_IMPORTANT_MEMORIES)) {
      if (!isValidImportantMemory(candidate)) continue;
      if (isDuplicateImportantMemory(ctx, candidate.content!)) continue;
      ctx.memories.create(
        candidate.kind ?? "project_note",
        candidate.content!,
        { source: "auto_extractor", usedFiles: usedFiles.map((file) => file.path).slice(0, 20) },
        clampImportance(candidate.importance),
        "auto_extractor",
        "important"
      );
    }
  } catch {
    // Memory extraction should never break the user's answer path.
  }
}

function parseMemoryExtraction(text: string): MemoryCandidate[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.memories) ? parsed.memories : [];
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed?.memories) ? parsed.memories : [];
    } catch {
      return [];
    }
  }
}

function isValidImportantMemory(candidate: MemoryCandidate): boolean {
  if (candidate.scope && candidate.scope !== "important") return false;
  if (!candidate.content || typeof candidate.content !== "string") return false;
  const content = candidate.content.trim();
  if (content.length < 12 || content.length > 500) return false;
  if (sensitivePattern.test(content)) return false;
  return true;
}

function isDuplicateImportantMemory(ctx: ToolContext, content: string): boolean {
  const normalized = normalizeMemoryText(content);
  return ctx.memories.searchImportant(content, 5).some((memory) => normalizeMemoryText(memory.content) === normalized);
}

function normalizeMemoryText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clampImportance(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.max(1, Math.min(5, numeric));
}

function getFunctionCalls(response: any): Array<{ call_id: string; name: string; arguments: string }> {
  return (response.output ?? []).filter((item: any) => item.type === "function_call");
}

function parseArgs(args: string): unknown {
  try {
    return JSON.parse(args || "{}");
  } catch {
    return {};
  }
}

function getOutputText(response: any): string {
  if (response.output_text) return response.output_text;
  const texts = (response.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .filter((content: any) => content.type === "output_text")
    .map((content: any) => content.text);
  return texts.join("\n").trim() || JSON.stringify(response);
}

function extractUsedFiles(output: unknown, toolName: string): UsedFile[] {
  const files: UsedFile[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("path" in value && typeof (value as { path?: unknown }).path === "string") {
      files.push({ path: (value as { path: string }).path, reason: `использован tool ${toolName}` });
    }
    if ("relative_path" in value && typeof (value as { relative_path?: unknown }).relative_path === "string") {
      files.push({ path: (value as { relative_path: string }).relative_path, reason: `использован tool ${toolName}` });
    }
    for (const item of Object.values(value)) {
      if (Array.isArray(item)) item.forEach(visit);
      else visit(item);
    }
  };
  visit(output);
  return files.filter((file) => file.path !== ".");
}

function uniqueUsedFiles(files: UsedFile[]): UsedFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
