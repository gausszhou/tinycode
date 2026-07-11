import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import type { Message, SessionData, RoundData, UsageData } from "./types";
import { estimateCost, formatCost } from "./pricing";

const LOG_DIR = join(homedir(), ".tinycode", "logs");
const SESSION_ID = `session_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
const SESSION_START = Date.now();

export function getLogDir(): string {
  mkdirSync(LOG_DIR, { recursive: true });
  return LOG_DIR;
}

export function getSessionId(): string {
  return SESSION_ID;
}

export function getSessionStart(): number {
  return SESSION_START;
}

export function createSession(model: string, resumedFrom?: string): SessionData {
  const session: SessionData = {
    sessionId: SESSION_ID,
    model,
    startedAt: new Date().toISOString(),
    rounds: [],
  };
  if (resumedFrom) session.resumedFrom = resumedFrom;
  return session;
}

export function truncateMessages(msgs: Message[], maxLen = 500): Message[] {
  return msgs.map((m) => {
    if (m.role === "tool" && typeof m.content === "string" && m.content.length > maxLen) {
      return {
        ...m,
        content: m.content.slice(0, maxLen) + `\n...[truncated, kept first ${maxLen} chars]`,
      };
    }
    if (m.tool_calls) {
      return { ...m, tool_calls: m.tool_calls.map((tc) => ({ ...tc })) };
    }
    return m;
  });
}

export function saveSession(
  session: SessionData,
  messages: Message[],
  totalTokens: number,
): void {
  const logDir = getLogDir();
  const logFile = join(logDir, `${SESSION_ID}.json`);
  try {
    session.finishedAt = session.finishedAt || new Date().toISOString();
    session.totalTokens = totalTokens;
    session.totalRounds = session.rounds.length;
    session.messages = truncateMessages(messages);
    writeFileSync(logFile, JSON.stringify(session, null, 2), "utf8");
    console.error(`Session saved: ${logFile}`);
  } catch (e) {
    console.error(`Failed to save session: ${(e as Error).message}`);
  }
}

export function pruneOldLogs(days = 30): void {
  try {
    const logDir = getLogDir();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const entries = readdirSync(logDir, { withFileTypes: true });
    let pruned = 0;
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      const fp = join(logDir, ent.name);
      if (statSync(fp).mtimeMs < cutoff) {
        unlinkSync(fp);
        pruned++;
      }
    }
    if (pruned > 0)
      console.error(`Cleaned ${pruned} log(s) older than ${days} days`);
  } catch {}
}

export function listSessions(): void {
  try {
    const logDir = getLogDir();
    const logs = readdirSync(logDir).filter((f) => f.endsWith(".json"));
    if (logs.length === 0) {
      console.log("(No saved sessions)");
    } else {
      console.log("Saved sessions:");
      for (const log of logs.sort()) {
        try {
          const s = JSON.parse(
            readFileSync(join(logDir, log), "utf8"),
          ) as SessionData;
          const prompt =
            s.messages?.find((m) => m.role === "user")?.content?.slice(
              0,
              60,
            ) || "(no prompt)";
          console.log(
            `  ${s.sessionId}  ${s.totalRounds || s.rounds?.length || "?"} rounds  ${prompt}`,
          );
        } catch {
          console.log(`  ${log}  (unparseable)`);
        }
      }
    }
  } catch {
    console.log("(No saved sessions)");
  }
}

export function loadSession(sessionId: string): SessionData | null {
  const logDir = getLogDir();
  const logFile = join(logDir, `${sessionId}.json`);
  if (!existsSync(logFile)) {
    console.error(`Session log not found: ${logFile}`);
    console.error("Available sessions (use --list-sessions for full list):");
    try {
      const logs = readdirSync(logDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .slice(-5);
      if (logs.length === 0) console.error("  (none)");
      else logs.forEach((f) => console.error(`  ${f.replace(".json", "")}`));
    } catch {}
    return null;
  }
  const data = JSON.parse(readFileSync(logFile, "utf8")) as SessionData & {
    messages: Message[];
  };
  if (!data.messages || !Array.isArray(data.messages)) {
    console.error(`Invalid session log: missing messages array`);
    return null;
  }
  return data;
}

export function printSummary(
  model: string,
  rounds: RoundData[],
  totalTokens: number,
): void {
  const duration = Date.now() - SESSION_START;
  const durStr =
    duration < 1000
      ? `${duration}ms`
      : duration < 60000
        ? `${(duration / 1000).toFixed(1)}s`
        : `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;

  let promptTokens = 0,
    completionTokens = 0,
    cachedTokens = 0,
    uncachedTokens = 0;
  for (const r of rounds) {
    if (r.usage) {
      const u = r.usage as UsageData;
      promptTokens += u.prompt_tokens || 0;
      completionTokens += u.completion_tokens || 0;
      const details = u.prompt_tokens_details || {};
      cachedTokens += details.cached_tokens || 0;
    }
  }
  uncachedTokens = promptTokens - cachedTokens;
  const total = promptTokens + completionTokens;
  const cost = estimateCost(model, promptTokens, completionTokens);

  console.error(`\n═══════════════════════════════════════`);
  console.error(`  Session Summary`);
  console.error(`  ═══════════════════════════════════`);
  console.error(`  ID:      ${SESSION_ID}`);
  console.error(`  Model:   ${model}`);
  console.error(`  Rounds:  ${rounds.length}`);
  console.error(`  Time:    ${durStr}`);
  console.error(`  Input:   ${promptTokens.toLocaleString()} tokens`);
  console.error(`     ├ Cache hit: ${cachedTokens.toLocaleString()}`);
  console.error(`     └ Cache miss: ${uncachedTokens.toLocaleString()}`);
  console.error(`  Output:  ${completionTokens.toLocaleString()} tokens`);
  console.error(`  Total:   ${total.toLocaleString()} tokens`);
  console.error(`  Cost:    ${formatCost(cost.cost)} USD`);
  console.error(`     (In ${cost.inputPrice}/1K, Out ${cost.outputPrice}/1K)`);
  console.error(`  ═══════════════════════════════════`);
}
