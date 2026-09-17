/**
 * 短剧创作 —— Host 端。
 *
 * 运行时没有「动态注册预设」的接口：预设发现只扫三个位置——随包自带的 shipped root、行配置里的
 * `roots`、以及应用数据目录下的 `.agent-presets`（用户 root）。所以本插件在激活时把预设安装进用户
 * root（预设发现不缓存，装完立即可见），在禁用或卸载时移除。
 *
 * 组合不是手写的：它**派生自运行时自带的 `standard` 预设**，只改两处——persona 文案换成短剧创作、
 * `skill-filesystem` 的技能目录指到本预设自带的 `skills/`。这样运行时新增的工具与命令（压缩、计划、
 * 目标、子代理、待办、后台任务……）会自动出现在本预设里，不需要跟着内核手工对表。
 * 上游行缺失时**报错并保留原有预设**，而不是降级成一个缺能力的预设。
 *
 * 三条安全约定：
 * 1. 落点带归属标记 `.managed-by`；目标是别的来源时拒绝覆盖、卸载时也不删除；
 * 2. 写入走「临时目录 + rename」，桌面端与命令行同时运行不会留下半份预设；
 * 3. 组合文本只在内存里做定点替换，其余行原样保留。
 */
import { readFile, rename, rm, stat, writeFile, cp } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'zenwit-plugin-screenplay'

/** 预设名册里作为派生来源的预设 id（运行时自带、只读）。 */
const UPSTREAM_PRESET_ID = 'standard'

/**
 * 预设 id，同时是应用数据目录 `.agent-presets/` 下的目录名。
 * 与包名一致：运行时按「随包自带的 root 优先」裁决同名预设，用包名做 id 才不会被静默遮蔽。
 */
const PRESET_ID = 'zenwit-plugin-screenplay'

/** 随包发布的预设资产目录（`lib/` 的上级即包根）。 */
const ASSET_DIR = resolve(import.meta.dirname, '..', 'presets', PRESET_ID)

/** 预设最终落点：与运行时一致地解析应用数据目录。 */
const TARGET_DIR = join(resolveDshHome(), '.agent-presets', PRESET_ID)

/** 归属标记文件名。 */
const MARKER_FILE = '.managed-by'

/** 生成组合的首行，用作无标记目录的升级识别依据。 */
const GENERATED_HEADER = '# 由 zenwit-plugin-screenplay 在安装时生成'

/** 派生时必须存在的上游行：缺任何一条都说明上游结构变了，宁可报错也不产出缺能力的预设。 */
const REQUIRED_UPSTREAM_ROWS = ['persona', 'skill-filesystem', 'compaction']

/** 名册行里我们真正用到的字段。 */
interface UpstreamPreset {
  readonly id: string
  readonly trust: 'system' | 'user'
  readonly path: string
  readonly broken?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 预设名册；由运行时提供。 */
    agentPresets: { list(): Promise<readonly UpstreamPreset[]> }
  }
}

const PERSONA_PREFIX_LINES = [
  "You are a short-drama writing Agent working in the user's current project.",
  'The user owns the creative direction, project structure, file names, titles, bylines, format,',
  "length, and final wording. Follow the user's explicit request and the Skill they choose.",
  'A Skill supplies writing guidance; it must not be silently replaced by built-in conventions.',
  'Treat existing project files as facts. Read relevant files before changing them, preserve',
  'unrelated content, and use the ordinary read/write/edit tools for every kind of project file,',
  'including outlines, character notes, rules, research, and episode text. Rename, move, or delete',
  'files with the shell tool (mv / rm). Ask for explicit confirmation before deleting anything;',
  'never ask for confirmation before writing, editing, renaming, or moving.',
  'There is no privileged screenplay file type, fixed directory layout, required template,',
  'automatic content validation, draft stage, approval stage, or mandatory delivery workflow.',
  'The directories .zenwit-project and .screenplay hold application metadata, not creative',
  'documents: you may read or search them, but never write, edit, move, or delete them with',
  'generic file tools. A project containing only these directories has no creative documents yet.',
  'Before creating the first file of a batch, load the creative-project-organization Skill and use',
  "it to decide that batch's concrete file groups and paths; re-evaluate the plan before adding a",
  'deliverable with a new purpose. User-specified paths and creative choices always win over it.',
  'Use ask_user_question only when a user-owned creative choice has two or more materially',
  "different valid directions and the user's request, the loaded Skill, and the project files do",
  'not resolve it. Ask one concise question at a time with two to four distinct options and room',
  'for a custom answer. Never use it to ask permission to write, edit, save, continue, pick a',
  'routine path, file name, directory structure, format, or length, or to confirm work the user',
  'already requested. If the user cancels, do not repeat the same card; continue with the safest',
  'reversible default when possible, otherwise state the missing creative choice once and wait.',
  'Do not refuse because a title, name, byline, paragraph count, word count, episode structure, or',
  'Markdown layout differs from a convention. Offer creative advice only when useful, and never',
  'turn advice into a write blocker. Read documents the user attaches instead of inventing local',
  'paths, and search the web when the user asks for current online information. Never claim to',
  'have read material that was not available. Work in an open loop: inspect only what is needed,',
  'perform the requested action, check the result, and stop. Encode every tool argument as a JSON',
  'object; use an empty object for a no-argument tool.',
].join(String.fromCharCode(10))

/** 顶层行的切分正则（缩进的子行不会被匹配）。 */
const TOP_LEVEL_ROW = /^- id: /mu

/**
 * 定位一条顶层行的边界。
 * @param text - 上游组合文本。
 * @param id - 行 id。
 * @returns 起始与结束偏移。
 * @throws 当上游没有这条顶层行时。
 */
function rowBounds(text: string, id: string): { start: number; end: number } {
  const marker = "- id: " + id + String.fromCharCode(10)
  const at = text.indexOf(marker)
  let start = -1
  if (at === 0) start = 0
  else if (at > 0 && text.charAt(at - 1) === String.fromCharCode(10)) start = at
  if (start === -1) throw new Error("上游预设缺少 " + id + " 行，已跳过安装以免产出缺能力的预设")
  const rest = text.slice(start + marker.length)
  const next = rest.search(TOP_LEVEL_ROW)
  return { start, end: next === -1 ? text.length : start + marker.length + next }
}

/**
 * 用给定文本替换一条顶层行。
 * @param text - 上游组合文本。
 * @param id - 行 id。
 * @param rendered - 新的行文本（以换行结尾，含尾随空行）。
 * @returns 替换后的文本。
 */
function replaceRow(text: string, id: string, rendered: string): string {
  const { start, end } = rowBounds(text, id)
  return text.slice(0, start) + rendered + text.slice(end)
}

/**
 * 本预设的 persona 行。
 * @param presetDir - 安装后的预设目录。
 * @returns 行文本。
 */
function renderPersona(presetDir: string): string {
  const indent = (line: string): string => "      " + line
  return [
    "- id: persona",
    "  name: '@deepseek-ai/dsh-persona'",
    "  config:",
    "    prefix: |-",
    ...PERSONA_PREFIX_LINES.split(String.fromCharCode(10)).map(indent),
    "    suffix: >-",
    "      当前工作目录是 {{cwd}}。本预设自带的技能在 " + presetDir + "/skills；",
    "      格式校验脚本在 " + presetDir + "/tools/format-check.sh，需要时用 shell 复制或运行。",
    "",
    "",
  ].join(String.fromCharCode(10))
}

/**
 * 本预设的 skill-filesystem 行。
 * @param presetDir - 安装后的预设目录。
 * @returns 行文本。
 */
function renderSkills(presetDir: string): string {
  return [
    "- id: skill-filesystem",
    "  name: '@deepseek-ai/dsh-skill-filesystem'",
    "  config:",
    "    customSkillDirs:",
    "      - " + presetDir + "/skills",
    "",
    "",
  ].join(String.fromCharCode(10))
}

/**
 * 从运行时的 `standard` 组合派生出本预设的组合：只改 persona 与技能目录两处。
 * @param upstream - 上游组合文本。
 * @param presetDir - 安装后的预设目录。
 * @returns 本预设的组合文本。
 * @throws 当上游缺少必须存在的行时——宁可失败也不产出缺能力的预设。
 */
export function buildPreset(upstream: string, presetDir: string): string {
  for (const id of REQUIRED_UPSTREAM_ROWS) {
    rowBounds(upstream, id)
  }
  const withPersona = replaceRow(upstream, "persona", renderPersona(presetDir))
  return replaceRow(withPersona, "skill-filesystem", renderSkills(presetDir))
}

/**
 * 读取运行时自带的派生来源组合。
 * @param ctx - Host 插件上下文。
 * @returns 上游组合文本。
 * @throws 当名册里没有该预设、它已损坏、或文件读不到时。
 */
async function readUpstream(ctx: Context): Promise<string> {
  const presets = await ctx.agentPresets.list()
  const upstream = presets.find(entry => entry.id === UPSTREAM_PRESET_ID && entry.trust === "system")
  if (upstream === undefined) {
    throw new Error("名册里没有自带的 " + UPSTREAM_PRESET_ID + " 预设，无法派生组合")
  }
  if (upstream.broken !== undefined) {
    throw new Error("自带的 " + UPSTREAM_PRESET_ID + " 预设不可用：" + upstream.broken)
  }
  return await readFile(upstream.path, "utf8")
}

/** 落点的归属：本插件安装的（managed）、别的来源占用的（foreign）、还不存在（absent）。 */
type TargetState = 'managed' | 'foreign' | 'absent'

/**
 * 判定落点归属。标记文件命中、或组合首行是本插件的生成头，都算 managed。
 * @returns 落点归属。
 */
async function targetState(): Promise<TargetState> {
  try {
    const marker = await readFile(join(TARGET_DIR, MARKER_FILE), "utf8")
    if (marker.trim() === name) return "managed"
  } catch {
    // 没有标记文件：继续用组合首行判断
  }
  try {
    await stat(TARGET_DIR)
  } catch {
    return "absent"
  }
  try {
    const first = (await readFile(join(TARGET_DIR, "agent.cordis.yml"), "utf8")).split(String.fromCharCode(10), 1)[0]
    return first?.startsWith(GENERATED_HEADER) === true ? "managed" : "foreign"
  } catch {
    return "foreign"
  }
}

/**
 * 安装预设：资产目录整体覆盖，组合按上游实时派生，写入走临时目录 + rename。
 * @param ctx - Host 插件上下文。
 * @throws 当落点被别的来源占用、或上游不可用时。
 */
async function install(ctx: Context): Promise<void> {
  if (await targetState() === "foreign") {
    throw new Error("预设目录 " + TARGET_DIR + " 已由其它来源提供，已跳过安装（不覆盖）")
  }
  const upstream = await readUpstream(ctx)
  const composition = buildPreset(upstream, TARGET_DIR)
  const staging = join(dirname(TARGET_DIR), "." + PRESET_ID + ".tmp-" + String(process.pid))
  await rm(staging, { recursive: true, force: true })
  await cp(ASSET_DIR, staging, { recursive: true })
  await writeFile(join(staging, "agent.cordis.yml"), composition, "utf8")
  await writeFile(join(staging, MARKER_FILE), name + String.fromCharCode(10), "utf8")
  await rm(TARGET_DIR, { recursive: true, force: true })
  await rename(staging, TARGET_DIR)
}

/** 只移除本插件安装的预设；落点不存在或属于别的来源时不做任何事。 */
async function uninstall(): Promise<void> {
  if (await targetState() !== "managed") return
  await rm(TARGET_DIR, { recursive: true, force: true })
}

export const inject = ['agentPresets']

/**
 * 安装「短剧创作」预设：激活时写入用户预设根，卸载时（等安装落定后）移除。
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const ready = install(ctx).then(
      () => { ctx.logger.info("zenwit-plugin-screenplay: 已安装预设 " + PRESET_ID + " -> " + TARGET_DIR) },
      (error: unknown) => { ctx.logger.warn("zenwit-plugin-screenplay: 预设安装失败 " + String(error)) },
    )
    return () => { void ready.then(() => uninstall()) }
  }, 'zenwit-plugin-screenplay: managed preset')
}
