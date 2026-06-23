import OpenAI from "openai";
import { env } from "../config/env.js";

export function createOpenAIClient(): OpenAI | null {
  if (!env.openaiApiKey) return null;
  return new OpenAI({ apiKey: env.openaiApiKey });
}
