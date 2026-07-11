export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface RoundData {
  round: number;
  durationMs: number;
  usage: unknown | null;
  message: Message;
}

export interface SessionData {
  sessionId: string;
  model: string;
  startedAt: string;
  rounds: RoundData[];
  messages?: Message[];
  totalTokens?: number;
  totalRounds?: number;
  finishedAt?: string;
  resumedFrom?: string;
}

export interface PricingEntry {
  prefix: string;
  input: number;
  output: number;
}

export interface ModelsConfig {
  pricing: PricingEntry[];
  contextLimits: Record<string, number>;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

export interface UsageData {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
}
