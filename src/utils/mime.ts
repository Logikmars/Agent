import { lookup } from "mime-types";

export function getMimeType(filePath: string): string {
  return lookup(filePath) || "application/octet-stream";
}
