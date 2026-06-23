import type { CodeToolType } from '../constants'
import type { RemoteModel } from '../utils/models'
import process from 'node:process'
import ansis from 'ansis'
import inquirer from 'inquirer'
import { resolveCodeToolType } from '../constants'
import { clearClaudeApiConfig, displayClaudeConfig, getExistingClaudeApiConfig, writeClaudeApiConfig } from '../utils/claude-config'
import { clearCodexApiConfig, displayCodexConfig, getExistingCodexConfig, writeCodexApiConfig } from '../utils/codex-config'
import { installTool, isToolInstalled } from '../utils/installer'
import { buildModelsChoices, fetchModels } from '../utils/models'
import { confirm, displayBanner, inputApiToken, inputBaseUrl, maskToken, selectCodeTool } from '../utils/ui'

export interface InitOptions {
  codeType?: string
  skipPrompt?: boolean
  baseUrl?: string
  token?: string
  model?: string
  opusModel?: string
  sonnetModel?: string
  haikuModel?: string
}

async function fetchModelList(baseUrl: string, token: string): Promise<RemoteModel[] | null> {
  try {
    const models = await fetchModels(baseUrl, token)
    return models.length > 0 ? models : null
  }
  catch {
    return null
  }
}

async function promptModelFromList(
  models: RemoteModel[] | null,
  message: string,
  preset?: string,
  skipPrompt?: boolean,
): Promise<string | undefined> {
  if (preset && preset.trim())
    return preset.trim()

  if (!models) {
    // 非交互模式下拉不到列表且无 preset → 跳过模型配置
    if (skipPrompt)
      return undefined
    console.log(ansis.yellow('ℹ 无法拉取模型列表，可手动输入模型名（留空则跳过）'))
    const { manual } = await inquirer.prompt<{ manual: string }>({
      type: 'input',
      name: 'manual',
      message,
    })
    return manual.trim() || undefined
  }

  const { choice } = await inquirer.prompt<{ choice: string }>({
    type: 'list',
    name: 'choice',
    message,
    choices: [
      ...buildModelsChoices(models),
      { name: '暂不设置（跳过）', value: '__none__' },
    ],
  })
  return choice === '__none__' ? undefined : choice
}

async function configureClaudeCode(options: InitOptions, baseUrl: string, token: string): Promise<void> {
  const existing = getExistingClaudeApiConfig()
  if (existing && !options.skipPrompt) {
    console.log(ansis.blue('\nℹ 检测到已有 Claude Code 配置：'))
    console.log(ansis.gray(`  base_url：${existing.baseUrl || 'N/A'}`))
    console.log(ansis.gray(`  token：${maskToken(existing.token)}`))
    if (existing.model)
      console.log(ansis.gray(`  主模型：${existing.model}`))
    if (existing.opusModel)
      console.log(ansis.gray(`  Opus：${existing.opusModel}`))
    if (existing.sonnetModel)
      console.log(ansis.gray(`  Sonnet：${existing.sonnetModel}`))
    if (existing.haikuModel)
      console.log(ansis.gray(`  Haiku：${existing.haikuModel}`))
    const overwrite = await confirm('\n已存在配置，是否覆盖为中转站配置？', true)
    if (!overwrite) {
      console.log(ansis.yellow('ℹ 已跳过 Claude Code 配置'))
      return
    }
  }

  // 一次性拉取模型列表，供四档模型选择复用
  const models = await fetchModelList(baseUrl, token)

  const model = await promptModelFromList(models, '请选择主模型 (ANTHROPIC_MODEL)：', options.model, options.skipPrompt)
  const opusModel = await promptModelFromList(models, '请选择 Opus 档模型 (ANTHROPIC_DEFAULT_OPUS_MODEL)：', options.opusModel, options.skipPrompt)
  const sonnetModel = await promptModelFromList(models, '请选择 Sonnet 档模型 (ANTHROPIC_DEFAULT_SONNET_MODEL)：', options.sonnetModel, options.skipPrompt)
  const haikuModel = await promptModelFromList(models, '请选择 Haiku 档模型 (ANTHROPIC_DEFAULT_HAIKU_MODEL)：', options.haikuModel, options.skipPrompt)

  const config = { baseUrl, token, model, opusModel, sonnetModel, haikuModel }
  writeClaudeApiConfig(config)
  console.log(ansis.green('\n✔ Claude Code 配置完成'))
  displayClaudeConfig(config)
}

async function configureCodex(options: InitOptions, baseUrl: string, token: string): Promise<void> {
  const existing = getExistingCodexConfig()
  if (existing && !options.skipPrompt) {
    console.log(ansis.blue('\nℹ 检测到已有 Codex 配置：'))
    console.log(ansis.gray(`  base_url：${existing.baseUrl || 'N/A'}`))
    console.log(ansis.gray(`  token：${maskToken(existing.token)}`))
    if (existing.model)
      console.log(ansis.gray(`  模型：${existing.model}`))
    const overwrite = await confirm('\n已存在配置，是否覆盖为中转站配置？（原配置将自动备份）', true)
    if (!overwrite) {
      console.log(ansis.yellow('ℹ 已跳过 Codex 配置'))
      return
    }
  }

  const models = await fetchModelList(baseUrl, token)
  const model = await promptModelFromList(models, '请选择默认使用的模型：', options.model, options.skipPrompt)
  const config = { baseUrl, token, model }
  writeCodexApiConfig(config)
  console.log(ansis.green('\n✔ Codex 配置完成'))
  displayCodexConfig(config)
}

export async function init(options: InitOptions = {}): Promise<void> {
  try {
    const tool: CodeToolType = options.codeType
      ? resolveCodeToolType(options.codeType)
      : (options.skipPrompt ? 'claude-code' : await selectCodeTool())

    displayBanner(tool)

    // 第一步：安装 CLI 工具
    if (options.skipPrompt) {
      await installTool(tool, true)
    }
    else {
      const installed = await isToolInstalled(tool)
      if (!installed) {
        const shouldInstall = await confirm(`未检测到 ${tool === 'claude-code' ? 'Claude Code' : 'Codex'}，是否立即安装？`, true)
        if (shouldInstall) {
          await installTool(tool, false)
        }
        else {
          console.log(ansis.yellow('ℹ 已跳过 CLI 安装，仅写入配置文件'))
        }
      }
      else {
        console.log(ansis.green(`✔ ${tool === 'claude-code' ? 'Claude Code' : 'Codex'} 已安装`))
      }
    }

    // 第二步：引导填写 base_url 与 api_token
    const baseUrl = options.baseUrl || (options.skipPrompt ? '' : await inputBaseUrl())
    if (!baseUrl) {
      console.error(ansis.red('✖ 缺少 base_url，无法继续配置'))
      process.exit(1)
    }

    const token = options.token || (options.skipPrompt ? '' : await inputApiToken())
    if (!token) {
      console.error(ansis.red('✖ 缺少 api_token，无法继续配置'))
      process.exit(1)
    }

    // 第三步：拉取模型列表并选择
    // 第四步：写入对应客户端配置文件
    if (tool === 'claude-code') {
      await configureClaudeCode(options, baseUrl, token)
    }
    else {
      await configureCodex(options, baseUrl, token)
    }

    console.log(`\n${ansis.cyan('🎉 配置完成！现在可以直接使用对应 CLI 工具连接 SrP-LLM 中转站。')}`)
  }
  catch (error) {
    if (error instanceof Error) {
      console.error(ansis.red(`\n✖ ${error.message}`))
    }
    else {
      console.error(ansis.red('\n✖ 配置过程中发生未知错误'))
    }
    process.exit(1)
  }
}

export { clearClaudeApiConfig, clearCodexApiConfig }
