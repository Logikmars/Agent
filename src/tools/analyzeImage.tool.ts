import fs from "node:fs/promises";
import { z } from "zod";
import type { ToolContext } from "./types.js";
import { env } from "../config/env.js";

export const analyzeImageSchema = z.object({
  relativePath: z.string().min(1),
  question: z.string().min(1)
});

export async function analyzeImageTool(ctx: ToolContext, input: unknown) {
  const { relativePath, question } = analyzeImageSchema.parse(input);
  const absolutePath = ctx.guard.resolveInside(relativePath);
  const file = ctx.files.findByRelativePath(relativePath);
  if (!file) throw new Error(`Image is not indexed: ${relativePath}`);
  if (!file.is_image) throw new Error(`Path is not an indexed image: ${relativePath}`);
  if (file.size_bytes > env.maxImageSizeBytes) throw new Error("Image is larger than MAX_IMAGE_SIZE_MB");
  if (!ctx.openai) throw new Error("OPENAI_API_KEY is not configured");

  const image = await fs.readFile(absolutePath);
  const dataUrl = `data:${file.mime_type};base64,${image.toString("base64")}`;
  const response = await ctx.openai.responses.create({
    model: env.openaiModel,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: `Ответь на русском. Вопрос: ${question}` },
        { type: "input_image", image_url: dataUrl }
      ]
    }]
  } as never);

  return {
    answer: getOutputText(response),
    usedFiles: [{ path: relativePath, reason: "изображение передано в OpenAI Vision для анализа" }]
  };
}

function getOutputText(response: unknown): string {
  const maybe = response as { output_text?: string };
  return maybe.output_text || JSON.stringify(response);
}
