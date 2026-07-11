import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set([
  "node_modules", ".git", "logs", "dist",
  "__pycache__", ".venv", "build", "target",
]);

const CONFIG_FILES: { file: string; label: string }[] = [
  { file: "tsconfig.json", label: "TypeScript" },
  { file: "Cargo.toml", label: "Rust" },
  { file: "go.mod", label: "Go" },
  { file: "requirements.txt", label: "Python" },
  { file: "pyproject.toml", label: "Python" },
  { file: "setup.py", label: "Python" },
  { file: "Gemfile", label: "Ruby" },
  { file: "Makefile", label: "Make" },
  { file: "CMakeLists.txt", label: "CMake" },
  { file: "Dockerfile", label: "Docker" },
  { file: "docker-compose.yml", label: "Docker" },
];

export function analyzeWorkspace(): string {
  const cwd = process.cwd();
  const parts: string[] = [];
  const detectedTypes: string[] = [];

  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    detectedTypes.push("Node.js");
    if (pkg.name) parts.push(`Project: ${pkg.name}`);
    if (pkg.description) parts.push(`Desc: ${pkg.description}`);
    if (pkg.scripts) {
      const names = Object.keys(pkg.scripts);
      if (names.length) parts.push(`npm scripts: ${names.join(", ")}`);
    }
  } catch {}

  for (const { file, label } of CONFIG_FILES) {
    try {
      if (existsSync(join(cwd, file)) && !detectedTypes.includes(label))
        detectedTypes.push(label);
    } catch {}
  }

  if (detectedTypes.length)
    parts.push(`Project type: ${detectedTypes.join(", ")}`);

  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    const dirs = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith(".") &&
          !SKIP.has(e.name),
      )
      .map((e) => e.name + "/");
    const files = entries
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => e.name);
    if (dirs.length) parts.push(`Top dirs: ${dirs.join(", ")}`);
    if (files.length) parts.push(`Top files: ${files.join(", ")}`);
  } catch {}

  return parts.length > 0 ? `\nWorkspace overview:\n${parts.join("\n")}` : "";
}
