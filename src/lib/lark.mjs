import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const execOptions = process.platform === 'win32' ? { shell: true } : {}

export async function inspectFeishu(url) {
  const { stdout } = await execFileAsync('lark-cli', [
    'drive',
    '+inspect',
    '--url',
    url,
    '--format',
    'json',
  ], execOptions)
  return JSON.parse(stdout)
}

export async function fetchFeishuDoc(url) {
  const inspection = await inspectFeishu(url)
  const token = inspection?.data?.token
  const canonicalUrl = inspection?.data?.url ?? url
  const title = inspection?.data?.title ?? ''
  const type = inspection?.data?.type ?? 'docx'

  const { stdout } = await execFileAsync('lark-cli', [
    'docs',
    '+fetch',
    '--doc',
    token || canonicalUrl,
    '--api-version',
    'v2',
    '--format',
    'json',
  ], execOptions)
  const fetched = JSON.parse(stdout)
  const content = fetched?.data?.document?.content ?? ''
  return {
    inputUrl: url,
    canonicalUrl,
    token,
    title,
    type,
    revisionId: fetched?.data?.revision_id ?? null,
    content,
  }
}
