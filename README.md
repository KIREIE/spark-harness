# spark-harness

通用 LLM Wiki Harness。它把外部文档源接成一个可重复使用的命令行流程：

`raw -> wiki -> flow-kit -> executor -> backwrite`

## 安装

### 直接用 GitHub 仓库

```bash
git clone https://github.com/KIREIE/spark-harness.git
cd spark-harness
npm install
```

### 作为 CLI 使用

```bash
npx github:KIREIE/spark-harness doctor
```

或者全局安装：

```bash
npm install -g github:KIREIE/spark-harness
spark-harness doctor
```

## 命令

```bash
spark-harness init
spark-harness sync --source <feishu-url> [--source <feishu-url> ...]
spark-harness check
spark-harness run --source <feishu-url> [--source <feishu-url> ...]
spark-harness backwrite
spark-harness doctor
```

## 怎么接入别的项目

把仓库放到目标工程根目录，或者在目标工程里通过 `npx` / 全局命令运行。
CLI 会默认以当前工作目录为工程根目录，读取：

- `harness.config.json`
- `docs/raw/feishu/`
- `docs/llm-wiki/`
- `docs/flow-kit/`
- `.codex/skills/`

## 目录约定

- `docs/raw/feishu/`：原始留档
- `docs/llm-wiki/`：整理后的 wiki
- `docs/flow-kit/`：任务、验证、交接
- `docs/flow-kit/<executor>/`：可替换执行层，默认 `lazycodex`，可配置为 `comet`
- `.codex/skills/`：项目级 skill

## 配置

`harness.config.json` 只放静态配置，比如路径、bundle 名称、执行后端。
Feishu 链接不预先写进配置，执行时直接通过 `sync` / `run` 传入：

```bash
spark-harness sync --source <feishu-url> --source <feishu-url>
```

执行层默认是 LazyCodex；要切到 Comet，改配置即可：

```json
{
  "executor": {
    "backend": "comet"
  }
}
```

## 默认状态

仓库默认不绑定任何业务样例。`sync` 在空配置下也能生成通用模板。

## CI / Release

- `push` 到 `main` 会跑 CI
- `pull request` 会跑 CI
- 打 `v*` tag 会触发 GitHub Release，并附上 `npm pack` 产物
