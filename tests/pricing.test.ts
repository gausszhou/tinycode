import { describe, it, expect } from "bun:test";
import { formatCost } from "../src/pricing";
import { loadModelsConfig, ensureDataDir } from "../src/pricing";

describe("pricing", () => {
  it("loads models config without error", () => {
    ensureDataDir();
    const config = loadModelsConfig();
    expect(config.pricing.length).toBeGreaterThan(0);
    expect(config.contextLimits).toBeDefined();
  });

  it("contains known models", () => {
    const config = loadModelsConfig();
    const prefixes = config.pricing.map((p) => p.prefix);
    expect(prefixes).toContain("deepseek");
    expect(prefixes).toContain("gpt-4o");
    expect(prefixes).toContain("claude");
  });
});

describe("formatCost", () => {
  it("formats tiny costs", () => {
    expect(formatCost(0.000001)).toMatch(/^0\.\d+$/);
  });
  it("formats normal costs", () => {
    expect(formatCost(0.01)).toBe("0.0100");
  });
  it("formats large costs", () => {
    expect(formatCost(1.5)).toBe("1.500");
  });
});
