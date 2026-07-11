import { readFileSync, existsSync } from "node:fs";

export function loadEnv(): void {
  try {
    if (existsSync(".env")) {
      const content = readFileSync(".env", "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        )
          value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {}
}

loadEnv();

const required = ["OPENAI_API_KEY", "OPENAI_MODEL"];
const missing = required.filter((k) => !process.env[k]);

export function validateEnv(): void {
  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    console.error("Set them in .env or export them.");
    process.exit(1);
  }
}

export const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
export const KEY = process.env.OPENAI_API_KEY!;
export const MODEL = process.env.OPENAI_MODEL!;
