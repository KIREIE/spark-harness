# AGENTS.md

## 工作顺序

1. 先读 `harness.config.json`
2. 再接收本次聊天里的 Feishu 链接参数
3. 再读 `docs/raw/feishu/`
4. 再读 `docs/llm-wiki/`
5. 再读 `docs/flow-kit/`
6. 最后再做回写

## LazyCodex 执行层

涉及 `docs/flow-kit/lazycodex/` 时，优先读 `EXECUTION.md`，再读 `HANDOFF.md`，最后看 `REPORT.md`。

## 维护约定

- raw 只做原始留档。
- wiki 只做整理和归纳。
- flow-kit 只做任务和验证。
- skill 只保存稳定复用的流程。
- `run` 必须产出 `REPORT.md` / `REPORT.json`。
- `check` 必须拒绝 stub 报告冒充 live。

## 默认执行链

`llm wiki` 读取 -> `flow-kit` 拆解 -> `subagent` 分发 -> `LazyCodex` 执行 -> 回写 `wiki / skill / flow-kit` -> 输出完整修改报告
