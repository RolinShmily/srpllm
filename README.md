<div align="center">

# SrP-LLM 配置工具

中转站客户端一键配置：安装 Claude Code / Codex · 填写 base_url 与 api_token · 从 litellm 拉取并选择模型与推理强度

[![npm version](https://img.shields.io/npm/v/srpllm.svg)](https://www.npmjs.com/package/srpllm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

## 简介

`srpllm` 是为 **SrP-LLM 中转站**（基于 litellm 后端）准备的客户端配置脚本。一条命令即可：

1. 安装 Claude Code / Codex CLI
2. 引导填写中转站的 `base_url` 与 `api_token`
3. 从中转站后端 `GET {base_url}/v1/models` 拉取可用模型列表；Codex 还可选择模型推理强度
4. 把配置写入对应客户端的配置文件（Claude Code 的 `settings.json` / Codex 的 `config.toml` + `auth.json`）

仅做「安装 + 配置接入中转站」这一件事，不做更多设置。

## 快速开始

无需全局安装，直接用 `npx` 运行：

```bash
npx srpllm
```

按提示选择工具、输入中转站地址和 token、选择模型即可完成。

## 命令

```bash
npx srpllm                      # 交互式引导配置（默认）
npx srpllm init                 # 安装 CLI 并配置中转站（同上）
npx srpllm uninstall            # 清除中转站配置（可选同时卸载 CLI）
```

### 非交互模式（CI / 脚本）

```bash
npx srpllm init -s \
  -T claude-code \
  -u https://api.srpllm.com \
  -k sk-xxxx \
  -m glm-5.2 \
  -O glm-5.2 \
  -S glm-5-turbo \
  -H glm-5-turbo
```

Codex 非交互配置示例：

```bash
npx srpllm init -s \
  -T codex \
  -u https://api.srpllm.com \
  -k sk-xxxx \
  -m cx-gpt-5.6-sol \
  -r max
```

### 参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--code-type` | `-T` | 工具类型：`claude-code` / `codex`（简写 `cc` / `cx`） |
| `--base-url` | `-u` | 中转站 base_url（例如 `https://api.srpllm.com`） |
| `--token` | `-k` | api_token |
| `--model` | `-m` | 默认模型；Claude Code 写入 `ANTHROPIC_MODEL`，Codex 写入 `model` |
| `--reasoning-effort` | `-r` | Codex 推理强度：`low` / `medium` / `high` / `xhigh` / `max` / `ultra` |
| `--opus-model` | `-O` | Opus 档模型，写入 `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| `--sonnet-model` | `-S` | Sonnet 档模型，写入 `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| `--haiku-model` | `-H` | Haiku 档模型，写入 `ANTHROPIC_DEFAULT_HAIKU_MODEL` |
| `--skip-prompt` | `-s` | 非交互模式，跳过所有交互提示 |
| `--help` | `-h` | 显示帮助 |
| `--version` | `-v` | 显示版本 |

> Opus / Sonnet / Haiku 三档模型参数仅对 Claude Code 生效；`--reasoning-effort` 仅对 Codex 生效，具体可用档位取决于模型和中转站。

## 配置写入位置

### Claude Code

写入 `~/.claude/settings.json` 的 `env` 段（合并式，保留其它字段）：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.srpllm.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxxx",
    "ANTHROPIC_MODEL": "glm-5.2",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5-turbo",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5-turbo",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

- 统一使用 `ANTHROPIC_AUTH_TOKEN`（Bearer token 鉴权），清除原 `ANTHROPIC_API_KEY`
- 额外附加 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 与 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 两个默认值

### Codex

写入 `~/.codex/config.toml`（合并式，保留用户其它 provider / mcp / projects 等配置，修改前自动备份）：

```toml
# --- SrP-LLM 中转站配置 ---
model = "cx-gpt-5.6-sol"
model_reasoning_effort = "max"
model_catalog_json = "/home/user/.codex/srpllm-models.json"
model_provider = "srpllm"

[model_providers.srpllm]
name = "SrP-LLM"
base_url = "https://api.srpllm.com"
wire_api = "responses"
temp_env_key = "SRPLLM_API_KEY"
requires_openai_auth = false
```

并把 `~/.codex/auth.json` 中的 `SRPLLM_API_KEY` 与 `OPENAI_API_KEY` 设为 token（合并保留其它 key）。选择推理强度后，还会生成 `~/.codex/srpllm-models.json`，为带 `cx-` 前缀的自定义模型补充 Codex 所需的推理能力元数据。

## 卸载

```bash
npx srpllm uninstall
```

- Claude Code：从 `settings.json` 清除中转站相关 env 字段，保留其它设置
- Codex：移除 `[model_providers.srpllm]` 段、相关顶层模型/推理配置与 `srpllm-models.json`，保留其它配置（修改前自动备份）
- 可选择同时卸载 Claude Code / Codex CLI

## 模型列表获取

模型列表从中转站后端 litellm 的标准接口拉取：

```
GET {base_url}/v1/models
Authorization: Bearer {api_token}
```

返回 `data: [{ id, owned_by, ... }]` 格式，工具会列出全部模型供选择。若拉取失败（网络不通 / token 无效），交互模式下可手动输入模型名，非交互模式下跳过模型配置。

## 平台支持

- macOS / Linux / Windows / WSL / Termux
- Claude Code 安装方式：npm / Homebrew / curl / PowerShell
- Codex 安装方式：npm / Homebrew

## License

[MIT](./LICENSE)
