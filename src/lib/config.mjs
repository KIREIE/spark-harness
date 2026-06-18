import path from 'node:path'
import { readOptional } from './fs-utils.mjs'

export const defaultConfig = {
  projectName: 'spark-harness',
  sourceAdapter: 'lark-cli',
  executionBackend: 'lazycodex',
  executor: {
    backend: 'lazycodex',
  },
  paths: {
    rawDir: 'docs/raw/feishu',
    wikiDir: 'docs/llm-wiki',
    flowKitDir: 'docs/flow-kit',
    skillsDir: '.codex/skills',
  },
  wiki: {
    bundleTitle: 'LLM Wiki Harness',
    bundleDescription: 'OKF 风格的 raw -> wiki -> flow-kit -> backwrite 流程',
  },
  agents: {
    roles: ['explorer', 'planner', 'tester', 'worker', 'reviewer'],
  },
}

export async function loadConfig(root, flags = {}) {
  const configPath = path.join(root, flags.config || 'harness.config.json')
  const text = await readOptional(configPath)
  if (!text) return structuredClone(defaultConfig)
  return mergeConfig(structuredClone(defaultConfig), JSON.parse(text))
}

export function seedConfig() {
  return structuredClone(defaultConfig)
}

export function mergeConfig(base, input) {
  const {
    sources: _sources,
    paths: inputPaths = {},
    wiki: inputWiki = {},
    agents: inputAgents = {},
    executor: inputExecutor = {},
    ...rest
  } = input
  return {
    ...base,
    ...rest,
    paths: { ...base.paths, ...inputPaths },
    wiki: { ...base.wiki, ...inputWiki },
    agents: { ...base.agents, ...inputAgents },
    executor: { ...base.executor, ...inputExecutor },
  }
}
