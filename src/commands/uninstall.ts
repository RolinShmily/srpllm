import type { RelayToolType } from '../constants'
import { existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import process from 'node:process'
import ansis from 'ansis'
import { join } from 'pathe'
import { isCliTool, resolveCodeToolType } from '../constants'
import { clearClaudeApiConfig } from '../utils/claude-config'
import { clearCodexApiConfig } from '../utils/codex-config'
import { uninstallTool } from '../utils/installer'
import { readLocalConfig, writeLocalConfig } from '../utils/local-config'
import { confirm, displayBanner, selectTool } from '../utils/ui'

export interface UninstallOptions {
  codeType?: string
  skipPrompt?: boolean
}

function getDownloadsYamlPath(): string {
  const home = homedir()
  const candidates = [
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Downloads') : '',
    join(home, 'Downloads'),
  ]
  for (const c of candidates) {
    if (c)
      return join(c, 'srpllm-chatbox-config.yaml')
  }
  return join(home, 'Downloads', 'srpllm-chatbox-config.yaml')
}

export async function uninstall(options: UninstallOptions = {}): Promise<void> {
  try {
    const tool: RelayToolType = options.codeType
      ? resolveCodeToolType(options.codeType)
      : (options.skipPrompt ? 'claude-code' : await selectTool())

    displayBanner(tool)

    // chatbox：删除生成的 config.yaml
    if (tool === 'chatbox') {
      console.log(ansis.blue('\nℹ 正在清理 Chatbox 生成的配置文件...'))
      const yamlPath = getDownloadsYamlPath()
      if (existsSync(yamlPath)) {
        unlinkSync(yamlPath)
        console.log(ansis.green(`✔ 已删除：${yamlPath}`))
      }
      else {
        console.log(ansis.gray('ℹ 未找到生成的 Chatbox 配置文件，无需清理'))
      }
      const memory = readLocalConfig()
      delete memory.chatbox
      if (memory.codeType === tool)
        delete memory.codeType
      writeLocalConfig(memory)
      console.log(ansis.gray('✔ 已清除本地记忆'))
      console.log(`\n${ansis.cyan('🎉 清理完成')}`)
      return
    }

    const removeCli = options.skipPrompt
      ? false
      : await confirm(`是否同时卸载 ${tool === 'claude-code' ? 'Claude Code' : 'Codex'} CLI？`, false)

    console.log(ansis.blue(`\nℹ 正在清理 ${tool === 'claude-code' ? 'Claude Code' : 'Codex'} 的中转站配置...`))

    if (tool === 'claude-code') {
      clearClaudeApiConfig()
    }
    else {
      clearCodexApiConfig()
    }
    console.log(ansis.green('✔ 中转站配置已清除'))

    // 清除该工具对应的本地记忆（保留另一工具的记忆）
    const memory = readLocalConfig()
    if (tool === 'claude-code')
      delete memory.claude
    else
      delete memory.codex
    if (memory.codeType === tool)
      delete memory.codeType
    writeLocalConfig(memory)
    console.log(ansis.gray('✔ 已清除本地记忆'))

    if (removeCli && isCliTool(tool)) {
      const ok = await uninstallTool(tool)
      if (!ok)
        console.log(ansis.yellow('ℹ CLI 卸载未完全成功，可手动卸载'))
    }

    console.log(`\n${ansis.cyan('🎉 清理完成')}`)
  }
  catch (error) {
    if (error instanceof Error)
      console.error(ansis.red(`\n✖ ${error.message}`))
    else
      console.error(ansis.red('\n✖ 清理过程中发生未知错误'))
    process.exit(1)
  }
}
