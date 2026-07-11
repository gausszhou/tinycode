import type { Message } from "./types";

const EST_CHAR_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / EST_CHAR_PER_TOKEN);
}

export function estimateMessageTokens(msgs: Message[]): number {
  let total = 0;
  for (const m of msgs) {
    total += estimateTokens(m.content || "");
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        total += estimateTokens(JSON.stringify(tc.function));
      }
    }
  }
  return total;
}

const COMPRESS_KEEP_RECENT = 5;
const COMPRESS_MAX_RESULT = 500;

export function compressMessages(msgs: Message[]): Message[] {
  const toolRoundStarts: number[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "assistant" && msgs[i].tool_calls?.length) {
      toolRoundStarts.push(i);
    }
  }
  if (toolRoundStarts.length <= COMPRESS_KEEP_RECENT) return msgs;
  const cutoffIdx =
    toolRoundStarts[toolRoundStarts.length - COMPRESS_KEEP_RECENT];
  const result: Message[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (i < cutoffIdx && msgs[i].role === "tool") {
      const content = msgs[i].content || "";
      if (content.length > COMPRESS_MAX_RESULT) {
        result.push({
          ...msgs[i],
          content:
            content.slice(0, COMPRESS_MAX_RESULT) +
            `\n...[truncated, kept first ${COMPRESS_MAX_RESULT} chars]`,
        });
      } else {
        result.push(msgs[i]);
      }
    } else {
      result.push(msgs[i]);
    }
  }
  return result;
}

export function getContextLimit(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("deepseek")) return 128_000;
  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo")) return 128_000;
  if (m.includes("gpt-4")) return 8_192;
  if (m.includes("gpt-3.5")) return 16_385;
  if (m.includes("claude")) return 200_000;
  if (m.includes("qwen")) return 128_000;
  return 128_000;
}
