import ansis from 'ansis'
import ora from 'ora'

export interface RemoteModel {
  id: string
  ownedBy?: string
}

/**
 * 从中转站后端 litellm 拉取可用模型列表
 * 标准接口：GET {baseUrl}/v1/models  Authorization: Bearer {token}
 * 返回 { data: [{ id, owned_by, ... }] }
 */
export async function fetchModels(baseUrl: string, token: string): Promise<RemoteModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/models`
  const spinner = ora(`正在从 ${url} 拉取模型列表...`).start()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      spinner.fail(`✖ 拉取模型列表失败：HTTP ${response.status} ${response.statusText}`)
      throw new Error(`拉取模型列表失败：HTTP ${response.status}`)
    }

    const json: any = await response.json()
    const data: any[] = Array.isArray(json) ? json : (json.data || json.models || [])
    const models: RemoteModel[] = data
      .map((m: any) => ({
        id: String(m.id || m.name || m.model).trim(),
        ownedBy: m.owned_by || m.ownedBy,
      }))
      .filter((m: RemoteModel) => m.id)

    if (models.length === 0) {
      spinner.fail('✖ 中转站返回的模型列表为空')
      throw new Error('模型列表为空')
    }

    spinner.succeed(`✔ 已获取 ${models.length} 个可用模型`)
    return models
  }
  catch (error) {
    spinner.fail(`✖ 拉取模型列表失败：${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export function buildModelsChoices(models: RemoteModel[]): Array<{ name: string, value: string }> {
  return models.map(m => ({
    name: m.ownedBy ? `${m.id} ${ansis.gray(`(${m.ownedBy})`)}` : m.id,
    value: m.id,
  }))
}
