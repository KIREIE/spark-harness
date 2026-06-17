import crypto from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './markdown.mjs'
import { readOptional, resolvePath } from './fs-utils.mjs'
import { fetchFeishuDoc } from './lark.mjs'

export function collectRuntimeSourceUrls(flags = {}) {
  const values = []
  const push = (value) => {
    if (typeof value !== 'string' || value.length === 0) return
    values.push(value)
  }
  const raw = flags.source ?? flags.sources ?? []
  if (Array.isArray(raw)) {
    for (const value of raw) push(value)
  } else {
    push(raw)
  }
  if (Array.isArray(flags._)) {
    for (const value of flags._) push(value)
  }
  return [...new Set(values)]
}

export async function fetchRuntimeSources(sourceUrls) {
  const fetchedSources = []
  for (const url of sourceUrls) {
    const fetched = await fetchFeishuDoc(url)
    const source = {
      id: sourceIdFromFetched(fetched),
      title: fetched.title || 'Feishu Document',
      inputUrl: fetched.inputUrl,
      canonicalUrl: fetched.canonicalUrl,
      token: fetched.token,
    }
    fetchedSources.push({ source, fetched })
  }
  return fetchedSources
}

export async function listRecordedSources(root, rawDir) {
  const dir = resolvePath(root, rawDir)
  const names = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const sourceEntries = []
  for (const entry of names) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === '.gitkeep') continue
    const file = path.join(dir, entry.name)
    const text = await readOptional(file)
    if (!text) continue
    const { frontmatter } = parseFrontmatter(text)
    if (frontmatter.type !== 'feishu-raw') continue
    sourceEntries.push({
      source: {
        id: frontmatter.source_id || entry.name.slice(0, -3),
        title: frontmatter.title || entry.name.slice(0, -3),
        inputUrl: frontmatter.source_url || '',
        canonicalUrl: frontmatter.canonical_url || frontmatter.source_url || '',
        token: frontmatter.token || null,
      },
      rawPath: file,
    })
  }
  return sourceEntries
}

function sourceIdFromFetched(fetched) {
  if (typeof fetched.token === 'string' && fetched.token.length > 0) return fetched.token
  return crypto.createHash('sha256').update(fetched.canonicalUrl || fetched.inputUrl).digest('hex').slice(0, 12)
}
