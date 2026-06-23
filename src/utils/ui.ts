import type { CodeToolType } from '../constants'
import ansis from 'ansis'
import inquirer from 'inquirer'
import { version } from '../../package.json'
import { CODE_TOOL_LABELS } from '../constants'

export function displayBanner(codeTool?: CodeToolType): void {
  const tool = codeTool ? ` ${ansis.gray(`· ${CODE_TOOL_LABELS[codeTool]}`)}` : ''
  console.log(ansis.cyan.bold(`\n  SrP-LLM 配置工具 v${version}${tool}`))
  console.log(ansis.gray('  中转站客户端一键配置：安装 CLI · 填写 base_url / api_token · 选择模型\n'))
}

export async function selectCodeTool(defaultTool?: 'claude-code' | 'codex'): Promise<CodeToolType> {
  const choices = [
    { name: 'Claude Code', value: 'claude-code' as CodeToolType },
    { name: 'Codex', value: 'codex' as CodeToolType },
  ]
  const { tool } = await inquirer.prompt<{ tool: CodeToolType }>({
    type: 'list',
    name: 'tool',
    message: '请选择要配置的客户端工具：',
    choices,
    default: defaultTool,
  })
  return tool
}

export async function inputBaseUrl(defaultUrl?: string): Promise<string> {
  const { url } = await inquirer.prompt<{ url: string }>({
    type: 'input',
    name: 'url',
    message: '请输入中转站 base_url（例如 https://api.srpllm.com）：',
    default: defaultUrl,
    validate: (value: string) => {
      const v = value.trim()
      if (!v)
        return 'base_url 不能为空'
      if (!/^https?:\/\//i.test(v))
        return '请输入以 http:// 或 https:// 开头的完整地址'
      if (/\/$/.test(v))
        return '地址末尾请不要带 /'
      return true
    },
  })
  return url.trim()
}

/**
 * 输入 api_token。若传入上次的 token，先问是否复用：
 * - 是 → 直接返回旧 token（password 类型无法预填明文，故用 confirm）
 * - 否 → 输入新 token
 */
export async function inputApiToken(existingToken?: string): Promise<string> {
  if (existingToken) {
    console.log(ansis.gray(`  上次 token：${maskToken(existingToken)}`))
    const reuse = await confirm('是否复用上次的 api_token？', true)
    if (reuse)
      return existingToken
  }
  const { token } = await inquirer.prompt<{ token: string }>({
    type: 'password',
    name: 'token',
    message: '请输入 api_token：',
    mask: '*',
    validate: (value: string) => !!value.trim() || 'api_token 不能为空',
  })
  return token.trim()
}

export async function confirm(message: string, defaultValue = true): Promise<boolean> {
  const { ok } = await inquirer.prompt<{ ok: boolean }>({
    type: 'confirm',
    name: 'ok',
    message,
    default: defaultValue,
  })
  return ok
}

export function maskToken(token: string): string {
  if (!token)
    return 'N/A'
  if (token.length <= 8)
    return '***'
  return `${token.slice(0, 4)}***${token.slice(-4)}`
}
