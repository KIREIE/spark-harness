import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export function resolvePath(root, rel) {
  return path.resolve(root, rel)
}

export function rel(root, file) {
  return path.relative(root, file).replaceAll('\\', '/')
}

export async function readOptional(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

export async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export async function requireFile(root, relPath, problems) {
  const file = resolvePath(root, relPath)
  if (!(await exists(file))) {
    problems.push(`missing file: ${rel(root, file)}`)
  }
}
