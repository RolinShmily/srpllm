import type { RemoteModel } from './models'
import { exec } from 'tinyexec'

export const CODEX_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number]

interface CodexReasoningLevel {
  effort: string
  description: string
}

export interface CodexModelPreset {
  slug: string
  display_name: string
  description: string
  default_reasoning_level: string
  supported_reasoning_levels: CodexReasoningLevel[]
  priority: number
  [key: string]: unknown
}

export interface CodexModelCatalog {
  models: CodexModelPreset[]
}

const EFFORT_DESCRIPTIONS: Record<CodexReasoningEffort, string> = {
  low: 'Fast responses with lighter reasoning',
  medium: 'Balances speed and reasoning depth',
  high: 'Greater reasoning depth for complex tasks',
  xhigh: 'Extra high reasoning depth for complex tasks',
  max: 'Maximum reasoning depth for the hardest tasks',
  ultra: 'Maximum reasoning with automatic task delegation',
}

export function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === 'string' && (CODEX_REASONING_EFFORTS as readonly string[]).includes(value)
}

function isCodexModelPreset(value: unknown): value is CodexModelPreset {
  if (!value || typeof value !== 'object')
    return false
  const preset = value as Partial<CodexModelPreset>
  return typeof preset.slug === 'string'
    && typeof preset.display_name === 'string'
    && typeof preset.description === 'string'
    && typeof preset.default_reasoning_level === 'string'
    && Array.isArray(preset.supported_reasoning_levels)
    && typeof preset.priority === 'number'
}

/** 读取当前已安装 Codex 自带的模型目录，用于复用与该版本匹配的模型能力元数据。 */
export async function loadBundledCodexModelCatalog(): Promise<CodexModelCatalog | null> {
  try {
    const result = await exec('codex', ['debug', 'models', '--bundled'])
    if (result.exitCode !== 0 || !result.stdout)
      return null

    const parsed = JSON.parse(result.stdout) as { models?: unknown[] }
    const models = Array.isArray(parsed.models) ? parsed.models.filter(isCodexModelPreset) : []
    return models.length > 0 ? { models } : null
  }
  catch {
    return null
  }
}

function baseModelId(modelId: string): string {
  return modelId.toLowerCase().startsWith('cx-') ? modelId.slice(3) : modelId
}

function findModelTemplate(catalog: CodexModelCatalog, modelId: string): CodexModelPreset | undefined {
  const candidates = new Set([modelId.toLowerCase(), baseModelId(modelId).toLowerCase()])
  return catalog.models.find(model => candidates.has(model.slug.toLowerCase()))
}

export function getCodexReasoningEfforts(catalog: CodexModelCatalog | null, modelId: string): CodexReasoningEffort[] {
  if (!catalog)
    return [...CODEX_REASONING_EFFORTS]

  const template = findModelTemplate(catalog, modelId)
  if (!template)
    return [...CODEX_REASONING_EFFORTS]

  const efforts = template.supported_reasoning_levels
    .map(level => level.effort)
    .filter(isCodexReasoningEffort)
  return efforts.length > 0 ? efforts : [...CODEX_REASONING_EFFORTS]
}

function templateForEffort(catalog: CodexModelCatalog, effort: CodexReasoningEffort): CodexModelPreset | undefined {
  return catalog.models.find(model => model.supported_reasoning_levels.some(level => level.effort === effort))
    || catalog.models[0]
}

function buildCatalogPreset(
  template: CodexModelPreset,
  modelId: string,
  priority: number,
  selectedEffort?: CodexReasoningEffort,
): CodexModelPreset {
  const preset = structuredClone(template)
  preset.slug = modelId
  preset.display_name = modelId
  preset.description = `SrP-LLM relay model based on ${template.display_name}`
  preset.priority = priority

  if (selectedEffort && !preset.supported_reasoning_levels.some(level => level.effort === selectedEffort)) {
    preset.supported_reasoning_levels.push({
      effort: selectedEffort,
      description: EFFORT_DESCRIPTIONS[selectedEffort],
    })
  }
  return preset
}

/**
 * Codex only sends reasoning.effort for models declared as reasoning-capable.
 * Relay model ids use a cx- prefix, so clone the matching built-in preset under the relay id.
 */
export function buildSrpllmCodexModelCatalog(
  remoteModels: RemoteModel[] | null,
  selectedModel: string,
  selectedEffort: CodexReasoningEffort,
  bundledCatalog: CodexModelCatalog | null,
): CodexModelCatalog | null {
  if (!bundledCatalog)
    return null

  const modelIds = Array.from(new Set([
    ...(remoteModels || []).map(model => model.id),
    selectedModel,
  ]))
  const fallbackTemplate = templateForEffort(bundledCatalog, selectedEffort)
  const models: CodexModelPreset[] = []

  for (const modelId of modelIds) {
    const template = findModelTemplate(bundledCatalog, modelId)
      || (modelId === selectedModel ? fallbackTemplate : undefined)
    if (!template)
      continue
    models.push(buildCatalogPreset(
      template,
      modelId,
      models.length + 1,
      modelId === selectedModel ? selectedEffort : undefined,
    ))
  }

  return models.length > 0 ? { models } : null
}
