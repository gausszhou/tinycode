import { resolve, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { isPathAllowed } from "../security";

export const write_file = {
  description:
    "Write file content, auto-creating parent directories. If file exists and overwrite=true, backs up to .bak before overwriting",
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path (relative only)" },
      content: { type: "string", description: "Content to write" },
      overwrite: {
        type: "boolean",
        description:
          "Whether to overwrite existing file (default false). When true, auto-backs up the original file",
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const p = resolve(args.path as string);
    if (!isPathAllowed(p)) return "Writing files outside the working directory is not allowed";

    mkdirSync(dirname(p), { recursive: true });

    if (existsSync(p)) {
      if (!args.overwrite)
        return `File already exists: ${args.path}\nSet overwrite=true to overwrite. Use read_file first to check contents.`;

      let bakPath = p + ".bak";
      let idx = 0;
      while (existsSync(bakPath + (idx > 0 ? `.${idx}` : ""))) idx++;
      const finalBakPath = idx > 0 ? bakPath + `.${idx}` : bakPath;
      const finalBakName =
        idx > 0 ? `${args.path}.bak.${idx}` : `${args.path}.bak`;

      await Bun.write(finalBakPath, Bun.file(p));
      await Bun.write(p, args.content as string);
      return `Overwritten ${args.path} (${(args.content as string).length} chars)\nBackup saved to ${finalBakName}`;
    }

    await Bun.write(p, args.content as string);
    return `Written ${args.path} (${(args.content as string).length} chars)`;
  },
};
