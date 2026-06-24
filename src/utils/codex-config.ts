import { readFileSync } from 'node:fs'
import ansis from 'ansis'
import { CODEX_AUTH_FILE, CODEX_CONFIG_FILE, CODEX_DIR, RELAY_PROVIDER_ID } from '../constants'
import { ensureDir, exists, readJson, writeFile, writeJson } from './fs'

function readFileRaw(path: string): string {
  return readFileSync(path, 'utf-8')
}

export interface CodexApiConfig {
  baseUrl: string
  token: string
  model?: string
  wireApi?: 'responses' | 'chat'
}

const ENV_KEY = `${RELAY_PROVIDER_ID.toUpperCase()}_API_KEY`
const SRPLLM_SECTION = `model_providers.${RELAY_PROVIDER_ID}`
const SRPLLM_HEADER = '# --- SrP-LLM 中转站配置 ---'

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
}

function backupCodexConfig(): string | null {
  if (!exists(CODEX_CONFIG_FILE))
    return null
  const backupPath = `${CODEX_CONFIG_FILE}.backup_${timestamp()}`
  try {
    writeFile(backupPath, readFileRaw(CODEX_CONFIG_FILE))
    return backupPath
  }
  catch {
    return null
  }
}

function renderSrpllmBlock(config: CodexApiConfig): string {
  const wireApi = config.wireApi || 'responses'
  const lines: string[] = [SRPLLM_HEADER]
  if (config.model)
    lines.push(`model = "${config.model}"`)
  lines.push(`model_provider = "${RELAY_PROVIDER_ID}"`)
  lines.push('')
  lines.push(`[${SRPLLM_SECTION}]`)
  lines.push(`name = "SrP-LLM"`)
  lines.push(`base_url = "${config.baseUrl}"`)
  lines.push(`wire_api = "${wireApi}"`)
  lines.push(`temp_env_key = "${ENV_KEY}"`)
  lines.push(`requires_openai_auth = false`)
  lines.push('')
  return lines.join('\n')
}

/**
 * 从 config.toml 内容中移除旧的 srpllm 段、顶层 model/model_provider 及其注释头，
 * 返回保留其余配置后的内容。
 */
function stripSrpllmManaged(content: string): string {
  const lines = content.split('\n')

  // 定位 srpllm 段的起止行
  let srpllmStart = -1
  let srpllmEnd = -1
  let currentSection = ''
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    const sec = trimmed.match(/^\[([^\]]+)\]/)
    if (sec) {
      currentSection = sec[1]!
      if (currentSection === SRPLLM_SECTION && srpllmStart === -1)
        srpllmStart = i
      else if (srpllmStart !== -1 && srpllmEnd === -1)
        srpllmEnd = i
    }
  }
  if (srpllmStart !== -1 && srpllmEnd === -1)
    srpllmEnd = lines.length

  // 向上吸收紧邻 srpllm 段的注释头与空行
  while (srpllmStart > 0) {
    const prev = lines[srpllmStart - 1]!.trim()
    if (prev === '' || prev === SRPLLM_HEADER || /---\s*SrP-LLM\s*---/i.test(prev) || /---\s*model provider added by ZCF\s*---/i.test(prev))
      srpllmStart--
    else
      break
  }

  // 重建保留行
  const preserved: string[] = []
  let inSection = false
  for (let i = 0; i < lines.length; i++) {
    // 跳过 srpllm 段区间
    if (i >= srpllmStart && i < srpllmEnd)
      continue

    const line = lines[i]!
    const trimmed = line.trim()

    const sec = trimmed.match(/^\[([^\]]+)\]/)
    if (sec) {
      inSection = true
      preserved.push(line)
      continue
    }

    if (!inSection) {
      // 顶层 model / model_provider 由我们接管，剔除
      if (/^model\s*=/.test(trimmed) || /^model_provider\s*=/.test(trimmed))
        continue
      // 跳过遗留的 SrP-LLM/ZCF 顶层注释头
      if (trimmed === SRPLLM_HEADER || /---\s*SrP-LLM\s*---/i.test(trimmed) || /---\s*model provider added by ZCF\s*---/i.test(trimmed))
        continue
    }

    preserved.push(line)
  }

  return preserved.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function mergeConfigContent(existing: string, config: CodexApiConfig): string {
  const stripped = stripSrpllmManaged(existing)
  const block = renderSrpllmBlock(config)
  const merged = stripped.trim() ? `${block}\n${stripped}` : `${block}\n`
  return `${merged.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

export function getExistingCodexConfig(): CodexApiConfig | null {
  if (!exists(CODEX_CONFIG_FILE))
    return null
  const content = readFileRaw(CODEX_CONFIG_FILE)
  const baseUrl = content.match(new RegExp(`\\[${escapeRegex(SRPLLM_SECTION)}\\][\\s\\S]*?base_url\\s*=\\s*"([^"]+)"`))?.[1]
  const model = content.match(/^model\s*=\s*"([^"]+)"/m)?.[1]
  const auth = readJson<Record<string, string>>(CODEX_AUTH_FILE) || {}
  const token = auth[ENV_KEY] || auth.OPENAI_API_KEY
  if (!baseUrl && !token)
    return null
  return { baseUrl: baseUrl || '', token: token || '', model }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function writeCodexApiConfig(config: CodexApiConfig): void {
  ensureDir(CODEX_DIR)
  const backup = backupCodexConfig()
  if (backup)
    console.log(ansis.gray(`✔ 已备份原配置：${backup}`))

  const existing = exists(CODEX_CONFIG_FILE) ? readFileRaw(CODEX_CONFIG_FILE) : ''
  writeFile(CODEX_CONFIG_FILE, mergeConfigContent(existing, config))

  const auth = readJson<Record<string, string>>(CODEX_AUTH_FILE) || {}
  auth[ENV_KEY] = config.token
  auth.OPENAI_API_KEY = config.token
  writeJson(CODEX_AUTH_FILE, auth)
}

export function disableCodexWindowsSandbox(): void {
  if (!exists(CODEX_CONFIG_FILE))
    return
  let content = readFileRaw(CODEX_CONFIG_FILE)
  if (content.includes('sandbox = "disabled"'))
    return

  // If [windows] section exists, append to it, else create it
  if (content.match(/^\[windows\]/m)) {
    content = content.replace(/^\[windows\]/m, '[windows]\nsandbox = "disabled"')
  }
  else {
    content += '\n[windows]\nsandbox = "disabled"\n'
  }
  writeFile(CODEX_CONFIG_FILE, content)
}

export function clearCodexApiConfig(): void {
  if (exists(CODEX_CONFIG_FILE)) {
    const backup = `${CODEX_CONFIG_FILE}.backup_${timestamp()}`
    try {
      writeFile(backup, readFileRaw(CODEX_CONFIG_FILE))
      console.log(ansis.gray(`✔ 已备份原配置：${backup}`))
    }
    catch {
    }
    // 仅移除 srpllm 段与顶层 model/model_provider，保留其它配置
    const existing = readFileRaw(CODEX_CONFIG_FILE)
    const cleaned = stripSrpllmManaged(existing)
    writeFile(CODEX_CONFIG_FILE, cleaned ? `${cleaned}\n` : '# Codex 配置\n')
  }
  const auth = readJson<Record<string, string>>(CODEX_AUTH_FILE) || {}
  delete auth[ENV_KEY]
  delete auth.OPENAI_API_KEY
  writeJson(CODEX_AUTH_FILE, auth)
}

export function displayCodexConfig(config: CodexApiConfig): void {
  console.log(ansis.gray(`  配置文件：${CODEX_CONFIG_FILE}`))
  console.log(ansis.gray(`  凭证文件：${CODEX_AUTH_FILE}`))
  console.log(ansis.gray(`  base_url：${config.baseUrl}`))
  console.log(ansis.gray(`  token：${maskToken(config.token)}`))
  if (config.model)
    console.log(ansis.gray(`  模型：${config.model}`))
}

function maskToken(token: string): string {
  if (!token)
    return 'N/A'
  if (token.length <= 8)
    return '***'
  return `${token.slice(0, 4)}***${token.slice(-4)}`
}
