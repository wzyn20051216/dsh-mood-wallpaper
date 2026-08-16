# dsh-mood-wallpaper 全家桶 一键安装脚本（Windows PowerShell）
#
# 用法（一行）：
#   irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex
#
# 作用：克隆全家桶仓库，把三个插件（壁纸引擎 + 状态 HUD/记忆中心 + 鲸鱼桌宠）
#       以本地目录方式装进你的 DSH web profile（link: 安装，改源码重启即生效），无需 npm。
# 要求：已安装 DSH（dsh 命令可用）、git、网络可达 GitHub。

param(
    [string]$ProfileName = "web"
)

$ErrorActionPreference = "Stop"

$REPO_URL = "https://github.com/wzyn20051216/dsh-mood-wallpaper.git"
# 克隆到持久目录（%TEMP% 可能被系统清理导致 link 失效）
$TMP = Join-Path $env:USERPROFILE "dsh-mood-wallpaper-all"

Write-Host "=== dsh-mood-wallpaper 全家桶 一键安装 ===" -ForegroundColor Cyan

# 1) 检查 dsh
$dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
if (-not $dshCmd) {
    Write-Host "[错误] 未找到 dsh 命令。请先安装 DeepSeek Harness：" -ForegroundColor Red
    Write-Host "  npm i -g dsh" -ForegroundColor Yellow
    exit 1
}
Write-Host "[1/4] dsh 可用: $($dshCmd.Source)"

# 2) 检查 git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 git，请先安装：https://git-scm.com/" -ForegroundColor Red
    exit 1
}

# 3) 克隆仓库（浅克隆）
if (Test-Path $TMP) { Remove-Item $TMP -Recurse -Force }
Write-Host "[2/4] 克隆仓库到 $TMP ..." -ForegroundColor Cyan
git clone --depth 1 $REPO_URL $TMP
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 克隆失败" -ForegroundColor Red
    exit 1
}

# 4) 安装三个插件（本地目录 link:）
Write-Host "[3/4] 安装插件到 profile '$ProfileName' ..." -ForegroundColor Cyan
dsh plugin --profile $ProfileName add "$TMP\packages\dsh-mood-wallpaper" "$TMP\packages\dsh-ui-hud" "$TMP\packages\dsh-whale-pet"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 插件安装失败，退出码 $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "[4/4] 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：重启 dsh web 使插件生效：" -ForegroundColor Yellow
Write-Host "  1) 停掉正在运行的 dsh web（Ctrl+C）"
Write-Host "  2) 重新运行： dsh web"
Write-Host "  3) 浏览器打开 DSH Web，进入 设置 → 状态壁纸 · Mood / 状态 HUD · Memory 体验"
Write-Host ""
Write-Host "卸载：" -ForegroundColor Gray
Write-Host "  dsh plugin --profile $ProfileName remove dsh-mood-wallpaper"
Write-Host "  dsh plugin --profile $ProfileName remove dsh-ui-hud"
Write-Host "  dsh plugin --profile $ProfileName remove dsh-whale-pet"
Write-Host ""
Write-Host "升级：重新运行本脚本（会重新克隆并覆盖 link 指向的目录）。"
