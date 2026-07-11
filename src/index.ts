import { validateEnv, MODEL } from "./env";
import { ensureDataDir, loadModelsConfig } from "./pricing";
import { estimateMessageTokens, compressMessages, getContextLimit } from "./context";
import {
  getSessionId,
  createSession,
  saveSession,
  pruneOldLogs,
  listSessions,
  loadSession,
  printSummary,
  getSessionStart,
} from "./session";
import { analyzeWorkspace } from "./workspace";
import { callStream, MAX_TOOL_RESULT_CHARS } from "./llm";
import { execTool, validateArgs, TOOLS } from "./registry";
import { todoList } from "./tools/todo_write";
import type { Message, ToolCall, SessionData, UsageData } from "./types";

const VERSION = "0.3.0";
const MAX_ROUNDS = 30;
const LOOP_DETECT_MAX_ENTRIES = 8;
const LOOP_DETECT_THRESHOLD = 3;

// ── Help & Version ──────────────────────────────────────

function showVersion(): void {
  console.log(`TinyCode v${VERSION} - CLI AI Agent`);
  process.exit(0);
}

function showHelp(): void {
  console.log(`
TinyCode v${VERSION} - CLI AI Agent

Usage:
  bun run src/index.ts <prompt>          Execute task
  bun run src/index.ts --resume <id>     Resume session
  bun run src/index.ts --list-sessions   List saved sessions
  bun run src/index.ts --help            Show help
  bun run src/index.ts --version         Show version

Tools:
  read_file       Read file content (supports line range)
  write_file      Write file content (auto-backup, no-overwrite guard)
  edit_file       Precise string replacement in files
  bash            Execute shell commands
  search_content  Recursive regex content search
  list_files      List directory contents
  find_files      Recursive filename search (glob)
  todo_write      Create and track task list
  web_fetch       Fetch HTTP/HTTPS URL content

Env:
  OPENAI_API_KEY     API key (required)
  OPENAI_MODEL       Model name (required)
  OPENAI_BASE_URL    API base URL (default: https://api.openai.com/v1)
`);
  process.exit(0);
}

// ── CLI Parsing ─────────────────────────────────────────

const rawArgs = process.argv.slice(2);

if (rawArgs.some((a) => a === "--version" || a === "-v")) showVersion();
if (rawArgs.some((a) => a === "--help" || a === "-h")) showHelp();

const resumeLong = rawArgs.indexOf("--resume");
const resumeShort = rawArgs.indexOf("-r");
const resumeIdx =
  resumeLong !== -1 ? resumeLong : resumeShort !== -1 ? resumeShort : -1;
let resumeId: string | null = null;

if (resumeIdx !== -1) {
  resumeId = rawArgs[resumeIdx + 1];
  if (!resumeId || resumeId.startsWith("-")) {
    console.error("--resume/-r requires a session ID. Use --list-sessions to list available sessions.");
    process.exit(1);
  }
  rawArgs.splice(resumeIdx, 2);
}

if (rawArgs.indexOf("--list-sessions") !== -1) {
  ensureDataDir();
  listSessions();
  process.exit(0);
}

// ── Init ────────────────────────────────────────────────

validateEnv();
ensureDataDir();
pruneOldLogs();

let totalTokens = 0;
let finished = false;
const CONTEXT_LIMIT = getContextLimit(MODEL);
const WARN_THRESHOLD = Math.floor(CONTEXT_LIMIT * 0.8);
const toolCallHistory: { name: string; args: string }[] = [];

// ── Session Setup ───────────────────────────────────────

let messages: Message[];
let session: SessionData;

if (resumeId) {
  const resumed = loadSession(resumeId);
  if (!resumed) process.exit(1);
  const resumedMessages = (resumed as SessionData & { messages: Message[] }).messages || [];
  session = createSession(MODEL, resumed.sessionId);
  messages = resumedMessages;

  const userPrompt = rawArgs.join(" ");
  if (userPrompt) {
    messages.push({ role: "user", content: userPrompt });
    console.error(`📝 Appended user message: ${userPrompt.slice(0, 80)}${userPrompt.length > 80 ? "..." : ""}`);
  } else {
    console.error("📝 No new prompt, continuing from history");
  }
} else {
  const userPrompt = rawArgs.join(" ");
  if (!userPrompt) {
    console.error("Please provide a prompt, e.g.: bun run src/index.ts \"list files\"");
    console.error("Or use --resume <sessionId> to resume a previous session.");
    process.exit(1);
  }
  const workspaceCtx = analyzeWorkspace();
  const systemMsg = `You are a concise but intelligent AI Agent v${VERSION}. For complex or multi-step tasks, first use todo_write to break down subtasks and plan steps. Execute step by step, updating status after each. Respond directly in text when done.\n\nEnvironment:\n  os=${process.platform}\n  arch=${process.arch}\n  cwd=${process.cwd()}${workspaceCtx}`;
  session = createSession(MODEL);
  messages = [
    { role: "system", content: systemMsg },
    { role: "user", content: userPrompt },
  ];
}

process.on("SIGINT", () => {
  console.error("\n\n⚠️ Interrupted (Ctrl+C), saving session...");
  session.finishedAt = new Date().toISOString();
  saveSession(session, messages, totalTokens);
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.error("\n⚠️ Terminated, saving session...");
  session.finishedAt = new Date().toISOString();
  saveSession(session, messages, totalTokens);
  process.exit(0);
});

// ── Loop Detection ──────────────────────────────────────

function detectLoop(
  history: { name: string; args: string }[],
): { name: string; args: string; count: number } | null {
  if (history.length < LOOP_DETECT_THRESHOLD) return null;
  const recent = history.slice(-LOOP_DETECT_MAX_ENTRIES);
  const counts: Record<string, number> = {};
  for (const entry of recent) {
    const key = `${entry.name}|${entry.args}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(counts)) {
    if (count >= LOOP_DETECT_THRESHOLD) {
      const sepIdx = key.indexOf("|");
      return {
        name: key.slice(0, sepIdx),
        args: key.slice(sepIdx + 1),
        count,
      };
    }
  }
  return null;
}

// ── Main Loop ───────────────────────────────────────────

async function main(): Promise<void> {
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const roundStart = Date.now();

      // Context compression check
      let callMessages = messages;
      const estimated = estimateMessageTokens(messages);
      if (estimated >= WARN_THRESHOLD) {
        console.error(
          `⚠️ Estimated context ${estimated} tokens near limit ${CONTEXT_LIMIT}, compressing...`,
        );
        callMessages = compressMessages(messages);
        const after = estimateMessageTokens(callMessages);
        console.error(
          `✅ Compressed: ${estimated} → ${after} estimated tokens (kept last 5 rounds)`,
        );
      }

      // LLM call
      const { message: m, usage } = await callStream(callMessages);
      if (usage) {
        totalTokens += usage.total_tokens;
        const p = usage.prompt_tokens ?? 0;
        const c = usage.completion_tokens ?? 0;
        const details = usage.prompt_tokens_details || {};
        const cached = details.cached_tokens ?? 0;
        const uncached = p - cached;
        const cacheStr =
          cached > 0
            ? ` (cache hit=${cached}, miss=${uncached})`
            : "";
        const curEst = estimateMessageTokens(messages);
        console.error(
          `[round ${round + 1}] in=${p} out=${c}${cacheStr} | cumulative ${totalTokens} | est context ${curEst}`,
        );
        if (curEst >= CONTEXT_LIMIT) {
          console.error(
            `⚠️ Estimated context ${curEst} tokens exceeds limit ${CONTEXT_LIMIT}`,
          );
        } else if (curEst >= WARN_THRESHOLD) {
          console.error(
            `⚠️ Estimated context ${curEst} tokens near limit ${CONTEXT_LIMIT} (cumulative API: ${totalTokens})`,
          );
        }
      }
      session.rounds.push({
        round: round + 1,
        durationMs: Date.now() - roundStart,
        usage,
        message: m,
      });

      // No tool calls → task done
      if (!m.tool_calls?.length) {
        process.stdout.write("\n");
        finished = true;
        break;
      }

      // Log tool calls
      for (const tc of m.tool_calls) {
        let argsPreview = "";
        try {
          const a = JSON.parse(tc.function.arguments);
          argsPreview = Object.entries(a)
            .map(([k, v]) =>
              typeof v === "string"
                ? `${k}=${(v as string).slice(0, 40)}`
                : `${k}=${JSON.stringify(v)}`,
            )
            .join(", ");
        } catch {}
        console.error(`🔧 ${tc.function.name}(${argsPreview})`);
      }

      messages.push(m);

      // Execute tools in parallel
      const toolResults = await Promise.all(
        m.tool_calls.map(async (tc: ToolCall) => {
          let result: string;
          try {
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(tc.function.arguments);
            } catch (e) {
              result = `Validation failed: cannot parse tool args JSON: ${(e as Error).message}`;
              return { role: "tool" as const, tool_call_id: tc.id, content: result };
            }
            const toolDef = TOOLS.find((t) => t.function.name === tc.function.name);
            const schema = toolDef?.function?.parameters as
              | { properties?: Record<string, unknown>; required?: string[] }
              | undefined;
            const validationError = validateArgs(
              tc.function.name,
              args,
              schema || {},
            );
            if (validationError) {
              result = validationError;
            } else {
              result = await execTool(tc.function.name, args);
            }
          } catch (e) {
            result = `Execution error: ${(e as Error).message}`;
          }
          if (result.length > MAX_TOOL_RESULT_CHARS) {
            result =
              result.slice(0, MAX_TOOL_RESULT_CHARS) +
              `\n...[truncated, kept first ${MAX_TOOL_RESULT_CHARS} chars, original ${result.length} chars]`;
          }
          return { role: "tool" as const, tool_call_id: tc.id, content: result };
        }),
      );

      for (const tr of toolResults) messages.push(tr);

      // Track for loop detection
      for (const tc of m.tool_calls) {
        let argsSig = "";
        try {
          const a = JSON.parse(tc.function.arguments);
          argsSig = Object.entries(a)
            .map(([k, v]) =>
              typeof v === "string"
                ? `${k}=${(v as string).slice(0, 40)}`
                : `${k}=${JSON.stringify(v).slice(0, 40)}`,
            )
            .sort()
            .join("&");
        } catch {
          argsSig = (tc.function.arguments || "").slice(0, 60);
        }
        toolCallHistory.push({ name: tc.function.name, args: argsSig });
      }

      const loop = detectLoop(toolCallHistory);
      if (loop) {
        console.error(
          `⚠️ Loop detected (tool: ${loop.name}, repeated ${loop.count}x), sending strategy change signal...`,
        );
        messages.push({
          role: "system",
          content: `⚠️ Loop detected: you called ${loop.name} ${loop.count} times with similar args. Try a different approach or use another tool.`,
        });
      }
    }

    // Fallback: max rounds reached
    if (!finished) {
      console.error(
        "⚠️ Max rounds (30) reached, requesting final summary...",
      );
      messages.push({
        role: "user",
        content:
          "You've reached the maximum tool call limit. Give your final result and summary based on what you've done so far. Do not call any tools.",
      });

      let finalCallMessages = messages;
      const finalEst = estimateMessageTokens(messages);
      if (finalEst >= WARN_THRESHOLD) {
        console.error(
          `⚠️ Final round est ${finalEst} tokens exceeds limit, compressing...`,
        );
        finalCallMessages = compressMessages(messages);
        console.error(
          `✅ Compressed: ${finalEst} → ${estimateMessageTokens(finalCallMessages)} est tokens`,
        );
      }

      const { message: finalM, usage: finalUsage } = await callStream(
        finalCallMessages,
        "none",
      );
      if (finalUsage) totalTokens += finalUsage.total_tokens;
      if (finalUsage) {
        const d = finalUsage.prompt_tokens_details || {};
        const fc = d.cached_tokens ?? 0;
        const fu = (finalUsage.prompt_tokens ?? 0) - fc;
        console.error(
          `  Final round: in=${finalUsage.prompt_tokens ?? 0}${fc > 0 ? ` (hit=${fc}, miss=${fu})` : ""} out=${finalUsage.completion_tokens ?? 0}`,
        );
      }
      session.rounds.push({
        round: session.rounds.length + 1,
        durationMs: 0,
        usage: finalUsage,
        message: finalM,
      });
      if (!finalM.content) console.log("(no output)");
      else process.stdout.write("\n");
    }
  } finally {
    printSummary(MODEL, session.rounds, totalTokens);
    session.finishedAt = new Date().toISOString();
    saveSession(session, messages, totalTokens);
  }
}

main().catch((e) => {
  console.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
