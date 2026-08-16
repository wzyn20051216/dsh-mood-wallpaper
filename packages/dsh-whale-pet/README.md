# dsh-whale-pet 🐋

**DSH 自研鲸鱼桌宠** —— 独立悬浮、可拖动、随 agent 状态联动、点击互动冒泡说话。纯原创（SVG 剪影、CSS 动画、交互逻辑全部自研），不参考任何第三方桌宠实现。

## ✨ 特性

- **独立悬浮**：鲸鱼浮在界面右上（默认），不占壁纸层
- **可拖动**：按住拖到任何位置，位置自动记忆；双击放大/缩小（循环 100→130→160px）
- **状态联动**：空闲漂浮、**思考时快速游动**（尾鳍加速摆 + 喷水加速）、**完成时跃水庆祝**（360° 翻转 + 说句祝贺）
- **点击互动**：冒泡 + 随机台词（8 句原创台词）；hover 显示操作提示
- **快捷键** `Ctrl+Shift+W` 显示/隐藏
- **设置分节**：显示开关、点击说话开关、大小、不透明度
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
