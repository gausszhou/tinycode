import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { read_file } from "../../src/tools/read_file";

const tmpDir = join(process.cwd(), ".test-tmp-read");

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, "test.txt"), "line1\nline2\nline3\nline4\nline5\n");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("read_file", () => {
  it("reads whole file", async () => {
    const result = await read_file.handler({ path: join(tmpDir, "test.txt") });
    expect(result).toContain("line1");
    expect(result).toContain("line5");
    expect(result).toContain("test.txt");
  });

  it("reads with offset and limit", async () => {
    const result = await read_file.handler({ path: join(tmpDir, "test.txt"), offset: 2, limit: 2 });
    expect(result).toContain("2: line2");
    expect(result).toContain("3: line3");
    expect(result).not.toContain("line1");
    expect(result).not.toContain("line4");
    expect(result).toMatch(/\[lines 2-3 of (5|6)\]/);
  });

  it("rejects outside cwd", async () => {
    const result = await read_file.handler({ path: "/etc/passwd" });
    expect(result).toMatch(/not allowed/i);
  });

  it("returns error for out-of-range offset", async () => {
    const result = await read_file.handler({ path: join(tmpDir, "test.txt"), offset: 100, limit: 10 });
    expect(result).toMatch(/exceeds file total/i);
  });

  it("caps limit at 2000", async () => {
    const result = await read_file.handler({ path: join(tmpDir, "test.txt"), limit: 9999 });
    expect(result).toContain("line1");
    expect(result).toContain("line5");
  });
});
