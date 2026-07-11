import { describe, it, expect } from "bun:test";
import { bash } from "../../src/tools/bash";

describe("bash", () => {
  it("runs a command and returns output", async () => {
    const result = await bash.handler({ cmd: "echo hello world" });
    expect(result).toContain("hello world");
    expect(result).toContain("exit=0");
  });

  it("captures exit code on failure", async () => {
    const result = await bash.handler({ cmd: "exit 42" });
    expect(result).toContain("exit=42");
  });

  it("captures stderr on error", async () => {
    const result = await bash.handler({ cmd: "node -e \"process.stderr.write('err msg'); process.exit(1)\"" });
    expect(result).toContain("err msg");
    expect(result).toContain("exit=1");
  });

  it("truncates stdout > 5000 chars", async () => {
    const result = await bash.handler({ cmd: "node -e \"process.stdout.write('x'.repeat(6000))\"" });
    expect(result).toContain("stdout truncated");
  });

  it("blocks dangerous commands", async () => {
    const result = await bash.handler({ cmd: "rm -rf /" });
    expect(result).toMatch(/blocked/i);
  });
});
