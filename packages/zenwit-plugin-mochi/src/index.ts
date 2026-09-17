import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'

/**
 * Mochi —— Host 端
 *
 * 职责：监听当前会话 Agent 的状态事件，维护一个 { mood, label, step } 状态，
 * 通过 `connection.rpc` 暴露给 Client 端轮询（对应动态插件的 `harness.handle`）。
 *
 * 状态机：
 *   agent/inbox/inserted  -> thinking（用户提问）
 *   agent/status=running  -> busy（Agent 执行中）
 *   agent/status=idle     -> done（刚从 busy/thinking 回落 = 本轮完成）
 *   agent/error           -> angry（出错）
 *   tools/result          -> busy + step（每一步工具调用，更新步骤文案）
 */

export const name = 'zenwit-plugin-mochi'
export const inject = ['connection']

/** Client 轮询拿到的状态快照。 */
export interface MochiState {
  mood: string
  label: string
  step: string
  seq: number
}

interface RpcSuccess<T> {
  ok: true
  value: T
}

interface RpcFailure {
  ok: false
  error: { code: 'internal'; message: string; details: Record<string, never> }
}

// The desktop runtime emits these events through the Host composition.
// They are intentionally not part of Cordis' base Events declaration.
type RuntimeEventContext = Context & {
  on(event: string, listener: (...args: unknown[]) => void): void
}

function stringField(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}

/** 工具名 -> 头顶气泡的中文步骤文案。 */
const TOOL_LABELS: Record<string, string> = {
  bash: '执行命令',
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  glob: '查找文件',
  grep: '检索内容',
  web_search: '联网搜索',
  web_fetch: '抓取网页',
  skill: '加载技能',
  todo_write: '更新计划',
  checkpoint: '保存检查点',
  subagent: '委派子任务',
  subagent_fork: '委派子任务',
  workflow: '编排工作流',
  cordis_define: '定义插件',
  cordis_run: '运行插件',
  cordis_stop: '停止插件',
  cordis_undefine: '移除插件',
  ask_user_question: '向你提问',
  create_goal: '创建目标',
  update_goal: '更新目标',
  get_goal: '读取目标',
  list_agents: '查看子代理',
  send_message: '联系子代理',
  interrupt_agent: '中断子代理',
  job_output: '读取后台任务',
  job_list: '列出任务',
  job_kill: '终止任务',
  read_image: '查看图片',
  read_rich_file: '读取文档',
  ocr_pdf: '识别 PDF',
}

function describeTool(name: string): string {
  if (name === '') return ''
  return TOOL_LABELS[name] ?? `调用 ${name}`
}

function success<T>(value: T): RpcSuccess<T> {
  return { ok: true, value }
}

function failure(error: unknown): RpcFailure {
  return {
    ok: false,
    error: {
      code: 'internal',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

/** 共享 /api 频道上本插件独占的状态路由（精确路径，位于 Connection 的鉴权围栏之下）。 */
const STATE_ROUTE = '/api/zenwit-plugin-mochi'

function jsonResponse(body: RpcSuccess<unknown> | RpcFailure): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export function apply(ctx: Context): void {
  const runtime = ctx as RuntimeEventContext
  const state: MochiState = { mood: 'idle', label: '', step: '', seq: 0 }

  const bump = (): void => {
    state.seq += 1
  }

  runtime.on('agent/inbox/inserted', () => {
    state.mood = 'thinking'
    state.label = '思考中'
    state.step = ''
    bump()
  })

  runtime.on('agent/status', (payload: unknown) => {
    if (stringField(payload, 'status') === 'running') {
      state.mood = 'busy'
      state.label = '工作中'
    } else if (state.mood === 'busy' || state.mood === 'thinking') {
      state.mood = 'done'
      state.label = '完成啦'
      state.step = ''
    } else {
      state.mood = 'idle'
      state.label = ''
      state.step = ''
    }
    bump()
  })

  runtime.on('agent/error', () => {
    state.mood = 'angry'
    state.label = '出错了'
    state.step = ''
    bump()
  })

  runtime.on('tools/result', (execution: unknown) => {
    const toolName = stringField(execution, 'name') ?? stringField(execution, 'tool') ?? ''
    state.mood = 'busy'
    state.label = '工作中'
    state.step = describeTool(toolName)
    bump()
  })

  // Client→Host 状态桥。
  //
  // 0.1.5-rc.1 起第三方 Host 插件不能再用 connection.rpc.handle() 自建 RPC 频道：
  // HostConnectionService.register() 在服务自身的上下文上读取 ctx.webServer，而该上下文
  // 没有 webServer 注入，Loader 装载时即报 cannot get property "webServer" without inject。
  // 改为在进程已挂载的共享 /api 频道上注册一条精确路由：它同样经过 Connection 的
  // Host/Origin 与浏览器鉴权围栏（未通过时 401/403），路由与响应体由本插件独占。
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: STATE_ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request: Request): Promise<Response> {
          let endpoint = ''
          try {
            endpoint = stringField(await request.json(), 'endpoint') ?? ''
          } catch {
            // 空体或非 JSON 请求体按未知操作处理，走下面的失败分支。
          }
          try {
            if (endpoint === 'state') {
              return jsonResponse(success({ ...state }))
            }
            throw new Error(`未知的宠物操作：${endpoint}`)
          } catch (error: unknown) {
            return jsonResponse(failure(error))
          }
        },
      }),
    'zenwit-plugin-mochi: state route',
  )
}
