# 插件仓库结构说明

## 这不是一个“把所有代码打成一个包”的仓库

`qnovel-plugins` 是一个 monorepo：一个 GitHub 仓库里放多个相互独立的 npm 包。根目录的 `package.json` 只负责 workspace 管理，真正发布的是 `packages/<plugin>/package.json`。

例如当前仓库中：

```text
GitHub 仓库：Qiuzixiao/qnovel-plugins
插件源码：packages/qnovel-mochi/src/
npm 包名：qnovel-mochi
Market 卡片：由目录 provider 返回 qnovel-mochi 的元数据
```

## 为什么不把插件代码直接放在 npm 里

npm 不是源码协作仓库。它保存的是发布后的包内容，DSH Desktop 安装时从 npm 获取它。GitHub 仍然需要保留完整源码、Issue、提交历史和插件 README，npm 包的 `repository` 字段再指回 GitHub。

## 为什么 Market 不直接读取 GitHub

DSH Community Market 的标准来源不是 GitHub 文件列表。它需要一个 HTTPS JSON 来源：

1. `catalog-source` manifest 描述来源；
2. 来源提供 `/v1/plugins` JSON 接口；
3. 接口返回插件名称、描述、版本、npm 包名和 GitHub 仓库链接；
4. Market Host 校验目录数据；
5. 用户确认后，受管安装流程才从 npm 安装精确版本。

因此，GitHub 仓库、npm 包和 Market 目录是三个不同的职责：

```text
GitHub 源码  ──发布──>  npm 安装包
     │                    │
     └──仓库链接──>  Market 目录卡片
```

本仓库第一阶段只负责 GitHub 源码和 npm 包的准备。下一阶段再为 QNovel 建立自己的目录数据和 `/v1/plugins` 服务，届时不需要改变插件的源码目录结构。
