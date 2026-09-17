/**
 * 用真实内核插件校验生成的预设组合。
 *
 * 运行时在「挂载预设」时才会用各行的 schemastery schema 校验配置——发现预设时的 broken 标记查不出
 * 缺字段。这个脚本把同一套校验提前到发布前：把组合文本解析成行，逐行调用内核包的 Config。
 *
 * 用法（需要指向一份装好内核包的 node_modules）：
 *   ZENWIT_KERNEL_MODULES=~/Projrcts/zenwit-hermas/dsh-plugin-desktop-beta/node_modules \
 *     node scripts/verify-composition.mjs
 * 退出码非 0 表示至少一行不通过。
 */
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
const { composition } = await import(join(packageRoot, 'lib/index.js'))

/** 组合里 !!js 表达式不是 YAML 标准标签，解析前摘掉（只影响 disabled 字段）。 */
const rows = yaml.load(composition('/tmp/preset').replace(/!!js /g, ''))
const scope = join(kernelModules, '@deepseek-ai')

let failures = 0
for (const row of rows) {
  const name = String(row.name)
  if (!name.startsWith('@deepseek-ai/')) continue
  let schema
  try {
    const mod = await import(join(scope, name.slice('@deepseek-ai/'.length), 'lib/index.js'))
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
    console.error(String(row.id).padEnd(18), first.slice(0, 140))
  }
}

if (failures === 0) {
  console.log(`组合校验通过：${rows.length} 行，配置全部满足内核 schema`)
} else {
  console.error(`组合校验失败：${failures} 行不满足内核 schema`)
  process.exit(1)
}
