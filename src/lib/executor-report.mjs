import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stringifyFrontmatter } from './markdown.mjs'
import { resolvePath } from './fs-utils.mjs'
import { resolveExecutor } from './executor.mjs'

export async function writeExecutorReport(root, config, status, fetchedSources) {
  const flowKitDir = resolvePath(root, config.paths.flowKitDir)
  const executor = resolveExecutor(config)
  const testCases = fetchedSources.length
    ? fetchedSources.map(({ source }) => ({
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
    executor: executor.id,
    readOrder: ['AGENTS.md', 'harness.config.json', 'docs/llm-wiki/index.md', 'docs/flow-kit/GO.md', `docs/flow-kit/${executor.dir}/EXECUTION.md`, `docs/flow-kit/${executor.dir}/HANDOFF.md`],
    dispatch: config.agents.roles.map((role, index) => ({
      role,
      agentId: `demo-${index + 1}`,
      status: 'completed',
      output: `${role} 完成了对应步骤。`,
      filesChecked: [`docs/flow-kit/${executor.dir}/HANDOFF.md`, 'docs/llm-wiki/index.md'],
    })),
    testCases,
    status,
    execution: {
      backend: executor.id,
      mode: config.executionBackend === 'demo' ? 'demo' : 'command',
    },
  }

  await writeFile(path.join(flowKitDir, executor.dir, 'REPORT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(
    path.join(flowKitDir, executor.dir, 'REPORT.md'),
    stringifyFrontmatter({
      type: `${executor.typePrefix}-report`,
      title: executor.reportTitle,
      updated_at: new Date().toISOString(),
      status,
      tags: [executor.id, 'execution', 'report'],
      refs: ['./EXECUTION.md', './HANDOFF.md', '../../llm-wiki/index.md'],
    }) +
      `# ${executor.reportTitle}\n\n## Status\n\n${status}\n\n## Test cases\n\n${report.testCases.map((item) => `- ${item.name}: ${item.scenario}`).join('\n')}\n`,
    'utf8',
  )
  return report
}
