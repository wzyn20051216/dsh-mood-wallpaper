# dsh-mood-wallpaper 🌌

**DSH（DeepSeek Harness）壁纸感知的动态壁纸引擎** —— 一个会"读懂"你的壁纸、随 agent 状态起舞的状态机。

> 导入你自己的动态壁纸（GIF / MP4 / WebM / APNG / SVG），插件在**后台分析**它（取帧 → 主色调 / 亮度 / 饱和度 / 动态能量），然后状态机在不同状态切换不同强度的**自适应动效**——空闲时壁纸本身也保持动态，绝不死板。

| 🖼️ 导入动态壁纸 | 🧠 后台分析 | 🎞️ 状态机动效 | ⚡ 全自动适配 |
|---|---|---|---|

## 它是怎么工作的

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
        壁纸自身动画         光带+粒子+加速KenBurns      光环+闪光+粒子爆散
        +慢速KenBurns        +暗角脉冲（按亮度自适应）     （一次性，按壁纸色板）
        +氛围呼吸光
```

- **思考中（thinking）**：壁纸色块加速涌动、光带扫过、粒子流、Ken Burns 加速、暗角脉冲——强度由分析出的**亮度**自适应（暗壁纸 → 更强光效）。
- **思考完成（done）**：按壁纸**主色调**渲染的光环扩散 + 闪光 + 粒子爆散，一次绽放后归于平静。
- **空闲（idle）**：壁纸本体持续动态（GIF/视频/SVG 动画）+ 慢速 Ken Burns + 色板氛围呼吸光——静态图也能"活"起来。
- **动作模式**：分析出的**动态能量**决定叠加动效的克制程度——壁纸本身很"动"（高 motion）时叠加动效自动收敛（calm），壁纸静止（低 motion）时叠加动效更活泼（lively）。

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
- **壁纸列表**：点击即应用；用户导入的壁纸带「导入」标记，可删除
- **后台分析**：首次应用自动分析（浏览器后台完成，`ImageDecoder` 取帧；无 `ImageDecoder` 时回退首帧），结果缓存到 localStorage 并在设置页展示「亮度 / 饱和度 / 动感 / 动作模式」，可手动「重新分析」
- **叠加风格**：`自动（随壁纸分析）` 或手动色板（极光 / 熔岩 / 深空 / 黑白）
- **动效强度**：舒缓 / 标准 / 强劲
- **Ken Burns**：壁纸慢速缩放平移（静态图也能"动"）；**完成动效**：思考结束时的绽放开关
- **背景透明化**：背景/面板透明度滑杆（壁纸可见度）

内置 3 张程序化动态壁纸（SMIL 动画 SVG，随仓库分发，MIT 许可）：

| aurora.svg | nebula.svg | waves.svg |
|---|---|---|
| 极光流动 + 星野闪烁 | 旋转星云 + 漂浮粒子 | 流动光波 + 光点 |

> 想用动漫壁纸？直接「导入壁纸」选你收藏的 GIF/视频即可；也可以把喜欢的静态图放进来，Ken Burns 会让它动起来。

## 兼容性

- 纯原生 DSH 插件（`dsh.bundle` + `dsh.client` 双面插件），无注入、不改安装包、不因 DSH 更新失效
- 壁纸层独立 `<div>`（`z-index:-1`）+ 私有 `<style>`，类前缀 `dswm-`，不触碰其他插件 DOM
- 主题覆盖走 `ctx.theme.overrideTokens`（source: `dsh-mood-wallpaper`）分层合成，与壁纸轮换/换肤插件共存
- 会话观察走 `ctx.sessions`（官方服务），切换会话自动重新订阅；状态输入来自官方 `ConversationSnapshot`
- 尊重 `prefers-reduced-motion`

## 结构

```
dsh-mood-wallpaper/
├── package.json     # dsh.bundle + dsh.client 声明
├── cordis.patch.yml # bundle 组合补丁（插入 mood-wallpaper 入口）
├── assets/          # 内置程序化动态壁纸（aurora / nebula / waves，SMIL SVG）
└── lib/
    ├── index.js     # host 半边：壁纸资产托管路由（list / asset / import / delete / config）
    └── client.js    # 浏览器半边：后台分析 + 自适应状态机 + 粒子引擎 + 设置页
```

## 冒烟测试（本项目自带验证记录）

- API：`/list`（内置+导入清单）、`/asset`（MIME 正确、路径穿越拦截 400）、`/import`→`/delete` 往返、`/config` 往返 全部通过
- 浏览器 E2E（agent-browser + 本地 mock LLM）：壁纸层挂载、设置分节渲染、分析结果展示、**真实发送消息后状态机按 idle → thinking → done → idle 切换** ✅

## License

MIT
