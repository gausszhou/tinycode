import { describe, it, expect } from "bun:test";
import { validateArgs, toolRegistry, TOOLS } from "../src/registry";

describe("toolRegistry", () => {
  it("contains all expected tools", () => {
    const names = Object.keys(toolRegistry);
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("bash");
    expect(names).toContain("search_content");
    expect(names).toContain("list_files");
    expect(names).toContain("find_files");
    expect(names).toContain("todo_write");
    expect(names).toContain("web_fetch");
    expect(names.length).toBe(9);
  });

  it("TOOLS array matches registry", () => {
    expect(TOOLS.length).toBe(Object.keys(toolRegistry).length);
    TOOLS.forEach((t) => {
      expect(t.type).toBe("function");
      expect(t.function.name).toBeTruthy();
      expect(t.function.description).toBeTruthy();
    });
  });
});

describe("validateArgs", () => {
  it("passes valid integer args", () => {
    const schema = {
      properties: { count: { type: "integer" } },
      required: ["count"],
    };
    expect(validateArgs("test", { count: 5 }, schema)).toBeNull();
  });

  it("rejects non-integer for integer field", () => {
    const schema = {
      properties: { count: { type: "integer" } },
      required: [],
    };
    expect(validateArgs("test", { count: "five" }, schema)).toMatch(/must be an integer/i);
  });

  it("passes valid string args", () => {
    const schema = {
      properties: { path: { type: "string" } },
      required: ["path"],
    };
    expect(validateArgs("test", { path: "foo.txt" }, schema)).toBeNull();
  });

  it("rejects missing required fields", () => {
    const schema = {
      properties: { path: { type: "string" } },
      required: ["path"],
    };
    expect(validateArgs("test", {}, schema)).toMatch(/missing required/i);
  });

  it("validates enum values", () => {
    const schema = {
      properties: { format: { type: "string", enum: ["text", "html"] } },
      required: [],
    };
    expect(validateArgs("test", { format: "json" }, schema)).toMatch(/not in allowed range/i);
    expect(validateArgs("test", { format: "text" }, schema)).toBeNull();
  });

  it("rejects non-object args", () => {
    expect(validateArgs("test", "string", {})).toMatch(/must be a json object/i);
    expect(validateArgs("test", null, {})).toMatch(/must be a json object/i);
    expect(validateArgs("test", [1, 2], {})).toMatch(/must be a json object/i);
  });
});
