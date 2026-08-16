<div align="center">

# DSH Wallpaper & HUD 全家桶 🌌🧠

**DeepSeek Harness 美化与效率插件全家桶** —— 一个仓库，两个插件：

| 插件 | 定位 | 一句话 |
|---|---|---|
| 🌌 **dsh-mood-wallpaper** | 壁纸感知动态壁纸引擎 | 壁纸随 agent 状态起舞：后台分析、状态机动效、WebGL 着色器、鲸鱼巡游、场景皮肤 |
| 🧠 **dsh-ui-hud** | 状态 HUD + 记忆中心 | 可拖动状态栏（模型/token/上下文压力/实时吞吐）+ 四类记忆可视化面板 |

[![version](https://img.shields.io/github/v/tag/wzyn20051216/dsh-mood-wallpaper?color=4f83f2&label=version)](https://github.com/wzyn20051216/dsh-mood-wallpaper/releases)
[![license](https://img.shields.io/github/license/wzyn20051216/dsh-mood-wallpaper?color=34d399)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-blueviolet)](https://github.com/deepseek-ai/deepseek-harness)
[![node](https://img.shields.io/badge/node-%3E%3D18-6d9af6)](package.json)

</div>

---

## 🎬 效果演示

<video src="packages/dsh-mood-wallpaper/docs/demo.mp4" controls width="100%"></video>

> 录制自真实运行：深海鲸语场景皮肤 → 发消息 → 鲸鱼随思考潜游、完成时跃出水面 → HUD 拖动 → 记忆抽屉页签切换。

---

## 📦 仓库结构

```
dsh-mood-wallpaper/                    # 全家桶仓库（monorepo）
├── install.ps1                        # 一键安装两个插件
├── packages/
│   ├── dsh-mood-wallpaper/            # 🌌 壁纸引擎（自述见 packages/dsh-mood-wallpaper/README.md）
│   └── dsh-ui-hud/                    # 🧠 状态 HUD + 记忆中心（自述见 packages/dsh-ui-hud/README.md）
```

## 🚀 安装（一条命令装两个）

```powershell
# 一键脚本（推荐）：克隆仓库 + 装两个插件（link: 安装，改源码重启即生效）
irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex

# 或手动（等价的四条命令）
git clone --depth 1 https://github.com/wzyn20051216/dsh-mood-wallpaper $env:TEMP\dsh-mood-wallpaper-all
dsh plugin --profile web add "$env:TEMP\dsh-mood-wallpaper-all\packages\dsh-mood-wallpaper"
dsh plugin --profile web add "$env:TEMP\dsh-mood-wallpaper-all\packages\dsh-ui-hud"
```

安装后**重启 `dsh web`** 生效。卸载：

```bash
dsh plugin --profile web remove dsh-mood-wallpaper
dsh plugin --profile web remove dsh-ui-hud
```

> 无需 npm；`link:` 安装意味着升级 = 重新跑一遍脚本（或 `git -C $env:TEMP\dsh-mood-wallpaper-all pull` 后重启）。

---

## 🌌 插件一：dsh-mood-wallpaper（壁纸引擎）

导入动态壁纸（GIF/MP4/WebM/APNG/SVG）+ 后台分析（主色调/亮度/动态能量）+ 状态机（空闲/思考/完成）+ 11 项特效 + 4 张 WebGL 着色器壁纸 + 鲸鱼巡游彩蛋 + 场景皮肤 + 玻璃材质 + 自定义壁纸文件夹（非系统盘）。

> 完整功能与使用指南：[packages/dsh-mood-wallpaper/README.md](packages/dsh-mood-wallpaper/README.md)

**快速上手**：设置 → 状态壁纸 · Mood → 点一张「着色器 · 深海」→ 点场景皮肤「深海鲸语」→ 发条消息看鲸鱼潜游跃水。

## 🧠 插件二：dsh-ui-hud（状态 HUD + 记忆中心）

可拖动底部状态栏（状态/模型/token/▲实时吞吐/上下文压力/任务/goal，点击展开统计与上下文雷达）+ 记忆中心抽屉（情景/工作/语义/感知四类记忆，★固定、检索、按会话隔离）+ 跨插件情绪联动（跟随壁纸强调色）。

> 完整功能与使用指南：[packages/dsh-ui-hud/README.md](packages/dsh-ui-hud/README.md)

**快速上手**：右下角悬浮条 → 按住可拖到任意位置 → 点「📖 记忆」或 `Ctrl+Shift+M` 打开记忆抽屉 → 点抽屉外任意处收起。

## 🔗 跨插件联动

两个插件**天生互补**：壁纸引擎分析出的主色调/强调色会实时广播给 HUD——壁纸是什么氛围，状态栏就是什么颜色（情绪联动）。

## 🖼️ 壁纸与开源致谢

- 内置程序化动态壁纸与 WebGL 着色器壁纸**均为本项目原创**（MIT）
- 「壁纸文件夹」示例壁纸来自开源项目 [JoshuaThadi/Wall-E-Desk](https://github.com/JoshuaThadi/Wall-E-Desk)（GitHub 直链，仅供个人使用，商用注意授权）

## 🧪 冒烟测试

两个插件均通过：API 路由（list/asset/import/delete/config + 路径穿越拦截 + nosniff + 魔数校验）、浏览器 E2E（状态机 idle→thinking→done→idle、文件夹壁纸应用、场景皮肤组合、鲸鱼互动、HUD 拖动与位置持久化、抽屉开关/点外收起、快捷键）、15 插件共存无冲突。

## 🤝 贡献

欢迎 PR！开发提示：改 `packages/<包>/lib/` 后重启 `dsh web` 生效；`node --check packages/<包>/lib/client.js` 做语法校验。

## 📄 License

[MIT](LICENSE)（每个插件子目录内亦有 LICENSE）
