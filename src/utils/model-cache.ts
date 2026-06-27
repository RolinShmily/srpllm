import type { RemoteModel } from './models'
import { join } from 'pathe'
import { readJson, writeJson } from './fs'
import { SRPLLM_DIR } from './local-config'

const MODEL_CACHE_FILE = join(SRPLLM_DIR, 'models-cache.json')

export interface ModelCacheEntry {
  /** 缓存的全量模型列表（未按前缀过滤） */
  models: RemoteModel[]
  /** 成功拉取时间，ISO 字符串 */
  fetchedAt: string
}

/** 以 baseUrl 为键的缓存表，不同中转站各自独立 */
type ModelCacheStore = Record<string, ModelCacheEntry>

/** 统一缓存键：去掉末尾斜杠、转小写，避免同一站点因大小写/尾斜杠产生多份缓存 */
function cacheKey(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').trim().toLowerCase()
}

export function readModelCache(baseUrl: string): ModelCacheEntry | null {
  const store = readJson<ModelCacheStore>(MODEL_CACHE_FILE)
  if (!store)
    return null
  const entry = store[cacheKey(baseUrl)]
  return entry && Array.isArray(entry.models) ? entry : null
}

/** 缓存成功拉取到的全量模型列表，并记录时间戳 */
export function writeModelCache(baseUrl: string, models: RemoteModel[]): void {
  const store = readJson<ModelCacheStore>(MODEL_CACHE_FILE) || {}
  store[cacheKey(baseUrl)] = {
    models,
    fetchedAt: new Date().toISOString(),
  }
  writeJson(MODEL_CACHE_FILE, store)
}

/**
 * 清除模型缓存。
 * - 传入 baseUrl：仅清除该站点
 * - 不传：清除全部缓存
 */
export function clearModelCache(baseUrl?: string): void {
  if (!baseUrl) {
    writeJson(MODEL_CACHE_FILE, {})
    return
  }
  const store = readJson<ModelCacheStore>(MODEL_CACHE_FILE) || {}
  delete store[cacheKey(baseUrl)]
  writeJson(MODEL_CACHE_FILE, store)
}
