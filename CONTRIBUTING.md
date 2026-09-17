# 贡献 Zenwit 插件

## 包命名规范（市场硬要求）

进插件市场的插件，npm 包名必须是 **`zenwit-plugin-<用途>`**：

- 前缀 `zenwit-plugin-` 不可省略；全小写、kebab-case；
- `<用途>` 用简短英文说明插件做什么：`zenwit-plugin-mochi`、`zenwit-plugin-screenplay`、`zenwit-plugin-writing-tools`；
- 目录名与 npm 包名一致：`packages/zenwit-plugin-<用途>/`；
- `package.json` 的 `name`、`cordis.patch.yml` 里的 row `name`、市场目录里的 `package.name` / `id` / `slug` 全部使用同一个值；
- 没有前缀的历史包名（如 `zenwit-plugin-mochi`）不再用于新插件。改名不能原地改，按「发新包 → 市场目录切到新包 → 老包 `npm deprecate`」的顺序做。

## 插件放在哪里

每个插件都放在仓库的 `packages/<plugin-package-name>/` 下，目录名与 npm 包名保持一致，方便从 GitHub 路径直接定位到插件源码。

例如：

```text
packages/zenwit-plugin-mochi/
packages/zenwit-plugin-writing-tools/
```

不要把多个插件的源码混在同一个 `src/` 目录，也不要把 `node_modules/` 或构建后的 `lib/` 提交进仓库。

## 一个插件必须包含什么

```text
<plugin>/
├── package.json
├── README.md
├── LICENSE
├── cordis.patch.yml
├── src/
│   ├── index.ts          # Host 入口
│   └── client/           # Client 入口和界面代码
├── scripts/
└── tsconfig*.json
```

`package.json` 是插件的正式身份文件，至少需要正确声明：

- npm `name` 和 `version`；
- `repository`、`repository.directory` 和 `homepage`；
- `main`、`types`、`exports` 和 `files`；
- 清单里的 `dsh.client` 注入点；
- 清单里的 `dsh.bundle.patch`；
- `build`、`typecheck` 和 `check` 脚本。

## 文档要求

插件 README 至少说明：

- 插件做什么；
- Host 和 Client 分别运行在哪里；
- 需要注入哪些宿主能力；
- 如何安装和重启生效；
- 用户可以看到和配置什么；
- 当前版本和兼容范围。

不要把 GitHub 地址当成安装命令，也不要在 README 中要求 Market 执行远程脚本。Market 展示目录信息，npm 提供实际安装包，插件代码仍然以本地包的方式运行。

## 版本和发布边界

每个插件独立维护版本号和 npm 发布记录。修改 `packages/zenwit-plugin-mochi` 时，不需要修改其他插件的版本号。插件发布到 npm 后，才把精确的 `package@version` 写入 Market 目录数据。
