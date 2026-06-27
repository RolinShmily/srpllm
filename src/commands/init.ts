import type { RelayToolType } from '../constants'
import type { LocalConfig } from '../utils/local-config'
import type { RemoteModel } from '../utils/models'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import process from 'node:process'
import ansis from 'ansis'
import inquirer from 'inquirer'
import { join } from 'pathe'
import { isCliTool, MODEL_PREFIX, resolveCodeToolType } from '../constants'
import { clearClaudeApiConfig, displayClaudeConfig, getExistingClaudeApiConfig, writeClaudeApiConfig } from '../utils/claude-config'
import { clearCodexApiConfig, displayCodexConfig, enableCodexFullAccess, getExistingCodexConfig, writeCodexApiConfig } from '../utils/codex-config'
import { ensureDir, writeFile } from '../utils/fs'
import { installTool, isToolInstalled } from '../utils/installer'
import { readLocalConfig, updateLocalConfig } from '../utils/local-config'
import { readModelCache, writeModelCache } from '../utils/model-cache'
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

/** 将毫秒差转为人类可读的相对时间（如「3 天前」的「3 天」） */
function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60)
    return `${sec} 秒`
  const min = Math.floor(sec / 60)
  if (min < 60)
    return `${min} 分钟`
  const hr = Math.floor(min / 60)
  if (hr < 24)
    return `${hr} 小时`
  const day = Math.floor(hr / 24)
  if (day < 30)
    return `${day} 天`
  const month = Math.floor(day / 30)
  if (month < 12)
    return `${month} 个月`
  return `${Math.floor(month / 12)} 年`
}

/**
 * 拉取失败后回退到本地缓存。
 * 交互模式下询问用户是否使用缓存；非交互模式（skipPrompt）下若有缓存则静默使用。
 * 缓存中存的是全量列表，这里再按前缀过滤后返回。
 */
async function tryCachedModels(
  baseUrl: string,
  prefix: string,
  skipPrompt?: boolean,
): Promise<RemoteModel[] | null> {
  const cache = readModelCache(baseUrl)
  if (!cache || cache.models.length === 0)
    return null

  const ageStr = formatAge(Date.now() - new Date(cache.fetchedAt).getTime())
  const filtered = filterByPrefix(cache.models, prefix)

  if (skipPrompt) {
    if (filtered.length > 0) {
      console.log(ansis.gray(`ℹ 拉取失败，已回退到本地缓存模型列表（${ageStr}前拉取，共 ${cache.models.length} 个，过滤后 ${filtered.length} 个 ${prefix}*）`))
      return filtered
    }
    return null
  }

  const hint = filtered.length > 0
    ? `共 ${cache.models.length} 个模型，其中 ${filtered.length} 个 ${prefix}*`
    : `共 ${cache.models.length} 个模型，但无 ${prefix}* 前缀`
  console.log(ansis.yellow(`\nℹ 拉取模型列表失败，检测到本地缓存（${ageStr}前，${hint}）`))
  const useCache = await confirm('是否使用本地缓存的模型列表？', true)
  if (!useCache)
    return null
  return filtered.length > 0 ? filtered : null
}

/**
 * 拉取全量模型并按客户端前缀过滤，打印过滤后数量。
 * 拉取成功时写入本地缓存；失败时回退到本地缓存（交互模式下询问用户）。
 * 最终仍为空时返回 null（调用方降级为手动输入）。
 */
async function fetchFilteredModels(baseUrl: string, token: string, prefix: string, skipPrompt?: boolean): Promise<RemoteModel[] | null> {
  const allModels = await fetchModelList(baseUrl, token)

  // 拉取失败：尝试本地缓存兜底
  if (!allModels)
    return tryCachedModels(baseUrl, prefix, skipPrompt)

  // 拉取成功：写入本地缓存，供下次失败时复用
  writeModelCache(baseUrl, allModels)

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
  const models = await fetchFilteredModels(baseUrl, token, MODEL_PREFIX['claude-code'], options.skipPrompt)
  const m = memory.claude

  const model = await promptModelFromList(models, '请选择主模型 (ANTHROPIC_MODEL)：', options.model, options.skipPrompt, m?.model)
  const opusModel = await promptModelFromList(models, '请选择 Opus 档模型 (ANTHROPIC_DEFAULT_OPUS_MODEL)：', options.opusModel, options.skipPrompt, m?.opusModel)
  const sonnetModel = await promptModelFromList(models, '请选择 Sonnet 档模型 (ANTHROPIC_DEFAULT_SONNET_MODEL)：', options.sonnetModel, options.skipPrompt, m?.sonnetModel)
  const haikuModel = await promptModelFromList(models, '请选择 Haiku 档模型 (ANTHROPIC_DEFAULT_HAIKU_MODEL)：', options.haikuModel, options.skipPrompt, m?.haikuModel)

  const config = { baseUrl, token, model, opusModel, sonnetModel, haikuModel }
  writeClaudeApiConfig(config)
  console.log(ansis.green('\n✔ Claude Code 配置完成'))
  displayClaudeConfig(config)

  console.log(ansis.yellow('\n  ℹ 提示：启动时附加 --dangerously-skip-permissions 可跳过权限确认、授予完全权限'))

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

  const models = await fetchFilteredModels(baseUrl, token, MODEL_PREFIX.codex, options.skipPrompt)
  const model = await promptModelFromList(models, '请选择默认使用的模型：', options.model, options.skipPrompt, memory.codex?.model)
  const config = { baseUrl, token, model }
  writeCodexApiConfig(config)
  console.log(ansis.green('\n✔ Codex 配置完成'))
  displayCodexConfig(config)

  if (process.platform === 'win32') {
    try {
      const output = execSync('pwsh -NoProfile -Command "(Get-Command pwsh).Source"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      if (output.includes('WindowsApps')) {
        console.log(ansis.yellow('\n⚠ 检测到你使用的是微软商店版的 PowerShell (pwsh)'))
        console.log(ansis.gray('  这会导致 Codex 的 Windows 沙盒功能出现 CreateProcessAsUserW failed: 5 权限错误。'))
        const shouldApply = options.skipPrompt ? true : await confirm('是否自动在 Codex 配置中授予完全访问权限并关闭审批以避免报错？', true)
        if (shouldApply) {
          enableCodexFullAccess()
          console.log(ansis.green('✔ 已授予完全访问权限（sandbox_mode = danger-full-access）并关闭审批（approval_policy = never）'))
          console.log(ansis.gray('  ℹ 等价于 --dangerously-bypass-approvals-and-sandbox，Codex 启动后将进入 YOLO 模式'))
        }
        else {
          console.log(ansis.yellow('ℹ 已跳过，若后续运行报错，请查阅文档或手动配置 sandbox_mode / approval_policy'))
        }
      }
    }
    catch {
      // 忽略找不到 pwsh 或执行失败的情况
    }
  }

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
  const models = await fetchFilteredModels(baseUrl, token, MODEL_PREFIX.chatbox, options.skipPrompt)
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
