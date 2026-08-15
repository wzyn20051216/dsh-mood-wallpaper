# dsh-mood-wallpaper 🌌

**DSH（DeepSeek Harness）壁纸感知的动态壁纸引擎** —— 一个会"读懂"你的壁纸、随 agent 状态起舞的状态机，外加一堆让程序员眼前一亮的特效。

> 导入你自己的动态壁纸（GIF / MP4 / WebM / APNG / SVG），插件在**后台分析**它（取帧 → 主色调 / 亮度 / 饱和度 / 动态能量），然后状态机在不同状态切换不同强度的**自适应动效**——空闲时壁纸本身也保持动态，绝不死板。

| 🖼️ 导入动态壁纸 | 🧠 后台分析 | 🎞️ 状态机动效 | ⚡ 特效与氛围 |
|---|---|---|---|

## 核心机制

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

- **思考中（thinking）**：壁纸色块加速涌动、光带扫过、粒子向"思维核心"汇聚、工具调用浮现**图标节点**（🔍 检索 / 📁 文件 / ⌨️ 终端 / 🌐 网页…）、Ken Burns 加速、暗角脉冲——强度由分析出的**亮度**自适应。
- **思考完成（done）**：按壁纸**主色调**渲染的光环扩散 + 闪光 + 粒子爆散，每个工具节点也随之爆开。
- **空闲（idle）**：壁纸本体持续动态（GIF/视频/SVG 动画）+ 慢速 Ken Burns + 色板氛围呼吸光。
- **动作模式**：分析出的**动态能量**决定叠加动效的克制程度（lively / balanced / calm）。

## 特效与氛围（v3，程序员向）

| 特效 | 说明 |
|---|---|
| ⚡ **WebGL 着色器壁纸** | 3 个内置实时渲染壁纸（极光/熔岩/星云）：手写 raw GLSL 全屏着色器，**60fps 零依赖**，思考时流速自动加速；GPU 不可用时降级静态渐变 |
| ⌨️ **敲击能量场** | 每次敲键盘，壁纸泛起能量火花 + 波纹，节奏随输入密度增强——"写代码有仪式感" |
| 🧠 **思维投影** | 思考时粒子向核心汇聚成思维涡流；每个工具调用浮现带图标的节点（按工具名自动分类） |
| 🌧️ **会思考的代码雨** | 黑客帝国雨升级：字符取自**真实对话 token**，思考时雨速 ×2.4、浓度暴涨 |
| 📺 **CRT 终端美学** | 扫描线 + 暗角 + 轻微闪烁，一键复古终端观感 |
| 🌗 **昼夜循环** | 按本地时间自动染色（晨 / 昼 / 暮 / 夜），壁纸"会生活" |
| 🖱️ **鼠标视差/尾迹** | 光层随鼠标微移（景深）+ 指针拖出与壁纸主色联动的粒子流 |
| 🎹 **键盘乐章** | 敲击即五声音阶合成器（WebAudio，默认关） |
| 🚨 **警报氛围** | LLM 失败 / 工具报错 → 红色警报脉冲；等待批准/提问 → 琥珀色待命光（错误解除自动恢复） |
| 🎧 **环境音** | WebAudio **纯合成**雨声 + 低音垫（零素材版权）；思考时渐强、完成时一声清脆提示；首次用户手势后启动，默认关闭 |
| 📊 **token 速率驱动** | 思考时粒子密度随真实 token 流速自适应（最高 2×），AI 想得快、壁纸就越"兴奋" |
| 🔋 **性能治理** | 页面不可见自动暂停全部动画/音频；`prefers-reduced-motion` 自动降级；粒子数按强度自适应 |

## 安装

```bash
# 本地源码安装（改源码后重启 dsh web 生效）
dsh plugin --profile web add <本仓库路径>

# 或手动：把包放进 ~/.dsh/profiles/node_modules/，在 cordis.patch.yml 加一行
# - insert: [{ id: mood-wallpaper, name: dsh-mood-wallpaper }]
```

安装后**重启 `dsh web`** 生效。卸载：

```bash
dsh plugin --profile web remove dsh-mood-wallpaper
```

## 使用

重启后打开 **设置 → 状态壁纸 · Mood**：

- **导入壁纸**：上传 GIF / MP4 / WebM / APNG / SVG / 静态图（≤48MB），文件存于 `$DSH_HOME/dsh-mood-wallpaper/`，重启保留
- **壁纸列表**：点击即应用；用户导入的壁纸可删除
- **后台分析**：首次应用自动分析（`ImageDecoder` 取帧；无则回退首帧），结果缓存 localStorage，展示「亮度 / 饱和度 / 动感 / 动作模式」，可手动「重新分析」
- **状态机与动效**：叠加风格（自动/极光/熔岩/深空/黑白）、动效强度、Ken Burns、完成动效
- **特效与氛围**：敲击能量场 / 思维投影 / CRT / 昼夜循环 / 鼠标视差 / 环境音，全部独立开关
- **背景透明化**：背景/面板透明度滑杆（壁纸可见度）

内置 3 张程序化动态壁纸（SMIL 动画 SVG，随仓库分发，MIT 许可）：

| aurora.svg | nebula.svg | waves.svg |
|---|---|---|
| 极光流动 + 星野闪烁 | 旋转星云 + 漂浮粒子 | 流动光波 + 光点 |

## 兼容性

- 纯原生 DSH 插件（`dsh.bundle` + `dsh.client` 双面插件），无注入、不改安装包
- 壁纸层独立 `<div>`（`z-index:-1`）+ 私有 `<style>`，类前缀 `dswm-`，不触碰其他插件 DOM
- 主题覆盖走 `ctx.theme.overrideTokens` 分层合成，与壁纸轮换/换肤插件共存
- 会话观察走 `ctx.sessions`（官方服务）；状态输入来自官方 `ConversationSnapshot`（partial / runningCalls / turnTimings / openState）

## Roadmap（调研结论，下一版候选）

- **差异化收尾**：按 `turn/end` reason（completed / aborted / error / max-tokens）切换不同动效
- **错误警报层**：lastAgentError / tool-result.isError / model-retry 事件 → 红色警报脉冲 + 重试呼吸
- **交互等待光**：pending approval → 中心柔光等待环；queue 非空 → 边缘提示光
- **plan / goal 正交氛围**：plan 激活 → 深蓝专注；goal blocked → 低频暗脉冲
- **token 速率驱动**：`assistant/chunk` 滑动窗口 → 粒子密度 × 扫光速度
- **subagent 星群**：`subagentsByParent` 活跃子代理数 → 色板冷暖 / 分身光球

## 冒烟测试记录

- API：`/list` `/asset`（MIME、路径穿越拦截）`/import`→`/delete` `/config` 全部通过
- 浏览器 E2E（agent-browser + mock LLM）：壁纸层挂载、设置分节渲染、分析结果展示、**状态机 idle → thinking → done → idle 切换** ✅；透明度滑杆拖动 → UI 同步 + 持久化 + 主题覆盖生效 ✅

## 结构

```
dsh-mood-wallpaper/
├── package.json     # dsh.bundle + dsh.client 声明
├── cordis.patch.yml # bundle 组合补丁（插入 mood-wallpaper 入口）
├── assets/          # 内置程序化动态壁纸（aurora / nebula / waves，SMIL SVG）
└── lib/
    ├── index.js     # host 半边：壁纸资产托管路由（list / asset / import / delete / config）
    └── client.js    # 浏览器半边：后台分析 + 自适应状态机 + 粒子引擎 + 特效 + 设置页
```

## License

MIT
