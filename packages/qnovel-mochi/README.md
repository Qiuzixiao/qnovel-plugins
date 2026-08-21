# QNovel Mochi

Mochi 是陪伴 QNovel 创作过程的桌面伙伴。它会停留在工作区角落，跟随当前创作状态切换表情，并用头顶气泡提示正在进行的步骤。

## 能做什么

- 创作开始时进入思考状态，执行步骤时进入忙碌状态；
- 完成时庆祝，发生异常时提示当前状态；
- 显示读取资料、整理设定、生成内容等过程提示；
- 可拖拽到任意位置，位置会自动记住；
- 单击互动，右键可切换心情、开关自动跟随、复位或暂时关闭；
- 在 QNovel 设置中调整创作进度气泡的显示方式。

## 安装

在 QNovel Plugin Market 搜索 **Mochi**，选择安装即可。安装完成后重启 QNovel，Mochi 会出现在右下角。

当前包名：

```text
qnovel-mochi
```

## 开发

```bash
corepack yarn workspace qnovel-mochi build
corepack yarn workspace qnovel-mochi typecheck
```

构建产物在 `lib/`。这个包包含 QNovel 所需的 Host 状态桥接和 Client 桌面组件；底层运行时声明保留在 `package.json`，以便 QNovel Desktop 加载它。

## 发布

发布前必须先构建和检查：

```bash
corepack yarn workspace qnovel-mochi check
cd packages/qnovel-mochi
npm publish
```

每次发布后，在 QNovel Plugin Market 后台新增对应版本，再将插件上架。

## License

MIT
