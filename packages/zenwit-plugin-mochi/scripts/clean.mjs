import { rm } from 'node:fs/promises'

// 构建前清理上一次产物（lib 目录）
await rm(new URL('../lib', import.meta.url), { recursive: true, force: true })
