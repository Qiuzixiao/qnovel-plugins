import { defineConfig } from 'tsdown'

export default defineConfig({
  // Host 端：ES module，供 Host 进程通过 Node 加载。预设文件随包发布，不参与打包。
  name: 'qnovel-screenplay',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
