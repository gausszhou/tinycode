import type { ToolDefinition } from "./types";
import * as tools from "./tools/index";

export const toolRegistry: Record<string, ToolDefinition> = {
  read_file: tools.read_file,
  write_file: tools.write_file,
  edit_file: tools.edit_file,
  bash: tools.bash,
  search_content: tools.search_content,
  list_files: tools.list_files,
  find_files: tools.find_files,
  todo_write: tools.todo_write,
  web_fetch: tools.web_fetch,
};

export const TOOLS = Object.entries(toolRegistry).map(([name, def]) => ({
  type: "function" as const,
  function: {
    name,
    description: def.description,
    parameters: def.parameters as Record<string, unknown>,
  },
}));

export function validateArgs(
  name: string,
  args: unknown,
  schema: { properties?: Record<string, unknown>; required?: string[] },
): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return `Validation failed: args must be a JSON object, got ${typeof args}`;
  }

  const props = (schema?.properties || {}) as Record<
    string,
    { type?: string; enum?: unknown[] }
  >;
  const required = schema?.required || [];

  for (const field of required) {
    if ((args as Record<string, unknown>)[field] === undefined) {
      return `Validation failed: missing required field "${field}"`;
    }
  }

  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const propSchema = props[key];
    if (!propSchema || !propSchema.type) continue;

    switch (propSchema.type) {
      case "integer":
        if (typeof value !== "number" || !Number.isInteger(value))
          return `Validation failed: "${key}" must be an integer, got ${JSON.stringify(value)}`;
        break;
      case "string":
        if (typeof value !== "string")
          return `Validation failed: "${key}" must be a string, got ${JSON.stringify(value)}`;
        break;
      case "array":
        if (!Array.isArray(value))
          return `Validation failed: "${key}" must be an array, got ${JSON.stringify(value)}`;
        break;
      case "boolean":
        if (typeof value !== "boolean")
          return `Validation failed: "${key}" must be a boolean, got ${JSON.stringify(value)}`;
        break;
      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value))
          return `Validation failed: "${key}" must be an object, got ${JSON.stringify(value)}`;
        break;
    }

    if (propSchema.enum && !propSchema.enum.includes(value)) {
      return `Validation failed: "${key}" value "${value}" not in allowed range [${propSchema.enum.join(", ")}]`;
    }
  }

  return null;
}

export async function execTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = toolRegistry[name];
  if (!tool) return `Unknown tool: ${name}`;
  return tool.handler(args);
}
