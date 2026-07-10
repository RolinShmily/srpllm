import type { CodexReasoningEffort } from './codex-model-catalog'
import { chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { ensureDir, readJson, writeJson } from './fs'

export const SRPLLM_DIR = join(homedir(), '.srpllm')
const SRPLLM_CONFIG_FILE = join(SRPLLM_DIR, 'config.json')

export interface LocalConfig {
  /** 上次选的工具 */
  codeType?: 'claude-code' | 'codex' | 'chatbox'
  /** 上次输入的中转站 base_url */
  baseUrl?: string
  /** 上次输入的 api_token（明文存储，文件权限 600） */
  token?: string
  /** 上次为 Claude Code 选的四档模型 */
  claude?: {
    model?: string
    opusModel?: string
    sonnetModel?: string
    haikuModel?: string
  }
  /** 上次为 Codex 选的模型与推理强度 */
  codex?: {
    model?: string
    reasoningEffort?: CodexReasoningEffort
  }
  /** 上次为 Chatbox 选的模型 */
  chatbox?: {
    model?: string
  }
}

export function readLocalConfig(): LocalConfig {
  return readJson<LocalConfig>(SRPLLM_CONFIG_FILE) || {}
}

export function writeLocalConfig(config: LocalConfig): void {
  ensureDir(SRPLLM_DIR)
  writeJson(SRPLLM_CONFIG_FILE, config)
  // 收紧文件权限为仅当前用户可读写
  try {
    chmodSync(SRPLLM_CONFIG_FILE, 0o600)
  }
  catch {
    // Windows 上 chmod 基本是 no-op，忽略
  }
}

/** 合并更新本地记忆 */
export function updateLocalConfig(patch: Partial<LocalConfig>): void {
  const existing = readLocalConfig()
  writeLocalConfig({ ...existing, ...patch })
}
