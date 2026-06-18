import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stringifyFrontmatter } from './markdown.mjs'
import { resolvePath } from './fs-utils.mjs'
import { resolveExecutor } from './executor.mjs'

export async function writeFlowKit(root, config, fetchedSources) {
  const flowKitDir = resolvePath(root, config.paths.flowKitDir)
  const executor = resolveExecutor(config)
  const executorDir = `./${executor.dir}`
  const wikiRefs = fetchedSources.map(({ source }) => `../llm-wiki/${source.id}.md`)
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
      refs: ['./GO.md', './METHODOLOGY.md', './RULES.md', './CONTEXT.md', `${executorDir}/EXECUTION.md`, `${executorDir}/HANDOFF.md`, './changes/wiki-bootstrap/CHANGE.md'],
    }) +
      `# Flow Kit 索引\n\n- [GO](./GO.md)\n- [方法论](./METHODOLOGY.md)\n- [规则](./RULES.md)\n- [上下文](./CONTEXT.md)\n- [${executor.label} 执行](${executorDir}/EXECUTION.md)\n- [${executor.label} 交接](${executorDir}/HANDOFF.md)\n- [变更](./changes/wiki-bootstrap/CHANGE.md)\n`,
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
      refs: ['./METHODOLOGY.md', './RULES.md', './CONTEXT.md', './changes/wiki-bootstrap/CHANGE.md', './changes/wiki-bootstrap/VERIFY.md', `${executorDir}/HANDOFF.md`],
    }) +
      `# GO\n\n1. 读 wiki。\n2. 读取当前 executor：${executor.label}。\n3. 再读 handoff。\n4. 拆 flow-kit 任务。\n5. 生成测试用例。\n6. 交给 subagent。\n7. 回写 report 和 skill。\n`,
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
      refs: [`${executorDir}/EXECUTION.md`, `${executorDir}/HANDOFF.md`, './GO.md'].concat(wikiRefs),
    }) +
      `# 上下文\n\n- 来源 bundle: ${fetchedSources.length} 份 Feishu 文档。\n- 当前任务面：wiki / flow-kit / skill / subagent。\n- 当前 executor：${executor.label}。\n- 当前仓库默认只保留模板，不携带业务样例。\n`,
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
    path.join(flowKitDir, executor.dir, 'README.md'),
    stringifyFrontmatter({
      type: `${executor.typePrefix}-readme`,
      title: executor.readmeTitle,
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: [executor.id, 'execution'],
      refs: ['./EXECUTION.md', './HANDOFF.md'],
    }) +
      `# ${executor.readmeTitle}\n\n${executor.description}\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, executor.dir, 'EXECUTION.md'),
    stringifyFrontmatter({
      type: `${executor.typePrefix}-execution`,
      title: executor.executionTitle,
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: [executor.id, 'execution', 'agents'],
      refs: ['./README.md', './HANDOFF.md', './REPORT.md'],
    }) +
      `# ${executor.executionTitle}\n\n1. 读取 handoff。\n2. 分发角色。\n3. 执行任务与验证。\n4. 写入 report。\n5. 回写稳定经验。\n`,
    'utf8',
  )

  await writeFile(
    path.join(flowKitDir, executor.dir, 'HANDOFF.md'),
    stringifyFrontmatter({
      type: `${executor.typePrefix}-handoff`,
      title: executor.handoffTitle,
      updated_at: new Date().toISOString(),
      status: 'active',
      tags: [executor.id, 'execution', 'agents'],
      refs: ['./README.md', './EXECUTION.md', '../GO.md', '../CONTEXT.md', '../changes/wiki-bootstrap/TASK.md'],
    }) +
      `# ${executor.handoffTitle}\n\n这个页面是执行输入，不是执行本身。真正的执行说明在 \`EXECUTION.md\`。\n\n## 目标\n\n- 构建并验证只读页面或 harness。\n- 用坐标式约束验证对话边界。\n\n## 分发角色\n\n- explorer\n- planner\n- tester\n- worker\n- reviewer\n\n## 测试用例\n\n${testCases}\n`,
    'utf8',
  )
}

export async function writeExperienceBackwrite(root, config, report) {
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
