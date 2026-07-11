import { resolve } from "node:path";
import { isPathAllowed } from "../security";

export const read_file = {
  description:
    "Read file content with optional offset/limit for line range. Returns line-numbered content",
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path" },
      offset: {
        type: "integer",
        description: "Starting line number (1-indexed), default 1",
      },
      limit: {
        type: "integer",
        description: "Max lines to return, default 2000",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const p = resolve(args.path as string);
    if (!isPathAllowed(p)) return "Reading files outside the working directory is not allowed";

    const file = Bun.file(p);
    const raw = await file.text();
    const allLines = raw.split("\n");
    const totalLines = allLines.length;
    const offset = Math.max(1, (args.offset as number) ?? 1);
    const limit = Math.min(Math.max(1, (args.limit as number) ?? 2000), 2000);
    const startIdx = offset - 1;
    const selectedLines = allLines.slice(startIdx, startIdx + limit);

    if (selectedLines.length === 0)
      return `Requested line range [${offset}, ${offset + limit - 1}] exceeds file total ${totalLines}`;

    const numbered = selectedLines
      .map((l: string, i: number) => `${startIdx + i + 1}: ${l}`)
      .join("\n");
    const rangeNote =
      offset > 1 || selectedLines.length < totalLines
        ? ` [lines ${startIdx + 1}-${startIdx + selectedLines.length} of ${totalLines}]`
        : "";
    return `${args.path}${rangeNote}:\n${numbered}`;
  },
};
