/** 组合派生的纯函数测试：不依赖内核，用与上游同形的最小夹具。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPreset } from '../lib/index.js'

/** 最小上游夹具：顶层行 persona / tool-fs / skill-filesystem / compaction（含组内子行）。 */
const UPSTREAM = [
  '- id: persona',
  "  name: '@deepseek-ai/dsh-persona'",
  '  config:',
  '    suffix: Your working directory is {{cwd}}.',
  '    prefix: >-',
  '      You are a coding agent powered by the {{model}} model.',
  '',
  '- id: tool-fs',
  "  name: '@deepseek-ai/dsh-tool-fs'",
  '',
  '- id: skill-filesystem',
  "  name: '@deepseek-ai/dsh-skill-filesystem'",
  '',
  '- id: compaction',
  '  name: cordis:group',
  '  group: true',
  '  isolate:',
  '    compaction: true',
  '  config:',
  '    - id: command-compact',
  "      name: '@deepseek-ai/dsh-command-compact'",
  '',
].join(String.fromCharCode(10))

/** 顶层行 id 列表。
 * @param {string} text - 组合文本。
 * @returns {string[]} id 列表。
 */
const rowIds = (text) => [...text.matchAll(/^- id: (.+)$/gmu)].map(match => match[1])

test('派生后保留上游的能力行与组内子行', () => {
  const out = buildPreset(UPSTREAM, '/tmp/p')
  assert.deepEqual(rowIds(out), ['persona', 'tool-fs', 'skill-filesystem', 'compaction'])
  assert.match(out, /dsh-command-compact/u)
  assert.match(out, /^ {2}group: true$/mu)
})

test('persona 换成短剧创作，上游文案不再出现', () => {
  const out = buildPreset(UPSTREAM, '/tmp/p')
  assert.match(out, /You are a short-drama writing Agent/u)
  assert.doesNotMatch(out, /You are a coding agent powered by/u)
  assert.match(out, /当前工作目录是 \{\{cwd\}\}/u)
})

test('技能目录指向传入的预设目录', () => {
  const out = buildPreset(UPSTREAM, '/x/y')
  assert.match(out, /customSkillDirs:\n {6}- \/x\/y\/skills/u)
})

test('上游缺必需行时报错，不产出缺能力的组合', () => {
  const missing = UPSTREAM.replace('- id: compaction', '- id: something-else')
  assert.throws(() => buildPreset(missing, '/tmp/p'), /缺少 compaction/u)
})
