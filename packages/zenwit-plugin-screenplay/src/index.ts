/**
 * 短剧创作 —— Host 端。
 *
 * 运行时没有「动态注册预设」的接口：预设发现只扫三个位置——随包自带的 shipped root、
 * 行配置里的 `roots`、以及应用数据目录下的 `.agent-presets`（用户 root）。所以本插件在激活时
 * 把自带预设安装进用户 root（预设发现不缓存，装完立即可见），在禁用或卸载时移除。
 *
 * 两条安全约定：
 * 1. 落点带归属标记 `.managed-by`；目标是别的来源（存在但没有标记，也不是本插件生成的组合）时
 *    拒绝覆盖、卸载时也不删除，避免动到用户自己写的同名预设。
 * 2. 写入走「临时目录 + rename」，任何时刻落点要么是旧内容要么是新内容，桌面端与命令行同时
 *    运行时不会留下半份预设。
 *
 * 预设组合里只有运行时自带的插件行（persona / tool-fs / tool-fs-search / bash|pwsh /
 * tool-web / tool-ask-user / skill-filesystem / tool-skill），没有第三方包，也没有服务行，
 * 因此不需要 isolate realm。
 */
import { cp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'zenwit-plugin-screenplay'

/**
 * 预设 id，同时是应用数据目录 `.agent-presets/` 下的目录名。
 * 与包名一致：运行时按「随包自带的 root 优先」裁决同名预设，用包名做 id 才不会被静默遮蔽。
 */
const PRESET_ID = 'zenwit-plugin-screenplay'

/** 随包发布的预设源目录（`lib/` 的上级即包根）。 */
const SOURCE_DIR = resolve(import.meta.dirname, '..', 'presets', PRESET_ID)

/** 预设最终落点：与运行时一致地解析应用数据目录。 */
const TARGET_DIR = join(resolveDshHome(), '.agent-presets', PRESET_ID)

/** 归属标记文件名：只有带本标记（或带下面生成头）的目录才归本插件管。 */
const MARKER_FILE = '.managed-by'

/** 生成组合的首行，用作无标记目录的升级识别依据。 */
const GENERATED_HEADER = '# 由 zenwit-plugin-screenplay 在安装时生成'

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

/**
 * 生成预设的 agent-plane 组合。
 * @param presetDir - 安装后的预设目录，用于给出技能与自检脚本的绝对路径。
 * @returns 可直接写入 `agent.cordis.yml` 的组合文本。
 */
export function composition(presetDir: string): string {
  const indent = (line: string): string => "      " + line
  return [
    GENERATED_HEADER + "，请勿手改（要改请改包内的 composition()）。",
    "- id: persona",
    "  name: '@deepseek-ai/dsh-persona'",
    "  config:",
    "    prefix: |-",
    ...PERSONA_PREFIX_LINES.split(String.fromCharCode(10)).map(indent),
    "    suffix: >-",
    "      当前工作目录是 {{cwd}}。本预设自带的技能在 " + presetDir + "/skills；",
    "      格式校验脚本在 " + presetDir + "/tools/format-check.sh，需要时用 shell 复制或运行。",
    "",
    "- id: tool-fs",
    "  name: '@deepseek-ai/dsh-tool-fs'",
    "",
    "- id: tool-fs-search",
    "  name: '@deepseek-ai/dsh-tool-fs-search'",
    "  config:",
    "    sampleOverCapGlobResults: false",
    "",
    "- id: tool-bash",
    "  name: '@deepseek-ai/dsh-tool-bash'",
    "  disabled: !!js process.platform === 'win32'",
    "",
    "- id: tool-pwsh",
    "  name: '@deepseek-ai/dsh-tool-pwsh'",
    "  disabled: !!js process.platform !== 'win32'",
    "",
    "- id: tool-web",
    "  name: '@deepseek-ai/dsh-tool-web'",
    "",
    "- id: tool-ask-user",
    "  name: '@deepseek-ai/dsh-tool-ask-user'",
    "",
    "- id: skill-filesystem",
    "  name: '@deepseek-ai/dsh-skill-filesystem'",
    "  config:",
    "    customSkillDirs:",
    "      - " + presetDir + "/skills",
    "",
    "- id: tool-skill",
    "  name: '@deepseek-ai/dsh-tool-skill'",
    "",
  ].join(String.fromCharCode(10))
}

/** 落点的归属：本插件安装的（managed）、别的来源占用的（foreign）、还不存在（absent）。 */
type TargetState = 'managed' | 'foreign' | 'absent'

/**
 * 判定落点归属。
 * 标记文件命中即 managed；没有标记但组合首行是本插件的生成头，也按 managed 处理（升级路径）；
 * 其余已存在目录一律视为 foreign。
 * @returns 落点归属。
 */
async function targetState(): Promise<TargetState> {
  try {
    const marker = await readFile(join(TARGET_DIR, MARKER_FILE), 'utf8')
    if (marker.trim() === name) return 'managed'
  } catch {
    // 没有标记文件：继续用组合首行判断，或判定为不存在
  }
  try {
    await stat(TARGET_DIR)
  } catch {
    return 'absent'
  }
  try {
    const first = (await readFile(join(TARGET_DIR, 'agent.cordis.yml'), 'utf8')).split(String.fromCharCode(10), 1)[0]
    return first?.startsWith(GENERATED_HEADER) === true ? 'managed' : 'foreign'
  } catch {
    return 'foreign'
  }
}

/**
 * 把随包预设安装到用户预设根。
 * @throws 当落点被别的来源占用时——不覆盖，交由调用方记录告警。
 */
async function install(): Promise<void> {
  if (await targetState() === 'foreign') {
    throw new Error("预设目录 " + TARGET_DIR + " 已由其它来源提供，已跳过安装（不覆盖）")
  }
  const staging = join(dirname(TARGET_DIR), "." + PRESET_ID + ".tmp-" + String(process.pid))
  await rm(staging, { recursive: true, force: true })
  await cp(SOURCE_DIR, staging, { recursive: true })
  await writeFile(join(staging, 'agent.cordis.yml'), composition(TARGET_DIR), 'utf8')
  await writeFile(join(staging, MARKER_FILE), name + String.fromCharCode(10), 'utf8')
  await rm(TARGET_DIR, { recursive: true, force: true })
  await rename(staging, TARGET_DIR)
}

/** 只移除本插件安装的预设；落点不存在或属于别的来源时不做任何事。 */
async function uninstall(): Promise<void> {
  if (await targetState() !== 'managed') return
  await rm(TARGET_DIR, { recursive: true, force: true })
}

/**
 * 安装「短剧创作」预设：激活时写入用户预设根，卸载时（等安装落定后）移除。
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const ready = install().then(
      () => { ctx.logger.info("zenwit-plugin-screenplay: 已安装预设 " + PRESET_ID + " -> " + TARGET_DIR) },
      (error: unknown) => { ctx.logger.warn("zenwit-plugin-screenplay: 预设安装失败 " + String(error)) },
    )
    return () => { void ready.then(() => uninstall()) }
  }, 'zenwit-plugin-screenplay: managed preset')
}
