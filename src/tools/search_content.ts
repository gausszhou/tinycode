import { resolve, relative, join } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";

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

export const search_content = {
  description:
    "Recursively search file contents matching a regex pattern. Returns relative paths with line numbers (max 50 results). Skips node_modules, .git, logs, binary files, and files >500KB",
  parameters: {
    type: "object" as const,
    properties: {
      pattern: { type: "string", description: "Regex search pattern" },
      path: {
        type: "string",
        description: "Search start directory, default CWD",
      },
      include: {
        type: "string",
        description:
          "Filename glob filter, e.g. '*.js', '*.{ts,js}', or '.ts'",
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

    const fnFilter = args.include as string | undefined;
    const MAX_RESULTS = 50;
    const MAX_FILE_KB = 500;

    let re: RegExp;
    try {
      re = new RegExp(args.pattern as string, "g");
    } catch (e) {
      return `Invalid regex: ${(e as Error).message}`;
    }

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
          if (fnFilter) {
            try {
              if (!globToRegex(fnFilter).test(ent.name)) continue;
            } catch {
              continue;
            }
          }
          const fp = join(dir, ent.name);
          try {
            const stat = statSync(fp);
            if (stat.size > MAX_FILE_KB * 1024) continue;
            const raw = readFileSync(fp, "utf8");
            const lines = raw.split("\n");
            for (let i = 0; i < lines.length; i++) {
              re.lastIndex = 0;
              if (re.test(lines[i])) {
                results.push(
                  `${relative(process.cwd(), fp)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`,
                );
                if (results.length >= MAX_RESULTS) return;
              }
            }
          } catch {}
        }
      }
    };
    walk(searchRoot);

    if (results.length === 0)
      return `No matches found for "${args.pattern}"`;
    const more =
      results.length >= MAX_RESULTS
        ? ` (max ${MAX_RESULTS} results reached)`
        : "";
    return `Found ${results.length} match(es)${more}:\n${results.join("\n")}`;
  },
};
