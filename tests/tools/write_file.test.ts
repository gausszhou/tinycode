import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { write_file } from "../../src/tools/write_file";

const tmpDir = join(process.cwd(), ".test-tmp-write");

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("write_file", () => {
  it("writes a new file", async () => {
    const fp = join(tmpDir, "new.txt");
    const result = await write_file.handler({ path: fp, content: "hello" });
    expect(result).toMatch(/written/i);
    expect(readFileSync(fp, "utf8")).toBe("hello");
  });

  it("refuses to overwrite without overwrite flag", async () => {
    const fp = join(tmpDir, "existing.txt");
    await write_file.handler({ path: fp, content: "original" });
    const result = await write_file.handler({ path: fp, content: "new" });
    expect(result).toMatch(/already exists/i);
    expect(readFileSync(fp, "utf8")).toBe("original");
  });

  it("creates backup when overwriting", async () => {
    const fp = join(tmpDir, "backup-test.txt");
    await write_file.handler({ path: fp, content: "original" });
    const result = await write_file.handler({ path: fp, content: "new", overwrite: true });
    expect(result).toMatch(/overwritten/i);
    expect(result).toMatch(/backup/i);
    expect(readFileSync(fp, "utf8")).toBe("new");
  });

  it("rejects outside cwd", async () => {
    const result = await write_file.handler({ path: "/etc/evil.txt", content: "bad" });
    expect(result).toMatch(/not allowed/i);
  });
});
