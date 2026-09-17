/** 组合生成的纯函数测试：只断言结构约束，不依赖 YAML 解析器。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composition } from '../lib/index.js'

/** 组合允许出现的插件行——运行时自带的那些，出现别的说明引了第三方包。 */
const ALLOWED = new Set([
  '@deepseek-ai/dsh-persona',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-web',
  '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill',
])

test('组合只引用运行时自带的插件行', () => {
  const names = [...composition('/tmp/p').matchAll(/^\s*name: '([^']+)'/gmu)].map(match => match[1])
  assert.equal(names.length, ALLOWED.size)
  for (const value of names) assert.ok(ALLOWED.has(value), `未在允许集合内: ${String(value)}`)
})

test('组合的 id 唯一', () => {
  const ids = [...composition('/tmp/p').matchAll(/^- id: (.+)$/gmu)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length)
})

test('技能目录与自检脚本指向传入的预设目录', () => {
  const text = composition('/x/y')
  assert.match(text, /customSkillDirs:\n\s+- \/x\/y\/skills/u)
  assert.match(text, /\/x\/y\/tools\/format-check\.sh/u)
})

/**
 * 运行时对各行的必填配置——漏一个，挂载预设时 zod 校验就会整条失败。
 * 与内核同步：`@deepseek-ai/dsh-persona` 的 prefix、`@deepseek-ai/dsh-tool-fs-search` 的
 * sampleOverCapGlobResults（见内核各包 src 里的 .required()）。
 */
const REQUIRED_CONFIG = {
  '@deepseek-ai/dsh-persona': ['prefix'],
  '@deepseek-ai/dsh-tool-fs-search': ['sampleOverCapGlobResults'],
}

test('每行的必填配置都给了值', () => {
  const blocks = composition('/tmp/p').split('\n- id: ')
  for (const [pkg, keys] of Object.entries(REQUIRED_CONFIG)) {
    const block = blocks.find(entry => entry.includes(`name: '${pkg}'`))
    assert.ok(block !== undefined, `${pkg} 行缺失`)
    for (const key of keys) {
      assert.match(String(block), new RegExp(`\\n\\s+${key}:`), `${pkg} 缺少必填配置 ${key}`)
    }
  }
})

test('persona 前缀被完整写入块标量', () => {
  const text = composition('/tmp/p')
  assert.match(text, /\n    prefix: \|-\n      You are a short-drama writing Agent/u)
  assert.match(text, /\n    suffix: >-\n/u)
})
