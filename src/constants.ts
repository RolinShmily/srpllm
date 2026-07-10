import { homedir } from 'node:os'
import { join } from 'pathe'

export const CLAUDE_DIR = join(homedir(), '.claude')
export const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')

export const CODEX_DIR = join(homedir(), '.codex')
export const CODEX_CONFIG_FILE = join(CODEX_DIR, 'config.toml')
export const CODEX_AUTH_FILE = join(CODEX_DIR, 'auth.json')
export const CODEX_MODEL_CATALOG_FILE = join(CODEX_DIR, 'srpllm-models.json')

export const CODE_TOOL_TYPES = ['claude-code', 'codex'] as const
export type CodeToolType = (typeof CODE_TOOL_TYPES)[number]
export const DEFAULT_CODE_TOOL_TYPE: CodeToolType = 'claude-code'

// 含 chatbox 在内的中转站客户端类型
export const RELAY_TOOL_TYPES = ['claude-code', 'codex', 'chatbox'] as const
export type RelayToolType = (typeof RELAY_TOOL_TYPES)[number]

export const CODE_TOOL_ALIASES: Record<string, RelayToolType> = {
  cc: 'claude-code',
  cx: 'codex',
  cb: 'chatbox',
}

export const CODE_TOOL_LABELS: Record<RelayToolType, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'chatbox': 'Chatbox (OpenAI 兼容)',
}

// 中转站按客户端前缀区分模型：claude-code → cc-，codex → cx-，chatbox → chat-
export const MODEL_PREFIX: Record<RelayToolType, string> = {
  'claude-code': 'cc-',
  'codex': 'cx-',
  'chatbox': 'chat-',
}

export function isCodeToolType(value: unknown): value is CodeToolType {
  return (CODE_TOOL_TYPES as readonly string[]).includes(value as string)
}

export function resolveCodeToolType(value: unknown): RelayToolType {
  if (value && (RELAY_TOOL_TYPES as readonly string[]).includes(value as string)) {
    return value as RelayToolType
  }
  if (typeof value === 'string' && value in CODE_TOOL_ALIASES) {
    return CODE_TOOL_ALIASES[value]
  }
  return DEFAULT_CODE_TOOL_TYPE
}

export function isCliTool(tool: RelayToolType): tool is CodeToolType {
  return tool !== 'chatbox'
}

export const RELAY_PROVIDER_ID = 'srpllm'
