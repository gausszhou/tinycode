import { checkDangerous } from "../security";

export const bash = {
  description: "Execute a shell command and return output",
  parameters: {
    type: "object" as const,
    properties: {
      cmd: { type: "string", description: "Command to execute" },
    },
    required: ["cmd"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const cmd = args.cmd as string;
    const danger = checkDangerous(cmd);
    if (danger) return danger;

    const proc = Bun.spawn(["bash", "-c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, 120_000);

    const [stdoutRaw, stderrRaw] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    const MAX_OUTPUT = 5000;
    const out = stdoutRaw.slice(0, MAX_OUTPUT);
    const err = stderrRaw.slice(0, MAX_OUTPUT);
    const outTruncated = stdoutRaw.length > MAX_OUTPUT;
    const errTruncated = stderrRaw.length > MAX_OUTPUT;

    const parts: string[] = [`exit=${exitCode}`];
    if (out) parts.push(`stdout:\n${out}`);
    if (outTruncated)
      parts.push(
        `[stdout truncated: first ${MAX_OUTPUT} chars, original ${stdoutRaw.length} chars]`,
      );
    if (err) parts.push(`stderr:\n${err}`);
    if (errTruncated)
      parts.push(
        `[stderr truncated: first ${MAX_OUTPUT} chars, original ${stderrRaw.length} chars]`,
      );

    return parts.join("\n") || "(no output)";
  },
};
