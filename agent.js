// 自动加载 .env 文件（如果存在）
(function loadEnv() {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const envFile = path.join(process.cwd(), '.env');
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // 移除可选引号
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
          value = value.slice(1, -1);
        // 只在环境变量未设置时写入，避免覆盖已有的环境变量
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch (e) {
    // .env 加载失败不应阻止程序运行
  }
})();

const required = ["OPENAI_API_KEY", "OPENAI_MODEL"];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`缺少环境变量: ${missing.join(", ")}`);
  console.error("请设置: export OPENAI_API_KEY=sk-xxx OPENAI_MODEL=deepseek-v4-pro");
  console.error("或在当前目录创建 .env 文件，例如:");
  console.error("  OPENAI_API_KEY=sk-xxx");
  console.error("  OPENAI_MODEL=deepseek-v4-pro");
  console.error("  OPENAI_BASE_URL=https://api.openai.com/v1");
  process.exit(1);
}
const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL;

const VERSION = "0.2.0";

const showVersion = process.argv.slice(2).some(a => a === "--version" || a === "-v");
if (showVersion) {
  console.log(`🤖 AI Agent v${VERSION}`);
  process.exit(0);
}

const showHelp = process.argv.slice(2).some(a => a === "--help" || a === "-h");
if (showHelp) {
  console.log(`🤖 AI Agent v${VERSION} - 智能命令行助手

用法:
  bun agent.js <prompt>                     执行任务
  bun agent.js --resume <sessionId>         恢复历史会话
  bun agent.js -r <sessionId>               同上
  bun agent.js --list-sessions              列出已保存的会话
  bun agent.js --help                       显示此帮助信息
  bun agent.js -h                           同上

可用工具:
  read_file       读取文件内容（支持行号范围）
  write_file      写入文件内容（自动创建父目录，防覆盖+自动备份）
  edit_file       精确字符串替换编辑文件
  bash            执行 shell 命令
  search_content  递归搜索文件内容（支持正则）
  list_files      列出目录中的文件和子目录
  find_files      递归搜索文件名（支持 glob）
  todo_write      创建和更新任务列表
  web_fetch       抓取 HTTP/HTTPS URL 内容

版本:
  v${VERSION}

环境变量:
  OPENAI_API_KEY      API 密钥（必需）
  OPENAI_MODEL        模型名称（必需）
  OPENAI_BASE_URL     API 基础地址（可选，默认 https://api.openai.com/v1）

会话管理:
  每次执行自动保存日志到 logs/ 目录
  使用 --list-sessions 查看历史会话
  使用 --resume <sessionId> 继续之前的会话

示例:
  bun agent.js "列出当前目录中的 JavaScript 文件"
  bun agent.js --resume session_2025-01-01T12-00-00 "继续优化代码"
  bun agent.js --list-sessions`);
  process.exit(0);
}

let resumeId = null;
const rawArgs = process.argv.slice(2);
const resumeLong = rawArgs.indexOf("--resume");
const resumeShort = rawArgs.indexOf("-r");
const resumeIdx = resumeLong !== -1 ? resumeLong : (resumeShort !== -1 ? resumeShort : -1);
if (resumeIdx !== -1) {
  resumeId = rawArgs[resumeIdx + 1];
  if (!resumeId || resumeId.startsWith("-")) {
    console.error("--resume/-r 需要指定会话ID。使用 --list-sessions 列出可用会话。");
    process.exit(1);
  }
  rawArgs.splice(resumeIdx, 2);
}

const listSessions = rawArgs.indexOf("--list-sessions") !== -1;
if (listSessions) {
  const fs = require('node:fs');
  const logDir = require('node:path').join(process.cwd(), 'logs');
  try {
    const logs = fs.readdirSync(logDir).filter(f => f.endsWith('.json'));
    if (logs.length === 0) {
      console.log("(无已保存的会话)");
    } else {
      console.log("已保存的会话:");
      for (const log of logs.sort()) {
        try {
          const s = JSON.parse(fs.readFileSync(require('node:path').join(logDir, log), 'utf8'));
          const prompt = s.messages?.find?.(m => m.role === "user")?.content?.slice(0, 60) || "(无提示词)";
          console.log(`  ${s.sessionId}  ${s.totalRounds || s.rounds?.length || '?'}轮  ${prompt}`);
        } catch (e) {
          console.log(`  ${log}  (无法解析)`);
        }
      }
    }
  } catch (e) {
    console.log("(无已保存的会话)");
  }
  process.exit(0);
}

const TOOLS = [
  { type: "function", function: { name: "read_file", description: "读取文件内容，可选 offset/limit 按行号范围读取。返回带行号标注的内容", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径" }, offset: { type: "integer", description: "起始行号（1-indexed），默认第 1 行" }, limit: { type: "integer", description: "最大返回行数，默认 2000 行" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "write_file", description: "写入文件内容，自动创建父目录。如果文件已存在且未设置 overwrite=true，则不会覆盖并返回提示。设置 overwrite=true 时会自动备份原文件到 .bak 文件后再覆盖。", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径(只允许相对路径)" }, content: { type: "string", description: "要写入的内容" }, overwrite: { type: "boolean", description: "是否覆盖已存在的文件（默认 false）。为 true 时会自动备份原文件" } }, required: ["path", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "edit_file", description: "对文件做精确字符串替换。oldString 必须在文件中唯一匹配，否则返回错误要求提供更多上下文。可用 replaceAll=true 替换所有匹配。不支持正则表达式。", parameters: { type: "object", properties: { path: { type: "string", description: "文件路径(只允许相对路径)" }, oldString: { type: "string", description: "要替换的原始文本，必须在文件中唯一匹配" }, newString: { type: "string", description: "替换后的新文本" }, replaceAll: { type: "boolean", description: "是否替换所有匹配（默认 false，即只替换唯一匹配的第一个）" } }, required: ["path", "oldString", "newString"], additionalProperties: false } } },
  { type: "function", function: { name: "bash", description: "执行 shell 命令并返回输出", parameters: { type: "object", properties: { cmd: { type: "string", description: "要执行的命令" } }, required: ["cmd"], additionalProperties: false } } },
  { type: "function", function: { name: "search_content", description: "递归搜索目录中匹配正则模式的文件内容，返回相对路径、行号和匹配行（自动跳过 node_modules、.git、logs 目录和二进制文件，最多返回 50 条结果）", parameters: { type: "object", properties: { pattern: { type: "string", description: "正则表达式搜索模式" }, path: { type: "string", description: "搜索起始目录，默认当前工作目录" }, include: { type: "string", description: "文件名 glob 过滤，如 '*.js'、'*.{ts,js}' 或 '.ts'" } }, required: ["pattern"], additionalProperties: false } } },
  { type: "function", function: { name: "list_files", description: "列出指定目录中的文件和子目录（不递归），支持可选的文件名 glob 过滤（仅匹配文件名，支持 *、?、{a,b}）", parameters: { type: "object", properties: { path: { type: "string", description: "要列出的目录路径，不指定则默认为当前工作目录" }, glob: { type: "string", description: "可选的 glob 模式，仅过滤文件名，如 '*.js' 或 '*.{ts,js}'" } }, required: [], additionalProperties: false } } },
  { type: "function", function: { name: "find_files", description: "递归搜索匹配文件名 glob 模式的文件，返回相对路径列表。自动跳过 node_modules、.git、logs、__pycache__、.venv、dist 和隐藏目录，最多返回 100 条结果", parameters: { type: "object", properties: { pattern: { type: "string", description: "文件名 glob 模式，如 '*.js'、'*.{ts,js}' 或 'test*'" }, path: { type: "string", description: "搜索起始目录，默认当前工作目录" } }, required: ["pattern"], additionalProperties: false } } },
  { type: "function", function: { name: "todo_write", description: "创建和更新任务列表以追踪多步骤任务的进度。将复杂任务拆解为子项，标记每项的状态和优先级。每轮最多只有一个 in_progress 项。完成后直接用文本回复，不要调此工具。", parameters: { type: "object", properties: { todos: { type: "array", description: "任务列表数组，每次调用会完全替换当前任务列表", items: { type: "object", properties: { content: { type: "string", description: "任务描述" }, status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"], description: "pending=未开始, in_progress=进行中(最多1个), completed=已完成, cancelled=已取消" }, priority: { type: "string", enum: ["high", "medium", "low"], description: "优先级" } }, required: ["content", "status", "priority"] } } }, required: ["todos"], additionalProperties: false } } },
  { type: "function", function: { name: "web_fetch", description: "抓取HTTP/HTTPS URL的内容。自动拦截内网地址和localhost防止SSRF。默认返回纯文本（去除HTML标签），可指定format=html获取原始HTML。最大返回50000字符。", parameters: { type: "object", properties: { url: { type: "string", description: "要抓取的URL（http/https），自动跟随重定向" }, format: { type: "string", enum: ["text", "html", "json"], description: "返回格式：text=纯文本（去除HTML标签和script/style），html=原始HTML，json=自动解析美化JSON。默认text" } }, required: ["url"], additionalProperties: false } } }
];

const todos = [];
const toolCallHistory = [];
const LOOP_DETECT_MAX_ENTRIES = 8;
const LOOP_DETECT_THRESHOLD = 3;

const detectLoop = (history) => {
  if (history.length < LOOP_DETECT_THRESHOLD) return null;
  const recent = history.slice(-LOOP_DETECT_MAX_ENTRIES);
  const counts = {};
  const firstSeen = {};
  for (let i = 0; i < recent.length; i++) {
    const entry = recent[i];
    const key = `${entry.name}|${entry.args}`;
    counts[key] = (counts[key] || 0) + 1;
    if (!firstSeen[key]) firstSeen[key] = i;
  }
  for (const [key, count] of Object.entries(counts)) {
    if (count >= LOOP_DETECT_THRESHOLD) {
      const sepIdx = key.indexOf('|');
      const name = key.slice(0, sepIdx);
      const args = key.slice(sepIdx + 1);
      return { name, args, count, firstIndex: firstSeen[key] };
    }
  }
  return null;
};

const globToRegex = glob => {
  let pattern = glob;
  if (!pattern.includes("*") && !pattern.includes("?") && !pattern.includes("{")) {
    pattern = "*" + pattern;
  }
  let reStr = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") { reStr += ".*"; }
    else if (ch === "?") { reStr += "."; }
    else if (ch === "{") {
      let depth = 1, close = -1;
      for (let j = i + 1; j < pattern.length; j++) {
        if (pattern[j] === "{") depth++;
        else if (pattern[j] === "}") { depth--; if (depth === 0) { close = j; break; } }
      }
      if (close === -1) { reStr += "\\{"; }
      else {
        const inner = pattern.slice(i + 1, close);
        const alts = inner.split(",").map(a => a.replace(/[.+^${}()|[\]\\]/g, "\\$&"));
        reStr += "(" + alts.join("|") + ")";
        i = close;
      }
    }
    else if (/[.+^${}()|[\]\\]/.test(ch)) { reStr += "\\" + ch; }
    else { reStr += ch; }
  }
  return new RegExp("^" + reStr + "$", "i");
};

const DANGEROUS_PATTERNS = [
  [/rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(\/[^ ]*|~)/i, "递归强制删除根目录或家目录"],
  [/rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s*$/i, "递归强制删除操作缺少安全路径"],
  [/mkfs/i, "创建文件系统，可能破坏磁盘数据"],
  [/dd\s+.*of=\/dev\//i, "直接写入块设备"],
  [/>\s*\/dev\/(sd|nvme|hd|xvd|vd)/i, "重定向覆盖块设备"],
  [/chmod\s+-R\s+777\s+\//i, "危险的全局权限修改"],
  [/:\(\s*\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;\s*:/, "Fork 炸弹"],
  [/>\s*\/etc\/(passwd|shadow|sudoers)/i, "覆盖关键系统文件"],
  [/curl.*\|.*ba?sh/i, "危险的远程脚本管道执行"],
];

const checkDangerous = cmd => {
  for (const [pattern, reason] of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) return `⚠️ 危险命令被拦截: ${reason}`;
  }
  return null;
};

const validateArgs = (name, args, schema) => {
  const props = schema?.properties || {};
  const required = schema?.required || [];
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return `参数校验失败: 参数必须是 JSON 对象，当前为 ${typeof args}`;
  }
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return `参数校验失败: 缺少必需参数 "${field}"`;
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const propSchema = props[key];
    if (!propSchema || !propSchema.type) continue;
    switch (propSchema.type) {
      case "integer":
        if (typeof value !== "number" || !Number.isInteger(value))
          return `参数校验失败: "${key}" 应为整数，当前值: ${JSON.stringify(value)} (类型: ${typeof value})`;
        break;
      case "string":
        if (typeof value !== "string")
          return `参数校验失败: "${key}" 应为字符串，当前值: ${JSON.stringify(value)} (类型: ${typeof value})`;
        break;
      case "array":
        if (!Array.isArray(value))
          return `参数校验失败: "${key}" 应为数组，当前值: ${JSON.stringify(value)} (类型: ${typeof value})`;
        break;
      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value))
          return `参数校验失败: "${key}" 应为对象，当前值: ${JSON.stringify(value)} (类型: ${typeof value})`;
        break;
    }
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      return `参数校验失败: "${key}" 的值 "${value}" 不在允许范围 [${propSchema.enum.join(", ")}] 内`;
    }
  }
  return null;
};

const MAX_RETRIES = 3;
const CALL_TIMEOUT = 120_000;
const MAX_TOOL_RESULT_CHARS = 8000;

const getContextLimit = model => {
  const m = model.toLowerCase();
  if (m.includes("deepseek")) return 128_000;
  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo")) return 128_000;
  if (m.includes("gpt-4")) return 8_192;
  if (m.includes("gpt-3.5")) return 16_385;
  if (m.includes("claude") || m.includes("anthropic")) return 200_000;
  if (m.includes("qwen")) return 128_000;
  return 128_000;
};
const CONTEXT_LIMIT = getContextLimit(MODEL);

const EST_CHAR_PER_TOKEN = 4;
const estimateTokens = text => Math.ceil((text || "").length / EST_CHAR_PER_TOKEN);

const estimateMessageTokens = msgs => {
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
};

// 模型定价表（每 1K tokens 的 USD 成本）
const MODEL_PRICING = [
  { prefix: "deepseek-reasoner", input: 0.00055, output: 0.00219 },
  { prefix: "deepseek-chat", input: 0.00027, output: 0.00110 },
  { prefix: "deepseek-v4", input: 0.00027, output: 0.00110 },
  { prefix: "deepseek", input: 0.00027, output: 0.00110 },
  { prefix: "gpt-4o", input: 0.00250, output: 0.01000 },
  { prefix: "gpt-4-turbo", input: 0.01000, output: 0.03000 },
  { prefix: "gpt-4", input: 0.03000, output: 0.06000 },
  { prefix: "gpt-3.5-turbo", input: 0.00150, output: 0.00200 },
  { prefix: "claude-3-5", input: 0.00300, output: 0.01500 },
  { prefix: "claude-3", input: 0.00800, output: 0.02400 },
  { prefix: "claude", input: 0.00800, output: 0.02400 },
  { prefix: "qwen-turbo", input: 0.00080, output: 0.00200 },
  { prefix: "qwen-plus", input: 0.00200, output: 0.00600 },
  { prefix: "qwen-max", input: 0.00400, output: 0.01200 },
  { prefix: "qwen", input: 0.00200, output: 0.00600 },
];

const estimateCost = (model, promptTokens, completionTokens) => {
  const m = model.toLowerCase();
  let inputPrice = 0.001, outputPrice = 0.002; // 默认价格
  for (const entry of MODEL_PRICING) {
    if (m.includes(entry.prefix)) {
      inputPrice = entry.input;
      outputPrice = entry.output;
      break;
    }
  }
  const cost = (promptTokens / 1000) * inputPrice + (completionTokens / 1000) * outputPrice;
  return { cost, inputPrice, outputPrice };
};

const formatCost = (cost) => {
  if (cost < 0.001) return `${cost.toFixed(6)}`;
  if (cost < 0.01) return `${cost.toFixed(5)}`;
  if (cost < 0.1) return `${cost.toFixed(4)}`;
  return `${cost.toFixed(3)}`;
};

const COMPRESS_KEEP_RECENT = 5;
const COMPRESS_MAX_RESULT = 500;

const compressMessages = msgs => {
  const toolRoundStarts = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "assistant" && msgs[i].tool_calls?.length) {
      toolRoundStarts.push(i);
    }
  }
  if (toolRoundStarts.length <= COMPRESS_KEEP_RECENT) return msgs;
  const cutoffIdx = toolRoundStarts[toolRoundStarts.length - COMPRESS_KEEP_RECENT];
  const result = [];
  for (let i = 0; i < msgs.length; i++) {
    if (i < cutoffIdx && msgs[i].role === "tool") {
      const content = msgs[i].content || "";
      if (content.length > COMPRESS_MAX_RESULT) {
        result.push({ ...msgs[i], content: content.slice(0, COMPRESS_MAX_RESULT) + "\n...[已截断，保留前" + COMPRESS_MAX_RESULT + "字符]" });
      } else {
        result.push(msgs[i]);
      }
    } else {
      result.push(msgs[i]);
    }
  }
  return result;
};

const SESSION_ID = `session_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const LOG_DIR = require('node:path').join(process.cwd(), 'logs');
require('node:fs').mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = require('node:path').join(LOG_DIR, `${SESSION_ID}.json`);
const SESSION_START = Date.now();
const session = { sessionId: SESSION_ID, model: MODEL, startedAt: new Date().toISOString(), rounds: [] };
let sessionSaved = false;

const saveSession = () => {
  if (sessionSaved) return;
  try {
    sessionSaved = true;
    session.finishedAt = session.finishedAt || new Date().toISOString();
    session.totalTokens = typeof totalTokens !== 'undefined' ? totalTokens : 0;
    session.totalRounds = session.rounds.length;
    if (typeof messages !== 'undefined') session.messages = messages;
    require('node:fs').writeFileSync(LOG_FILE, JSON.stringify(session, null, 2), "utf8");
    console.error(`📝 会话日志已保存: ${LOG_FILE}`);
  } catch (e) {
    console.error(`\n⚠️ 会话保存失败: ${e.message}`);
  }
};

// 优雅处理中断信号：确保 Ctrl+C 时仍能保存会话日志
process.on('SIGINT', () => {
  console.error('\n\n⚠️ 接收到中断信号(Ctrl+C)，正在保存会话...');
  saveSession();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.error('\n⚠️ 接收到终止信号，正在保存会话...');
  saveSession();
  process.exit(0);
});

let resumedSession = null;
if (resumeId) {
  const fs = require('node:fs');
  const logFile = require('node:path').join(LOG_DIR, `${resumeId}.json`);
  if (!fs.existsSync(logFile)) {
    console.error(`会话日志不存在: ${logFile}`);
    console.error(`可用会话 (使用 --list-sessions 查看完整列表):`);
    try {
      const logs = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json')).sort().slice(-5);
      if (logs.length === 0) console.error('  (无)');
      else logs.forEach(f => console.error(`  ${f.replace('.json', '')}`));
    } catch (e) {}
    process.exit(1);
  }
  resumedSession = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  if (!resumedSession.messages || !Array.isArray(resumedSession.messages)) {
    console.error(`会话日志格式无效: ${logFile} (缺少 messages 数组)`);
    process.exit(1);
  }
  session.resumedFrom = resumedSession.sessionId;
  console.error(`📂 已恢复会话: ${resumedSession.sessionId} (${resumedSession.totalRounds || resumedSession.rounds?.length || '?'} 轮, ${resumedSession.totalTokens || '?'} tokens)`);
}

const analyzeWorkspace = () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const cwd = process.cwd();
  const parts = [];
  const detectedTypes = [];

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    detectedTypes.push('Node.js');
    if (pkg.name) parts.push(`项目名: ${pkg.name}`);
    if (pkg.description) parts.push(`描述: ${pkg.description}`);
    if (pkg.scripts) {
      const names = Object.keys(pkg.scripts);
      if (names.length) parts.push(`npm脚本: ${names.join(', ')}`);
    }
  } catch (e) {}

  const CONFIG_FILES = [
    { file: 'tsconfig.json', label: 'TypeScript' },
    { file: 'Cargo.toml', label: 'Rust' },
    { file: 'go.mod', label: 'Go' },
    { file: 'requirements.txt', label: 'Python' },
    { file: 'pyproject.toml', label: 'Python' },
    { file: 'setup.py', label: 'Python' },
    { file: 'Gemfile', label: 'Ruby' },
    { file: 'Makefile', label: 'Make' },
    { file: 'CMakeLists.txt', label: 'CMake' },
    { file: 'Dockerfile', label: 'Docker' },
    { file: 'docker-compose.yml', label: 'Docker' },
  ];
  for (const { file, label } of CONFIG_FILES) {
    try { if (fs.existsSync(path.join(cwd, file)) && !detectedTypes.includes(label)) detectedTypes.push(label); } catch (e) {}
  }

  if (detectedTypes.length) parts.push(`项目类型: ${detectedTypes.join(', ')}`);

  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !['node_modules', '.git', 'logs', 'dist', '__pycache__', '.venv', 'build', 'target'].includes(e.name))
      .map(e => e.name + '/');
    const files = entries
      .filter(e => e.isFile() && !e.name.startsWith('.'))
      .map(e => e.name);
    if (dirs.length) parts.push(`顶层目录: ${dirs.join(', ')}`);
    if (files.length) parts.push(`顶层文件: ${files.join(', ')}`);
  } catch (e) {}

  return parts.length > 0 ? `\n工作区概述:\n${parts.join('\n')}` : '';
};

const WORKSPACE_CTX = analyzeWorkspace();
if (WORKSPACE_CTX) console.error(`🔍${WORKSPACE_CTX.replace(/\n/g, '\n  ')}\n`);

const call = async (messages, tool_choice = "auto") => {
  for (let i = 0; i <= MAX_RETRIES; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tool_choice, tools: TOOLS }),
        signal: ctrl.signal
      });
      const data = await res.json();
      if (!res.ok || !data.choices?.length) throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
      return { message: data.choices[0].message, usage: data.usage };
    } catch (e) {
      if (i === MAX_RETRIES) throw e;
      if (e.message?.startsWith('API error 4')) throw e;
      const d = 1000 * Math.pow(2, i);
      console.error(`调用失败 (${e.message?.slice(0, 60) || 'AbortError'}), ${d / 1000}s 后重试 (${i + 1}/${MAX_RETRIES})...`);
      await new Promise(r => setTimeout(r, d));
    } finally {
      clearTimeout(t);
    }
  }
};

const callStream = async (messages, tool_choice = "auto") => {
  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tool_choice, tools: TOOLS, stream: true }),
        signal: ctrl.signal
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", content = "", usage = null;
      const toolCalls = {};
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
          let chunk;
          try { chunk = JSON.parse(payload); } catch (e) { continue; }
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) { content += delta.content; process.stdout.write(delta.content); }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) toolCalls[idx] = { id: "", type: "function", function: { name: "", arguments: "" } };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
          if (chunk.usage) usage = chunk.usage;
        }
      }
      const tcArr = Object.values(toolCalls).filter(tc => tc.function.name);
      const message = { role: "assistant", content: content || null };
      if (tcArr.length > 0) message.tool_calls = tcArr;
      return { message, usage };
    } catch (e) {
      if (retry === MAX_RETRIES) throw e;
      if (e.message?.startsWith('API error 4')) throw e;
      const d = 1000 * Math.pow(2, retry);
      console.error(`\n调用失败 (${e.message?.slice(0, 60) || 'AbortError'}), ${d / 1000}s 后重试 (${retry + 1}/${MAX_RETRIES})...`);
      await new Promise(r => setTimeout(r, d));
    } finally {
      clearTimeout(t);
    }
  }
};

const execTool = async (name, args) => {
  if (name === "bash") {
    const danger = checkDangerous(args.cmd);
    if (danger) return danger;
    return new Promise((resolve) => {
      const child = require('node:child_process').exec(args.cmd, { timeout: 120_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        const rawOut = stdout || "";
        const rawErr = stderr || "";
        const MAX_OUTPUT = 5000;
        let out = rawOut.slice(0, MAX_OUTPUT);
        let err = rawErr.slice(0, MAX_OUTPUT);
        const outTruncated = rawOut.length > MAX_OUTPUT;
        const errTruncated = rawErr.length > MAX_OUTPUT;
        const code = error?.code ?? (error?.signal ? -1 : 0);
        const parts = [`exit=${code}`];
        if (out) parts.push(`stdout:\n${out}`);
        if (outTruncated) parts.push(`[stdout 已截断: 仅显示前 ${MAX_OUTPUT} 字符，原始 ${rawOut.length} 字符。建议使用更精确的命令查看所需部分]`);
        if (err) parts.push(`stderr:\n${err}`);
        if (errTruncated) parts.push(`[stderr 已截断: 仅显示前 ${MAX_OUTPUT} 字符，原始 ${rawErr.length} 字符。建议使用更精确的命令查看所需部分]`);
        if (error?.signal) parts.push(`signal: ${error.signal}`);
        if (error && !error.code && !error.signal) parts.push(`error: ${error.message}`);
        resolve(parts.join("\n") || "(no output)");
      });
    });
  }
  if (name === "search_content") {
    const searchRoot = args.path ? require('node:path').resolve(args.path) : process.cwd();
    if (!searchRoot.startsWith(process.cwd())) throw new Error("禁止搜索工作目录外的文件");
    const fnFilter = args.include;
    const SKIP_DIRS = new Set(["node_modules", ".git", "logs", "__pycache__", ".venv", "dist"]);
    const MAX_RESULTS = 50;
    const MAX_FILE_KB = 500;
    let re;
    try { re = new RegExp(args.pattern, "g"); } catch (e) { throw new Error(`无效正则: ${e.message}`); }
    const results = [];
    const walk = (dir) => {
      if (results.length >= MAX_RESULTS) return;
      let entries;
      try { entries = require('node:fs').readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const ent of entries) {
        if (results.length >= MAX_RESULTS) return;
        if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name) && !ent.name.startsWith(".")) walk(require('node:path').join(dir, ent.name)); }
        else if (ent.isFile()) {
          if (fnFilter) {
            try { if (!globToRegex(fnFilter).test(ent.name)) continue; } catch (e) { continue; }
          }
          const fp = require('node:path').join(dir, ent.name);
          try {
            const stat = require('node:fs').statSync(fp);
            if (stat.size > MAX_FILE_KB * 1024) continue;
            const raw = require('node:fs').readFileSync(fp, "utf8");
            const lines = raw.split("\n");
            for (let i = 0; i < lines.length; i++) {
              re.lastIndex = 0;
              if (re.test(lines[i])) {
                results.push(`${require('node:path').relative(process.cwd(), fp)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                if (results.length >= MAX_RESULTS) return;
              }
            }
          } catch (e) { /* 跳过二进制或无权限文件 */ }
        }
      }
    };
    walk(searchRoot);
    if (results.length === 0) return `未找到匹配 "${args.pattern}" 的内容`;
    const more = results.length >= MAX_RESULTS ? ` (已达上限 ${MAX_RESULTS} 条)` : "";
    return `找到 ${results.length} 个匹配${more}:\n${results.join("\n")}`;
  }
  if (name === "list_files") {
    const dir = args.path ? require('node:path').resolve(args.path) : process.cwd();
    if (!dir.startsWith(process.cwd())) throw new Error("禁止列出工作目录外的内容");
    let entries;
    try { entries = require('node:fs').readdirSync(dir, { withFileTypes: true }); } catch (e) { throw new Error(`无法读取目录: ${e.message}`); }
    let pattern = null;
    if (args.glob) {
      try {
        pattern = globToRegex(args.glob);
      } catch (e) { throw new Error(`无效的 glob 模式: ${e.message}`); }
    }
    const items = [];
    for (const ent of entries) {
      if (pattern && !pattern.test(ent.name)) continue;
      const prefix = ent.isDirectory() ? "📁" : "📄";
      const fp = require('node:path').relative(process.cwd(), require('node:path').join(dir, ent.name));
      try {
        const s = require('node:fs').statSync(require('node:path').join(dir, ent.name));
        const size = ent.isDirectory() ? "" : ` (${s.size} B)`;
        items.push(`${prefix} ${fp}${size}`);
      } catch (e) { items.push(`${prefix} ${fp}`); }
    }
    if (items.length === 0) return `目录 "${require('node:path').relative(process.cwd(), dir) || '.'}" 中没有${args.glob ? `匹配 "${args.glob}" 的` : '任何'}条目`;
    const dirLabel = require('node:path').relative(process.cwd(), dir) || '.';
    return `📂 ${dirLabel}\n${items.join("\n")}`;
  }
  if (name === "read_file") {
    const p = require('node:path').resolve(args.path);
    if (!p.startsWith(process.cwd())) throw new Error("禁止读取工作目录外的文件");
    const raw = require('node:fs').readFileSync(p, "utf8");
    const allLines = raw.split("\n");
    const totalLines = allLines.length;
    const offset = Math.max(1, args.offset ?? 1);
    const limit = Math.min(Math.max(1, args.limit ?? 2000), 2000);
    const startIdx = offset - 1;
    const selectedLines = allLines.slice(startIdx, startIdx + limit);
    if (selectedLines.length === 0) return `📄 ${args.path}: 请求的行号范围 [${offset}, ${offset + limit - 1}] 超出文件总行数 ${totalLines}`;
    const numbered = selectedLines.map((l, i) => `${startIdx + i + 1}: ${l}`).join("\n");
    const rangeNote = (offset > 1 || selectedLines.length < totalLines) ? ` [lines ${startIdx + 1}-${startIdx + selectedLines.length} of ${totalLines}]` : "";
    return `📄 ${args.path}${rangeNote}:\n${numbered}`;
  }
  if (name === "find_files") {
    const searchRoot = args.path ? require('node:path').resolve(args.path) : process.cwd();
    if (!searchRoot.startsWith(process.cwd())) throw new Error("禁止搜索工作目录外的文件");
    let fnFilter;
    try { fnFilter = globToRegex(args.pattern); } catch (e) { throw new Error(`无效的 glob 模式: ${e.message}`); }
    const SKIP_DIRS = new Set(["node_modules", ".git", "logs", "__pycache__", ".venv", "dist"]);
    const MAX_RESULTS = 100;
    const results = [];
    const walk = (dir) => {
      if (results.length >= MAX_RESULTS) return;
      let entries;
      try { entries = require('node:fs').readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const ent of entries) {
        if (results.length >= MAX_RESULTS) return;
        if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name) && !ent.name.startsWith(".")) walk(require('node:path').join(dir, ent.name)); }
        else if (ent.isFile()) {
          if (fnFilter.test(ent.name)) {
            results.push(require('node:path').relative(process.cwd(), require('node:path').join(dir, ent.name)));
          }
        }
      }
    };
    walk(searchRoot);
    if (results.length === 0) return `未找到匹配 "${args.pattern}" 的文件`;
    const more = results.length >= MAX_RESULTS ? ` (已达上限 ${MAX_RESULTS} 条)` : "";
    return `找到 ${results.length} 个文件${more}:\n${results.join("\n")}`;
  }
  if (name === "write_file") {
    const p = require('node:path').resolve(args.path);
    if (!p.startsWith(process.cwd())) throw new Error("禁止写入工作目录外的文件");
    const fs = require('node:fs');
    const path = require('node:path');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (fs.existsSync(p)) {
      if (!args.overwrite) {
        return `⚠️ 文件已存在: ${args.path}\n如需覆盖，请设置 overwrite=true 参数。已存在的文件内容不会被修改。\n提示: 可以先使用 read_file 查看现有内容，确认后再决定是否覆盖。`;
      }
      const bakPath = p + '.bak';
      let bakName = args.path + '.bak';
      let idx = 0;
      while (fs.existsSync(bakPath + (idx > 0 ? `.${idx}` : ''))) { idx++; }
      const finalBakPath = idx > 0 ? bakPath + `.${idx}` : bakPath;
      const finalBakName = idx > 0 ? args.path + `.bak.${idx}` : args.path + '.bak';
      fs.copyFileSync(p, finalBakPath);
      fs.writeFileSync(p, args.content, "utf8");
      return `已覆盖写入 ${args.path} (${args.content.length} 字符)\n📦 原文件已备份到 ${finalBakName}`;
    }
    fs.writeFileSync(p, args.content, "utf8");
    return `已写入 ${args.path} (${args.content.length} 字符)`;
  }
  if (name === "edit_file") {
    const p = require('node:path').resolve(args.path);
    if (!p.startsWith(process.cwd())) throw new Error("禁止编辑工作目录外的文件");
    if (!require('node:fs').existsSync(p)) return `编辑失败: 文件 ${args.path} 不存在`;
    const raw = require('node:fs').readFileSync(p, "utf8");
    const count = raw.split(args.oldString).length - 1;
    if (count === 0) return `编辑失败: 在文件中未找到要替换的文本\n提示: 请使用 read_file 先确认文件的实际内容（包括空白字符和缩进）`;
    if (count > 1 && !args.replaceAll) return `编辑失败: 匹配到 ${count} 处 "${args.oldString.slice(0, 60)}"，请提供更多上下文以确保唯一匹配，或设置 replaceAll=true 替换全部`;
    const newContent = args.replaceAll ? raw.split(args.oldString).join(args.newString) : raw.replace(args.oldString, args.newString);
    require('node:fs').writeFileSync(p, newContent, "utf8");
    const replaced = args.replaceAll ? count : 1;
    return `已编辑 ${args.path}: 替换 ${replaced} 处匹配`;
  }
  if (name === "todo_write") {
    todos.length = 0;
    todos.push(...(args.todos || []));
    const emoji = { pending: "⏳", in_progress: "🔄", completed: "✅", cancelled: "❌" };
    const summary = todos.map(t => `${emoji[t.status] || "❓"} [${t.priority}] ${t.content}`).join("\n");
    const inProgress = todos.filter(t => t.status === "in_progress");
    const pending = todos.filter(t => t.status === "pending");
    const completed = todos.filter(t => t.status === "completed");
    const total = todos.length;
    console.error(`\n📋 任务列表 (${total} 项 | ${completed.length} 完成 | ${inProgress.length} 进行中 | ${pending.length} 待处理):\n${summary}\n`);
    return `任务列表已更新: ${total} 项, ${completed.length} 已完成, ${pending.length} 待处理`;
  }
  if (name === "web_fetch") {
    const urlStr = args.url;
    let parsed;
    try { parsed = new URL(urlStr); } catch (e) { return `web_fetch 失败: URL无效 - ${e.message}`; }
    const proto = parsed.protocol;
    if (proto !== "http:" && proto !== "https:") return `web_fetch 失败: 不支持的协议 "${proto}"，仅限 http/https`;
    const host = parsed.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return `web_fetch 失败: 禁止访问 localhost`;
    const ipm = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipm) {
      const a = +ipm[1], b = +ipm[2];
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224)
        return `web_fetch 失败: 禁止访问内网/保留IP`;
    }
    const httpMod = proto === "https:" ? require("node:https") : require("node:http");
    const MAX_REDIRECTS = 3;
    const doFetch = (url, redirectsLeft) => new Promise((resolve) => {
      const req = httpMod.get(url, { headers: { "User-Agent": "10xagent/1.0" } }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectsLeft <= 0) { resolve(`web_fetch 失败: 重定向次数过多`); return; }
          const loc = res.headers.location;
          if (!loc) { resolve(`web_fetch 失败: ${res.statusCode} 缺少 Location 头`); return; }
          const newUrl = new URL(loc, url).href;
          resolve(doFetch(newUrl, redirectsLeft - 1));
          return;
        }
        let body = ""; let truncated = false;
        res.on("data", chunk => {
          body += chunk.toString("utf8");
          if (body.length > 50000) { body = body.slice(0, 50000); truncated = true; req.destroy(); }
        });
        res.on("end", () => {
          let output = body;
          if ((args.format || "text") === "json") {
            try { output = JSON.stringify(JSON.parse(body), null, 2); }
            catch (e) { output = body; }
          } else if ((args.format || "text") === "text") {
            output = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<[^>]+>/g, "")
              .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ")
              .replace(/\n{3,}/g, "\n\n");
          }
          if (output.length > 50000) output = output.slice(0, 50000) + "\n...[已截断]";
          const suffix = truncated ? "\n...[响应体已截断]" : "";
          resolve(`HTTP ${res.statusCode} ${url}\n\n${output}${suffix}`);
        });
        res.on("error", e => resolve(`web_fetch 失败: 响应流错误 - ${e.message}`));
      });
      req.setTimeout(20000);
      req.on("timeout", () => { req.destroy(); resolve("web_fetch 失败: 请求超时(20s)"); });
      req.on("error", e => resolve(`web_fetch 失败: ${e.message}`));
    });
    return doFetch(parsed.href, MAX_REDIRECTS);
  }
  return `未知工具: ${name}`;
};

const printSummary = () => {
  const duration = Date.now() - SESSION_START;
  const durStr = duration < 1000 ? `${duration}ms` :
    duration < 60000 ? `${(duration / 1000).toFixed(1)}s` :
    `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
  const rounds = session.rounds.length;
  const modelName = MODEL;
  const est = estimateCost(modelName, totalTokens || 0, 0);
  // 分离 prompt 和 completion tokens
  let promptTokens = 0, completionTokens = 0, cachedTokens = 0, uncachedTokens = 0;
  for (const r of session.rounds) {
    if (r.usage) {
      promptTokens += r.usage.prompt_tokens || 0;
      completionTokens += r.usage.completion_tokens || 0;
      const d = r.usage.prompt_tokens_details || {};
      cachedTokens += d.cached_tokens || 0;
    }
  }
  uncachedTokens = promptTokens - cachedTokens;
  const total = promptTokens + completionTokens;
  const cost = estimateCost(modelName, promptTokens, completionTokens);
  console.error(`\n═══════════════════════════════════════`);
  console.error(`  📊 会话摘要`);
  console.error(`  ═══════════════════════════════════`);
  console.error(`  🆔 会话ID:  ${SESSION_ID}`);
  console.error(`  🤖 模型:    ${modelName}`);
  console.error(`  🔄 轮次:    ${rounds}`);
  console.error(`  ⏱ 耗时:    ${durStr}`);
  console.error(`  📝 输入:    ${promptTokens.toLocaleString()} tokens`);
  console.error(`     ├ 缓存命中: ${cachedTokens.toLocaleString()}`);
  console.error(`     └ 缓存未命中: ${uncachedTokens.toLocaleString()}`);
  console.error(`  💬 输出:    ${completionTokens.toLocaleString()} tokens`);
  console.error(`  📊 合计:    ${total.toLocaleString()} tokens`);
  console.error(`  💰 估算费用: ${formatCost(cost.cost)} USD`);
  console.error(`     (输入 ${cost.inputPrice}/1K, 输出 ${cost.outputPrice}/1K)`);
  console.error(`  ═══════════════════════════════════`);
};

const userPrompt = rawArgs.join(" ");
let messages;
if (resumedSession) {
  messages = resumedSession.messages;
  if (userPrompt) {
    messages.push({ role: "user", content: userPrompt });
    console.error(`📝 追加用户消息: ${userPrompt.slice(0, 80)}${userPrompt.length > 80 ? '...' : ''}`);
  } else {
    console.error(`📝 无新提示词，基于历史上下文继续`);
  }
} else {
  messages = [{ role: 'system', content: `你是简洁但十分智能的AI Agent v${VERSION}。可用 read_file、write_file、edit_file、bash、search_content、list_files、find_files、todo_write 和 web_fetch 工具完成任务。面对复杂或多步骤任务时，先用 todo_write 拆解为子任务并规划步骤，再逐步执行；完成一项后立即更新其状态。全部完成后直接用文本回复。环境信息：\nos=${process.platform}\narch=${process.arch}\ncwd=${process.cwd()}${WORKSPACE_CTX}` }, { role: "user", content: userPrompt }];
  if (!userPrompt) {
    console.error("请提供一个提示词，例如: bun 10xagent.js \"列出项目中的文件\"");
    console.error("或使用 --resume <会话ID> 恢复之前的会话");
    process.exit(1);
  }
}
const WARN_THRESHOLD = Math.floor(CONTEXT_LIMIT * 0.8);
let totalTokens = 0;
try {
  let finished = false;
  for (let i = 0; i < 30; i++) {
  const roundStart = Date.now();
  let callMessages = messages;
  const estimated = estimateMessageTokens(messages);
  if (estimated >= WARN_THRESHOLD) {
    console.error(`⚠️ 预估上下文 ${estimated} tokens 接近限制 ${CONTEXT_LIMIT}，进行消息压缩...`);
    callMessages = compressMessages(messages);
    const after = estimateMessageTokens(callMessages);
    console.error(`✅ 压缩完成: ${estimated} → ${after} 预估 tokens (保留最近 ${COMPRESS_KEEP_RECENT} 轮完整结果)`);
  }
  const { message: m, usage } = await callStream(callMessages);
  if (usage) {
    totalTokens += usage.total_tokens;
    const p = usage.prompt_tokens ?? 0;
    const c = usage.completion_tokens ?? 0;
    const details = usage.prompt_tokens_details || {};
    const cached = details.cached_tokens ?? 0;
    const uncached = p - cached;
    const cacheStr = cached > 0 ? ` (缓存命中=${cached}, 未命中=${uncached})` : '';
    const curEst = estimateMessageTokens(messages);
    console.error(`[round ${i + 1}] in=${p} out=${c}${cacheStr} | 累计 ${totalTokens} | 预估上下文 ${curEst}`);
    if (curEst >= CONTEXT_LIMIT) {
      console.error(`⚠️ 预估上下文 ${curEst} tokens 已超过模型限制 ${CONTEXT_LIMIT}，可能产生错误`);
    } else if (curEst >= WARN_THRESHOLD) {
      console.error(`⚠️ 预估上下文 ${curEst} tokens 接近限制 ${CONTEXT_LIMIT} (累计API tokens: ${totalTokens})`);
    }
  }
  session.rounds.push({ round: i + 1, durationMs: Date.now() - roundStart, usage, message: m });
  if (!m.tool_calls?.length) { process.stdout.write("\n"); finished = true; break; }
  for (const tc of m.tool_calls) {
    let argsPreview = "";
    try { const a = JSON.parse(tc.function.arguments); argsPreview = Object.entries(a).map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v)}`).join(", "); } catch (e) {}
    console.error(`🔧 ${tc.function.name}(${argsPreview})`);
  }
  messages.push(m);
  const toolResults = await Promise.all(m.tool_calls.map(async tc => {
    let result;
    try {
      let args;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch (e) {
        result = `参数校验失败: 无法解析工具参数 JSON: ${e.message}`;
        return { role: "tool", tool_call_id: tc.id, content: result };
      }
      const toolDef = TOOLS.find(t => t.function.name === tc.function.name);
      const schema = toolDef?.function?.parameters;
      const validationError = validateArgs(tc.function.name, args, schema);
      if (validationError) {
        result = validationError;
      } else {
        result = await execTool(tc.function.name, args);
      }
    } catch (e) { result = `执行出错: ${e.message}`; }
    if (typeof result === "string" && result.length > MAX_TOOL_RESULT_CHARS) {
      result = result.slice(0, MAX_TOOL_RESULT_CHARS) + `\n...[已截断，保留前 ${MAX_TOOL_RESULT_CHARS} 字符，原始 ${result.length} 字符]`;
    }
    return { role: "tool", tool_call_id: tc.id, content: result };
  }));
  for (const tr of toolResults) messages.push(tr);
  // 记录本轮工具调用用于循环检测
  for (const tc of m.tool_calls) {
    let argsSig = "";
    try {
      const a = JSON.parse(tc.function.arguments);
      argsSig = Object.entries(a).map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`).sort().join("&");
    } catch (e) { argsSig = (tc.function.arguments || "").slice(0, 60); }
    toolCallHistory.push({ name: tc.function.name, args: argsSig });
  }
  const loop = detectLoop(toolCallHistory);
  if (loop) {
    console.error(`⚠️ 检测到可能的循环 (工具: ${loop.name}, 重复 ${loop.count} 次)，向模型发送策略变更提示...`);
    messages.push({ role: "system", content: `⚠️ 检测到循环：你连续 ${loop.count} 次调用了 ${loop.name} 工具且参数模式重复。请评估当前进展，如果陷入死循环，请改变策略、换用其他工具或直接给出结果。` });
  }
  }
  if (!finished) {
    console.error("⚠️ 已达到最大轮次(30)，要求模型给出最终总结...");
    messages.push({ role: "user", content: "你已达到最大工具调用轮次限制。请基于当前已完成的工作，直接给出最终结果和总结，不要调用任何工具。" });
    let finalCallMessages = messages;
    const finalEst = estimateMessageTokens(messages);
    if (finalEst >= WARN_THRESHOLD) {
      console.error(`⚠️ 最终轮次预估上下文 ${finalEst} tokens 超过限制，进行压缩...`);
      finalCallMessages = compressMessages(messages);
      console.error(`✅ 压缩完成: ${finalEst} → ${estimateMessageTokens(finalCallMessages)} 预估 tokens`);
    }
    const { message: finalM, usage: finalUsage } = await callStream(finalCallMessages, "none");
    if (finalUsage) { totalTokens += finalUsage.total_tokens; }
    if (finalUsage) {
      const d = finalUsage.prompt_tokens_details || {};
      const fc = d.cached_tokens ?? 0;
      const fu = (finalUsage.prompt_tokens ?? 0) - fc;
      console.error(`  最终轮: in=${finalUsage.prompt_tokens ?? 0}${fc > 0 ? ` (缓存命中=${fc}, 未命中=${fu})` : ''} out=${finalUsage.completion_tokens ?? 0}`);
    }
    session.rounds.push({ round: session.rounds.length + 1, durationMs: 0, usage: finalUsage, message: finalM });
    if (!finalM.content) console.log("(无输出)"); else process.stdout.write("\n");
  }
} finally {
  printSummary();
  saveSession();
}
