#!/usr/bin/env node
import { loadConfig, initProject, syncProject, checkProject, runProject, backwriteProject, doctorProject } from './lib/harness.mjs'

const [command = 'help', ...rest] = process.argv.slice(2)
const root = process.cwd()

try {
  switch (command) {
    case 'init':
      await initProject(root, parseFlags(rest))
      break
    case 'sync':
      await syncProject(root, parseFlags(rest))
      break
    case 'check':
      await checkProject(root, parseFlags(rest))
      break
    case 'run':
      await runProject(root, parseFlags(rest))
      break
    case 'backwrite':
      await backwriteProject(root, parseFlags(rest))
      break
    case 'doctor':
      await doctorProject(root, parseFlags(rest))
      break
    default:
      printHelp()
      process.exitCode = 1
  }
} catch (error) {
  console.error(error?.stack || error?.message || String(error))
  process.exitCode = 1
}

function parseFlags(args) {
  const flags = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = args[i + 1]
    if (next && !next.startsWith('--')) {
      flags[key] = next
      i += 1
    } else {
      flags[key] = true
    }
  }
  return flags
}

function printHelp() {
  console.log(`spark-harness

usage:
  spark-harness init
  spark-harness sync
  spark-harness check
  spark-harness run
  spark-harness backwrite
  spark-harness doctor`)
}
