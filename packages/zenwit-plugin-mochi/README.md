# Mochi

常驻工作区的创作伙伴。跟随你的写作节奏变换表情，用头顶气泡提示当前进度；可以拖到任意位置，右键就能换状态。

## 能做什么

- 提问时进入「思考」，执行时进入「工作」，完成时庆祝，出错时提醒；
- 气泡实时显示正在进行的步骤：读取资料、整理设定、生成内容……
- 单击互动，右键切换心情、开关自动跟随、复位位置或暂时收起；
- 位置自动记忆；「设置 → 通用」里可以调整气泡的显示方式。

## 安装

在插件市场搜索 **Mochi** 安装，重启后它出现在工作区右下角。

## 兼容性

| 插件版本 | 适用运行时 |
| --- | --- |
| 0.1.1 及以后 | 当前桌面端（宿主 0.1.5-rc.1，React 18） |
| 0.1.0 | 旧版宿主（0.1.0-rc.7），不再维护 |

## 开发

```bash
corepack yarn workspace zenwit-plugin-mochi build
corepack yarn workspace zenwit-plugin-mochi typecheck
```

构建产物在 `lib/`：Host 半把工作状态同步给界面，Client 半负责渲染；两者如何被加载由 `package.json` 里的宿主声明决定。

### 本地试用未发布版本

```bash
corepack yarn workspace zenwit-plugin-mochi check
cd packages/zenwit-plugin-mochi
corepack yarn pack --out /tmp/zenwit-plugin-mochi-0.1.1.tgz
# 用应用自带的插件管理命令安装到 desktop 预设
<应用的插件管理命令> --profile desktop add /tmp/zenwit-plugin-mochi-0.1.1.tgz
```

重启应用后生效；卸载把 `add` 换成 `remove zenwit-plugin-mochi`。

## 发布

先构建检查，再发布，最后在插件市场后台登记版本：

```bash
corepack yarn workspace zenwit-plugin-mochi check
cd packages/zenwit-plugin-mochi
npm publish
```

## License

MIT
