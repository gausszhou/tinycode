import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import type { ModelsConfig, PricingEntry } from "./types";

const DATA_DIR = join(homedir(), ".tinycode");
const MODELS_FILE = join(DATA_DIR, "models.json");

const DEFAULT_MODELS: ModelsConfig = {
  pricing: [
    { prefix: "deepseek-reasoner", input: 0.00055, output: 0.00219 },
    { prefix: "deepseek-chat", input: 0.00027, output: 0.00110 },
    { prefix: "deepseek-v4", input: 0.00027, output: 0.00110 },
    { prefix: "deepseek", input: 0.00027, output: 0.00110 },
    { prefix: "gpt-4o", input: 0.00250, output: 0.01000 },
    { prefix: "gpt-4-turbo", input: 0.01000, output: 0.03000 },
    { prefix: "gpt-4", input: 0.03000, output: 0.06000 },
    { prefix: "gpt-3.5-turbo", input: 0.00150, output: 0.00200 },
    { prefix: "claude-3-5", input: 0.00300, output: 0.01500 },
    { prefix: "claude-3", input: 0.00800, output: 0.02400 },
    { prefix: "claude", input: 0.00800, output: 0.02400 },
    { prefix: "qwen-turbo", input: 0.00080, output: 0.00200 },
    { prefix: "qwen-plus", input: 0.00200, output: 0.00600 },
    { prefix: "qwen-max", input: 0.00400, output: 0.01200 },
    { prefix: "qwen", input: 0.00200, output: 0.00600 },
  ],
  contextLimits: {
    deepseek: 128000,
    "gpt-4o": 128000,
    "gpt-4-turbo": 128000,
    "gpt-4": 8192,
    "gpt-3.5": 16385,
    claude: 200000,
    qwen: 128000,
  },
};

let modelsConfig: ModelsConfig | null = null;

export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

export function loadModelsConfig(): ModelsConfig {
  if (modelsConfig) return modelsConfig;
  try {
    if (existsSync(MODELS_FILE)) {
      const raw = Bun.file(MODELS_FILE);
      modelsConfig = JSON.parse(raw.textSync()) as ModelsConfig;
    } else {
      modelsConfig = DEFAULT_MODELS;
      Bun.write(MODELS_FILE, JSON.stringify(DEFAULT_MODELS, null, 2));
    }
  } catch {
    modelsConfig = DEFAULT_MODELS;
  }
  return modelsConfig;
}

function getPricing(model: string): { input: number; output: number } {
  const config = loadModelsConfig();
  const m = model.toLowerCase();
  const matched = config.pricing.find((p: PricingEntry) =>
    m.includes(p.prefix),
  );
  return matched || { input: 0.001, output: 0.002 };
}

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): { cost: number; inputPrice: number; outputPrice: number } {
  const { input: inputPrice, output: outputPrice } = getPricing(model);
  const cost =
    (promptTokens / 1000) * inputPrice +
    (completionTokens / 1000) * outputPrice;
  return { cost, inputPrice, outputPrice };
}

export function formatCost(cost: number): string {
  if (cost < 0.001) return cost.toFixed(6);
  if (cost < 0.01) return cost.toFixed(5);
  if (cost < 0.1) return cost.toFixed(4);
  return cost.toFixed(3);
}
