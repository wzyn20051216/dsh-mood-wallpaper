<div align="center">

# DSH Wallpaper & HUD 全家桶 🌌🧠

**DeepSeek Harness 美化与效率插件全家桶** —— 一个仓库，两个插件：

| 插件 | 定位 | 一句话 |
|---|---|---|
| 🌌 **dsh-mood-wallpaper** | 壁纸感知动态壁纸引擎 | 壁纸随 agent 状态起舞：后台分析、状态机动效、WebGL 着色器、鲸鱼巡游、场景皮肤、记忆星图、多 Agent 任务现场、自适应性能档位 |
| 🧠 **dsh-ui-hud** | 状态 HUD + 记忆中心 | 可拖动状态栏（模型/token/上下文压力/实时吞吐）+ 四类记忆可视化面板 |
| 🐋 **dsh-whale-pet** | 自研鲸鱼桌宠 | 独立悬浮、可拖动、随状态联动（思考游动/完成跃水）、点击互动冒泡说话、多形象系统（5 内置 + 自定义上传） |

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
├── install.ps1                        # 一键安装三个插件
├── packages/
│   ├── dsh-mood-wallpaper/            # 🌌 壁纸引擎（自述见 packages/dsh-mood-wallpaper/README.md）
│   ├── dsh-ui-hud/                    # 🧠 状态 HUD + 记忆中心（自述见 packages/dsh-ui-hud/README.md）
│   └── dsh-whale-pet/                 # 🐋 自研鲸鱼桌宠（自述见 packages/dsh-whale-pet/README.md）
```

## 🚀 安装（一条命令装两个）

```powershell
# 一键脚本（推荐）：克隆仓库 + 装三个插件（link: 安装，改源码重启即生效）
irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex

# 或手动（等价的五条命令）
git clone --depth 1 https://github.com/wzyn20051216/dsh-mood-wallpaper $env:USERPROFILE\dsh-mood-wallpaper-all
dsh plugin --profile web add "$env:USERPROFILE\dsh-mood-wallpaper-all\packages\dsh-mood-wallpaper"
dsh plugin --profile web add "$env:USERPROFILE\dsh-mood-wallpaper-all\packages\dsh-ui-hud"
dsh plugin --profile web add "$env:USERPROFILE\dsh-mood-wallpaper-all\packages\dsh-whale-pet"
```

安装后**重启 `dsh web`** 生效。卸载：

```bash
dsh plugin --profile web remove dsh-mood-wallpaper
dsh plugin --profile web remove dsh-ui-hud
dsh plugin --profile web remove dsh-whale-pet
```

> 无需 npm；`link:` 安装意味着升级 = 重新跑一遍脚本（或 `git -C $env:TEMP\dsh-mood-wallpaper-all pull` 后重启）。

---

## 🌌 插件一：dsh-mood-wallpaper（壁纸引擎）

导入动态壁纸（GIF/MP4/WebM/APNG/SVG）+ 后台分析（主色调/亮度/动态能量）+ 状态机（空闲/思考/完成）+ 12 项特效 + 4 张 WebGL 着色器壁纸 + 鲸鱼巡游彩蛋 + 场景皮肤 + 玻璃材质 + 自定义壁纸文件夹（非系统盘）+ 记忆星图 + 多 Agent 任务现场 + 自适应性能档位。

> 完整功能与使用指南：[packages/dsh-mood-wallpaper/README.md](packages/dsh-mood-wallpaper/README.md)

**快速上手**：设置 → 状态壁纸 · Mood → 点一张「着色器 · 深海」→ 点场景皮肤「深海鲸语」→ 发条消息看鲸鱼潜游跃水。

## 🧠 插件二：dsh-ui-hud（状态 HUD + 记忆中心）

可拖动底部状态栏（状态/模型/token/▲实时吞吐/上下文压力/任务/goal，点击展开统计与上下文雷达）+ 记忆中心抽屉（情景/工作/语义/感知四类记忆，★固定、检索、按会话隔离）+ 跨插件情绪联动（跟随壁纸强调色）。

> 完整功能与使用指南：[packages/dsh-ui-hud/README.md](packages/dsh-ui-hud/README.md)

**快速上手**：右下角悬浮条 → 按住可拖到任意位置 → 点「📖 记忆」或 `Ctrl+Shift+M` 打开记忆抽屉 → 点抽屉外任意处收起。

**极简模式（全家桶一键收敛）**：按 `Ctrl+Shift+X` 或到 HUD 设置页打开「极简模式」——HUD 状态栏、桌宠、壁纸特效（着色器/鲸鱼/昼夜/玻璃/媒体）全部收敛为「静默极简」皮肤，只剩一张安静的背景图，专注当前会话；再按一次恢复原状。HUD 作为中枢广播 `dsh:minimal` 事件，壁纸引擎与桌宠各自监听收敛，无需逐个配置。

## 🐋 插件三：dsh-whale-pet（自研鲸鱼桌宠）

独立悬浮鲸鱼（默认右下角上方）：按住拖动、双击缩放、点击冒泡说话；空闲漂浮、**思考时快速游动**、**完成时跃水庆祝**。快捷键 `Ctrl+Shift+W` 显示/隐藏。

> 完整功能：[packages/dsh-whale-pet/README.md](packages/dsh-whale-pet/README.md)

**快速上手**：默认鲸鱼在右下角上方；设置页可切换 5 个内置形象（鲸鱼/猫/企鹅/幽灵/恐龙），或上传自定义形象（PNG/GIF/WebP ≤3MB ×3，支持从图片 URL 直接添加）——上传播放帧即可拥有自己专属的桌宠。

## 🔗 跨插件联动

三个插件**天生互补**：

- **情绪联动**：壁纸引擎分析出的主色调/强调色实时广播给 HUD——壁纸是什么氛围，状态栏就是什么颜色；
- **极简模式**：HUD 作中枢广播 `dsh:minimal`（`Ctrl+Shift+X`），壁纸引擎切换「静默极简」皮肤、桌宠临时隐藏，全家桶一键收敛/一键恢复；
- **状态同步**：壁纸状态机（空闲/思考/完成）与桌宠游动/跃水、HUD 状态标签都来自同一份官方会话快照，天然同频。

## ✨ 创作平台：四大改进方向

全家桶从「三个插件」升级为一个可持续生长的**创作平台**：

| 方向 | 能力 | 入口 |
|---|---|---|
| 🚀 **自适应性能档位** | 自动检测平均 FPS → 60/30/15 分档；电池供电自动降着色器分辨率；高上下文压力（≥70%）或大量工具调用（≥5 并发）时减少非关键特效；WebGL 上下文丢失后自动恢复；设置页实时展示 GPU/CPU 开销 | 状态壁纸 · Mood → 「性能治理」 |
| 🎨 **场景编排器 Scene Studio** | 可视化编排壁纸/着色器/桌宠/音效/HUD 布局；分别预览 idle/thinking/tool/approval/error/done 六态；调节转场/粒子密度/通透度；导出 `scene.json`、一键导入他人分享的场景包（跨插件同步桌宠形象与 HUD 布局） | 场景编排器 · Scene Studio |
| 🌌 **记忆星图** | 把记忆中心延伸到壁纸层：用户问题=恒星、决策/工具/上下文注入=轨道节点、错误=红色脉冲、被固定记忆=金色星座；点击节点查看详情 | 状态壁纸 · Mood → 「记忆星图」开关 |
| 🛰️ **多 Agent 任务现场** | 后台任务=光点舰船：运行沿轨道移动、工具调用产生连接线、等待批准停靠变琥珀色、完成返回中心、失败短暂故障波纹；HUD 显示精确数据，壁纸表达全局态势 | 状态壁纸 · Mood → 「多 Agent 任务现场」开关 |

## 🖼️ 壁纸与开源致谢

- 内置程序化动态壁纸与 WebGL 着色器壁纸**均为本项目原创**（MIT）
- 「壁纸文件夹」示例壁纸来自开源项目 [JoshuaThadi/Wall-E-Desk](https://github.com/JoshuaThadi/Wall-E-Desk)（GitHub 直链，仅供个人使用，商用注意授权）

## 🧪 冒烟测试

三个插件均通过：API 路由（list/asset/import/delete/config + 路径穿越拦截 + nosniff + 魔数校验）、浏览器 E2E（状态机 idle→thinking→done→idle、文件夹壁纸应用、场景皮肤组合、鲸鱼互动、HUD 拖动与位置持久化、抽屉开关/点外收起、快捷键、极简模式进入/退出全家桶收敛与恢复）、15 插件共存无冲突。

## 🗺️ Roadmap（后续改进方向）

欢迎 PR，以下方向按优先级排列：

- **记忆星图增强**：hover 显示节点标签、点击跳转到对应回合/文件、星座按会话聚类、时间轴回放
- **Scene Studio 增强**：场景市场（社区 scene.json 分享库）、缩略图预览、场景模板、粒子密度曲线编辑器
- **多 Agent 增强**：按 Agent 类型区分舰船/光点/小鲸鱼造型、子 Agent 树形连线、批准队列可视化
- **性能治理增强**：功耗曲线统计、GPU 显存占用估算、自动降级白名单、每台设备学习出的个性化档位阈值

## 🤝 贡献

欢迎 PR！开发提示：改 `packages/<包>/lib/` 后重启 `dsh web` 生效；`node --check packages/<包>/lib/client.js` 做语法校验。

## 📄 License

[MIT](LICENSE)（每个插件子目录内亦有 LICENSE）
