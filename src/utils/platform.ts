import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import process from 'node:process'
import { exec } from 'tinyexec'

export type Platform = 'windows' | 'macos' | 'linux'

export function getPlatform(): Platform {
  const p = platform()
  if (p === 'win32')
    return 'windows'
  if (p === 'darwin')
    return 'macos'
  return 'linux'
}

export function isWindows(): boolean {
  return getPlatform() === 'windows'
}

export function isTermux(): boolean {
  return !!(process.env.PREFIX && process.env.PREFIX.includes('com.termux'))
    || !!process.env.TERMUX_VERSION
    || existsSync('/data/data/com.termux/files/usr')
}

export async function commandExists(command: string): Promise<boolean> {
  const cmd = isWindows() ? 'where' : 'which'
  try {
    const result = await exec(cmd, [command])
    return result.exitCode === 0
  }
  catch {
    return false
  }
}

export async function findCommandPath(command: string): Promise<string | null> {
  const cmd = isWindows() ? 'where' : 'which'
  try {
    const result = await exec(cmd, [command])
    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.trim().split('\n')[0]!.trim()
    }
  }
  catch {
  }
  return null
}

export interface WrappedCommand {
  command: string
  args: string[]
  usedSudo: boolean
}

export function wrapCommandWithSudo(command: string, args: string[]): WrappedCommand {
  if (isWindows() || isTermux())
    return { command, args, usedSudo: false }

  const isGlobalNpm = (command === 'npm' || command === 'pnpm') && args.includes('-g')
  if (isGlobalNpm && needsSudo()) {
    return { command: 'sudo', args: [command, ...args], usedSudo: true }
  }
  return { command, args, usedSudo: false }
}

function needsSudo(): boolean {
  try {
    return !existsSync('/.dockerenv') && process.getuid?.() !== 0 && !process.env.SUDO_USER
  }
  catch {
    return false
  }
}
