import { describe, it, expect, beforeAll } from "bun:test";
import { $ } from "bun";

const runE2e = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);

const itIf = runE2e ? it : it.skip;

describe("e2e", () => {
  beforeAll(() => {
    if (!runE2e) {
      console.log("Skipping e2e tests: OPENAI_API_KEY or OPENAI_MODEL not set");
    }
  });

  itIf("--help exits 0 and prints usage", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(out).toContain("Usage");
    expect(out).toContain("TinyCode");
  });

  itIf("--version exits 0 and prints version", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(out).toMatch(/v\d+\.\d+\.\d+/);
  });

  itIf("--list-sessions exits 0", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "--list-sessions"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  itIf("prompt executes tools and produces output", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "list files in the current directory"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(out.length).toBeGreaterThan(0);
  }, 60000);
});
