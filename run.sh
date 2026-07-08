for i in {1..10}; do echo "=== 第 $i 次 ==="; bun agent.js "
你正在将 agent.js 从一个极简 Agent 原型，持续优化为一个更完整、更可靠、更安全、更智能的 AI Agent。
当前是第 $i/10 轮。每轮只做一个独立、自洽、可独立验证的改进。
先复制 agent.js 为 agent.tmp.js 然后在 agent.tmp.js 基础上进行改动。
修改后必须使用 bun agent.tmp.js <prompt> 做一次真实端到端验证，验证 prompt 由你根据本轮改动自主设计，必须覆盖本轮改动影响的能力，并确认能正常调用 LLM、使用必要工具、及时返回结果；
不要只验证语法或帮助信息，必须验证一个真实任务；
如果程序完整,运行正常 再将其重命名为 agent.js。
如果端到端跑不通或明显卡住，必须回滚本轮改动。并且删除 agent.tmp.js
"; done