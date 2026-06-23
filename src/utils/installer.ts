import type { CodeToolType } from '../constants'
import ansis from 'ansis'
import inquirer from 'inquirer'
import ora from 'ora'
import { exec } from 'tinyexec'
import { commandExists, getPlatform, isTermux, isWindows, wrapCommandWithSudo } from './platform'

export type InstallMethod = 'npm' | 'homebrew' | 'curl' | 'powershell'

interface ToolPackage {
  command: string
  npmPackage: string
  displayName: string
}

const TOOL_PACKAGES: Record<CodeToolType, ToolPackage> = {
  'claude-code': { command: 'claude', npmPackage: '@anthropic-ai/claude-code', displayName: 'Claude Code' },
  'codex': { command: 'codex', npmPackage: '@openai/codex', displayName: 'Codex' },
}

export async function isToolInstalled(tool: CodeToolType): Promise<boolean> {
  return await commandExists(TOOL_PACKAGES[tool].command)
}

export async function detectInstalledVersion(tool: CodeToolType): Promise<string | null> {
  try {
    const result = await exec(TOOL_PACKAGES[tool].command, ['--version'])
    if (result.exitCode === 0 && result.stdout) {
      const match = result.stdout.match(/(\d+\.\d+\.\d+)/)
      return match ? match[1]! : result.stdout.trim()
    }
  }
  catch {
  }
  return null
}

function getAvailableMethods(tool: CodeToolType): InstallMethod[] {
  const plat = getPlatform()
  const methods: InstallMethod[] = ['npm']
  if (plat === 'macos' || plat === 'linux')
    methods.push('homebrew')
  if (tool === 'claude-code') {
    if (plat !== 'windows' || isTermux())
      methods.push('curl')
    if (isWindows())
      methods.push('powershell')
  }
  return methods
}

const METHOD_LABELS: Record<InstallMethod, string> = {
  npm: 'npm 全局安装',
  homebrew: 'Homebrew 安装',
  curl: 'curl 脚本安装',
  powershell: 'PowerShell 脚本安装',
}

export async function selectInstallMethod(tool: CodeToolType): Promise<InstallMethod> {
  const methods = getAvailableMethods(tool)
  const { method } = await inquirer.prompt<{ method: InstallMethod }>({
    type: 'list',
    name: 'method',
    message: `请选择 ${TOOL_PACKAGES[tool].displayName} 的安装方式：`,
    choices: methods.map((m, i) => ({
      name: i === 0 ? `${METHOD_LABELS[m]} ${ansis.green('[推荐]')}` : METHOD_LABELS[m],
      value: m,
    })),
  })
  return method
}

async function runInstall(tool: CodeToolType, method: InstallMethod): Promise<void> {
  const pkg = TOOL_PACKAGES[tool]
  switch (method) {
    case 'npm': {
      const { command, args, usedSudo } = wrapCommandWithSudo('npm', ['install', '-g', pkg.npmPackage, '--force'])
      if (usedSudo)
        console.log(ansis.yellow('ℹ 使用 sudo 执行全局安装'))
      const result = await exec(command, args)
      if (result.exitCode !== 0)
        throw new Error(`npm 安装失败：${result.stderr || result.stdout}`)
      break
    }
    case 'homebrew': {
      const brewArgs = tool === 'claude-code'
        ? ['install', '--cask', 'claude-code']
        : ['install', '--cask', 'codex']
      const brewResult = await exec('brew', brewArgs)
      if (brewResult.exitCode !== 0)
        throw new Error(`Homebrew 安装失败：${brewResult.stderr || brewResult.stdout}`)
      break
    }
    case 'curl': {
      const curlResult = await exec('bash', ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'])
      if (curlResult.exitCode !== 0)
        throw new Error(`curl 脚本安装失败：${curlResult.stderr || curlResult.stdout}`)
      break
    }
    case 'powershell': {
      const psResult = await exec('powershell', ['-Command', 'irm https://claude.ai/install.ps1 | iex'])
      if (psResult.exitCode !== 0)
        throw new Error(`PowerShell 安装失败：${psResult.stderr || psResult.stdout}`)
      break
    }
  }
}

export async function installTool(tool: CodeToolType, skipMethodSelection = false): Promise<void> {
  const pkg = TOOL_PACKAGES[tool]
  if (await isToolInstalled(tool)) {
    const ver = await detectInstalledVersion(tool)
    console.log(ansis.green(`✔ ${pkg.displayName} 已安装`))
    if (ver)
      console.log(ansis.gray(`  当前版本：${ver}`))
    return
  }

  const method = skipMethodSelection ? 'npm' : await selectInstallMethod(tool)
  const spinner = ora(`正在通过 ${METHOD_LABELS[method]} 安装 ${pkg.displayName}...`).start()
  try {
    await runInstall(tool, method)
    spinner.succeed(`✔ ${pkg.displayName} 安装完成`)
  }
  catch (error) {
    spinner.fail(`✖ ${pkg.displayName} 安装失败`)
    if (error instanceof Error)
      console.error(ansis.gray(error.message))
    throw error
  }
}

export async function uninstallTool(tool: CodeToolType): Promise<boolean> {
  const pkg = TOOL_PACKAGES[tool]
  if (!await isToolInstalled(tool))
    return true
  const spinner = ora(`正在卸载 ${pkg.displayName} CLI...`).start()
  try {
    if (tool === 'claude-code') {
      try {
        await exec('brew', ['uninstall', '--cask', 'claude-code'])
      }
      catch {
        const { command, args } = wrapCommandWithSudo('npm', ['uninstall', '-g', pkg.npmPackage])
        await exec(command, args)
      }
    }
    else {
      try {
        await exec('brew', ['uninstall', '--cask', 'codex'])
      }
      catch {
        const { command, args } = wrapCommandWithSudo('npm', ['uninstall', '-g', pkg.npmPackage])
        await exec(command, args)
      }
    }
    spinner.succeed(`✔ ${pkg.displayName} CLI 已卸载`)
    return true
  }
  catch (error) {
    spinner.fail(`✖ ${pkg.displayName} CLI 卸载失败`)
    if (error instanceof Error)
      console.error(ansis.gray(error.message))
    return false
  }
}
