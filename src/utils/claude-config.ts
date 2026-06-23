import ansis from 'ansis'
import { CLAUDE_DIR, CLAUDE_SETTINGS_FILE } from '../constants'
import { ensureDir, readJson, writeJson } from './fs'

interface ClaudeSettings {
  env?: Record<string, string | undefined>
  [key: string]: any
}

export interface ClaudeApiConfig {
  baseUrl: string
  token: string
  /** 主模型，对应 ANTHROPIC_MODEL */
  model?: string
  /** Opus 档模型，对应 ANTHROPIC_DEFAULT_OPUS_MODEL */
  opusModel?: string
  /** Sonnet 档模型，对应 ANTHROPIC_DEFAULT_SONNET_MODEL */
  sonnetModel?: string
  /** Haiku 档模型，对应 ANTHROPIC_DEFAULT_HAIKU_MODEL */
  haikuModel?: string
}

// 中转站客户端统一附加的 Claude Code 默认 env 字段
const FIXED_ENV_DEFAULTS: Record<string, string> = {
  CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
}

export function ensureClaudeDir(): void {
  ensureDir(CLAUDE_DIR)
}

export function readClaudeSettings(): ClaudeSettings {
  return readJson<ClaudeSettings>(CLAUDE_SETTINGS_FILE) || {}
}

export function getExistingClaudeApiConfig(): ClaudeApiConfig | null {
  const settings = readClaudeSettings()
  const env = settings.env
  if (!env)
    return null
  const url = env.ANTHROPIC_BASE_URL
  const token = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY
  if (!url && !token)
    return null
  return {
    baseUrl: url || '',
    token: token || '',
    model: env.ANTHROPIC_MODEL,
    opusModel: env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    sonnetModel: env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    haikuModel: env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  }
}

export function writeClaudeApiConfig(config: ClaudeApiConfig): void {
  ensureClaudeDir()
  const settings = readClaudeSettings()
  settings.env = settings.env || {}

  // 中转站使用 Bearer token 鉴权，对应 Claude Code 的 ANTHROPIC_AUTH_TOKEN
  settings.env.ANTHROPIC_BASE_URL = config.baseUrl
  settings.env.ANTHROPIC_AUTH_TOKEN = config.token
  delete settings.env.ANTHROPIC_API_KEY

  // 四档模型：未提供则删除对应 env，回退到客户端默认
  setOrDelete(settings.env, 'ANTHROPIC_MODEL', config.model)
  setOrDelete(settings.env, 'ANTHROPIC_DEFAULT_OPUS_MODEL', config.opusModel)
  setOrDelete(settings.env, 'ANTHROPIC_DEFAULT_SONNET_MODEL', config.sonnetModel)
  setOrDelete(settings.env, 'ANTHROPIC_DEFAULT_HAIKU_MODEL', config.haikuModel)

  // 统一附加中转站客户端默认 env 字段
  for (const [key, value] of Object.entries(FIXED_ENV_DEFAULTS)) {
    settings.env[key] = value
  }

  writeJson(CLAUDE_SETTINGS_FILE, settings)
}

function setOrDelete(env: Record<string, string | undefined>, key: string, value?: string): void {
  if (value && value.trim()) {
    env[key] = value.trim()
  }
  else {
    delete env[key]
  }
}

export function clearClaudeApiConfig(): void {
  const settings = readClaudeSettings()
  if (settings.env) {
    delete settings.env.ANTHROPIC_BASE_URL
    delete settings.env.ANTHROPIC_AUTH_TOKEN
    delete settings.env.ANTHROPIC_API_KEY
    delete settings.env.ANTHROPIC_MODEL
    delete settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
    delete settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL
    delete settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL
    delete settings.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
    delete settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  }
  writeJson(CLAUDE_SETTINGS_FILE, settings)
}

export function displayClaudeConfig(config: ClaudeApiConfig): void {
  console.log(ansis.gray(`  配置文件：${CLAUDE_SETTINGS_FILE}`))
  console.log(ansis.gray(`  base_url：${config.baseUrl}`))
  console.log(ansis.gray(`  token：${maskToken(config.token)}`))
  if (config.model)
    console.log(ansis.gray(`  主模型 (ANTHROPIC_MODEL)：${config.model}`))
  if (config.opusModel)
    console.log(ansis.gray(`  Opus (ANTHROPIC_DEFAULT_OPUS_MODEL)：${config.opusModel}`))
  if (config.sonnetModel)
    console.log(ansis.gray(`  Sonnet (ANTHROPIC_DEFAULT_SONNET_MODEL)：${config.sonnetModel}`))
  if (config.haikuModel)
    console.log(ansis.gray(`  Haiku (ANTHROPIC_DEFAULT_HAIKU_MODEL)：${config.haikuModel}`))
}

function maskToken(token: string): string {
  if (!token)
    return 'N/A'
  if (token.length <= 8)
    return '***'
  return `${token.slice(0, 4)}***${token.slice(-4)}`
}
