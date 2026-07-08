# TinyCode — AI Agent

一个命令行 AI Agent，通过 LLM 调用工具完成软件工程任务。

## 快速开始

```bash
# 1. 安装 Bun（若未安装）
# 2. 配置环境变量（.env 或 export）
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=deepseek-v4-flash

# 3. 运行
bun agent.js "列出当前目录中的 JavaScript 文件"
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | 是 | 兼容 OpenAI 格式的 API 密钥 |
| `OPENAI_MODEL` | 是 | 模型名称（如 `deepseek-v4-flash`, `gpt-4o`） |
| `OPENAI_BASE_URL` | 否 | API 地址，默认 `https://api.openai.com/v1` |

在项目根目录创建 `.env` 文件即可自动加载。

## 可用工具

| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件内容，支持行号范围 |
| `write_file` | 写入文件，自动创建目录，支持覆盖备份 |
| `edit_file` | 精确字符串替换编辑文件 |
| `bash` | 执行 shell 命令 |
| `search_content` | 按正则递归搜索文件内容 |
| `list_files` | 列出目录内容，支持 glob 过滤 |
| `find_files` | 按 glob 递归搜索文件名 |
| `todo_write` | 创建和追踪任务列表 |
| `web_fetch` | 抓取 HTTP/HTTPS URL 内容 |

## 用法

```bash
# 执行任务
bun agent.js "修复 src/app.js 中的拼写错误"

# 恢复历史会话
bun agent.js --resume session_2026-07-09T01-12-49

# 列出所有会话
bun agent.js --list-sessions

# 查看帮助
bun agent.js --help
```

## 功能特性

- SSE 流式输出，实时打印模型回复
- 自动压缩上下文，避免超限
- 指数退避重试 + 请求超时
- Token 用量追踪与费用估算
- 路径沙箱安全保护
- 循环检测与兜底总结
- 会话日志自动保存与恢复

## 许可

MIT
