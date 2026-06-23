import type { RelayToolType } from '../constants'
import type { LocalConfig } from '../utils/local-config'
import type { RemoteModel } from '../utils/models'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import process from 'node:process'
import ansis from 'ansis'
import inquirer from 'inquirer'
import { join } from 'pathe'
import { isCliTool, MODEL_PREFIX, resolveCodeToolType } from '../constants'
import { clearClaudeApiConfig, displayClaudeConfig, getExistingClaudeApiConfig, writeClaudeApiConfig } from '../utils/claude-config'
import { clearCodexApiConfig, displayCodexConfig, getExistingCodexConfig, writeCodexApiConfig } from '../utils/codex-config'
import { ensureDir, writeFile } from '../utils/fs'
import { installTool, isToolInstalled } from '../utils/installer'
import { readLocalConfig, updateLocalConfig } from '../utils/local-config'
import { buildModelsChoices, fetchModels, filterByPrefix } from '../utils/models'
import { confirm, displayBanner, inputApiToken, inputBaseUrl, maskToken, selectTool } from '../utils/ui'

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

/**
 * 拉取全量模型并按客户端前缀过滤，打印过滤后数量。
 * 拉取失败或过滤后为空时返回 null（调用方降级为手动输入）。
 */
async function fetchFilteredModels(baseUrl: string, token: string, prefix: string): Promise<RemoteModel[] | null> {
  const allModels = await fetchModelList(baseUrl, token)
  if (!allModels)
    return null
  const filtered = filterByPrefix(allModels, prefix)
  if (filtered.length === 0) {
    console.log(ansis.yellow(`ℹ 已获取 ${allModels.length} 个模型，但无 ${prefix}* 前缀的模型，可手动输入`))
    return null
  }
  console.log(ansis.gray(`ℹ 已获取 ${allModels.length} 个模型，过滤后剩余 ${filtered.length} 个 ${prefix}* 模型`))
  return filtered
}

async function promptModelFromList(
  models: RemoteModel[] | null,
  message: string,
  preset?: string,
  skipPrompt?: boolean,
  defaultModel?: string,
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
      default: defaultModel,
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
    default: defaultModel,
  })
  return choice === '__none__' ? undefined : choice
}

async function configureClaudeCode(options: InitOptions, baseUrl: string, token: string, memory: LocalConfig): Promise<void> {
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

  // 一次性拉取全部模型列表，按客户端前缀过滤后供选择复用
  const models = await fetchFilteredModels(baseUrl, token, MODEL_PREFIX['claude-code'])
  const m = memory.claude

  const model = await promptModelFromList(models, '请选择主模型 (ANTHROPIC_MODEL)：', options.model, options.skipPrompt, m?.model)
  const opusModel = await promptModelFromList(models, '请选择 Opus 档模型 (ANTHROPIC_DEFAULT_OPUS_MODEL)：', options.opusModel, options.skipPrompt, m?.opusModel)
  const sonnetModel = await promptModelFromList(models, '请选择 Sonnet 档模型 (ANTHROPIC_DEFAULT_SONNET_MODEL)：', options.sonnetModel, options.skipPrompt, m?.sonnetModel)
  const haikuModel = await promptModelFromList(models, '请选择 Haiku 档模型 (ANTHROPIC_DEFAULT_HAIKU_MODEL)：', options.haikuModel, options.skipPrompt, m?.haikuModel)

  const config = { baseUrl, token, model, opusModel, sonnetModel, haikuModel }
  writeClaudeApiConfig(config)
  console.log(ansis.green('\n✔ Claude Code 配置完成'))
  displayClaudeConfig(config)

  // 记住本次选择
  updateLocalConfig({ claude: { model, opusModel, sonnetModel, haikuModel } })
}

async function configureCodex(options: InitOptions, baseUrl: string, token: string, memory: LocalConfig): Promise<void> {
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

  const models = await fetchFilteredModels(baseUrl, token, MODEL_PREFIX.codex)
  const model = await promptModelFromList(models, '请选择默认使用的模型：', options.model, options.skipPrompt, memory.codex?.model)
  const config = { baseUrl, token, model }
  writeCodexApiConfig(config)
  console.log(ansis.green('\n✔ Codex 配置完成'))
  displayCodexConfig(config)

  updateLocalConfig({ codex: { model } })
}

/** 获取用户下载目录，回退到 home 目录 */
function getDownloadsDir(): string {
  const home = homedir()
  const candidates = [
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Downloads') : '',
    join(home, 'Downloads'),
  ]
  for (const c of candidates) {
    if (c && existsSync(c))
      return c
  }
  // Downloads 不存在时回退到 home，并创建 Downloads
  const fallback = join(home, 'Downloads')
  ensureDir(fallback)
  return fallback
}

async function configureChatbox(options: InitOptions, baseUrl: string, token: string, memory: LocalConfig): Promise<void> {
  const models = await fetchFilteredModels(baseUrl, token, MODEL_PREFIX.chatbox)
  const model = await promptModelFromList(models, '请选择默认模型（chat- 前缀）：', options.model, options.skipPrompt, memory.chatbox?.model)

  // 生成 config.yaml 到下载目录
  const downloads = getDownloadsDir()
  const filePath = join(downloads, 'srpllm-chatbox-config.yaml')
  const yaml = [
    '# SrP-LLM 中转站 Chatbox 配置',
    '# 在 Chatbox 客户端「设置 → 模型服务 → OpenAI API」中填入以下信息',
    `base_url: ${baseUrl}`,
    `api_key: ${token}`,
    model ? `model: ${model}` : '# model: （未选择，请在 Chatbox 中手动指定）',
    '',
  ].join('\n')
  writeFile(filePath, yaml)

  console.log(ansis.green('\n✔ Chatbox 配置已生成'))
  console.log(ansis.gray(`  配置文件：${filePath}`))
  console.log(ansis.gray(`  base_url：${baseUrl}`))
  console.log(ansis.gray(`  api_key：${maskToken(token)}`))
  if (model)
    console.log(ansis.gray(`  model：${model}`))
  console.log(ansis.yellow('\n  ℹ 请打开 Chatbox，在「设置 → 模型服务 → OpenAI API 兼容」中填入以上 base_url / api_key / model'))

  updateLocalConfig({ chatbox: { model } })
}

export async function init(options: InitOptions = {}): Promise<void> {
  try {
    // 读取本地记忆（上次的配置）
    const memory = readLocalConfig()

    const tool: RelayToolType = options.codeType
      ? resolveCodeToolType(options.codeType)
      : (options.skipPrompt ? 'claude-code' : await selectTool(memory.codeType))

    displayBanner(tool)

    // 第一步：安装 CLI 工具（chatbox 是桌面 GUI，不安装 CLI）
    if (isCliTool(tool)) {
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
    }
    else {
      console.log(ansis.gray('ℹ Chatbox 为桌面客户端，需自行安装；本工具仅生成配置文件'))
    }

    // 第二步：引导填写 base_url 与 api_token（默认回填上次值）
    const baseUrl = options.baseUrl || (options.skipPrompt ? (memory.baseUrl || '') : await inputBaseUrl(memory.baseUrl))
    if (!baseUrl) {
      console.error(ansis.red('✖ 缺少 base_url，无法继续配置'))
      process.exit(1)
    }

    const token = options.token
      || (options.skipPrompt ? (memory.token || '') : await inputApiToken(memory.token))
    if (!token) {
      console.error(ansis.red('✖ 缺少 api_token，无法继续配置'))
      process.exit(1)
    }

    // 第三步：拉取模型列表并选择
    // 第四步：写入对应客户端配置文件
    if (tool === 'claude-code') {
      await configureClaudeCode(options, baseUrl, token, memory)
    }
    else if (tool === 'codex') {
      await configureCodex(options, baseUrl, token, memory)
    }
    else {
      await configureChatbox(options, baseUrl, token, memory)
    }

    // 记住本次工具选择与 base_url / token（便于下次回填）
    updateLocalConfig({ codeType: tool, baseUrl, token })

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
