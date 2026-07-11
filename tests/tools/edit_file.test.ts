import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { edit_file } from "../../src/tools/edit_file";

const tmpDir = join(process.cwd(), ".test-tmp-edit");

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, "edit.txt"), "foo bar baz\nhello world\nfoo bar baz\n");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("edit_file", () => {
  it("replaces unique string", async () => {
    const fp = join(tmpDir, "edit.txt");
    const result = await edit_file.handler({ path: fp, oldString: "hello world", newString: "hi there" });
    expect(result).toMatch(/replaced 1 match/i);
    expect(readFileSync(fp, "utf8")).toContain("hi there");
  });

  it("fails when text not found", async () => {
    const fp = join(tmpDir, "edit.txt");
    const result = await edit_file.handler({ path: fp, oldString: "does not exist", newString: "nope" });
    expect(result).toMatch(/not found/i);
  });

  it("fails on ambiguous match without replaceAll", async () => {
    const fp = join(tmpDir, "edit.txt");
    const result = await edit_file.handler({ path: fp, oldString: "foo bar baz", newString: "replaced" });
    expect(result).toMatch(/found 2 matches/i);
  });

  it("replaces all with replaceAll", async () => {
    const fp = join(tmpDir, "edit.txt");
    const result = await edit_file.handler({ path: fp, oldString: "foo bar baz", newString: "replaced", replaceAll: true });
    expect(result).toMatch(/replaced 2 match/i);
    const content = readFileSync(fp, "utf8");
    expect(content).not.toContain("foo bar baz");
    expect(content).toContain("replaced");
  });

  it("rejects outside cwd", async () => {
    const result = await edit_file.handler({ path: "/etc/passwd", oldString: "root", newString: "user" });
    expect(result).toMatch(/not allowed/i);
  });
});
