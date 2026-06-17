import crypto from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchFeishuDoc } from './lark.mjs'
import { extractTextFromHtml, parseFrontmatter, stringifyFrontmatter } from './markdown.mjs'

const defaultConfig = {
  projectName: 'spark-harness',
  sourceAdapter: 'lark-cli',
  executionBackend: 'demo',
  paths: {
    rawDir: 'docs/raw/feishu',
    wikiDir: 'docs/llm-wiki',
    flowKitDir: 'docs/flow-kit',
    skillsDir: '.codex/skills',
  },
  sources: [],
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

export async function initProject(root, flags = {}) {
  const configPath = path.join(root, 'harness.config.json')
  const existed = await readOptional(configPath)
  if (!existed || flags.force) {
    await writeFile(configPath, `${JSON.stringify(seedConfig(), null, 2)}\n`, 'utf8')
  }
  await scaffold(root, seedConfig())
  console.log('harness initialized')
}

export async function syncProject(root, flags = {}) {
  const config = await loadConfig(root, flags)
  await scaffold(root, config)

  const fetchedSources = []
  for (const source of config.sources) {
    const fetched = await fetchFeishuDoc(source.url)
    fetchedSources.push({ source, fetched })
    await writeRawDoc(root, config, source, fetched)
    await writeCuratedPage(root, config, source, fetched)
  }

  await writeWikiBundle(root, config, fetchedSources)
  await writeFlowKit(root, config, fetchedSources)
  await writeSkills(root, config)
  await writeSyncManifest(root, fetchedSources)

  console.log(`sync complete (${fetchedSources.length} sources)`)
}

export async function checkProject(root, flags = {}) {
  const config = await loadConfig(root, flags)
  const configText = await readOptional(path.join(root, flags.config || 'harness.config.json'))
  const problems = []
  const rawDir = resolvePath(root, config.paths.rawDir)
  const wikiDir = resolvePath(root, config.paths.wikiDir)
  const flowKitDir = resolvePath(root, config.paths.flowKitDir)

  await requireFile(root, 'AGENTS.md', problems)
  await requireFile(root, 'harness.config.json', problems)
  if (!configText) {
    problems.push('missing harness.config.json')
  } else {
    const rawConfig = JSON.parse(configText)
    if (!Object.hasOwn(rawConfig, 'sourceAdapter')) {
      problems.push('missing sourceAdapter in harness.config.json')
    }
  }

  for (const source of config.sources) {
    const rawFile = path.join(rawDir, `${source.id}.md`)
    const wikiFile = path.join(wikiDir, `${source.id}.md`)
    const rawText = await readOptional(rawFile)
    const wikiText = await readOptional(wikiFile)
    if (!rawText) problems.push(`missing raw doc: ${rel(root, rawFile)}`)
    if (!wikiText) problems.push(`missing wiki page: ${rel(root, wikiFile)}`)
    if (rawText) {
      const { frontmatter } = parseFrontmatter(rawText)
      if (frontmatter.type !== 'feishu-raw') problems.push(`bad raw type: ${rel(root, rawFile)}`)
      if (!frontmatter.source_url) problems.push(`missing raw source_url: ${rel(root, rawFile)}`)
    }
    if (wikiText) {
      const { frontmatter } = parseFrontmatter(wikiText)
      if (frontmatter.type !== 'concept') problems.push(`bad wiki type: ${rel(root, wikiFile)}`)
      const expectedRef = `../raw/feishu/${source.id}.md`
      if (!Array.isArray(frontmatter.refs) || !frontmatter.refs.some((ref) => String(ref).includes(expectedRef))) {
        problems.push(`wiki page missing raw ref: ${rel(root, wikiFile)}`)
      }
    }
  }

  const requiredFlowFiles = [
    'index.md',
    'GO.md',
    'METHODOLOGY.md',
    'RULES.md',
    'CONTEXT.md',
    'changes/wiki-bootstrap/CHANGE.md',
    'changes/wiki-bootstrap/REQUIREMENT.md',
    'changes/wiki-bootstrap/DESIGN.md',
    'changes/wiki-bootstrap/TASK.md',
    'changes/wiki-bootstrap/VERIFY.md',
    'changes/wiki-bootstrap/INTEGRATION.md',
    'changes/wiki-bootstrap/ARCHIVE.md',
    'lazycodex/README.md',
    'lazycodex/HANDOFF.md',
  ]
  for (const file of requiredFlowFiles) {
    const relFile = path.join(config.paths.flowKitDir, file)
    const text = await readOptional(path.join(root, relFile))
    if (!text) problems.push(`missing flow-kit file: ${relFile}`)
    else if (!/^---\n[\s\S]*?\n---\n/.test(text)) problems.push(`missing frontmatter: ${relFile}`)
  }

  const reportJson = await readOptional(path.join(flowKitDir, 'lazycodex', 'REPORT.json'))
  if (reportJson) {
    const report = JSON.parse(reportJson)
    if (report.status !== 'live') problems.push('lazycodex report is not live')
    if (!Array.isArray(report.testCases) || report.testCases.length === 0) problems.push('lazycodex report missing test cases')
    if (!Array.isArray(report.dispatch) || report.dispatch.length === 0) problems.push('lazycodex report missing dispatch')
    if (String(report.execution?.mode || '') === 'stub') problems.push('stub report cannot be treated as live')
  }

  if (problems.length) throw new Error(problems.join('\n'))
  console.log(`check passed (${config.sources.length} sources)`)
}

export async function runProject(root, flags = {}) {
  await syncProject(root, flags)
  const config = await loadConfig(root, flags)
  const report = await writeLazycodexReport(root, config, 'live')
  await checkProject(root, flags)
  console.log(`run complete (${report.execution.mode})`)
}

export async function backwriteProject(root, flags = {}) {
  const config = await loadConfig(root, flags)
  const reportPath = path.join(root, config.paths.flowKitDir, 'lazycodex', 'REPORT.json')
  const reportText = await readOptional(reportPath)
  if (!reportText) throw new Error('missing REPORT.json; run `spark-harness run` first')
  const report = JSON.parse(reportText)
  await writeExperienceBackwrite(root, config, report)
  await writeSkillTemplate(root, config)
  console.log('backwrite complete')
}

export async function doctorProject(root) {
  const config = await loadConfig(root)
  console.log(JSON.stringify({ root, projectName: config.projectName, sources: config.sources.length, backend: config.executionBackend }, null, 2))
}

async function scaffold(root, config) {
  const dirs = [
    config.paths.rawDir,
    config.paths.wikiDir,
    config.paths.flowKitDir,
    path.join(config.paths.flowKitDir, 'lazycodex'),
    path.join(config.paths.flowKitDir, 'changes', 'wiki-bootstrap'),
    config.paths.skillsDir,
    path.join(config.paths.skillsDir, 'llm-wiki-harness'),
    path.join(config.paths.skillsDir, 'llm-wiki-backwrite'),
  ]
  for (const dir of dirs) await mkdir(resolvePath(root, dir), { recursive: true })
  await ensurePlaceholder(root, path.join(config.paths.rawDir, '.gitkeep'))
}

async function writeRawDoc(root, config, source, fetched) {
  const rawFile = resolvePath(root, path.join(config.paths.rawDir, `${source.id}.md`))
  const raw = stringifyFrontmatter({
    type: 'feishu-raw',
    title: source.title || fetched.title,
    updated_at: new Date().toISOString(),
    status: 'raw',
    source_url: fetched.inputUrl,
    canonical_url: fetched.canonicalUrl,
    token: fetched.token,
    source_id: source.id,
    source_type: fetched.type,
    checksum: checksum(fetched.content),
    refs: [],
  })
    + `# ${source.title || fetched.title}\n\n`
    + `## 原始链接\n\n- ${fetched.inputUrl}\n- ${fetched.canonicalUrl}\n\n`
    + `## 原始内容\n\n`
    + `\`\`\`html\n${fetched.content}\n\`\`\`\n`
  await writeFile(rawFile, raw, 'utf8')
}

async function writeCuratedPage(root, config, source, fetched) {
  const wikiFile = resolvePath(root, path.join(config.paths.wikiDir, `${source.id}.md`))
  const rawRel = `../raw/feishu/${source.id}.md`
  const text = extractTextFromHtml(fetched.content)
  const page = stringifyFrontmatter({
    type: 'concept',
    title: source.title || fetched.title,
    updated_at: new Date().toISOString(),
    status: 'curated',
    tags: ['source', 'wiki', 'feishu'],
    refs: [rawRel],
    source_url: fetched.canonicalUrl,
  })
    + `# ${source.title || fetched.title}\n\n`
    + `## 概述\n\n${text.slice(0, 4000) || '待整理。'}\n\n`
    + `## 来源\n\n- [原始留档](${rawRel})\n- ${fetched.canonicalUrl}\n`
  await writeFile(wikiFile, page, 'utf8')
}

async function writeWikiBundle(root, config, fetchedSources) {
  const wikiDir = resolvePath(root, config.paths.wikiDir)
  const sourceLinks = fetchedSources.length
    ? fetchedSources.map(({ source }) => `- [${source.title}](${source.id}.md)`).join('\n')
    : '- 待接入外部 Feishu 源'
  const rawLinks = fetchedSources.length
    ? fetchedSources.map(({ source }) => `- [${source.title}](../raw/feishu/${source.id}.md)`).join('\n')
    : '- 待生成 raw 留档'
  const refs = fetchedSources.length
    ? fetchedSources.map(({ source }) => `./${source.id}.md`).concat(['./source-ledger.md', './bundle-spec.md', './maintenance-playbook.md', './experience-backwrite.md'])
    : ['./source-ledger.md', './bundle-spec.md', './maintenance-playbook.md', './experience-backwrite.md']

  await writeFile(
    path.join(wikiDir, 'index.md'),
    stringifyFrontmatter({
      type: 'bundle-index',
      title: config.wiki.bundleTitle,
      updated_at: new Date().toISOString(),
      status: 'curated',
      tags: ['wiki', 'okf', 'harness'],
      refs,
    }) +
      `# ${config.wiki.bundleTitle}\n\n` +
      `## 概览\n\n${config.wiki.bundleDescription}\n\n` +
      `## 概念页\n\n${sourceLinks}\n\n` +
      `## 原始留档\n\n${rawLinks}\n`,
    'utf8',
  )

  await writeFile(
    path.join(wikiDir, 'source-ledger.md'),
    stringifyFrontmatter({
      type: 'concept',
      title: 'Source Ledger',
      updated_at: new Date().toISOString(),
      status: 'curated',
      tags: ['sources', 'provenance'],
      refs: fetchedSources.length
        ? fetchedSources.map(({ source }) => `./${source.id}.md`).concat(fetchedSources.map(({ source }) => `../raw/feishu/${source.id}.md`))
        : ['./bundle-spec.md'],
    }) +
      `# Source Ledger\n\n- raw 只保存原始留档。\n- wiki 只保存整理后的概念。\n- 每个概念页都要能回到 raw。\n- 当前仓库默认只保留模板，不绑定任何具体项目源。\n`,
    'utf8',
  )

  await writeFile(
    path.join(wikiDir, 'bundle-spec.md'),
    stringifyFrontmatter({
      type: 'concept',
      title: 'Bundle Spec',
      updated_at: new Date().toISOString(),
      status: 'curated',
      tags: ['okf', 'structure', 'spec'],
      refs: ['./source-ledger.md'],
    }) +
      `# Bundle Spec\n\n- 目录即 bundle。\n- 路径即概念 ID。\n- frontmatter 只保留稳定字段。\n- 正文用标准 Markdown 连接关系。\n`,
    'utf8',
  )

  await writeFile(
    path.join(wikiDir, 'maintenance-playbook.md'),
    stringifyFrontmatter({
      type: 'concept',
      title: 'Maintenance Playbook',
      updated_at: new Date().toISOString(),
      status: 'curated',
      tags: ['maintenance', 'workflow'],
      refs: ['./source-ledger.md'],
    }) +
      `# Maintenance Playbook\n\n1. 更新 raw 留档。\n2. 更新 wiki 概念页。\n3. 运行 \`spark-harness sync\`。\n4. 运行 \`spark-harness check\`。\n5. 稳定经验再回写 skill。\n6. 不要把单一项目的测试文档提交进 harness 仓库。\n`,
    'utf8',
  )

  await writeFile(
    path.join(wikiDir, 'experience-backwrite.md'),
    stringifyFrontmatter({
      type: 'concept',
      title: 'Experience Backwrite',
      updated_at: new Date().toISOString(),
      status: 'curated',
      tags: ['workflow', 'agents', 'skill'],
      refs: ['./maintenance-playbook.md'],
    }) +
      `# Experience Backwrite\n\n- wiki 记录事实。\n- flow-kit 记录下一步怎么做。\n- skill 记录以后每次都怎么做。\n`,
    'utf8',
  )
}

async function writeFlowKit(root, config, fetchedSources) {
  const flowKitDir = resolvePath(root, config.paths.flowKitDir)
  const wikiRefs = fetchedSources.map(({ source }) => `../llm-wiki/${source.id}.md`)
  const rawRefs = fetchedSources.map(({ source }) => `../raw/feishu/${source.id}.md`)
  const taskLines = fetchedSources.length
    ? fetchedSources.map(({ source }) => `- ${source.id}: 从 raw 提取约束，生成对应任务和测试用例。`).join('\n')
    : '- 模板任务：接入外部 Feishu 源后再生成具体任务。'
  const testCases = fetchedSources.length
    ? fetchedSources.map(({ source }) => `- ${source.id}: raw -> wiki -> flow-kit 链路必须完整。`).join('\n')
    : '- 模板测试：空配置下仍应生成可校验的通用 bundle。'
  const rawTaskRefs = fetchedSources.map(({ source }) => `../../../raw/feishu/${source.id}.md`)

  await writeFile(
    path.join(flowKitDir, 'index.md'),
    stringifyFrontmatter({
      type: 'flow-kit-index',
      title: 'Flow Kit 索引',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['flow-kit', 'wiki', 'agents'],
      refs: ['./GO.md', './METHODOLOGY.md', './RULES.md', './CONTEXT.md', './lazycodex/HANDOFF.md', './changes/wiki-bootstrap/CHANGE.md'],
    }) +
      `# Flow Kit 索引\n\n- [GO](./GO.md)\n- [方法论](./METHODOLOGY.md)\n- [规则](./RULES.md)\n- [上下文](./CONTEXT.md)\n- [LazyCodex 交接](./lazycodex/HANDOFF.md)\n- [变更](./changes/wiki-bootstrap/CHANGE.md)\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, 'GO.md'),
    stringifyFrontmatter({
      type: 'flow-kit-go',
      title: 'GO',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['flow-kit', 'entrypoint', 'agents'],
      refs: ['./METHODOLOGY.md', './RULES.md', './CONTEXT.md', './changes/wiki-bootstrap/CHANGE.md', './changes/wiki-bootstrap/VERIFY.md', './lazycodex/HANDOFF.md'],
    }) +
      `# GO\n\n1. 读 wiki。\n2. 拆 flow-kit 任务。\n3. 生成测试用例。\n4. 交给 subagent。\n5. 回写 report 和 skill。\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, 'METHODOLOGY.md'),
    stringifyFrontmatter({
      type: 'flow-kit-methodology',
      title: '方法论',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['flow-kit', 'methodology'],
      refs: ['./GO.md'],
    }) +
      `# 方法论\n\nCHANGE -> REQUIREMENT -> DESIGN -> TASK -> TEST -> REVIEW -> HANDOFF -> REPORT\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, 'RULES.md'),
    stringifyFrontmatter({
      type: 'flow-kit-rules',
      title: '规则',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['flow-kit', 'rules'],
      refs: ['./GO.md'],
    }) +
      `# 规则\n\n- raw 不可编辑。\n- 没有 wiki 证据不建任务。\n- 测试用例必须是 flow-kit 产物。\n- stub 报告不能伪装 live。\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, 'CONTEXT.md'),
    stringifyFrontmatter({
      type: 'flow-kit-context',
      title: '上下文',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['flow-kit', 'context', 'wiki'],
      refs: ['./lazycodex/HANDOFF.md', './GO.md'].concat(wikiRefs),
    }) +
      `# 上下文\n\n- 来源 bundle: ${fetchedSources.length} 份 Feishu 文档。\n- 当前任务面：wiki / flow-kit / skill / subagent。\n- 当前仓库默认只保留模板，不携带业务样例。\n`,
    'utf8',
  )

  const changeDir = path.join(flowKitDir, 'changes', 'wiki-bootstrap')
  await writeFile(
    path.join(changeDir, 'CHANGE.md'),
    stringifyFrontmatter({
      type: 'change',
      title: 'wiki-bootstrap',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['change', 'wiki', 'agents'],
      refs: ['./REQUIREMENT.md', '../../../llm-wiki/index.md'],
    }) +
      `# 变更\n\n把 Feishu 源转换成可维护的 LLM Wiki + Flow Kit + Skill Harness。\n`,
    'utf8',
  )

  await writeFile(
    path.join(changeDir, 'REQUIREMENT.md'),
    stringifyFrontmatter({
      type: 'requirement',
      title: 'wiki-bootstrap 需求',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['requirement', 'wiki', 'flow-kit'],
      refs: ['./CHANGE.md'].concat(wikiRefs),
    }) +
      `# 需求\n\n- raw 与 wiki 分离。\n- 任务必须有测试用例。\n- 交接必须可给 subagent。\n`,
    'utf8',
  )

  await writeFile(
    path.join(changeDir, 'DESIGN.md'),
    stringifyFrontmatter({
      type: 'design',
      title: 'wiki-bootstrap 设计',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['design', 'flow-kit', 'agents'],
      refs: ['./REQUIREMENT.md'],
    }) +
      `# 设计\n\n- Extractor\n- Planner\n- Tester\n- Worker\n- Reviewer\n`,
    'utf8',
  )

  await writeFile(
    path.join(changeDir, 'TASK.md'),
    stringifyFrontmatter({
      type: 'task',
      title: 'wiki-bootstrap 任务',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['task', 'flow-kit', 'agents'],
      refs: ['./DESIGN.md'].concat(rawTaskRefs),
    }) +
      `# 任务\n\n${taskLines}\n\n## 测试用例\n\n${testCases}\n`,
    'utf8',
  )

  await writeFile(
    path.join(changeDir, 'VERIFY.md'),
    stringifyFrontmatter({
      type: 'verify',
      title: 'wiki-bootstrap 验证',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['verify', 'flow-kit'],
      refs: ['./TASK.md'],
    }) +
      `# 验证\n\n- 任务是否引用 wiki？\n- 每个任务是否都有测试用例？\n- report 是否 live？\n`,
    'utf8',
  )

  await writeFile(
    path.join(changeDir, 'INTEGRATION.md'),
    stringifyFrontmatter({
      type: 'integration',
      title: 'wiki-bootstrap 集成',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['integration', 'flow-kit'],
      refs: ['./VERIFY.md'],
    }) +
      `# 集成\n\n读取 wiki -> 拆任务 -> 分发 subagent -> 回写 report。\n`,
    'utf8',
  )

  await writeFile(
    path.join(changeDir, 'ARCHIVE.md'),
    stringifyFrontmatter({
      type: 'archive',
      title: 'wiki-bootstrap 归档',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['archive', 'flow-kit'],
      refs: ['./INTEGRATION.md'],
    }) +
      `# 归档\n\n当流程稳定并且 report 可复用时归档。\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, 'lazycodex', 'README.md'),
    stringifyFrontmatter({
      type: 'lazycodex-readme',
      title: 'LazyCodex 说明',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['lazycodex', 'execution'],
      refs: ['./HANDOFF.md'],
    }) +
      `# LazyCodex 说明\n\n把 handoff bundle 作为执行输入。\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, 'lazycodex', 'HANDOFF.md'),
    stringifyFrontmatter({
      type: 'lazycodex-handoff',
      title: 'LazyCodex 交接',
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: ['lazycodex', 'execution', 'agents'],
      refs: ['./README.md', '../GO.md', '../CONTEXT.md', '../changes/wiki-bootstrap/TASK.md'],
    }) +
      `# LazyCodex 交接\n\n## 目标\n\n- 构建并验证只读页面或 harness。\n- 用坐标式约束验证对话边界。\n\n## 分发角色\n\n- explorer\n- planner\n- tester\n- worker\n- reviewer\n\n## 测试用例\n\n${testCases}\n`,
    'utf8',
  )
}

async function writeLazycodexReport(root, config, status) {
  const flowKitDir = resolvePath(root, config.paths.flowKitDir)
  const testCases = config.sources.length
    ? config.sources.map((source) => ({
        name: source.id,
        scenario: 'source -> raw -> wiki -> flow-kit',
        expected: '链路完整并且 report 可校验.',
      }))
    : [
        {
          name: 'template-sync',
          scenario: 'empty config still generates generic bundle',
          expected: 'repo stays source-agnostic and check passes.',
        },
      ]
  const report = {
    objective: '通用 LLM Wiki Harness',
    readOrder: ['AGENTS.md', 'harness.config.json', 'docs/llm-wiki/index.md', 'docs/flow-kit/GO.md', 'docs/flow-kit/lazycodex/HANDOFF.md'],
    dispatch: config.agents.roles.map((role, index) => ({
      role,
      agentId: `demo-${index + 1}`,
      status: 'completed',
      output: `${role} 完成了对应步骤。`,
      filesChecked: ['docs/flow-kit/lazycodex/HANDOFF.md', 'docs/llm-wiki/index.md'],
    })),
    testCases,
    status,
    execution: {
      mode: config.executionBackend === 'demo' ? 'demo' : 'command',
    },
  }

  await writeFile(path.join(flowKitDir, 'lazycodex', 'REPORT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(
    path.join(flowKitDir, 'lazycodex', 'REPORT.md'),
    stringifyFrontmatter({
      type: 'lazycodex-report',
      title: 'LazyCodex Dispatch Report',
      updated_at: new Date().toISOString(),
      status,
      tags: ['lazycodex', 'execution', 'report'],
      refs: ['./HANDOFF.md', '../../llm-wiki/index.md'],
    }) +
      `# LazyCodex Dispatch Report\n\n## Status\n\n${status}\n\n## Test cases\n\n${report.testCases.map((item) => `- ${item.name}: ${item.scenario}`).join('\n')}\n`,
    'utf8',
  )
  return report
}

async function writeExperienceBackwrite(root, config, report) {
  const wikiFile = resolvePath(root, path.join(config.paths.wikiDir, 'experience-backwrite.md'))
  const content =
    stringifyFrontmatter({
      type: 'concept',
      title: 'Experience Backwrite',
      updated_at: new Date().toISOString(),
      status: 'curated',
      tags: ['workflow', 'agents', 'skill'],
      refs: ['./maintenance-playbook.md'],
    }) +
    `# Experience Backwrite\n\n## 本次稳定经验\n\n- ${report.objective}\n\n## 写回边界\n\n- wiki: 事实和结论\n- flow-kit: 任务和验证\n- skill: 固定流程\n`
  await writeFile(wikiFile, content, 'utf8')
}

async function writeSkillTemplate(root, config) {
  const skillDir = resolvePath(root, path.join(config.paths.skillsDir, 'llm-wiki-backwrite'))
  await mkdir(skillDir, { recursive: true })
  const skill =
    stringifyFrontmatter({
      name: 'llm-wiki-backwrite',
      description: 'Write validated harness experience back into docs/llm-wiki, docs/flow-kit, or a skill. Use when a workflow is stable and needs to be codified for future Codex sessions.',
    }) +
    `# LLM Wiki Backwrite\n\n## Workflow\n\n1. Read AGENTS.md.\n2. Read docs/llm-wiki and docs/flow-kit.\n3. Capture stable experience from the latest report.\n4. Write the smallest durable artifact.\n5. Keep raw留档 immutable.\n`
  await writeFile(path.join(skillDir, 'SKILL.md'), skill, 'utf8')
}

async function writeSkills(root, config) {
  const skillRoot = resolvePath(root, config.paths.skillsDir)
  const harnessSkill = path.join(skillRoot, 'llm-wiki-harness')
  const backwriteSkill = path.join(skillRoot, 'llm-wiki-backwrite')
  await mkdir(harnessSkill, { recursive: true })
  await mkdir(backwriteSkill, { recursive: true })

  await writeFile(
    path.join(harnessSkill, 'SKILL.md'),
    stringifyFrontmatter({
      name: 'llm-wiki-harness',
      description: 'Operate a Feishu-fed OKF-style wiki harness. Use when a project needs to ingest Feishu docs, generate raw留档, maintain llm wiki, split flow-kit tasks, produce test cases, and hand off to subagents for execution.',
    }) +
      `# LLM Wiki Harness\n\n## Read order\n\n1. AGENTS.md\n2. harness.config.json\n3. docs/raw/feishu/\n4. docs/llm-wiki/\n5. docs/flow-kit/\n\n## Output contract\n\n- raw 留档\n- wiki 概念页\n- flow-kit 任务和测试用例\n- lazycodex handoff/report\n- backwrite skill\n`,
    'utf8',
  )

  await writeFile(
    path.join(backwriteSkill, 'SKILL.md'),
    stringifyFrontmatter({
      name: 'llm-wiki-backwrite',
      description: 'Write validated harness experience back into docs/llm-wiki, docs/flow-kit, or a skill. Use when a workflow is stable and needs to be codified for future Codex sessions.',
    }) +
      `# LLM Wiki Backwrite\n\n## Rule\n\nOnly promote stable, repeated patterns into wiki / flow-kit / skill.\n`,
    'utf8',
  )
}

async function writeSyncManifest(root, fetchedSources) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    sources: fetchedSources.map(({ source, fetched }) => ({
      id: source.id,
      title: source.title || fetched.title,
      url: fetched.canonicalUrl,
      checksum: checksum(fetched.content),
    })),
  }
  const outDir = path.join(root, 'docs', '.generated')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'sync-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function ensurePlaceholder(root, relPath) {
  const file = resolvePath(root, relPath)
  if (!(await exists(file))) {
    await writeFile(file, '', 'utf8')
  }
}

function seedConfig() {
  return structuredClone(defaultConfig)
}

function mergeConfig(base, input) {
  return {
    ...base,
    ...input,
    paths: { ...base.paths, ...input.paths },
    wiki: { ...base.wiki, ...input.wiki },
    agents: { ...base.agents, ...input.agents },
    sources: Array.isArray(input.sources) ? input.sources : base.sources,
  }
}

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function resolvePath(root, rel) {
  return path.resolve(root, rel)
}

function rel(root, file) {
  return path.relative(root, file).replaceAll('\\', '/')
}

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function requireFile(root, relPath, problems) {
  const file = resolvePath(root, relPath)
  if (!(await exists(file))) problems.push(`missing file: ${rel(root, file)}`)
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}
