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

export async function selectCodeTool(): Promise<CodeToolType> {
  const { tool } = await inquirer.prompt<{ tool: CodeToolType }>({
    type: 'list',
    name: 'tool',
    message: '请选择要配置的客户端工具：',
    choices: [
      { name: 'Claude Code', value: 'claude-code' },
      { name: 'Codex', value: 'codex' },
    ],
  })
  return tool
}

export async function inputBaseUrl(): Promise<string> {
  const { url } = await inquirer.prompt<{ url: string }>({
    type: 'input',
    name: 'url',
    message: '请输入中转站 base_url（例如 https://api.srpllm.com）：',
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

export async function inputApiToken(): Promise<string> {
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
