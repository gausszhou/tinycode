import { resolve, relative, join } from "node:path";
import { readdirSync } from "node:fs";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "logs", "__pycache__", ".venv", "dist",
]);

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

export const find_files = {
  description:
    "Recursively search files matching a filename glob pattern. Returns relative paths. Skips node_modules, .git, logs, __pycache__, .venv, dist, and hidden dirs. Max 100 results",
  parameters: {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string",
        description:
          "Filename glob pattern, e.g. '*.js', '*.{ts,js}', or 'test*'",
      },
      path: {
        type: "string",
        description: "Search start directory, default CWD",
      },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const searchRoot = args.path
      ? resolve(args.path as string)
      : process.cwd();
    if (!searchRoot.startsWith(process.cwd()))
      return "Searching outside the working directory is not allowed";

    let fnFilter: RegExp;
    try {
      fnFilter = globToRegex(args.pattern as string);
    } catch (e) {
      return `Invalid glob pattern: ${(e as Error).message}`;
    }

    const MAX_RESULTS = 100;
    const results: string[] = [];
    const walk = (dir: string) => {
      if (results.length >= MAX_RESULTS) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (results.length >= MAX_RESULTS) return;
        if (ent.isDirectory()) {
          if (!SKIP_DIRS.has(ent.name) && !ent.name.startsWith("."))
            walk(join(dir, ent.name));
        } else if (ent.isFile()) {
          if (fnFilter.test(ent.name))
            results.push(relative(process.cwd(), join(dir, ent.name)));
        }
      }
    };
    walk(searchRoot);

    if (results.length === 0)
      return `No files found matching "${args.pattern}"`;
    const more =
      results.length >= MAX_RESULTS
        ? ` (max ${MAX_RESULTS} results reached)`
        : "";
    return `Found ${results.length} file(s)${more}:\n${results.join("\n")}`;
  },
};
