import type { CodeToolType } from '../constants'
import process from 'node:process'
import ansis from 'ansis'
import { resolveCodeToolType } from '../constants'
import { clearClaudeApiConfig } from '../utils/claude-config'
import { clearCodexApiConfig } from '../utils/codex-config'
import { uninstallTool } from '../utils/installer'
import { confirm, displayBanner, selectCodeTool } from '../utils/ui'

export interface UninstallOptions {
  codeType?: string
  skipPrompt?: boolean
}

export async function uninstall(options: UninstallOptions = {}): Promise<void> {
  try {
    const tool: CodeToolType = options.codeType
      ? resolveCodeToolType(options.codeType)
      : (options.skipPrompt ? 'claude-code' : await selectCodeTool())

    displayBanner(tool)

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

    if (removeCli) {
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
