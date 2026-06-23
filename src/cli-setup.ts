import type { CAC } from 'cac'
import ansis from 'ansis'
import { version } from '../package.json'
import { init } from './commands/init'
import { uninstall } from './commands/uninstall'

export function customizeHelp(sections: any[]): any[] {
  sections.unshift({
    title: '',
    body: ansis.cyan.bold(`SrP-LLM 配置工具 v${version}`),
  })
  sections.push({
    title: ansis.yellow('命令'),
    body: [
      `  ${ansis.cyan('srpllm')}              交互式引导配置（默认）`,
      `  ${ansis.cyan('srpllm init')}         安装 CLI 并配置中转站`,
      `  ${ansis.cyan('srpllm uninstall')}    清除中转站配置`,
      '',
      ansis.gray('  选项'),
      `  ${ansis.green('--code-type, -T')} <type>   指定工具 (claude-code/codex, cc/cx)`,
      `  ${ansis.green('--base-url, -u')} <url>      中转站 base_url`,
      `  ${ansis.green('--token, -k')} <token>       api_token`,
      `  ${ansis.green('--model, -m')} <model>       主模型 (ANTHROPIC_MODEL)`,
      `  ${ansis.green('--opus-model, -O')} <model>   Opus 档模型 (ANTHROPIC_DEFAULT_OPUS_MODEL)`,
      `  ${ansis.green('--sonnet-model, -S')} <model> Sonnet 档模型 (ANTHROPIC_DEFAULT_SONNET_MODEL)`,
      `  ${ansis.green('--haiku-model, -H')} <model>  Haiku 档模型 (ANTHROPIC_DEFAULT_HAIKU_MODEL)`,
      `  ${ansis.green('--skip-prompt, -s')}         非交互模式`,
      `  ${ansis.green('--help, -h')}                显示帮助`,
      `  ${ansis.green('--version, -v')}             显示版本`,
      '',
      ansis.gray('  示例'),
      `  ${ansis.cyan('npx srpllm')}`,
      `  ${ansis.cyan('npx srpllm init -T codex -u https://api.srpllm.com -k sk-xxx -m gpt-5.2')}`,
    ].join('\n'),
  })
  return sections
}

export function setupCommands(cli: CAC): void {
  cli
    .command('', '交互式引导配置中转站（默认）')
    .option('--code-type, -T <type>', '工具类型 (claude-code/codex, cc/cx)')
    .option('--base-url, -u <url>', '中转站 base_url')
    .option('--token, -k <token>', 'api_token')
    .option('--model, -m <model>', '主模型 (ANTHROPIC_MODEL)')
    .option('--opus-model, -O <model>', 'Opus 档模型 (ANTHROPIC_DEFAULT_OPUS_MODEL)')
    .option('--sonnet-model, -S <model>', 'Sonnet 档模型 (ANTHROPIC_DEFAULT_SONNET_MODEL)')
    .option('--haiku-model, -H <model>', 'Haiku 档模型 (ANTHROPIC_DEFAULT_HAIKU_MODEL)')
    .option('--skip-prompt, -s', '非交互模式')
    .action(async (options) => {
      await init(options)
    })

  cli
    .command('init', '安装 CLI 并配置中转站')
    .option('--code-type, -T <type>', '工具类型 (claude-code/codex, cc/cx)')
    .option('--base-url, -u <url>', '中转站 base_url')
    .option('--token, -k <token>', 'api_token')
    .option('--model, -m <model>', '主模型 (ANTHROPIC_MODEL)')
    .option('--opus-model, -O <model>', 'Opus 档模型 (ANTHROPIC_DEFAULT_OPUS_MODEL)')
    .option('--sonnet-model, -S <model>', 'Sonnet 档模型 (ANTHROPIC_DEFAULT_SONNET_MODEL)')
    .option('--haiku-model, -H <model>', 'Haiku 档模型 (ANTHROPIC_DEFAULT_HAIKU_MODEL)')
    .option('--skip-prompt, -s', '非交互模式')
    .action(async (options) => {
      await init(options)
    })

  cli
    .command('uninstall', '清除中转站配置')
    .option('--code-type, -T <type>', '工具类型 (claude-code/codex, cc/cx)')
    .option('--skip-prompt, -s', '非交互模式')
    .action(async (options) => {
      await uninstall(options)
    })

  cli.help(sections => customizeHelp(sections))
  cli.version(version)
}
