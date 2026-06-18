const BACKENDS = {
  lazycodex: {
    id: 'lazycodex',
    dir: 'lazycodex',
    label: 'LazyCodex',
    typePrefix: 'lazycodex',
    readmeTitle: 'LazyCodex 说明',
    executionTitle: 'LazyCodex 执行',
    handoffTitle: 'LazyCodex 交接',
    reportTitle: 'LazyCodex Dispatch Report',
    description: 'LazyCodex 是 flow-kit 的执行层，负责把 handoff bundle 真正跑起来。',
  },
  comet: {
    id: 'comet',
    dir: 'comet',
    label: 'Comet',
    typePrefix: 'comet',
    readmeTitle: 'Comet 说明',
    executionTitle: 'Comet 执行',
    handoffTitle: 'Comet 交接',
    reportTitle: 'Comet Dispatch Report',
    description: 'Comet 是可替换的执行层，负责接收 handoff bundle 并产出可回写 report。',
  },
}

export function resolveExecutor(config) {
  const requested = config.executor?.backend || config.executionBackend || 'lazycodex'
  const normalized = requested === 'demo' ? 'lazycodex' : String(requested).toLowerCase()
  return BACKENDS[normalized] || BACKENDS.lazycodex
}
