import path from "node:path";

export class PathGuard {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  getRoot(): string {
    return this.root;
  }

  resolveInside(inputPath = "."): string {
    const resolved = path.resolve(this.root, inputPath);
    if (!this.isInside(resolved)) {
      throw new Error(`Path escapes WATCH_DIR: ${inputPath}`);
    }
    return resolved;
  }

  toRelative(absolutePath: string): string {
    const resolved = path.resolve(absolutePath);
    if (!this.isInside(resolved)) {
      throw new Error(`Path escapes WATCH_DIR: ${absolutePath}`);
    }
    const relative = path.relative(this.root, resolved);
    return relative === "" ? "." : normalizeRelative(relative);
  }

  isInside(absolutePath: string): boolean {
    const resolved = path.resolve(absolutePath);
    const relative = path.relative(this.root, resolved);
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  }
}

export function normalizeRelative(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
