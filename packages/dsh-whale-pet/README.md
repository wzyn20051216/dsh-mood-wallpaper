# dsh-whale-pet 🐋

**DSH 自研鲸鱼桌宠** —— 独立悬浮、可拖动、随 agent 状态联动、点击互动冒泡说话。纯原创（SVG 剪影、CSS 动画、交互逻辑全部自研），不参考任何第三方桌宠实现。

## ✨ 特性

- **独立悬浮**：鲸鱼浮在界面右上（默认），不占壁纸层
- **可拖动**：按住拖到任何位置，位置自动记忆；双击放大/缩小（循环 100→130→160px）
- **状态联动**：空闲漂浮、**思考时快速游动**（尾鳍加速摆 + 喷水加速）、**完成时跃水庆祝**（360° 翻转 + 说句祝贺）
- **点击互动**：冒泡 + 随机台词；hover 显示操作提示
- **跟随鼠标**：开启后桌宠缓慢漂向光标（拖动时暂停）
- **多形象**：内置 5 个原创形象（鲸鱼/招财猫/企鹅/小幽灵/小恐龙）+ 自定义形象上传
- **图片预处理**：导入时自动去背景（白底/纯色底 → 透明，含边缘羽化）、透明边裁剪、最大 512px 缩放；**GIF 保留动画**（转精灵图）
- **自定义台词 + 音效**：可添加自己的台词（点击随机说）、导入音频（点击/完成时播放）
- **快捷键** `Ctrl+Shift+W` 显示/隐藏
- **设置分节**：显示开关、点击说话、跟随鼠标、大小、不透明度、去背景开关与容差、台词与音效管理
- **性能**：纯 CSS 动画（无 rAF 循环），`prefers-reduced-motion` 自动降级

## 🚀 安装

随全家桶一起装：

```powershell
irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex
```

或单独（本地目录方式）：

```powershell
git clone --depth 1 https://github.com/wzyn20051216/dsh-mood-wallpaper $env:USERPROFILE\dsh-mood-wallpaper-all
dsh plugin --profile web add "$env:USERPROFILE\dsh-mood-wallpaper-all\packages\dsh-whale-pet"
```

重启 `dsh web` 生效。卸载：`dsh plugin --profile web remove dsh-whale-pet`

## 🎨 鲸鱼形象

原创 SVG 剪影：青绿渐变身体、白色高光、胸鳍、尾鳍（摆动动画）、眼睛 + 高光点、喷水孔（水滴动画）——夜间深海配色的发光小精灵。

## 🧪 冒烟测试

- 桌宠渲染、拖动 + 位置持久化、双击缩放、点击冒泡、状态联动（思考游动/完成跃水）、快捷键、设置分节 —— 均实测通过
- 与 dsh-mood-wallpaper / dsh-ui-hud 共存无冲突（z-index 9200，壁纸层之上、记忆抽屉之下）

## 📄 License

MIT
