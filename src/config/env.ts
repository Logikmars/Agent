import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  WATCH_DIR: z.string().default("./workspace"),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(25),
  MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(20),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default("./agent-index.sqlite")
});

const parsed = envSchema.parse(process.env);
const root = process.cwd();

export const env = {
  openaiApiKey: parsed.OPENAI_API_KEY,
  openaiModel: parsed.OPENAI_MODEL,
  watchDir: path.resolve(root, parsed.WATCH_DIR),
  maxFileSizeBytes: parsed.MAX_FILE_SIZE_MB * 1024 * 1024,
  maxImageSizeBytes: parsed.MAX_IMAGE_SIZE_MB * 1024 * 1024,
  port: parsed.PORT,
  databasePath: path.resolve(root, parsed.DATABASE_PATH)
};
