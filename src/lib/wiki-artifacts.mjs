import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { extractTextFromHtml, stringifyFrontmatter } from './markdown.mjs'
import { resolvePath } from './fs-utils.mjs'

export async function writeRawDoc(root, config, source, fetched) {
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

export async function writeCuratedPage(root, config, source, fetched) {
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

export async function writeWikiBundle(root, config, fetchedSources) {
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

export async function writeSkillTemplate(root, config) {
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

export async function writeSkills(root, config) {
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

export async function writeSyncManifest(root, fetchedSources) {
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

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}
