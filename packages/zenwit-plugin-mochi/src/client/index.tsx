import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// ctx.slots 的 Context 增强由 ui-renderer/client 声明（0.1.0-rc.7 时在 dsh-client-runtime/client）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { styles } from './styles.ts'

type MochiSlotName = 'shell.overlay' | 'settings.general.item'

interface MochiSlots {
  inject(name: MochiSlotName, factory: () => () => void): void
  register(
    options: { name: MochiSlotName; id: string; order: number },
    component: () => React.ReactElement | null,
  ): () => void
}

/**
 * Mochi —— Client 端
 *
 * 职责：渲染可拖拽的悬浮表情球，轮询 Host 端状态自动跟随，并注册
 * 「shell.overlay」宠物本体 + 「settings.general.item」设置行。
 */

/** Host 端返回的状态快照（见 src/index.ts 的 MochiState）。 */
interface MochiState {
  mood: string
  label: string
  step: string
  seq: number
}

interface MochiSettings {
  enabled: boolean
  bubbleMode: 'detail' | 'simple' | 'off'
}

interface RpcSuccess<T> {
  ok: true
  value: T
}

interface RpcFailure {
  ok: false
  error: { code: string; message: string; details: unknown }
}

type RpcResult<T> = RpcSuccess<T> | RpcFailure

/**
 * Host 端状态路由（见 src/index.ts 的 STATE_ROUTE）：注册在共享 /api 频道上，
 * 由 Connection 的 Host/Origin + 浏览器鉴权围栏保护，因此用同源 fetch 调用。
 */
const STATE_ROUTE = '/api/zenwit-plugin-mochi'
const SETTINGS_KEY = 'zenwit-plugin-mochi-settings'

async function unwrap<T>(response: RpcResult<T>): Promise<T> {
  if (response.ok) return response.value
  throw new Error(response.error.message)
}

/** 拉取一次 Host 状态快照；非 2xx 抛错，由轮询按“本次失败”吞掉。 */
async function readState(): Promise<MochiState> {
  const response = await fetch(STATE_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: 'state' }),
  })
  if (!response.ok) throw new Error(`Mochi 状态请求失败：${response.status}`)
  return parseMochiState(await unwrap(await response.json() as RpcResult<unknown>))
}

function parseMochiState(value: unknown): MochiState {
  if (value === null || typeof value !== 'object') throw new Error('Mochi 状态无效')
  const state = value as Record<string, unknown>
  if (
    typeof state.mood !== 'string'
    || typeof state.label !== 'string'
    || typeof state.step !== 'string'
    || typeof state.seq !== 'number'
  ) throw new Error('Mochi 状态无效')
  return { mood: state.mood, label: state.label, step: state.step, seq: state.seq }
}

// ---------------------------------------------------------------------------
// 设置 store：模块级单例，供 MochiRoot（overlay）与 MochiSettingsRow（设置行）
// 两个独立挂载点共享同一份状态，并持久化到 localStorage。
// ---------------------------------------------------------------------------

let settingsStore: MochiSettings = { enabled: true, bubbleMode: 'detail' }

try {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') {
      const p = parsed as Partial<MochiSettings>
      if (typeof p.enabled === 'boolean') settingsStore.enabled = p.enabled
      if (p.bubbleMode === 'detail' || p.bubbleMode === 'simple' || p.bubbleMode === 'off') {
        settingsStore.bubbleMode = p.bubbleMode
      }
    }
  }
} catch {
  // localStorage 不可用时静默降级为默认值
}

const settingsListeners = new Set<() => void>()

function subscribeSettings(listener: () => void): () => void {
  settingsListeners.add(listener)
  return () => {
    settingsListeners.delete(listener)
  }
}

function updateSettings(patch: Partial<MochiSettings>): void {
  settingsStore = { ...settingsStore, ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsStore))
  } catch {
    // ignore
  }
  for (const listener of settingsListeners) listener()
}

function useSettings(): MochiSettings {
  const [settings, setSettings] = useState(settingsStore)
  useEffect(() => subscribeSettings(() => setSettings(settingsStore)), [])
  return settings
}

// ---------------------------------------------------------------------------
// 常量与工具
// ---------------------------------------------------------------------------

interface MoodDef {
  id: string
  name: string
  color: string
}

const MOODS: MoodDef[] = [
  { id: 'idle', name: '待机', color: '#F3F0EA' },
  { id: 'happy', name: '开心', color: '#F6EFE4' },
  { id: 'thinking', name: '思考', color: '#E8F0F7' },
  { id: 'busy', name: '忙碌', color: '#E7EEF6' },
  { id: 'surprised', name: '惊讶', color: '#F7F0EA' },
  { id: 'angry', name: '生气', color: '#E4574A' },
  { id: 'sleep', name: '睡觉', color: '#ECE9E2' },
  { id: 'shy', name: '害羞', color: '#F4D3D0' },
  { id: 'done', name: '完成', color: '#F0F6E7' },
]

const CONFETTI = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd']

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = `${h.charAt(0)}${h.charAt(0)}${h.charAt(1)}${h.charAt(1)}${h.charAt(2)}${h.charAt(2)}`
  const n = Number.parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbHex(r: number, g: number, b: number): string {
  const to = (v: number): string => ('0' + clamp(Math.round(v), 0, 255).toString(16)).slice(-2)
  return `#${to(r)}${to(g)}${to(b)}`
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a)
  const [br, bg, bb] = hexRgb(b)
  return rgbHex(lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t))
}

// ---------------------------------------------------------------------------
// SVG 引擎：创建并驱动表情球（直接操作 DOM + rAF，避免逐帧 React 重渲染）
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg'

function el(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

interface MochiEngine {
  setMood(id: string): void
  blink(): void
  bounce(): void
  burst(count: number): void
  setGaze(nx: number, ny: number): void
  destroy(): void
}

function createMochi(hostEl: HTMLElement): MochiEngine {
  const svg = el('svg', { viewBox: '0 0 200 200', width: '100%', height: '100%', 'aria-label': '桌面宠物球' }) as SVGSVGElement
  svg.style.display = 'block'
  svg.style.overflow = 'visible'

  const defs = el('defs', {})
  const grad = el('radialGradient', { id: 'mochiGrad', cx: '38%', cy: '30%', r: '78%' })
  const stopA = el('stop', { offset: '0%' })
  const stopB = el('stop', { offset: '60%' })
  const stopC = el('stop', { offset: '100%' })
  grad.append(stopA, stopB, stopC)
  defs.append(grad)
  svg.append(defs)

  const shadow = el('ellipse', { cx: '100', cy: '184', rx: '44', ry: '9', fill: 'rgba(0,0,0,0.14)' })
  svg.append(shadow)

  const bodyG = el('g', {})
  const body = el('circle', { cx: '100', cy: '100', r: '86', fill: 'url(#mochiGrad)' })
  const highlight = el('ellipse', { cx: '76', cy: '66', rx: '20', ry: '13', fill: 'rgba(255,255,255,0.55)', transform: 'rotate(-28 76 66)' })
  bodyG.append(body, highlight)
  svg.append(bodyG)

  const browL = el('line', { x1: '70', y1: '62', x2: '88', y2: '72', stroke: '#5A2E22', 'stroke-width': '5', 'stroke-linecap': 'round', opacity: '0' })
  const browR = el('line', { x1: '130', y1: '62', x2: '112', y2: '72', stroke: '#5A2E22', 'stroke-width': '5', 'stroke-linecap': 'round', opacity: '0' })
  svg.append(browL, browR)

  const eyeL = el('ellipse', { cx: '78', cy: '96', rx: '13', ry: '20', fill: '#26241F' })
  const eyeR = el('ellipse', { cx: '122', cy: '96', rx: '13', ry: '20', fill: '#26241F' })
  svg.append(eyeL, eyeR)

  const mouth = el('path', { fill: 'none', stroke: '#26241F', 'stroke-width': '4.5', 'stroke-linecap': 'round', d: '', opacity: '0' })
  svg.append(mouth)

  const blushL = el('ellipse', { cx: '66', cy: '118', rx: '11', ry: '7', fill: '#F2A9A0', opacity: '0' })
  const blushR = el('ellipse', { cx: '134', cy: '118', rx: '11', ry: '7', fill: '#F2A9A0', opacity: '0' })
  svg.append(blushL, blushR)

  const halo = el('ellipse', { cx: '100', cy: '12', rx: '26', ry: '9', fill: 'none', stroke: '#8FC3F5', 'stroke-width': '5', 'stroke-linecap': 'round', opacity: '0' })
  svg.append(halo)

  const zzz: SVGElement[] = []
  for (let z = 0; z < 3; z++) {
    const zt = el('text', { x: '0', y: '0', fill: '#A8A296', opacity: '0', 'font-family': 'system-ui, sans-serif', 'font-weight': '700', 'font-style': 'italic', 'text-anchor': 'middle' })
    zt.textContent = 'z'
    svg.append(zt)
    zzz.push(zt)
  }

  const confG = el('g', { 'pointer-events': 'none' })
  svg.append(confG)

  hostEl.append(svg)

  interface ConfettiPiece {
    x: number
    y: number
    vx: number
    vy: number
    life: number
    max: number
    r: number
    el: SVGElement
  }

  const st = {
    mood: 'idle',
    color: '#F3F0EA',
    targetColor: '#F3F0EA',
    open: 1,
    blinkAt: -1,
    blinkDur: 220,
    nextBlink: performance.now() + rand(2500, 6000),
    lookX: 0,
    lookY: 0,
    lookTx: 0,
    lookTy: 0,
    bounceAt: -1,
    confetti: [] as ConfettiPiece[],
    last: 0,
  }

  const moodCfg = new Map(MOODS.map((m) => [m.id, m]))

  const setMood = (id: string): void => {
    const def = moodCfg.get(id)
    if (def === undefined) return
    st.mood = id
    st.targetColor = def.color
    if (id === 'done') burst(26)
  }

  const blink = (): void => {
    st.blinkAt = performance.now()
  }

  const bounce = (): void => {
    st.bounceAt = performance.now()
  }

  const burst = (count = 20): void => {
    for (let i = 0; i < count && st.confetti.length < 70; i++) {
      const ang = (i / count) * Math.PI * 2 + rand(-0.4, 0.4)
      const spd = rand(90, 220)
      const node = el('circle', { r: '0', fill: CONFETTI[(Math.random() * CONFETTI.length) | 0] ?? '#f9705c' })
      confG.append(node)
      st.confetti.push({
        x: 100 + Math.cos(ang) * rand(10, 60),
        y: 100 + Math.sin(ang) * rand(10, 60),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(10, 50),
        life: 0,
        max: rand(0.5, 1.0),
        r: rand(3, 7),
        el: node,
      })
    }
  }

  interface EyeShape {
    ryK: number
    rxK?: number
    dy: number
    mouth: 'none' | 'smile' | 'frown' | 'o'
    brow?: boolean
    zzz?: boolean
    halo?: boolean
    blush?: number
    look?: number
    scan?: boolean
  }

  function eyeShape(mood: string): EyeShape {
    switch (mood) {
      case 'happy': return { ryK: 0.55, dy: -7, mouth: 'smile' }
      case 'surprised': return { ryK: 1.3, rxK: 1.25, dy: -4, mouth: 'o' }
      case 'angry': return { ryK: 0.5, dy: 1, mouth: 'frown', brow: true }
      case 'sleep': return { ryK: 0, dy: 2, mouth: 'none', zzz: true }
      case 'thinking': return { ryK: 1, dy: -10, mouth: 'none', halo: true }
      case 'busy': return { ryK: 0.9, rxK: 0.82, dy: 0, mouth: 'none', scan: true }
      case 'shy': return { ryK: 0.85, dy: 4, mouth: 'smile', blush: 0.9, look: -10 }
      case 'done': return { ryK: 0.55, dy: -7, mouth: 'smile' }
      default: return { ryK: 1, dy: 0, mouth: 'none' }
    }
  }

  function mouthPath(kind: EyeShape['mouth']): string {
    switch (kind) {
      case 'smile': return 'M 90 126 Q 100 138 110 126'
      case 'frown': return 'M 90 132 Q 100 122 110 132'
      case 'o': return 'M 100 130 Q 104 122 100 130'
      default: return ''
    }
  }

  function render(t: number): void {
    const dt = st.last !== 0 ? clamp((t - st.last) / 1000, 0.001, 0.05) : 1 / 60
    st.last = t

    const cfg = eyeShape(st.mood)

    if (st.mood !== 'sleep') {
      if (st.blinkAt < 0 && t >= st.nextBlink) {
        blink()
        st.nextBlink = t + rand(2500, 6500)
      }
    } else {
      st.blinkAt = -1
    }

    let openTarget = 1
    if (st.blinkAt >= 0) {
      const bp = (t - st.blinkAt) / st.blinkDur
      if (bp >= 1) {
        st.blinkAt = -1
      } else {
        openTarget = 1 - Math.sin(Math.PI * bp)
      }
    }
    st.open += (openTarget - st.open) * 0.55

    const k = 1 - Math.exp(-6 * dt)
    st.lookX += (st.lookTx - st.lookX) * k
    st.lookY += (st.lookTy - st.lookY) * k

    st.color = lerpColor(st.color, st.targetColor, Math.min(1, dt * 6))

    const breathe = 1 + 0.014 * Math.sin((t / 1000) * Math.PI)
    let bounceY = 0
    if (st.bounceAt >= 0) {
      const be = (t - st.bounceAt) / 1000
      if (be >= 0.7) {
        st.bounceAt = -1
      } else {
        bounceY = -Math.abs(Math.sin((be / 0.7) * Math.PI)) * 26
      }
    }

    stopA.setAttribute('stop-color', lerpColor(st.color, '#FFFFFF', 0.35))
    stopB.setAttribute('stop-color', st.color)
    stopC.setAttribute('stop-color', lerpColor(st.color, '#000000', 0.14))

    bodyG.setAttribute('transform', `translate(100 100) scale(${breathe.toFixed(4)}) translate(-100 -100)`)
    body.setAttribute('transform', `translate(0 ${bounceY.toFixed(1)})`)
    highlight.setAttribute('transform', `translate(0 ${bounceY.toFixed(1)}) rotate(-28 76 66)`)

    const shScale = bounceY < -1 ? 0.72 : 1
    shadow.setAttribute('rx', (44 * shScale).toFixed(1))
    shadow.setAttribute('opacity', (0.14 * shScale).toFixed(3))

    let lookX = cfg.look ?? st.lookX
    const lookY = cfg.look !== undefined ? st.lookY : st.lookY
    if (cfg.scan === true) lookX = st.lookX + Math.sin(t / 90) * 4
    const ey = 96 + cfg.dy
    let rx = 13 * (cfg.rxK ?? 1)
    let ry = 20 * cfg.ryK * (st.open < 0.05 ? 0.05 : st.open)
    if (st.mood === 'sleep') {
      rx = 11
      ry = 3
    }

    eyeL.setAttribute('cx', (78 + lookX).toFixed(1))
    eyeL.setAttribute('cy', (ey + lookY).toFixed(1))
    eyeL.setAttribute('rx', rx.toFixed(1))
    eyeL.setAttribute('ry', ry.toFixed(1))
    eyeR.setAttribute('cx', (122 + lookX).toFixed(1))
    eyeR.setAttribute('cy', (ey + lookY).toFixed(1))
    eyeR.setAttribute('rx', rx.toFixed(1))
    eyeR.setAttribute('ry', ry.toFixed(1))

    browL.setAttribute('opacity', cfg.brow === true ? '1' : '0')
    browR.setAttribute('opacity', cfg.brow === true ? '1' : '0')

    const mp = mouthPath(cfg.mouth)
    if (mp !== '') {
      mouth.setAttribute('d', mp)
      mouth.setAttribute('opacity', '1')
    } else {
      mouth.setAttribute('opacity', '0')
    }

    const bv = cfg.blush !== undefined ? String(cfg.blush) : '0'
    blushL.setAttribute('opacity', bv)
    blushR.setAttribute('opacity', bv)

    if (cfg.halo === true) {
      halo.setAttribute('opacity', String(0.35 + 0.65 * Math.abs(Math.sin(t / 1000))))
      halo.setAttribute('rx', String(20 + 8 * Math.sin(t / 700)))
      halo.setAttribute('transform', `translate(0 ${bounceY.toFixed(1)})`)
    } else {
      halo.setAttribute('opacity', '0')
    }

    if (cfg.zzz === true) {
      for (let zi = 0; zi < zzz.length; zi++) {
        const zp = (t * 0.0004 + zi / 3) % 1
        const zo = zp < 0.2 ? zp / 0.2 : 1 - (zp - 0.2) / 0.8
        const z = zzz[zi]
        if (z === undefined) continue
        z.setAttribute('opacity', (zo * 0.8).toFixed(3))
        z.setAttribute('font-size', (13 + zp * 12).toFixed(1))
        z.setAttribute('transform', `translate(${(150 + zp * 30 + 4 * Math.sin(zp * 9)).toFixed(1)} ${(48 - zp * 40).toFixed(1)}) rotate(${(-12 + zp * 16).toFixed(0)})`)
      }
    } else {
      for (const zj of zzz) zj.setAttribute('opacity', '0')
    }

    for (let ci = st.confetti.length - 1; ci >= 0; ci--) {
      const pc = st.confetti[ci]
      if (pc === undefined) continue
      pc.life += dt
      if (pc.life >= pc.max) {
        pc.el.remove()
        st.confetti.splice(ci, 1)
        continue
      }
      pc.x += pc.vx * dt
      pc.y += pc.vy * dt
      pc.vy += 160 * dt
      const u = pc.life / pc.max
      const fd = u < 0.15 ? u / 0.15 : Math.pow(1 - (u - 0.15) / 0.85, 1.5)
      pc.el.setAttribute('cx', pc.x.toFixed(1))
      pc.el.setAttribute('cy', pc.y.toFixed(1))
      pc.el.setAttribute('r', (pc.r * (1 - 0.5 * u)).toFixed(1))
      pc.el.setAttribute('opacity', fd.toFixed(3))
    }
  }

  let rafId = 0
  const loop = (): void => {
    render(performance.now())
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)

  return {
    setMood,
    blink,
    bounce,
    burst,
    setGaze(nx: number, ny: number): void {
      st.lookTx = clamp(nx, -1, 1) * 7
      st.lookTy = clamp(ny, -1, 1) * 5
    },
    destroy(): void {
      cancelAnimationFrame(rafId)
      svg.remove()
    },
  }
}

// ---------------------------------------------------------------------------
// 宠物组件
// ---------------------------------------------------------------------------

interface MochiProps {
  settings: MochiSettings
}

const SIZE = 68

function Mochi({ settings }: MochiProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<MochiEngine | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)
  const autoRef = useRef(true)
  const lastMoodRef = useRef<string | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    let x = 0
    let y = 0
    try {
      x = Number.parseFloat(localStorage.getItem('zenwit-plugin-mochi-x') ?? '') || 0
      y = Number.parseFloat(localStorage.getItem('zenwit-plugin-mochi-y') ?? '') || 0
    } catch {
      // ignore
    }
    const defX = window.innerWidth - SIZE - 20
    const defY = window.innerHeight - SIZE - 20
    return { x: x || defX, y: y || defY }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [bubbleText, setBubbleText] = useState('')
  const [bubbleFade, setBubbleFade] = useState(false)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (bodyEl === null) return

    const engine = createMochi(bodyEl)
    engineRef.current = engine

    const onMove = (e: PointerEvent): void => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)
      engine.setGaze(nx, ny)
    }
    const onLeave = (): void => engine.setGaze(0, 0)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)

    const clearBubbleTimer = (): void => {
      if (bubbleTimerRef.current !== null) {
        clearTimeout(bubbleTimerRef.current)
        bubbleTimerRef.current = null
      }
    }

    const poll = async (): Promise<void> => {
      try {
        const s = await readState()
        const eng = engineRef.current
        if (eng === null) return
        if (!autoRef.current) {
          setBubbleText('')
          setBubbleFade(false)
          clearBubbleTimer()
          lastMoodRef.current = null
          return
        }
        eng.setMood(s.mood)
        if (s.mood === 'done' && lastMoodRef.current !== 'done') {
          eng.burst(26)
        }
        const prevMood = lastMoodRef.current
        lastMoodRef.current = s.mood

        const mode = settingsRef.current.bubbleMode
        let text = ''
        if (mode !== 'off' && s.mood !== 'idle') {
          text = mode === 'simple' ? s.label : s.step || s.label
        }
        setBubbleText(text)

        if (s.mood !== prevMood) {
          clearBubbleTimer()
          if (s.mood === 'done' && text !== '') {
            bubbleTimerRef.current = setTimeout(() => {
              setBubbleFade(true)
              bubbleTimerRef.current = setTimeout(() => {
                setBubbleText('')
                setBubbleFade(false)
                bubbleTimerRef.current = null
              }, 400)
            }, 3200)
          } else {
            setBubbleFade(false)
          }
        }
      } catch {
        // RPC 失败静默忽略，下一次轮询重试
      }
    }

    void poll()
    const pollTimer = setInterval(() => { void poll() }, 350)

    return () => {
      clearInterval(pollTimer)
      clearBubbleTimer()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(false)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
      moved: false,
    }
    const onMove = (ev: PointerEvent): void => {
      const d = dragRef.current
      if (d === null) return
      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY
      if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true
      if (d.moved) {
        const nx = d.baseX + dx
        const ny = d.baseY + dy
        const root = rootRef.current
        if (root !== null) {
          root.style.left = `${nx}px`
          root.style.top = `${ny}px`
        }
      }
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const d = dragRef.current
      dragRef.current = null
      if (d === null || !d.moved) {
        const engine = engineRef.current
        if (engine !== null) {
          engine.bounce()
          engine.blink()
          const moods = ['happy', 'surprised', 'shy']
          if (Math.random() < 0.5) {
            engine.setMood(moods[(Math.random() * moods.length) | 0] ?? 'happy')
          } else {
            engine.burst(18)
          }
        }
      } else {
        const root = rootRef.current
        if (root !== null) {
          const nx = Number.parseFloat(root.style.left) || pos.x
          const ny = Number.parseFloat(root.style.top) || pos.y
          setPos({ x: nx, y: ny })
        }
        try {
          localStorage.setItem('zenwit-plugin-mochi-x', String(Math.round(Number.parseFloat(rootRef.current?.style.left ?? '') || pos.x)))
          localStorage.setItem('zenwit-plugin-mochi-y', String(Math.round(Number.parseFloat(rootRef.current?.style.top ?? '') || pos.y)))
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(true)
  }

  const pickMood = (id: string): void => {
    engineRef.current?.setMood(id)
    autoRef.current = false
    setAuto(false)
    setBubbleText('')
    setBubbleFade(false)
    lastMoodRef.current = null
    setMenuOpen(false)
  }

  const toggleAuto = (): void => {
    autoRef.current = !autoRef.current
    setAuto(autoRef.current)
    if (autoRef.current) {
      lastMoodRef.current = null
    } else {
      setBubbleText('')
      setBubbleFade(false)
    }
    setMenuOpen(false)
  }

  const closeMochi = (): void => {
    updateSettings({ enabled: false })
    setMenuOpen(false)
  }

  const resetPos = (): void => {
    const defX = window.innerWidth - SIZE - 20
    const defY = window.innerHeight - SIZE - 20
    setPos({ x: defX, y: defY })
    if (rootRef.current !== null) {
      rootRef.current.style.left = `${defX}px`
      rootRef.current.style.top = `${defY}px`
    }
    setMenuOpen(false)
    try {
      localStorage.removeItem('zenwit-plugin-mochi-x')
      localStorage.removeItem('zenwit-plugin-mochi-y')
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${SIZE}px`,
        height: `${SIZE}px`,
        zIndex: 2147483000,
        pointerEvents: 'auto',
        cursor: 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      {bubbleText !== '' && (
        <div className={`zenwit-plugin-mochi-bubble${bubbleFade ? ' zenwit-plugin-mochi-bubble-fade' : ''}`}>{bubbleText}</div>
      )}
      <div ref={bodyRef} style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.18))' }} />
      {menuOpen && (
        <div
          className="zenwit-plugin-mochi-menu"
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <button type="button" className="zenwit-plugin-mochi-menu-item" onClick={toggleAuto}>
            {auto ? '✓ 自动跟随状态' : '自动跟随状态（关）'}
          </button>
          <div className="zenwit-plugin-mochi-sep" />
          {MOODS.map((m) => (
            <button key={m.id} type="button" className="zenwit-plugin-mochi-menu-item" onClick={() => pickMood(m.id)}>
              <span className="zenwit-plugin-mochi-dot" style={{ background: m.color }} />
              {m.name}
            </button>
          ))}
          <div className="zenwit-plugin-mochi-sep" />
          <button type="button" className="zenwit-plugin-mochi-menu-item" onClick={resetPos}>复位位置</button>
          <button type="button" className="zenwit-plugin-mochi-menu-item zenwit-plugin-mochi-menu-item-danger" onClick={closeMochi}>关闭宠物</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 挂载点
// ---------------------------------------------------------------------------

function MochiRoot(): React.ReactElement | null {
  const settings = useSettings()
  if (!settings.enabled) return null
  return <Mochi settings={settings} />
}

function MochiSettingsRow(): React.ReactElement {
  const settings = useSettings()
  const modes: Array<{ id: MochiSettings['bubbleMode']; label: string }> = [
    { id: 'detail', label: '详细' },
    { id: 'simple', label: '简略' },
    { id: 'off', label: '关闭' },
  ]

  return (
    <div className="zenwit-plugin-mochi-setting">
      <div className="zenwit-plugin-mochi-setting-row">
        <span className="zenwit-plugin-mochi-setting-label">Mochi 创作伙伴</span>
        <button
          type="button"
          className={`zenwit-plugin-mochi-toggle${settings.enabled ? ' zenwit-plugin-mochi-toggle-on' : ''}`}
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => updateSettings({ enabled: !settings.enabled })}
        >
          <span className="zenwit-plugin-mochi-toggle-knob" />
        </button>
      </div>
      <div className="zenwit-plugin-mochi-setting-row">
        <span className="zenwit-plugin-mochi-setting-label">创作进度气泡</span>
        <div className="zenwit-plugin-mochi-mode">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`zenwit-plugin-mochi-mode-item${settings.bubbleMode === m.id ? ' zenwit-plugin-mochi-mode-item-active' : ''}`}
              onClick={() => updateSettings({ bubbleMode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  // These runtime slots are present in every supported desktop build,
  // while their declaration modules vary across upstream rc releases.
  const slots = ctx.slots as unknown as MochiSlots
  // 样式：styles 由构建工具内联，见 tsdown.config.ts / styles.ts
  const styleTag = document.createElement('style')
  styleTag.dataset.plugin = 'zenwit-plugin-mochi'
  styleTag.textContent = styles
  document.head.append(styleTag)

  ctx.effect(() => () => { styleTag.remove() }, 'zenwit-plugin-mochi: styles')

  slots.inject('shell.overlay', () =>
    slots.register(
      { name: 'shell.overlay', id: 'zenwit-plugin-mochi', order: 100 },
      () => <MochiRoot />,
    ),
  )

  slots.inject('settings.general.item', () =>
    slots.register(
      { name: 'settings.general.item', id: 'zenwit-plugin-mochi', order: 30 },
      () => <MochiSettingsRow />,
    ),
  )
}
