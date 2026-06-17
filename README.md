# spark-harness

通用 LLM Wiki Harness，用来把外部文档源接入成可维护的 `raw -> wiki -> flow-kit -> backwrite` 流程。

## 你可以拿它做什么

- 喂 Feishu / Lark 链接
- 自动生成原始留档
- 自动维护整理后的 wiki
- 自动拆分任务、测试用例和交接包
- 自动生成回写材料和可复用 skill

## 运行方式

```bash
npm run init
npm run sync
npm run check
npm run run
npm run backwrite
```

## 目录约定

- `docs/raw/feishu/`：原始留档
- `docs/llm-wiki/`：整理后的 wiki
- `docs/flow-kit/`：任务、验证、交接
- `.codex/skills/`：项目级 skill

## 配置

编辑 `harness.config.json`，把 `sources` 换成你的 Feishu 链接列表即可。

## 默认状态

仓库默认不绑定任何业务样例。`sync` 在空配置下也能生成通用模板。
