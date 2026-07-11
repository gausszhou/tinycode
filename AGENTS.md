# TinyCode — AGENTS.md

## 项目概览

TinyCode 是一个 **Bun + TypeScript** 项目，编译为独立的二进制文件（`bun build --compile`）。  
**零 npm 运行时依赖** — 仅使用 Bun 内置 API（`Bun.file()`、`Bun.spawn()` 等）。

## 关键命令

```bash
bun run src/index.ts "<prompt>"        # 开发模式运行
bun run build                          # 构建二进制 → dist/tinycode(.exe)
dist/tinycode "<prompt>"               # 运行二进制的版本
bun run src/index.ts --resume <id>     # 恢复会话
bun run src/index.ts --list-sessions   # 列出会话
bun test                               # 运行所有测试（单元测试 + 端到端测试）
bun test --timeout 30000               # 长时间超时（bash 测试需要）
bun test tests/e2e.test.ts             # 仅端到端测试
```

## 项目结构

| 路径 | 用途 |
|------|----------|
| `src/index.ts` | 入口 + 主循环 |
| `src/tools/` | 9 个工具，每个独立文件 |
| `src/registry.ts` | `toolRegistry` + `validateArgs()` |
| `src/llm.ts` | `callStream()` SSE 流式传输 |
| `src/session.ts` | 会话日志到 `~/.tinycode/logs/` |
| `src/pricing.ts` | 从 `~/.tinycode/models.json` 读取定价 |
| `tests/` | 9 个 Bun 测试文件（`bun test`） |
| `agent.js` | 旧版单体文件（迁移遗留） |

## 环境与数据

- `.env` 从 `process.cwd()` 加载（开发环境由 Bun 自动加载，二进制手动加载）
- 会话日志：`~/.tinycode/logs/session_*.json`
- 模型定价：`~/.tinycode/models.json`（首次运行时自动创建，包含默认定价）
- 30 天前的日志会自动清理
- 锁文件：`bun.lock`（由 `bun install` 生成）

## 架构注意事项

- **工具注册表模式**：`src/registry.ts` 导入 `src/tools/*.ts`。添加新工具 → 在 `src/tools/` 中创建文件，将其添加到 `src/registry.ts`，添加到 `src/tools/index.ts`。无需修改其他代码。
- **流式输出**：`src/llm.ts` 中的 `callStream()` 处理 SSE 流式传输。主循环和最终兜底轮次均使用此函数。
- **上下文压缩**（`src/context.ts`）：当预估上下文超过限制的 80% 时触发。将旧工具结果截断至 500 字符，保留最近 5 轮完整内容。
- **循环检测**（`src/index.ts`）：追踪最近 8 次工具调用；若任何模式出现 3 次或以上，则注入系统消息要求切换策略。
- **路径沙箱**（`src/security.ts`）：所有文件工具拒绝访问 `process.cwd()` 之外的路径。
- **危险命令过滤器**（`src/security.ts`）：可配置的正则表达式模式列表，用于拦截 `rm -rf /`、`mkfs`、`dd` 等操作。

## 工具行为边界

| 工具 | 限制 |
|------|-------|
| `bash` | 输出截断至 5000 字符/流；超时 120 秒 |
| `read_file` | 最多 2000 行；偏移量从 1 开始 |
| `write_file` | 除非 `overwrite=true`，否则不覆盖；设置后通过 `Bun.write(bak, Bun.file(original))` 创建 `.bak` 备份 |
| `edit_file` | 纯字符串替换（无正则表达式）；除非 `replaceAll=true`，否则需要唯一匹配 |
| `search_content` | 最多 50 条结果；跳过 `node_modules`、`.git`、`logs`、二进制文件、>500KB 的文件 |
| `find_files` | 最多 100 条结果；跳过与搜索内容相同的目录 |
| `web_fetch` | 最多 50000 字符；阻止本地主机/内网 IP（SSRF）；超时 20 秒；最多 3 次重定向 |
| 所有工具结果 | 在 `llm.ts` 中截断至 8000 字符 |

## 会话生命周期

- 最大轮次：30 次工具调用
- 第 30 轮后，如果模型未给出最终答案，会使用 `tool_choice: "none"` 自动注入"给出总结"提示并调用一次 API。
- 会话保存到 `~/.tinycode/logs/session_<ISO 时间戳>.json`
- `--resume <id>` 加载之前会话的消息历史；如果提供了额外的提示词，会将其追加；否则仅从历史记录继续

## 测试

- **框架**：Bun 内置 (`bun test`)，含 `describe`/`it`/`expect`
- **单元测试**：通过 `tests/tools/*.test.ts`、`tests/context.test.ts`、`tests/registry.test.ts`、`tests/pricing.test.ts` 直接调用工具处理程序
- **端到端测试**（`tests/e2e.test.ts`）：缺少 `OPENAI_API_KEY` 或 `OPENAI_MODEL` 时**自动跳过**。通过 `const itIf = runE2e ? it : it.skip` 实现守卫
- **注意事项**：`bash` 测试启动真实子进程，在子进程完成之前可能会持续约 4 秒；长时间超时
- 测试在**隔离的临时目录**（`.test-tmp-*`）中运行文件操作，测试运行后清理
