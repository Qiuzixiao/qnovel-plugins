# Zenwit Plugins

Zenwit 插件源码仓库。这里存放插件的源代码、构建配置、说明文档和发布所需的 npm 包元数据。

## 仓库和市场的关系

这个 GitHub 仓库是“插件源码仓库”；
一个插件的发布链路是：

```text
GitHub qnovel-plugins
        │  保存源代码、文档和版本变更
        ▼
npm qiuzixiao 发布的插件包
        │  Zenwit 桌面端安装实际使用的包
        ▼
插件市场的目录卡片
        │  展示插件信息，并指向精确的 npm 包和版本
        ▼
用户确认安装
```

因此：

- GitHub 保存“怎么开发和维护插件”；
- npm 保存“用户可以安装的构建产物”；
- Market 的目录服务保存“市场里展示哪些插件以及它们的名称、描述、版本和仓库链接”。

当前第一步只初始化插件源码仓库。Market 的目录 manifest 和 `/v1/plugins` 服务属于后续接入工作，不放入插件包本身，也不会让远程目录下发可执行代码。

## 目录结构

```text
qnovel-plugins/
├── packages/                 # 每个目录都是一个独立的 npm/Zenwit 插件包
│   └── zenwit-plugin-mochi/         # 当前已有的桌面创作伙伴插件
│       ├── package.json      # npm 身份、版本与宿主声明
│       ├── README.md         # 插件功能、结构和安装说明
│       ├── cordis.patch.yml  # Host 插件注册层
│       ├── src/              # Host 和 Client 源代码
│       ├── scripts/          # 构建辅助脚本
│       └── tsconfig*.json    # TypeScript 配置
├── package.json              # 仓库级 workspace 配置
├── README.md
└── .gitignore
```

### 为什么使用 `packages/`

`packages/` 只是一个清晰的容器名，表示“这个仓库里有多个可以独立发布的包”。它不是运行时规定的插件目录，也不是用户安装后的运行目录。

这样组织后，新增插件只需要新增一个目录：

```text
packages/
├── zenwit-plugin-mochi/
├── zenwit-plugin-screenplay/
└── another-plugin/
```

每个插件都有自己的 `package.json`、版本号、README 和构建产物。以后如果只有一个插件，直接放在仓库根目录也能工作；这里采用 `packages/` 是为了让这个“插件集合”以后可以继续放多个插件，并保持每个插件的 npm 发布边界清楚。

## 当前插件

- [`packages/zenwit-plugin-mochi`](packages/zenwit-plugin-mochi/)：Mochi 桌面创作伙伴插件。

## 添加一个新插件

1. 在 `packages/` 下创建一个新的插件目录。
2. 在该目录创建独立的 `package.json`，其中的 `name` 必须是最终发布到 npm 的包名，且必须符合 [包命名规范](./CONTRIBUTING.md#包命名规范市场硬要求)：`zenwit-plugin-<用途>`。
3. 添加插件所需的 Host/Client 代码、`cordis.patch.yml`、构建配置和 README。
4. 在插件自己的 `package.json` 中声明清单字段（`dsh.client`、`dsh.bundle`）、`files`、`repository` 和 `homepage`。
5. 在根 README 的“当前插件”中增加入口。
6. 发布新版本时，只修改该插件自己的版本号；不要把所有插件绑成一个 npm 包。

## 本地开发

仓库使用 Yarn workspace 管理多个插件。常用命令如下：

```bash
corepack yarn install
corepack yarn workspace zenwit-plugin-mochi build
corepack yarn workspace zenwit-plugin-mochi typecheck
```

## 发布到 npm

GitHub 仓库和 npm 是两个位置，二者都需要保留：GitHub 用来协作和提供源码链接，npm 用来提供用户实际安装的包。

进入具体插件目录发布，不发布仓库根目录：

```bash
cd packages/zenwit-plugin-mochi
corepack yarn build
npm pack --dry-run
npm publish --access public
```

发布前确认：

- 插件自己的 `package.json` 版本号已更新；
- `repository.directory` 和 `homepage` 指向当前 GitHub 子目录；
- `files` 只包含构建后的 `lib/`、`cordis.patch.yml`、README 和许可证；
- 发布成功后，再把对应的精确 npm 版本写入 Zenwit 插件市场的目录数据。
