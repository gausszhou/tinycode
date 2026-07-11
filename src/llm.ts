import { BASE, KEY, MODEL } from "./env";
import { TOOLS } from "./registry";
import type { Message, UsageData } from "./types";

const MAX_RETRIES = 3;
const CALL_TIMEOUT = 120_000;
const MAX_TOOL_RESULT_CHARS = 8000;

export { MAX_TOOL_RESULT_CHARS };

export async function callStream(
  messages: Message[],
  tool_choice: "auto" | "none" = "auto",
): Promise<{ message: Message; usage: UsageData | null }> {
  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tool_choice,
          tools: TOOLS,
          stream: true,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "",
        content = "",
        usage: UsageData | null = null;
      const toolCalls: Record<number, Message["tool_calls"] extends (infer U)[] ? U : never> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data: ")) continue;
          const payload = s.slice(6);
          if (payload === "[DONE]") continue;
          let chunk: any;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            process.stdout.write(delta.content);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx])
                toolCalls[idx] = {
                  id: "",
                  type: "function" as const,
                  function: { name: "", arguments: "" },
                };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name)
                toolCalls[idx].function.name = tc.function.name;
              if (tc.function?.arguments)
                toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
          if (chunk.usage) usage = chunk.usage as UsageData;
        }
      }

      const tcArr = Object.values(toolCalls).filter((tc) => tc.function.name);
      const message: Message = {
        role: "assistant",
        content: content || null,
      };
      if (tcArr.length > 0) message.tool_calls = tcArr as any;
      return { message, usage };
    } catch (e) {
      if (retry === MAX_RETRIES) throw e;
      if ((e as Error).message?.startsWith("API error 4")) throw e;
      const d = 1000 * Math.pow(2, retry);
      console.error(
        `\nCall failed (${(e as Error).message?.slice(0, 60) || "AbortError"}), retrying in ${d / 1000}s (${retry + 1}/${MAX_RETRIES})...`,
      );
      await new Promise((r) => setTimeout(r, d));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("Unreachable");
}

export async function call(
  messages: Message[],
  tool_choice: "auto" | "none" = "auto",
): Promise<{ message: Message; usage: UsageData | null }> {
  for (let i = 0; i <= MAX_RETRIES; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tool_choice,
          tools: TOOLS,
        }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.choices?.length)
        throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
      return {
        message: data.choices[0].message as Message,
        usage: data.usage as UsageData,
      };
    } catch (e) {
      if (i === MAX_RETRIES) throw e;
      if ((e as Error).message?.startsWith("API error 4")) throw e;
      const d = 1000 * Math.pow(2, i);
      console.error(
        `Call failed (${(e as Error).message?.slice(0, 60) || "AbortError"}), ${d / 1000}s retry (${i + 1}/${MAX_RETRIES})...`,
      );
      await new Promise((r) => setTimeout(r, d));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("Unreachable");
}
