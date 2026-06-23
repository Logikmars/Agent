import path from "node:path";

const textExtensions = new Set([
  ".txt", ".md", ".json", ".csv", ".log", ".html", ".css", ".js", ".ts", ".jsx", ".tsx",
  ".py", ".java", ".php", ".xml", ".yaml", ".yml", ".pdf", ".docx", ".pptx", ".xlsx", ".doc", ".ppt", ".xls"
]);
const officeDocumentExtensions = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".doc", ".ppt", ".xls"]);
const simpleTextExtensions = new Set([...textExtensions].filter((ext) => !officeDocumentExtensions.has(ext)));
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const ignoredNames = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", ".env", ".env.local"]);

export function shouldIgnoreName(name: string): boolean {
  return ignoredNames.has(name);
}

export function classifyPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    extension,
    isText: textExtensions.has(extension),
    isSimpleText: simpleTextExtensions.has(extension),
    isImage: imageExtensions.has(extension),
    isSupportedDocument: officeDocumentExtensions.has(extension)
  };
}
