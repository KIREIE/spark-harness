export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  const body = match ? text.slice(match[0].length) : text
  const frontmatter = match ? parseYamlLike(match[1]) : {}
  return { frontmatter, body }
}

export function stringifyFrontmatter(frontmatter) {
  const lines = ['---']
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${formatValue(value)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

export function firstHeading(body) {
  const match = /^#\s+(.+)$/m.exec(body)
  return match?.[1]?.trim() ?? ''
}

export function summarizeMarkdown(text) {
  const { body } = parseFrontmatter(text)
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#') && !line.startsWith('>'))
  return lines[0]?.replace(/\s+/g, ' ').slice(0, 180) ?? ''
}

export function extractTextFromHtml(html) {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<\/(p|div|h\d|li|tr|table|callout|blockquote|sheet)>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<li>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function parseYamlLike(text) {
  const result = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    result[key] = parseValue(value)
  }
  return result
}

function parseValue(value) {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((part) => unquote(part.trim()))
      .filter(Boolean)
  }
  return unquote(value)
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatScalar(item)).join(', ')}]`
  }
  return formatScalar(value)
}

function formatScalar(value) {
  if (value === null || value === undefined) return '""'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(String(value))
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, '')
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
