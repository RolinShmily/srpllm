import { homedir } from 'node:os'
import { join } from 'pathe'

export const CLAUDE_DIR = join(homedir(), '.claude')
export const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')

export const CODEX_DIR = join(homedir(), '.codex')
export const CODEX_CONFIG_FILE = join(CODEX_DIR, 'config.toml')
export const CODEX_AUTH_FILE = join(CODEX_DIR, 'auth.json')

export const CODE_TOOL_TYPES = ['claude-code', 'codex'] as const
export type CodeToolType = (typeof CODE_TOOL_TYPES)[number]
export const DEFAULT_CODE_TOOL_TYPE: CodeToolType = 'claude-code'

export const CODE_TOOL_ALIASES: Record<string, CodeToolType> = {
  cc: 'claude-code',
  cx: 'codex',
}

export const CODE_TOOL_LABELS: Record<CodeToolType, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
}

export function resolveCodeToolType(value: unknown): CodeToolType {
  if (value && (CODE_TOOL_TYPES as readonly string[]).includes(value as string)) {
    return value as CodeToolType
  }
  if (typeof value === 'string' && value in CODE_TOOL_ALIASES) {
    return CODE_TOOL_ALIASES[value]
  }
  return DEFAULT_CODE_TOOL_TYPE
}

export const RELAY_PROVIDER_ID = 'srpllm'
