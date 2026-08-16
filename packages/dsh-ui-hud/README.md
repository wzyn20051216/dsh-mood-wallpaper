<div align="center">

# dsh-ui-hud 🧠

**DSH（DeepSeek Harness）状态 HUD + 会话记忆中心** —— 填补生态空白的 UI 增强插件：VSCode 式**可拖动**状态栏 HUD + 四种记忆类型可视化面板。

[![version](https://img.shields.io/github/v/tag/wzyn20051216/dsh-ui-hud?color=4f83f2&label=version)](https://github.com/wzyn20051216/dsh-ui-hud/releases)
[![license](https://img.shields.io/github/license/wzyn20051216/dsh-ui-hud?color=34d399)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-blueviolet)](https://github.com/deepseek-ai/deepseek-harness)
[![node](https://img.shields.io/badge/node-%3E%3D18-6d9af6)](package.json)

> 底部悬浮状态栏，实时显示 agent 状态 / 模型 / token / 上下文压力 / 后台任务 / goal —— **按住可拖到任何位置**；右侧抽屉把会话记忆可视化为「情景 / 工作 / 语义 / 感知」四类面板。

</div>

---

## 🎬 效果演示

<video src="docs/demo.mp4" controls width="100%"></video>

> 录制自真实运行：HUD 拖动位置 → 记忆抽屉打开 → 情景/语义/感知页签切换（壁纸状态联动由 [dsh-mood-wallpaper](https://github.com/wzyn20051216/dsh-mood-wallpaper) 演示）。

---

## ✨ 特性一览

### 1️⃣ 状态栏 HUD（可拖动）

```
[● 思考中 12s] [DeepSeek-V4-Flash] [⚡ 12.4k] [▲ 128/s] [上下文 ▓▓▓░░ 62%] [⚙ 2 任务] [🎯 目标] [📖 记忆] [12:34]
```

- **状态 pill**：空闲 / 思考中（实时计时）/ 完成（脉冲动效）/ 错误 / 待命
- **当前模型**（assistant 节点 provenance）、**token 用量**（tokenUsage 投影）
- **▲ 实时吞吐**：思考时每秒 token 速率
- **上下文压力条**（contextPressure；>65% 黄、>85% 红）
- **后台任务数**（jobsBySession）、**goal 阶段**（goal 投影）
- **点击展开详情**：sessionStats（回合/步骤/LLM 耗时/工具耗时/首 token 延迟）+ **上下文雷达**（系统/工具/消息构成占比条）
- **按住拖动**：拖到任何位置，位置自动记忆；设置页可「重置位置」
- **自动隐藏**：鼠标移开淡出、悬停恢复（可关）
- **完成脉冲**：每次 agent 完成任务，HUD 泛起一次强调色柔光

### 2️⃣ 记忆中心 · Memory Hub（右侧抽屉）

| 页签 | 记忆类型 | 内容 |
|---|---|---|
| **情景** | Episodic | 会话时间线：用户/助手/工具调用/压缩/上下文注入/错误，可 **★ 固定** 重要条目 |
| **工作** | Working | 当前回合流式输出 + 固定的消息（localStorage 持久化，按会话隔离） |
| **语义** | Semantic | 上下文注入卡片（context 节点 + provenance 来源标签） |
| **感知** | Sensory | 会话中的图片附件墙 |
| 检索框 | — | 对当前会话关键词过滤 |
| 统计行 | — | 回合 / 步骤 / token / 上下文占用 |

- **鼠标离开抽屉自动收起**（移回则保持）；点 ✕ 或 Esc 或点击遮罩关闭

### 3️⃣ 情绪联动（跨插件）

监听 [dsh-mood-wallpaper](https://github.com/wzyn20051216/dsh-mood-wallpaper) 的壁纸分析广播：壁纸的主色调/强调色会实时染色 HUD 的状态点、压力条、页签指示条与抽屉头部——壁纸是什么氛围，HUD 就是什么颜色。

### 4️⃣ 快捷键 & 设置

- `Ctrl+Shift+H` 显示/隐藏 HUD · `Ctrl+Shift+M` 打开/关闭记忆抽屉 · `Esc` 关闭抽屉
- **设置 → 状态 HUD · Memory**：HUD 开关、自动隐藏、记忆抽屉开关、重置位置

## 🚀 安装（一条命令）

```powershell
# 一键脚本（推荐）：GitHub 直装两个插件（本插件 + dsh-mood-wallpaper），免 npm
irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex

# 或手动 GitHub 直装（无需 npm）
dsh plugin --profile web add github:wzyn20051216/dsh-ui-hud
dsh plugin --profile web add github:wzyn20051216/dsh-mood-wallpaper

# 或本地源码调试（改源码后重启 dsh web 生效）
dsh plugin --profile web add <本仓库路径>
```

安装后**重启 `dsh web`** 生效。卸载：

```bash
dsh plugin --profile web remove dsh-ui-hud
```

## 📖 功能使用指南

### 🖱️ HUD 拖动与定位

- **默认位置**：右下角（不遮挡 DSH 底部缓存命中等信息）
- **拖动**：按住 HUD 任意空白处拖到想要的位置，松手自动保存；下次打开仍是这个位置
- **重置**：设置 → 状态 HUD · Memory → 「重置位置」回到默认右下角

### 📊 上下文压力与雷达

- HUD 上的「上下文」进度条 = 投影估算的下一请求 token / 模型上下文窗口
- 点击 HUD 展开详情 → 底部是「上下文构成」占比条（系统/工具/消息），一眼看清上下文被什么占满

### 🧠 记忆中心怎么用

- 点 HUD 上的「📖 记忆」或按 `Ctrl+Shift+M` 打开抽屉
- **情景**页签看会话完整时间线；点任意条目的 **★** 固定到工作记忆（跨刷新保留，按会话隔离）
- **工作**页签 = 当前流式输出 + 你固定的内容
- **语义**页签 = 每次上下文注入的知识卡片（带来源）
- **感知**页签 = 会话中出现的图片
- 顶部检索框过滤当前页签内容

## 🏗️ 工作原理

```
        ctx.sessions（官方快照订阅）────────────────┐
        projections.faceOf('tokenUsage'/'contextPressure'  ├─→ 状态栏 HUD
                          /'contextBreakdown'/'sessionStats'/'goal')  │
        ctx.sessions.list（jobsBySession）───────────┘
                                                            │
        ConversationSnapshot.nodes ──→ 记忆中心抽屉         │
          （user/assistant/tool-result/context/compaction/  ├─→ 情景/语义/感知
            turn-error + partial + pending）                │    工作（+★固定）
                                                            ▼
        全部来自官方服务，无注入、无 DOM 抓取
```

## 📦 结构

```
dsh-ui-hud/
├── package.json     # dsh.bundle + dsh.client 声明
├── cordis.patch.yml # bundle 组合补丁（插入 ui-hud 入口）
├── docs/            # 演示视频与截图
└── lib/
    ├── index.js     # host 半边（空激活载体）
    └── client.js    # 浏览器半边：HUD + 拖拽 + 记忆抽屉 + 快捷键 + 设置页
```

## 🔌 兼容性

- 纯原生 DSH 插件（`dsh.bundle` + `dsh.client`）
- HUD/抽屉为私有 fixed 元素（类前缀 `dshhud-`，z-index 8000/9500 级，高于应用弹层确保可点）
- 数据全部来自**官方会话快照与投影服务**，随 DSH 更新稳定
- 与 [dsh-mood-wallpaper](https://github.com/wzyn20051216/dsh-mood-wallpaper) 等插件共存，支持 DSH 0.1.0-rc.6，Node ≥ 18

## ❓ 常见问题

**Q：HUD 和底部信息重叠？** 按住拖走即可；或设置 → 重置位置回右下角默认。

**Q：抽屉点 X 没反应？** 已修复：抽屉 z-index 提到应用弹层之上（9500），X 点击区域加大；也可用 Esc 或点遮罩关闭，鼠标移出抽屉自动收起。

**Q：固定记忆丢了？** ★ 固定内容存浏览器 localStorage（按会话隔离，上限 50 条）；换浏览器/清缓存会清空。

## 🧪 冒烟测试

- HUD 渲染/计时/时钟、拖动+位置持久化、详情面板、上下文雷达、记忆抽屉四页签+检索+★固定、快捷键、Esc 关闭、鼠标移出自动收起 —— 均实测通过

## 🤝 贡献

欢迎 PR！开发提示：改 `lib/` 后重启 `dsh web` 生效；`node --check lib/client.js` 做语法校验。

## 📄 License

[MIT](LICENSE)
