import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { isPathAllowed } from "../security";

export const edit_file = {
  description:
    "Precise string replacement in files. oldString must be unique (or use replaceAll=true). No regex support",
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path (relative only)" },
      oldString: {
        type: "string",
        description: "Text to replace, must match uniquely",
      },
      newString: { type: "string", description: "Replacement text" },
      replaceAll: {
        type: "boolean",
        description:
          "Replace all matches (default false, only replaces the first unique match)",
      },
    },
    required: ["path", "oldString", "newString"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const p = resolve(args.path as string);
    if (!isPathAllowed(p))
      return "Editing files outside the working directory is not allowed";
    if (!existsSync(p)) return `Edit failed: file ${args.path} does not exist`;

    const file = Bun.file(p);
    const raw = await file.text();
    const oldStr = args.oldString as string;
    const newStr = args.newString as string;

    const count = raw.split(oldStr).length - 1;
    if (count === 0)
      return `Edit failed: text not found in file. Use read_file to check actual content.`;
    if (count > 1 && !args.replaceAll)
      return `Edit failed: found ${count} matches. Provide more context for unique match, or set replaceAll=true`;

    const newContent = args.replaceAll
      ? raw.split(oldStr).join(newStr)
      : raw.replace(oldStr, newStr);
    await Bun.write(p, newContent);

    const replaced = args.replaceAll ? count : 1;
    return `Edited ${args.path}: replaced ${replaced} match(es)`;
  },
};
