import { resolve, relative, join } from "node:path";
import { readdirSync, statSync } from "node:fs";

function globToRegex(glob: string): RegExp {
  let pattern = glob;
  if (!pattern.includes("*") && !pattern.includes("?") && !pattern.includes("{")) {
    pattern = "*" + pattern;
  }
  let reStr = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") reStr += ".*";
    else if (ch === "?") reStr += ".";
    else if (ch === "{") {
      let depth = 1, close = -1;
      for (let j = i + 1; j < pattern.length; j++) {
        if (pattern[j] === "{") depth++;
        else if (pattern[j] === "}") { depth--; if (depth === 0) { close = j; break; } }
      }
      if (close === -1) reStr += "\\{";
      else {
        const inner = pattern.slice(i + 1, close);
        const alts = inner.split(",").map((a) =>
          a.replace(/[.+^${}()|[\]\\]/g, "\\$&"),
        );
        reStr += "(" + alts.join("|") + ")";
        i = close;
      }
    } else if (/[.+^${}()|[\]\\]/.test(ch)) reStr += "\\" + ch;
    else reStr += ch;
  }
  return new RegExp("^" + reStr + "$", "i");
}

export const list_files = {
  description:
    "List files and subdirectories in a directory (non-recursive). Supports optional glob filter on filename",
  parameters: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Directory to list, defaults to CWD",
      },
      glob: {
        type: "string",
        description: "Optional glob filter on filename, e.g. '*.js' or '*.{ts,js}'",
      },
    },
    required: [],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const dir = args.path
      ? resolve(args.path as string)
      : process.cwd();
    if (!dir.startsWith(process.cwd()))
      return "Listing files outside the working directory is not allowed";

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return `Cannot read directory: ${(e as Error).message}`;
    }

    let pattern: RegExp | null = null;
    if (args.glob) {
      try {
        pattern = globToRegex(args.glob as string);
      } catch (e) {
        return `Invalid glob pattern: ${(e as Error).message}`;
      }
    }

    const items: string[] = [];
    for (const ent of entries) {
      if (pattern && !pattern.test(ent.name)) continue;
      const fp = relative(process.cwd(), join(dir, ent.name));
      try {
        const s = statSync(join(dir, ent.name));
        const size = ent.isDirectory() ? "" : ` (${s.size} B)`;
        items.push(`${ent.isDirectory() ? "📁" : "📄"} ${fp}${size}`);
      } catch {
        items.push(`${ent.isDirectory() ? "📁" : "📄"} ${fp}`);
      }
    }

    if (items.length === 0)
      return `No entries${args.glob ? ` matching "${args.glob}"` : ""} in "${relative(process.cwd(), dir) || "."}"`;
    const label = relative(process.cwd(), dir) || ".";
    return `📂 ${label}\n${items.join("\n")}`;
  },
};
