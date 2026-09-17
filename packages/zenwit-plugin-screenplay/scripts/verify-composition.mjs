/**
 * 发布前校验：用运行时自带的 `standard` 预设派生一次，确认没丢能力行、配置满足内核 schema。
 *
 * 运行时在「挂载预设」时才用各行的 schemastery schema 校验配置，发现预设时的 broken 标记查不出来；
 * 这个脚本把同一套校验提前到发布前。
 *
 * 用法（指向一份装好内核包的 node_modules）：
 *   ZENWIT_KERNEL_MODULES=<路径> node scripts/verify-composition.mjs
 * 退出码非 0 表示派生结果有问题。
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const kernelModules = process.env.ZENWIT_KERNEL_MODULES ?? process.argv[2]
if (kernelModules === undefined || kernelModules.length === 0) {
  console.error('缺少内核 node_modules 路径：设 ZENWIT_KERNEL_MODULES 或作为第一个参数传入')
  process.exit(2)
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const yaml = require(join(kernelModules, 'js-yaml'))
const { buildPreset } = await import(join(packageRoot, 'lib/index.js'))

const upstreamPath = join(kernelModules, '@deepseek-ai/dsh-agent-presets/presets/standard/agent.cordis.yml')
const upstream = await readFile(upstreamPath, 'utf8')
const derived = buildPreset(upstream, '/tmp/preset')

/** 顶层行 id 列表。
 * @param {string} text - 组合文本。
 * @returns {string[]} id 列表。
 */
const rowIds = (text) => [...text.matchAll(/^- id: (.+)$/gmu)].map(match => match[1])

let failures = 0
const upstreamIds = rowIds(upstream)
const derivedIds = rowIds(derived)
const missingRows = upstreamIds.filter(id => !derivedIds.includes(id))
if (missingRows.length > 0) {
  console.error('派生后缺少上游行：', missingRows.join(', '))
  failures += 1
}
if (derived.includes("You are a coding agent powered by")) {
  console.error('persona 未替换')
  failures += 1
}

const rows = yaml.load(derived.replace(/!!js /g, ''))
const scope = join(kernelModules, '@deepseek-ai')
for (const row of rows) {
  const rowName = String(row.name)
  if (!rowName.startsWith('@deepseek-ai/')) continue
  let schema
  try {
    const mod = await import(join(scope, rowName.slice('@deepseek-ai/'.length), 'lib/index.js'))
    schema = mod.Config
  } catch {
    continue
  }
  if (schema === undefined) continue
  try {
    schema(row.config ?? {})
  } catch (error) {
    failures += 1
    const first = String(error instanceof Error ? error.message : error).split(String.fromCharCode(10))[0]
    console.error(String(row.id).padEnd(20), first.slice(0, 140))
  }
}

if (failures === 0) {
  console.log(`派生校验通过：${derivedIds.length} 行继承自上游，配置满足内核 schema`)
} else {
  console.error(`派生校验失败：${failures} 处问题`)
  process.exit(1)
}
