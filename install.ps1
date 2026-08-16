# dsh-mood-wallpaper 全家桶 一键安装脚本（Windows PowerShell）
#
# 用法（一行）：
#   irm https://raw.githubusercontent.com/wzyn20051216/dsh-mood-wallpaper/master/install.ps1 | iex
#
# 作用：把全家桶两个插件（壁纸引擎 + 状态 HUD/记忆中心）以 GitHub 直装方式
#       装进你的 DSH web profile，无需 npm。
# 要求：已安装 DSH（dsh 命令可用）、git、网络可达 GitHub。

param(
    [string]$ProfileName = "web"
)

$ErrorActionPreference = "Stop"

$REPO = "github:wzyn20051216/dsh-mood-wallpaper"
$PLUGINS = @(
    "$REPO#path=packages/dsh-mood-wallpaper",
    "$REPO#path=packages/dsh-ui-hud"
)

Write-Host "=== dsh-mood-wallpaper 全家桶 一键安装 ===" -ForegroundColor Cyan

# 1) 检查 dsh
$dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
if (-not $dshCmd) {
    Write-Host "[错误] 未找到 dsh 命令。请先安装 DeepSeek Harness：" -ForegroundColor Red
    Write-Host "  npm i -g dsh" -ForegroundColor Yellow
    exit 1
}
Write-Host "[1/3] dsh 可用: $($dshCmd.Source)"

# 2) GitHub 直装两个插件（无构建脚本，无需 pnpm allowBuilds）
Write-Host "[2/3] 安装插件到 profile '$ProfileName' ..." -ForegroundColor Cyan
dsh plugin --profile $ProfileName add $PLUGINS
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 插件安装失败，退出码 $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

# 3) 提示重启
Write-Host "[3/3] 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：重启 dsh web 使插件生效：" -ForegroundColor Yellow
Write-Host "  1) 停掉正在运行的 dsh web（Ctrl+C）"
Write-Host "  2) 重新运行： dsh web"
Write-Host "  3) 浏览器打开 DSH Web，进入 设置 → 状态壁纸 · Mood / 状态 HUD · Memory 体验"
Write-Host ""
Write-Host "卸载：" -ForegroundColor Gray
Write-Host "  dsh plugin --profile $ProfileName remove dsh-mood-wallpaper"
Write-Host "  dsh plugin --profile $ProfileName remove dsh-ui-hud"
