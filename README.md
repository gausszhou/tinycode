# TinyCode — AI Agent

A CLI AI Agent that uses LLM API calls to complete software engineering tasks.

Built with **Bun + TypeScript**. Compiles to a standalone binary via `bun build --compile`.

## Quick Start

```bash
# 1. Install Bun (if not installed)
# 2. Configure environment variables (.env or export)
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=deepseek-v4-flash

# 3. Run (development)
bun run src/index.ts "list JavaScript files in the current directory"

# 4. Build binary
bun run build

# 5. Run binary
./dist/tinycode "list JavaScript files in the current directory"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI-compatible API key |
| `OPENAI_MODEL` | Yes | Model name (e.g. `deepseek-v4-flash`, `gpt-4o`) |
| `OPENAI_BASE_URL` | No | API base URL, default `https://api.openai.com/v1` |

Create a `.env` file in the project root. Auto-loaded at startup.

## Usage

```bash
bun run src/index.ts "<prompt>"            # Execute task
bun run src/index.ts --resume <sessionId>  # Resume session
bun run src/index.ts --list-sessions       # List all sessions
bun run src/index.ts --help                # Show help
bun run src/index.ts --version             # Show version

bun run build                              # Build binary (output: dist/tinycode.exe)
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run src/index.ts <prompt>` | Run a task |
| `bun run build` | Build standalone binary |
| `bun run dev` | Alias for `bun run src/index.ts` |

## Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file with optional line range |
| `write_file` | Write file, auto-create dirs, backup on overwrite |
| `edit_file` | Precise string replacement (no regex) |
| `bash` | Execute shell commands (120s timeout) |
| `search_content` | Recursive regex content search |
| `list_files` | List directory contents with glob filter |
| `find_files` | Recursive filename search (glob) |
| `todo_write` | Create and track task list |
| `web_fetch` | Fetch HTTP/HTTPS content (SSRF-protected) |

## Features

- SSE streaming output
- Automatic context compression (80% limit threshold)
- Exponential backoff retry + request timeout
- Token tracking and cost estimation
- Path sandboxing security
- Loop detection and fallback summary
- Session logging to `~/.tinycode/logs/`
- Model pricing from `~/.tinycode/models.json` (auto-created)
- Session resume (`--resume`)

## Project Structure

```
src/
├── index.ts          # Entry point, main loop
├── types.ts          # TypeScript interfaces
├── env.ts            # Environment validation
├── llm.ts            # API calls (SSE streaming)
├── registry.ts       # Tool registry (toolRegistry + TOOLS)
├── context.ts        # Context compression
├── security.ts       # Path sandbox, dangerous command filter
├── pricing.ts        # Model pricing (~/.tinycode/models.json)
├── session.ts        # Session logging/resume
├── workspace.ts      # Workspace analysis
└── tools/            # Tool implementations
    ├── read_file.ts
    ├── write_file.ts
    ├── edit_file.ts
    ├── bash.ts
    ├── search_content.ts
    ├── list_files.ts
    ├── find_files.ts
    ├── todo_write.ts
    └── web_fetch.ts
```

## License

MIT
