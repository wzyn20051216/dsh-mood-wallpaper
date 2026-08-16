<div align="center">

# dsh-mood-wallpaper 🌌

**DSH（DeepSeek Harness）壁纸感知的动态壁纸引擎** —— 会"读懂"你的壁纸、随 agent 状态起舞的状态机 + 一串程序员向特效。

[![version](https://img.shields.io/github/v/tag/wzyn20051216/dsh-mood-wallpaper?color=4f83f2&label=version)](https://github.com/wzyn20051216/dsh-mood-wallpaper/releases)
[![license](https://img.shields.io/github/license/wzyn20051216/dsh-mood-wallpaper?color=34d399)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-blueviolet)](https://github.com/deepseek-ai/deepseek-harness)
[![node](https://img.shields.io/badge/node-%3E%3D18-6d9af6)](package.json)

> 导入你自己的动态壁纸（GIF / MP4 / WebM / APNG / SVG / 静态图），插件在**后台分析**它（取帧 → 主色调 / 亮度 / 饱和度 / 动态能量），状态机在「空闲 / 思考中 / 完成」间切换**自适应动效**——空闲时壁纸本身也保持动态，绝不死板。

</div>

---

## 🎬 效果演示

<video src="docs/demo.mp4" controls width="100%"></video>

> 录制自真实运行：深海鲸语场景皮肤 → 发消息 → 鲸鱼随思考潜游、完成时跃出水面 → HUD 拖动 → 记忆抽屉四页签切换。

---

## ✨ 特性一览

| 类别 | 能力 |
|---|---|
| 🖼️ **壁纸** | 导入动态壁纸（GIF/视频/APNG/SVG/静态，≤48MB）+ **自定义壁纸文件夹**（任意目录，壁纸放非系统盘不占 C 盘）+ 3 张内置程序化动态壁纸 + 4 张 **WebGL 实时着色器壁纸**（极光/熔岩/星云/深海） |
| 🐋 **鲸鱼巡游** | 一只鲸鱼在壁纸里巡游：空闲慢游、思考加速潜游、**完成时跃出水面**；点击它会有互动回应（原创彩蛋） |
| 🧠 **后台分析** | ImageDecoder 取帧 → 主色调 / 亮度 / 饱和度 / 动态能量 → **自适应风格**（色板染色 + lively/balanced/calm 动作模式） |
| 🎞️ **状态机** | 空闲（壁纸自身动画 + Ken Burns + 氛围光）→ 思考中（粒子汇聚 + 工具节点 + 光带 + 加速）→ 完成（光环绽放 + 粒子爆散） |
| 🎨 **场景皮肤** | 深海鲸语 / 极光夜航 / 熔岩引擎 / 静默极简 —— 一键应用「壁纸 + 风格 + 特效 + 通透度」组合 |
| 🪟 **玻璃材质** | 透明玻璃化：更通透的背景 + 高光质感 |
| ⌨️ **敲击能量场** | 敲键盘泛起能量火花，节奏随输入密度增强 |
| 🌧️ **会思考的代码雨** | 字符取自**真实对话 token**，思考时雨势暴涨 |
| 📺 **CRT 终端美学** | 扫描线 + 暗角 + 闪烁，一键复古终端 |
| 🌗 **昼夜循环** | 按本地时间自动染色（晨/昼/暮/夜） |
| 🖱️ **鼠标视差/尾迹** | 光层随鼠标微移 + 指针粒子流 |
| 🎹 **键盘乐章** | 敲击即五声音阶合成器（默认关） |
| 🎧 **环境音** | WebAudio 纯合成雨声 + 低音垫，思考时渐强、完成一声提示（默认关） |
| 🚨 **警报氛围** | LLM 失败/工具报错 → 红色警报脉冲；等待批准 → 琥珀待命光（自动恢复） |
| 📊 **token 速率驱动** | 思考时粒子密度随真实 token 流速自适应（最高 2×） |
| 🔋 **性能治理** | 页面不可见暂停全部动画/音频；`prefers-reduced-motion` 自动降级 |

## 🚀 安装（一条命令）

```powershell
# 一键脚本（推荐）：GitHub 直装两个插件（本插件 + dsh-ui-hud），免 npm
irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex

# 或手动 GitHub 直装（无需 npm）
dsh plugin --profile web add github:wzyn20051216/dsh-mood-wallpaper
dsh plugin --profile web add github:wzyn20051216/dsh-ui-hud

# 或本地源码调试（改源码后重启 dsh web 生效）
dsh plugin --profile web add <本仓库路径>
```

安装后**重启 `dsh web`** 生效。卸载：

```bash
dsh plugin --profile web remove dsh-mood-wallpaper
```

## 📖 功能使用指南

打开 **设置 → 状态壁纸 · Mood**，所有功能都在这里配置：

### 🖼️ 壁纸怎么换

- **点击即用**：壁纸列表里点任意一张立刻应用（内置 SVG / WebGL 着色器 / 你导入的 / 文件夹里的）
- **导入你自己的**：点「导入壁纸」选择本地 GIF/MP4/WebM/APNG/SVG/静态图（≤48MB），导入的壁纸可删除
- **壁纸文件夹**：填一个本地目录（如 `E:\wallpapers`），目录里所有图片/GIF/视频**自动出现**在列表（带「文件夹」徽标）——大量壁纸建议放非系统盘，不占 C 盘；点「应用」保存
- **WebGL 着色器壁纸**：极光/熔岩/星云/深海 四张实时渲染壁纸（60fps 零依赖），GPU 不可用时自动降级静态渐变

### 🧠 后台分析是什么

首次应用壁纸自动分析（浏览器后台，`ImageDecoder` 取帧）：提取**主色调、亮度、饱和度、动态能量**。分析结果决定：
- **叠加风格**（自动模式）：色板染色 + 动作模式（暗壁纸→更强光效；高动态壁纸→叠加动效收敛）
- 设置页顶部实时显示「亮度/饱和度/动感/动作模式」数值，可点「重新分析」

### 🎞️ 状态机怎么玩

发一条消息，看壁纸的反应：
- **思考中**：粒子向"思维核心"汇聚、光带扫过、工具调用浮现图标节点、代码雨加速、**鲸鱼潜游**、Ken Burns 加速、暗角脉冲
- **完成**：按壁纸主色调的光环扩散 + 粒子爆散 + **鲸鱼跃出水面**
- **空闲**：壁纸自身动态（GIF/视频/着色器）+ 慢速 Ken Burns + 氛围呼吸光

### 🎨 场景皮肤（一键换风格）

| 皮肤 | 组合 |
|---|---|
| 深海鲸语 | 深海着色器 + 玻璃材质 + 鲸鱼 + 高通透 |
| 极光夜航 | 极光着色器 + 代码雨 + 昼夜循环 |
| 熔岩引擎 | 熔岩着色器 + CRT 复古 + 熔岩色板 |
| 静默极简 | 静态壁纸 + 黑白 + 全部特效收敛（专注模式） |

### 🎛️ 11 项特效开关（特效与氛围卡片）

敲击能量场 / 思维投影 / 会思考的代码雨 / CRT 终端美学 / 昼夜循环 / 鼠标视差 / 鼠标尾迹 / 键盘乐章 / 环境音 / 警报氛围 / 鲸鱼巡游 —— 全部独立开关，可自由组合。

### 🪟 玻璃材质

开启后背景更通透、带高光质感（适合配深海/极光等深色壁纸）。

### 🎚️ 背景透明化

- **背景透明度**：越低壁纸越明显（默认 70%）
- **面板透明度**：侧栏/卡片的不透明度（默认 85%）

## 🖼️ 内置壁纸与开源致谢

内置 3 张程序化动态壁纸（自绘 SMIL 动画 SVG）与 4 张 WebGL 着色器壁纸（自研 GLSL）**均为本项目原创**，MIT 许可。

「自定义壁纸文件夹」示例壁纸来自开源项目 [JoshuaThadi/Wall-E-Desk](https://github.com/JoshuaThadi/Wall-E-Desk)（GitHub 直链下载，仅供个人使用；商用请注意各素材授权）。想用更多壁纸：往文件夹里丢 GIF/MP4 即可自动出现。

## 🏗️ 工作原理

```
        导入/内置动态壁纸（GIF·视频·SVG·静态图）
                    │
                    ▼
   后台分析（ImageDecoder 取帧 → 主色调/亮度/饱和度/动态能量）
                    │
                    ▼
   自适应风格（色板染色 + 动作模式 lively / balanced / calm）
                    │
                    ▼
   状态机  idle ──思考开始──▶ thinking ──思考结束──▶ done ──1.7s──▶ idle
            │                    │                     │
        壁纸自身动画         光带+粒子汇聚+工具节点      光环+闪光+粒子爆散
        +慢速KenBurns        +暗角脉冲（按亮度自适应）     （一次性，按壁纸色板）
        +氛围呼吸光
```

状态输入来自官方 `ConversationSnapshot`（partial / runningCalls / turnTimings / openState / nodes / pending），订阅走 `ctx.sessions` 官方服务；特效数据全部来自官方投影服务，**不抓取 DOM、不注入、不改安装包**。

## 📦 结构

```
dsh-mood-wallpaper/
├── package.json     # dsh.bundle + dsh.client 声明
├── cordis.patch.yml # bundle 组合补丁（插入 mood-wallpaper 入口）
├── install.ps1      # 一键安装脚本（GitHub 直装两个插件）
├── assets/          # 内置程序化动态壁纸（aurora / nebula / waves，SMIL SVG）
├── docs/            # 演示视频与截图
└── lib/
    ├── index.js     # host 半边：壁纸资产托管路由（list / asset / import / delete / config）
    └── client.js    # 浏览器半边：后台分析 + 状态机 + WebGL 着色器 + 粒子引擎 + 特效 + 设置页
```

## 🔌 兼容性

- 纯原生 DSH 插件（`dsh.bundle` + `dsh.client` 双面插件），加载方式与官方 UI 包一致
- 壁纸层独立 `<div>`（`z-index:-1`）+ 私有 `<style>`（类前缀 `dswm-`），不触碰其他插件 DOM
- 主题覆盖走 `ctx.theme.overrideTokens` 分层合成，与其它插件共存
- 与 [dsh-ui-hud](https://github.com/wzyn20051216/dsh-ui-hud)（状态 HUD + 记忆中心）配合效果最佳——壁纸分析出的强调色会通过「情绪联动」染色 HUD
- 支持 DSH 0.1.0-rc.6，Node ≥ 18

## ❓ 常见问题

**Q：壁纸不显示？** 检查「背景透明化」——背景透明度太高会盖住壁纸，调低即可；或确认未启用"减少动态效果"系统设置。

**Q：导入的 GIF/视频不动？** 动态壁纸会持续播放；静态图也会通过 Ken Burns 缓慢缩放平移"活"起来。

**Q：WebGL 壁纸黑屏？** 低端 GPU/远程桌面可能着色器编译失败，会自动降级为静态渐变；也可在设置里选内置 SVG 壁纸。

**Q：和壁纸轮换插件冲突吗？** 功能重叠（都是背景层），建议二选一——本插件功能更全（状态驱动 + 分析 + 特效）。

## 🧪 冒烟测试

- API：list / asset（MIME、路径穿越拦截、nosniff）/ import（魔数校验）↔ delete / config 全部通过
- 浏览器 E2E（agent-browser + mock LLM）：状态机 `idle → thinking → done → idle` 复验通过；文件夹壁纸应用、场景皮肤一键组合、鲸鱼互动、HUD 拖动均实测通过

## 🤝 贡献

欢迎 PR！开发提示：改 `lib/` 后重启 `dsh web` 生效；`node --check lib/client.js` 做语法校验。

## 📄 License

[MIT](LICENSE)
