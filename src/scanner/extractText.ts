import fs from "node:fs/promises";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import { classifyPath } from "./fileClassifier.js";

export async function extractText(filePath: string): Promise<string> {
  const classification = classifyPath(filePath);
  if (classification.isSimpleText) {
    return fs.readFile(filePath, "utf8");
  }
  if (classification.extension === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (classification.extension === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  if (classification.extension === ".pptx") {
    return extractPptxText(filePath);
  }
  if (classification.extension === ".xlsx") {
    return extractXlsxText(filePath);
  }
  if ([".doc", ".ppt", ".xls"].includes(classification.extension)) {
    return extractBinaryOfficeText(filePath);
  }
  return "";
}

async function extractPptxText(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const slideFiles = Object.values(zip.files)
    .filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const parts: string[] = [];
  for (const file of slideFiles) {
    const xml = await file.async("text");
    parts.push(...extractXmlTagTexts(xml, ["a:t"]));
  }
  return parts.join("\n");
}

async function extractXlsxText(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const parts: string[] = [];
  const sharedStrings = zip.file("xl/sharedStrings.xml");
  if (sharedStrings) {
    parts.push(...extractXmlTagTexts(await sharedStrings.async("text"), ["t"]));
  }

  const sheetFiles = Object.values(zip.files)
    .filter((file) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const file of sheetFiles) {
    const xml = await file.async("text");
    parts.push(...extractXmlTagTexts(xml, ["t", "v"]));
  }
  return [...new Set(parts)].join("\n");
}

function extractXmlTagTexts(xml: string, tagNames: string[]): string[] {
  const results: string[] = [];
  for (const tagName of tagNames) {
    const escaped = tagName.replace(":", "\\:");
    const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
    for (const match of xml.matchAll(pattern)) {
      const text = decodeXmlEntities(stripXmlTags(match[1]).trim());
      if (text) results.push(text);
    }
  }
  return results;
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function extractBinaryOfficeText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const latin = extractPrintableStrings(buffer.toString("latin1"));
  const utf16 = extractPrintableStrings(buffer.toString("utf16le"));
  return [...new Set([...latin, ...utf16])]
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
    .join("\n");
}

function extractPrintableStrings(value: string): string[] {
  const normalized = value
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\r\n\t]+/gu, " ")
    .replace(/[ \t]{2,}/g, " ");
  return normalized
    .split(/\r?\n| {3,}/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && line.length <= 500);
}
