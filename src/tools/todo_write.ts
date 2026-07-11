import type { TodoItem } from "../types";

// Module-scoped todo list (shared with index.ts via reference)
export const todoList: TodoItem[] = [];

export const todo_write = {
  description:
    "Create and update a task list to track multi-step task progress. Break complex tasks into subtasks with status and priority",
  parameters: {
    type: "object" as const,
    properties: {
      todos: {
        type: "array",
        description:
          "Task list array. Each call replaces the entire task list. Only one in_progress at a time",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "Task description" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description:
                "pending=not started, in_progress=active (max 1), completed=done, cancelled=skipped",
            },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Priority level",
            },
          },
          required: ["content", "status", "priority"],
        },
      },
    },
    required: ["todos"],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>): Promise<string> => {
    const newTodos = args.todos as TodoItem[];
    todoList.length = 0;
    todoList.push(...newTodos);

    const inProgress = todoList.filter((t) => t.status === "in_progress");
    const pending = todoList.filter((t) => t.status === "pending");
    const completed = todoList.filter((t) => t.status === "completed");
    const total = todoList.length;

    const summary = todoList
      .map((t) => {
        const emoji =
          t.status === "completed"
            ? "✅"
            : t.status === "in_progress"
              ? "🔄"
              : t.status === "cancelled"
                ? "❌"
                : "⏳";
        return `${emoji} [${t.priority}] ${t.content}`;
      })
      .join("\n");

    console.error(`\n📋 Task List (${total} total | ${completed.length} done | ${inProgress.length} active | ${pending.length} pending):\n${summary}\n`);
    return `Task list updated: ${total} item(s), ${completed.length} completed, ${pending.length} pending`;
  },
};
