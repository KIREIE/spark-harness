import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stringifyFrontmatter } from './markdown.mjs'
import { resolvePath } from './fs-utils.mjs'

export async function writeLazycodexReport(root, config, status, fetchedSources) {
  const flowKitDir = resolvePath(root, config.paths.flowKitDir)
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
    readOrder: ['AGENTS.md', 'harness.config.json', 'docs/llm-wiki/index.md', 'docs/flow-kit/GO.md', 'docs/flow-kit/lazycodex/EXECUTION.md', 'docs/flow-kit/lazycodex/HANDOFF.md'],
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
      refs: ['./EXECUTION.md', './HANDOFF.md', '../../llm-wiki/index.md'],
    }) +
      `# LazyCodex Dispatch Report\n\n## Status\n\n${status}\n\n## Test cases\n\n${report.testCases.map((item) => `- ${item.name}: ${item.scenario}`).join('\n')}\n`,
    'utf8',
  )
  return report
}
