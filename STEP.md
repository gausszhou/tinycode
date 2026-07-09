1

改进方向：当前 `agent.js` 缺少对 `OPENAI_API_KEY`、`OPENAI_MODEL` 等环境变量的校验，配置缺失时会抛出隐晦的网络/JSON 解析错误。本轮在启动阶段做友好校验。

2

本轮改进：添加 `read_file` 工具，让 Agent 除了执行 bash 命令外还能读取文件内容。

3

为 LLM API 调用添加带指数退避的重试逻辑 + 请求超时控制。

4

添加 `write_file` 工具（含路径安全校验）。

5

添加危险命令安全过滤器（`DANGEROUS_PATTERNS` + `checkDangerous`）。

6

新增 Token 用量追踪：从 API 响应中提取用量信息，展示每轮 Token 消耗，统计累计用量，超出上下文限制时发出警告。

7

改进内容：为 `read_file` 工具添加路径沙箱，禁止读取工作目录外的文件。之前只有 `write_file` 有路径限制，`read_file` 可以读取系统任意文件（如 `/etc/passwd`），现在两者行为一致，都受 `process.cwd()` 约束。

8

会话日志（Session Logging）。

9

将 `bash` 工具从 `execSync` 改为 `spawnSync`，捕获退出码、stdout 和 stderr，让 LLM 能看到命令失败的具体原因。

10

为 `read_file` 输出添加行号标注，使 LLM 能更方便地引用文件中的具体位置。

11

添加 `search_content` 工具 —— 在代码库中按正则搜索文件内容。

12

当前 Agent 缺少最基本的文件探索能力 —— 无法列出目录内容，只能通过 `search_content` 盲目搜索。本轮添加 `list_files` 工具。

13

统一 `list_files` 和 `search_content` 的 glob 过滤，提取 `globToRegex` 共享函数，新增 `{a,b}` 大括号展开（brace expansion）支持。

14

第 14 轮：达到最大轮次时强制获取最终总结。之前 `agent.js` 在执行满 30 轮后如果模型仍未给出最终回答，会静默退出，用户看不到任何输出。现在：
1. 引入 `finished` 标志跟踪模型是否已产出最终回答
2. 循环结束后，若 `!finished`，自动追加一条 `user` 消息要求模型基于已完成的工作直接给出总结，并再调用一次 LLM 获取最终结果
3. 最终总结轮的用量也会计入 `totalTokens` 和会话日志

15

修改 `execTool` 为异步 + `bash` 改用 `child_process.exec` + `Promise.all` 并行执行工具。

16

添加 `find_files` 工具 —— 递归搜索匹配 glob 模式的文件。当前仅有 `list_files`（单层目录）和 `search_content`（按内容搜索），缺少按文件名递归查找的能力。

17

添加 `edit_file` 工具 —— 支持精确字符串替换的文件编辑能力，避免小改动就必须重写整个文件。

18

`call()` 函数新增 `tool_choice` 参数（默认 `"auto"`），最终降级轮次使用 `tool_choice: "none"` 强制模型给出文本回复，防止在达到最大轮次时仍尝试调用工具。

19

新增 `todo_write` 工具，让 Agent 能将复杂任务拆解为子任务并追踪进度。

20

上下文窗口智能管理（`agent.js:86-130`）：
- `estimateTokens` / `estimateMessageTokens` —— 基于字符数（4 字符 ≈ 1 token）预估消息 token 用量
- `compressMessages` —— 当预估 tokens 超过 80% 上下文限制时，截断旧轮次的工具结果至 500 字符，保留最近 5 轮完整结果
- 主循环中每轮调用前自动估算并压缩，同时应用于"最大轮次"兜底分支
- 日志增强：每轮输出同时显示 API 累计 tokens 和预估上下文 tokens

21

`read_file` 工具增加 `offset` 和 `limit` 参数支持按行号范围读取（默认 offset=1, limit=2000, 最大 2000 行），输出增加行号标注和范围提示（如 `[lines 250-299 of 376]`），超出文件行数时返回明确错误提示。

22

在执行工具前对参数做 JSON Schema 校验：
- 检查必填字段是否存在
- 检查类型（string / integer / array / object）是否匹配
- 检查 enum 枚举值是否在允许范围
- JSON 解析失败时给出明确错误信息而非崩溃

23

新增 SSE 流式输出支持 —— 新增 `callStream()` 函数，通过 `fetch` + `ReadableStream` 解析 OpenAI 兼容的 SSE 事件流，实时将模型输出逐字符打印到 stdout，不再等待完整响应。主循环和最终轮都改用 `callStream`。

24

新增 `edit_file` 工具 —— 精确的字符串替换文件编辑。支持单次替换（要求唯一匹配）和 `replaceAll` 模式。验证文件存在性，统计匹配次数，当目标字符串存在歧义（多次匹配但未使用 `replaceAll`）或未找到时返回描述性错误信息。

25

添加 `web_fetch` 工具，使 Agent 具备抓取 HTTP/HTTPS URL 的能力（含 SSRF 防护、超时控制、HTML 去标签），让 Agent 能力更完整。

26

新增功能：
- `--resume` / `-r <会话ID>` —— 从之前的会话日志恢复上下文继续工作，Agent 会记住之前创建了哪些文件、做了哪些操作。
- `--list-sessions` —— 列出所有已保存的会话及其摘要。

27

Token 用量区分缓存命中/未命中：从 API 的 `prompt_tokens_details.cached_tokens` 提取缓存命中 tokens，在每轮日志和会话摘要中分别展示缓存命中数与未命中数，便于监控实际消耗。

28

工具模块化注册：将 `execTool` 的 240 行 if-else 链重构为 `toolRegistry` 注册表模式。每个工具是一个独立的 `{ schema, handler }` 模块，`TOOLS` 数组由注册表自动生成。新增工具只需在注册表中添加一条记录，消除耦合，提升可维护性。

29

会话日志存储优化：保存日志时截断工具结果至 500 字符，保留 `--resume` 所需的基础消息结构；启动时自动清理 30 天前的旧日志，减少长期使用产生的磁盘占用。

30

系统提示词精简：移除系统提示中与 `tools` 参数重复的工具描述，精简行为指令至核心约束，每轮节省约 150–200 tokens 的系统提示开销。
