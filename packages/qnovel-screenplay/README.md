# QNovel Screenplay

把「短剧创作」Agent 预设与整套技能安装进 DSH。装上之后，在预设选择器里选中它，Agent 就按短剧编剧的工作方式干活。

## 它做了什么

- 随包发布一个 **agent 预设**（`presets/short-drama/`）与 11 个技能：总纲·情绪账务引擎、立项选题、人物骨架、结构、分场、正文格式、改稿、钩子、交付、技能沉淀、文件组织；
- 附加新项目模板（创作合同 / 设定 / 人物 / 大纲 / 分集大纲 / 剧本 / 交付）与一个正文格式校验脚本；
- 插件激活时把这套预设安装到 `$DSH_HOME/.agent-presets/short-drama`，禁用或卸载时移除。

**为什么需要这段 Host 代码**：当前内核的 `@deepseek-ai/dsh-agent-presets` 只扫描固定位置（自带 root、行配置 `roots`、用户 root），没有「运行时注册预设」的 API。要让预设随 npm 包分发，只能在激活时把它落到用户 root。组合里全部是内核自带的插件行，没有第三方依赖，也没有服务行。

## 安装

```bash
# 经插件市场安装，或本地：
DSH_HOME="$HOME/.dsh" <dsh 可执行文件> plugin --profile desktop add <包或 tarball>
```

装完在预设选择器里选「短剧创作」。卸载后插件会把 `$DSH_HOME/.agent-presets/short-drama` 一并移除。

## 开发

```bash
corepack yarn workspace qnovel-screenplay check
```

预设内容在 `presets/short-drama/`（技能与模板是纯文件，改完直接生效）；组合由 `src/index.ts` 的 `composition()` 生成，路径按安装位置动态写入。

## License

MIT
