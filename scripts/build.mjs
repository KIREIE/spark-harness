import { rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const outdir = path.join(root, 'dist')

await rm(outdir, { recursive: true, force: true })
await build({
  entryPoints: [path.join(root, 'src', 'cli.mjs')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  outfile: path.join(outdir, 'cli.cjs'),
  logLevel: 'info',
})
