import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'pathe'

export function exists(path: string): boolean {
  return existsSync(path)
}

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export function ensureFileDir(filePath: string): void {
  ensureDir(dirname(filePath))
}

export function readFile(path: string, encoding: BufferEncoding = 'utf-8'): string {
  return readFileSync(path, encoding)
}

export function writeFile(path: string, content: string): void {
  ensureFileDir(path)
  writeFileSync(path, content, 'utf-8')
}

export function readJson<T = any>(path: string): T | null {
  if (!existsSync(path))
    return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  }
  catch {
    return null
  }
}

export function writeJson(path: string, data: any): void {
  ensureFileDir(path)
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}
