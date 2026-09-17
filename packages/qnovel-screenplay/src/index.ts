/**
 * QNovel Screenplay —— Host 端。
 *
 * 当前内核没有「运行时注册预设」的 API：`@deepseek-ai/dsh-agent-presets` 只扫描三个位置——
 * 随包自带的 shipped root、行配置里的 `roots`、以及 `$DSH_HOME/.agent-presets`（用户 root）。
 * 因此本插件在激活时把自带预设安装进用户 root（预设发现不缓存，装完立即可见），在禁用或
 * 卸载时移除它。这就是源项目 `managed-presets` 的等价实现，也是「预设经市场分发」唯一稳的形态。
 *
 * 预设组合里只有内核自带的插件行（persona / tool-fs / tool-fs-search / bash|pwsh /
 * tool-web / tool-ask-user / skill-filesystem / tool-skill），没有第三方包，也没有服务行，
 * 因此不需要 isolate realm。
 */
import { cp, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'qnovel-screenplay'

/** 预设 id，同时是 `$DSH_HOME/.agent-presets` 下的目录名。 */
const PRESET_ID = 'short-drama'

/** 随包发布的预设源目录（`lib/` 的上级即包根）。 */
const SOURCE_DIR = resolve(import.meta.dirname, '..', 'presets', PRESET_ID)

/** 未显式设置 `DSH_HOME` 时与内核一致地回落到 `~/.dsh`。 */
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')

/** 预设最终落点，必须与内核的用户 root 一致。 */
const TARGET_DIR = join(DSH_HOME, '.agent-presets', PRESET_ID)

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
 * @param presetDir - 安装后的预设目录，用于给出技能与模板的绝对路径。
 * @returns 可直接写入 `agent.cordis.yml` 的组合文本。
 */
function composition(presetDir: string): string {
  const indent = (line: string): string => "      " + line
  return [
    "# 由 qnovel-screenplay 在安装时生成，请勿手改（要改请改包内的 composition()）。",
    "- id: persona",
    "  name: '@deepseek-ai/dsh-persona'",
    "  config:",
    "    prefix: |-",
    ...PERSONA_PREFIX_LINES.split(String.fromCharCode(10)).map(indent),
    "    suffix: >-",
    "      当前工作目录是 {{cwd}}。本预设自带的技能在 " + presetDir + "/skills；",
    "      新项目模板（创作合同、设定、人物、大纲、分集大纲、剧本、交付）在 " + presetDir + "/workspace-template；",
    "      格式校验脚本在 " + presetDir + "/tools/format-check.sh，需要时用 shell 复制或运行。",
    "",
    "- id: tool-fs",
    "  name: '@deepseek-ai/dsh-tool-fs'",
    "",
    "- id: tool-fs-search",
    "  name: '@deepseek-ai/dsh-tool-fs-search'",
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

/** 把随包预设安装到用户 root；重复执行是幂等的（整体覆盖）。 */
async function install(): Promise<void> {
  await rm(TARGET_DIR, { recursive: true, force: true })
  await cp(SOURCE_DIR, TARGET_DIR, { recursive: true })
  await writeFile(join(TARGET_DIR, 'agent.cordis.yml'), composition(TARGET_DIR), 'utf8')
}

/** 撤销安装，避免残留一个指向已卸载包的预设。 */
async function uninstall(): Promise<void> {
  await rm(TARGET_DIR, { recursive: true, force: true })
}

/**
 * 安装「短剧创作」预设：激活时写入 `$DSH_HOME/.agent-presets/<id>`，卸载时移除。
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    void install().then(
      () => { ctx.logger.info("qnovel-screenplay: 已安装预设 " + PRESET_ID + " -> " + TARGET_DIR) },
      (error: unknown) => { ctx.logger.warn("qnovel-screenplay: 预设安装失败 " + String(error)) },
    )
    return () => { void uninstall() }
  }, 'qnovel-screenplay: managed preset')
}
