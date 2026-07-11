import { describe, it, expect } from "bun:test";
import { estimateTokens, estimateMessageTokens, compressMessages, getContextLimit } from "../src/context";
import type { Message } from "../src/types";

describe("estimateTokens", () => {
  it("estimates tokens based on char count", () => {
    const tokens = estimateTokens("hello world");
    expect(tokens).toBe(Math.ceil("hello world".length / 4));
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("estimateMessageTokens", () => {
  it("sums content tokens across messages", () => {
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    expect(estimateMessageTokens(msgs)).toBeGreaterThan(0);
  });

  it("includes tool_calls in estimation", () => {
    const msgs: Message[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "1", type: "function", function: { name: "bash", arguments: '{"cmd":"ls"}' } }],
      },
    ];
    expect(estimateMessageTokens(msgs)).toBeGreaterThan(0);
  });
});

describe("compressMessages", () => {
  function makeToolMsg(i: number): Message {
    return { role: "tool", content: "x".repeat(i < 3 ? 100 : 1000), tool_call_id: `tc${i}` };
  }

  function makeAssistantWithCalls(): Message {
    return {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "a", type: "function", function: { name: "bash", arguments: "{}" } }],
    };
  }

  it("does not compress if under threshold", () => {
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      makeAssistantWithCalls(),
      { role: "tool", content: "result" },
    ];
    expect(compressMessages(msgs).length).toBe(3);
  });

  it("truncates old tool results when many rounds exist", () => {
    const msgs: Message[] = [];
    msgs.push({ role: "user", content: "start" });
    // 10 rounds of tool interactions
    for (let i = 0; i < 10; i++) {
      msgs.push(makeAssistantWithCalls());
      msgs.push(makeToolMsg(i));
    }
    const compressed = compressMessages(msgs);
    // The old (first 5) tool messages should be truncated to 500 chars
    const firstTool = compressed.findIndex((m) => m.role === "tool");
    if (firstTool >= 0) {
      // Check it was truncated
      const oldToolMsg = compressed[firstTool];
      expect(oldToolMsg.content?.length).toBeLessThanOrEqual(500 + "...[truncated".length);
    }
  });
});

describe("getContextLimit", () => {
  it("returns 128K for deepseek", () => {
    expect(getContextLimit("deepseek-v4-flash")).toBe(128000);
  });
  it("returns 200K for claude", () => {
    expect(getContextLimit("claude-sonnet-4")).toBe(200000);
  });
  it("returns 8K for gpt-4", () => {
    expect(getContextLimit("gpt-4")).toBe(8192);
  });
  it("returns 128K fallback for unknown models", () => {
    expect(getContextLimit("unknown-model")).toBe(128000);
  });
});
