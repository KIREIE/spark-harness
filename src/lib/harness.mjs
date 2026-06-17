import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { loadConfig, seedConfig } from './config.mjs'
import { readOptional, requireFile, resolvePath, rel } from './fs-utils.mjs'
import { collectRuntimeSourceUrls, fetchRuntimeSources, listRecordedSources } from './runtime-sources.mjs'
import { parseFrontmatter } from './markdown.mjs'
import { writeSkillTemplate, writeSkills, writeSyncManifest, writeWikiBundle, writeCuratedPage, writeRawDoc } from './wiki-artifacts.mjs'
import { writeFlowKit as writeFlowKitArtifacts, writeExperienceBackwrite } from './flowkit-artifacts.mjs'
import { writeLazycodexReport } from './lazycodex-report.mjs'

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

  const sourceUrls = collectRuntimeSourceUrls(flags)
  const fetchedSources = await fetchRuntimeSources(sourceUrls)
  for (const { source, fetched } of fetchedSources) {
    await writeRawDoc(root, config, source, fetched)
    await writeCuratedPage(root, config, source, fetched)
  }

  await writeWikiBundle(root, config, fetchedSources)
  await writeFlowKitArtifacts(root, config, fetchedSources)
  await writeSkills(root, config)
  await writeSyncManifest(root, fetchedSources)

  console.log(`sync complete (${fetchedSources.length} sources)`)
  return fetchedSources
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

  const recordedSources = await listRecordedSources(root, config.paths.rawDir)
  for (const { source } of recordedSources) {
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
    'lazycodex/EXECUTION.md',
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
  console.log(`check passed (${recordedSources.length} sources)`)
}

export async function runProject(root, flags = {}) {
  const fetchedSources = await syncProject(root, flags)
  const config = await loadConfig(root, flags)
  const report = await writeLazycodexReport(root, config, 'live', fetchedSources)
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
  console.log(JSON.stringify({ root, projectName: config.projectName, backend: config.executionBackend }, null, 2))
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

async function ensurePlaceholder(root, relPath) {
  const file = resolvePath(root, relPath)
  const existing = await readOptional(file)
  if (existing === null) {
    await writeFile(file, '', 'utf8')
  }
}
