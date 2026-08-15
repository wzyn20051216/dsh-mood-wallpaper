/**
 * dsh-mood-wallpaper — browser half (v3: wallpaper-aware mood engine + effects).
 *
 * 壁纸感知的动态壁纸引擎（状态机）：
 *
 *   导入/内置动态壁纸
 *        │
 *        ▼
 *   后台分析（ImageDecoder 取帧 → 主色调/亮度/饱和度/动态能量）
 *        │
 *        ▼
 *   自适应风格（palette 染色 + 动作模式 lively/balanced/calm）
 *        │
 *        ▼
 *   状态机  idle ──思考开始──▶ thinking ──思考结束──▶ done ──1.7s──▶ idle
 *            │                   │                     │
 *        壁纸自身动画        光带+粒子汇聚+工具节点    光环+闪光+粒子爆散
 *        +慢速KenBurns        +暗角脉冲（按亮度自适应）   （一次性，按色板）
 *        +氛围呼吸光
 *
 * v3 新增「特效与氛围」（程序员向）：
 *   - 敲击能量场：键盘敲击泛起能量火花，节奏随输入密度增强
 *   - 思维投影：思考时粒子向核心汇聚，工具调用浮现带图标的节点
 *   - CRT 终端美学：扫描线 + 暗角 + 轻微闪烁，一键复古终端观感
 *   - 昼夜循环：按本地时间染色（晨昏/白昼/夜晚）
 *   - 鼠标视差：光层随鼠标微移，景深感
 *   - 环境音：WebAudio 纯合成雨声 + 低音垫（无素材版权），思考时渐强，
 *     完成时一声提示音；首次用户手势后启动，默认关闭
 *   - 性能治理：页面不可见暂停全部动画/音频；prefers-reduced-motion 降级
 *
 * 兼容性：壁纸层独立 <div>（z-index:-1）+ 私有 <style>，类前缀 dswm-；
 * 主题覆盖走 ctx.theme.overrideTokens（source: dsh-mood-wallpaper）分层合成；
 * 状态输入来自当前会话 ConversationSnapshot（partial/runningCalls/turnTimings）。
 */
window.__ModuleLoader__.load({
  id: "dsh-mood-wallpaper",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;

    /** Cordis 插件名（与 patch 行 id 一致）。 */
    const name = "mood-wallpaper";
    /** 依赖的客户端服务。 */
    const inject = ["slots", "theme", "sessions"];

    const API = "/plugins/mood-wallpaper";
    const CFG_KEY = "dsh-mood-wallpaper.config";

    const DEFAULTS = {
      enabled: true,
      wallpaperId: null,
      style: "auto",
      intensity: 1,
      doneFx: true,
      kenburns: true,
      baseAlpha: 70,
      panelAlpha: 85,
      fx: {
        keyboard: true,
        thought: true,
        crt: false,
        daynight: true,
        parallax: true,
        sound: false,
        coderain: true,
        trail: true,
        keysound: false
      },
      analysis: {}
    };

    /** 手动风格预设（style != auto 时覆盖分析结果）。 */
    const PRESETS = {
      aurora: { label: "极光 Aurora", palette: ["#38bdf8", "#a78bfa", "#f472b6"], accent: "rgba(125, 211, 252, 0.6)" },
      ember: { label: "熔岩 Ember", palette: ["#fb923c", "#f43f5e", "#facc15"], accent: "rgba(251, 191, 36, 0.6)" },
      deep: { label: "深空 Deep", palette: ["#3b82f6", "#6366f1", "#06b6d4"], accent: "rgba(56, 189, 248, 0.6)" },
      mono: { label: "黑白 Mono", palette: ["#cbd5e1", "#94a3b8", "#64748b"], accent: "rgba(203, 213, 225, 0.6)" }
    };

    const INTENSITIES = [
      { value: 0.6, label: "舒缓 Calm" },
      { value: 1, label: "标准 Normal" },
      { value: 1.6, label: "强劲 Intense" }
    ];

    /** 工具名 → 图标（思维投影用）。 */
    function toolIcon(name) {
      const n = (name || "").toLowerCase();
      if (n.includes("web") || n.includes("http") || n.includes("browser")) return "🌐";
      if (n.includes("bash") || n.includes("pwsh") || n.includes("terminal")) return "⌨️";
      if (n.includes("grep") || n.includes("glob") || n.includes("search")) return "🔍";
      if (n.includes("read") || n.includes("file") || n.includes("fs")) return "📁";
      if (n.includes("todo") || n.includes("goal") || n.includes("schedule")) return "🎯";
      if (n.includes("subagent") || n.includes("fork")) return "👥";
      if (n.includes("skill")) return "📚";
      if (n.includes("image") || n.includes("screenshot") || n.includes("read_image")) return "🖼️";
      if (n.includes("workflow")) return "🔀";
      if (n.includes("edit") || n.includes("write")) return "✏️";
      return "⚙️";
    }

    function loadConfig() {
      try {
        const raw = localStorage.getItem(CFG_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        const parsed = JSON.parse(raw);
        const merged = Object.assign({}, DEFAULTS, parsed && typeof parsed === "object" ? parsed : {});
        merged.fx = Object.assign({}, DEFAULTS.fx, parsed && parsed.fx && typeof parsed.fx === "object" ? parsed.fx : {});
        return merged;
      } catch {
        return Object.assign({}, DEFAULTS);
      }
    }

    /** 运行期配置（模块级，供 saveConfig 等函数闭包访问；apply 内初始化）。 */
    let cfg;

    function saveConfig() {
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      } catch (e) {
        console.warn("dsh-mood-wallpaper: saveConfig failed", e);
      }
    }

    function clamp01(v) {
      return Math.max(0, Math.min(1, Number(v) || 0));
    }

    function rgbToHex(r, g, b) {
      const to = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
      return "#" + to(r) + to(g) + to(b);
    }

    function rgbHue(r, g, b) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const d = mx - mn;
      if (d === 0) return 0;
      let hue;
      if (mx === r) hue = ((g - b) / d) % 6;
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      return hue;
    }

    function mixHex(hex, target, t) {
      const parse = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      let c;
      try { c = parse(hex); } catch { return target; }
      const tgt = parse(target);
      return rgbToHex(c[0] + (tgt[0] - c[0]) * t, c[1] + (tgt[1] - c[1]) * t, c[2] + (tgt[2] - c[2]) * t);
    }

    function apply(ctx) {
      // ================= 配置 =================
      cfg = loadConfig();

      // ================= 小型内存 store（设置页用；含配置字段，UI 单数据源） =================
      const listeners = new Set();
      let state = Object.assign({
        users: [],
        builtins: [],
        current: null,
        analyzing: null,
        analysisInfo: null,
        importing: false,
        error: null
      }, cfg);
      const store = {
        get: () => state,
        set(patch) { state = Object.assign({}, state, patch); for (const l of listeners) l(state); },
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
      };

      // ================= 私有样式 =================
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-dsh-mood-wallpaper", "true");
      document.head.appendChild(styleEl);
      styleEl.textContent = `
        #dswm-wall {
          position: fixed; left: 0; top: 0; width: 100%; height: 100%;
          z-index: -1; overflow: hidden; pointer-events: none;
          opacity: 1; transition: opacity 0.5s ease;
        }
        #dswm-wall.dswm-disabled { opacity: 0 !important; }

        /* ---- 媒体层（壁纸本体） ---- */
        #dswm-wall .dswm-media { position: absolute; inset: -4%; }
        #dswm-wall .dswm-media img, #dswm-wall .dswm-media video {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        #dswm-wall .dswm-media canvas.dswm-shader {
          width: 100%; height: 100%; display: block;
        }
        #dswm-wall .dswm-media canvas.dswm-shader-fallback {
          width: 100%; height: 100%; display: block; border: 0;
        }
        #dswm-wall[data-kenburns="1"] .dswm-media {
          animation: dswmKB 42s ease-in-out infinite alternate;
        }
        #dswm-wall[data-kenburns="1"][data-state="thinking"] .dswm-media {
          animation: dswmKB2 var(--dswm-kb2, 11s) ease-in-out infinite alternate;
        }
        #dswm-wall[data-kenburns="1"][data-state="done"] .dswm-media {
          animation: dswmKBSettle 1.6s ease-out forwards;
        }

        /* ---- 氛围层 ---- */
        #dswm-wall .dswm-glow {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at 30% 20%, var(--dswm-c1, #38bdf8) 0%, transparent 55%),
            radial-gradient(ellipse at 75% 80%, var(--dswm-c3, #f472b6) 0%, transparent 55%);
          opacity: var(--dswm-glow-op, 0.22);
          mix-blend-mode: screen;
          transition: opacity 0.8s ease;
        }
        #dswm-wall .dswm-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,var(--dswm-vig, 0.32)) 100%);
          opacity: 1;
        }
        #dswm-wall .dswm-sweep {
          position: absolute; left: 0; top: -15%; bottom: -15%; width: 45%;
          background: linear-gradient(90deg, transparent, var(--dswm-accent, rgba(125,211,252,0.30)), transparent);
          transform: skewX(-18deg) translateX(-90vw);
          opacity: 0;
        }
        #dswm-wall .dswm-ring {
          position: absolute; left: 50%; top: 50%; width: 8vmax; height: 8vmax; margin: -4vmax 0 0 -4vmax;
          border-radius: 50%;
          border: 3px solid var(--dswm-accent, rgba(125,211,252,0.7));
          box-shadow: 0 0 40px 6px var(--dswm-accent, rgba(125,211,252,0.35)), inset 0 0 40px 6px var(--dswm-accent, rgba(125,211,252,0.25));
          opacity: 0; transform: scale(0);
        }
        #dswm-wall .dswm-flash {
          position: absolute; inset: 0;
          background: radial-gradient(circle at 50% 50%, var(--dswm-accent, rgba(125,211,252,0.35)), transparent 70%);
          opacity: 0;
        }
        #dswm-wall .dswm-canvas { position: absolute; inset: 0; }

        /* ---- CRT 终端美学 ---- */
        #dswm-wall .dswm-crt {
          position: absolute; inset: 0; opacity: 0; pointer-events: none;
          background:
            repeating-linear-gradient(0deg, rgba(0,0,0,0.20) 0px, rgba(0,0,0,0.20) 1px, transparent 1px, transparent 3px),
            radial-gradient(ellipse at 50% 50%, transparent 62%, rgba(0,0,0,0.34) 100%);
        }
        #dswm-wall[data-crt="1"] .dswm-crt { opacity: 1; animation: dswmFlicker 5s steps(1) infinite; }

        /* ---- 昼夜染色 ---- */
        #dswm-wall .dswm-daytint {
          position: absolute; inset: 0; opacity: 0; pointer-events: none;
          background: var(--dswm-daytint, transparent);
          mix-blend-mode: soft-light;
          transition: opacity 1s ease;
        }
        #dswm-wall[data-daynight="1"] .dswm-daytint { opacity: 1; }

        /* ---- 状态：thinking ---- */
        #dswm-wall[data-state="thinking"] .dswm-sweep {
          animation: dswmSweep var(--dswm-sweep-dur, 7s) ease-in-out infinite;
        }
        #dswm-wall[data-state="thinking"] .dswm-glow { opacity: calc(var(--dswm-glow-op, 0.22) * 1.8); }
        #dswm-wall[data-state="thinking"] .dswm-vignette { --dswm-vig: calc(var(--dswm-vig-base, 0.32) + 0.16); }

        /* ---- 状态：done（一次性绽放） ---- */
        #dswm-wall[data-state="done"] .dswm-ring { animation: dswmRing 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
        #dswm-wall[data-state="done"] .dswm-flash { animation: dswmFlash 1.6s ease-out forwards; }

        /* ---- 动作模式微调（analysis → lively/balanced/calm） ---- */
        #dswm-wall[data-action="calm"] .dswm-sweep { --dswm-sweep-op: 0.5; }
        #dswm-wall[data-action="lively"] .dswm-sweep { --dswm-sweep-op: 1; }

        @keyframes dswmKB {
          0% { transform: scale(1) translate3d(0, 0, 0); }
          50% { transform: scale(1.07) translate3d(-0.8%, 0.6%, 0); }
          100% { transform: scale(1.05) translate3d(0.8%, -0.5%, 0); }
        }
        @keyframes dswmKB2 {
          0% { transform: scale(1.06) translate3d(0, 0, 0); }
          50% { transform: scale(1.16) translate3d(-1.2%, 0.8%, 0); }
          100% { transform: scale(1.13) translate3d(1%, -0.8%, 0); }
        }
        @keyframes dswmKBSettle {
          0% { transform: scale(1.14) translate3d(0.5%, -0.4%, 0); }
          100% { transform: scale(1) translate3d(0, 0, 0); }
        }
        @keyframes dswmSweep {
          0% { transform: skewX(-18deg) translateX(-90vw); opacity: 0; }
          12% { opacity: var(--dswm-sweep-op, 1); }
          88% { opacity: var(--dswm-sweep-op, 1); }
          100% { transform: skewX(-18deg) translateX(200vw); opacity: 0; }
        }
        @keyframes dswmRing {
          0% { opacity: 0; transform: scale(0.05); }
          15% { opacity: 0.95; }
          100% { opacity: 0; transform: scale(14); }
        }
        @keyframes dswmFlash {
          0% { opacity: 0; }
          20% { opacity: 0.45; }
          100% { opacity: 0; }
        }
        @keyframes dswmFlicker {
          0%, 91%, 100% { opacity: 1; }
          93% { opacity: 0.88; }
          95% { opacity: 1; }
          97% { opacity: 0.94; }
        }

        @media (prefers-reduced-motion: reduce) {
          #dswm-wall * { animation: none !important; }
          #dswm-wall .dswm-ring, #dswm-wall .dswm-flash, #dswm-wall .dswm-sweep { display: none; }
        }

        /* ---- 设置页样式（dswm- 前缀） ---- */
        .dswm-page { padding: 4px 20px 28px; max-width: 640px; display: flex; flex-direction: column; gap: 16px; }
        .dswm-card {
          background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
        }
        .dswm-title { font-size: 15px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
        .dswm-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .dswm-row .dswm-grow { flex: 1; min-width: 0; }
        .dswm-label { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); flex: none; width: 110px; }
        .dswm-select {
          box-sizing: border-box; height: 32px; padding: 0 10px;
          background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
          font-family: inherit; font-size: 13px; line-height: 20px; outline: none; min-width: 0;
        }
        .dswm-select:focus { border-color: var(--dsw-alias-brand-primary); }
        .dswm-hint { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
        .dswm-error { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
        .dswm-switch { position: relative; width: 40px; height: 22px; flex: none; cursor: pointer; display: inline-block; }
        .dswm-switch input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
        .dswm-switch .dswm-track {
          position: absolute; inset: 0; border-radius: 11px;
          background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
          border: 1px solid var(--dsw-alias-border-l1); transition: background 0.15s ease;
        }
        .dswm-switch .dswm-thumb {
          position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
          background: var(--dsw-alias-label-secondary); transition: transform 0.15s ease, background 0.15s ease;
        }
        .dswm-switch input:checked ~ .dswm-track { background: var(--dsw-alias-brand-primary); border-color: transparent; }
        .dswm-switch input:checked ~ .dswm-thumb { transform: translateX(18px); background: #fff; }
        .dswm-slider { flex: 1; accent-color: var(--dsw-alias-brand-primary); }
        .dswm-num { width: 44px; text-align: right; }
        .dswm-state-pill {
          display: inline-block; padding: 1px 10px; border-radius: 999px;
          font-size: 12px; line-height: 20px;
          border: 1px solid var(--dsw-alias-border-l1);
          color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2);
        }
        .dswm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
        .dswm-cell {
          position: relative; border: 2px solid var(--dsw-alias-border-l1); border-radius: 10px;
          overflow: hidden; cursor: pointer; background: var(--dsw-alias-bg-layer-2);
        }
        .dswm-cell:hover { border-color: var(--dsw-alias-border-l2); }
        .dswm-cell.dswm-sel { border-color: var(--dsw-alias-brand-primary); }
        .dswm-cell img, .dswm-cell video { width: 100%; height: 84px; object-fit: cover; display: block; }
        .dswm-cell .dswm-cell-name {
          padding: 4px 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .dswm-cell .dswm-badge {
          position: absolute; top: 6px; left: 6px; padding: 0 6px; border-radius: 6px;
          font-size: 10px; line-height: 16px; color: #fff; background: rgba(0,0,0,0.45);
        }
        .dswm-cell .dswm-del {
          position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border: none; border-radius: 6px;
          background: rgba(220, 38, 38, 0.85); color: #fff; font-size: 12px; line-height: 20px; text-align: center;
          cursor: pointer; display: none;
        }
        .dswm-cell:hover .dswm-del { display: block; }
        .dswm-cell .dswm-analyzing {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.35); color: #fff; font-size: 12px;
        }
        .dswm-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2)); overflow: hidden; }
        .dswm-bar > i { display: block; height: 100%; background: var(--dsw-alias-brand-primary); border-radius: 3px; }
        .dswm-btn {
          box-sizing: border-box; height: 32px; padding: 0 14px; cursor: pointer; flex: none;
          background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
          font-family: inherit; font-size: 13px; line-height: 20px;
        }
        .dswm-btn:hover { background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2)); }
        .dswm-btn:disabled { opacity: 0.55; cursor: default; }
        .dswm-btn-primary {
          background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff;
        }
        .dswm-btn-primary:hover { opacity: 0.9; background: var(--dsw-alias-brand-primary); }
      `;

      // ================= 壁纸 DOM =================
      const wallEl = document.createElement("div");
      wallEl.id = "dswm-wall";
      wallEl.setAttribute("data-state", "idle");
      wallEl.setAttribute("data-action", "balanced");
      wallEl.innerHTML =
        '<div class="dswm-media"></div>' +
        '<div class="dswm-glow"></div>' +
        '<div class="dswm-vignette"></div>' +
        '<div class="dswm-sweep"></div>' +
        '<div class="dswm-flash"></div>' +
        '<div class="dswm-ring"></div>' +
        '<div class="dswm-daytint"></div>' +
        '<div class="dswm-crt"></div>' +
        '<canvas class="dswm-canvas"></canvas>';
      document.body.appendChild(wallEl);

      const mediaWrap = wallEl.querySelector(".dswm-media");
      const glowEl = wallEl.querySelector(".dswm-glow");
      const canvas = wallEl.querySelector(".dswm-canvas");
      const pctx = canvas.getContext("2d");

      /** 代码雨列（resizeCanvas 在初始化阶段即调用 initRain，故提前声明）。 */
      let rain = [];
      /** WebGL 着色器壁纸运行时（resizeCanvas 早期调用 resizeShader，故提前声明）。 */
      let shader = null;

      function resizeCanvas() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(innerWidth * dpr);
        canvas.height = Math.round(innerHeight * dpr);
        canvas.style.width = innerWidth + "px";
        canvas.style.height = innerHeight + "px";
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        initRain();
        resizeShader();
      }
      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      const setVar = (name, value) => wallEl.style.setProperty(name, value);

      // ================= 主题覆盖：背景透明化（分层合成） =================
      let disposeOverrides = null;
      function applyAlpha() {
        if (disposeOverrides) { disposeOverrides(); disposeOverrides = null; }
        if (!cfg.enabled) return;
        const base = clamp01(cfg.baseAlpha / 100);
        const panel = clamp01(cfg.panelAlpha / 100);
        disposeOverrides = ctx.theme.overrideTokens("dsh-mood-wallpaper", {
          "--dsw-alias-bg-base": { light: "rgba(248,249,252," + base + ")", dark: "rgba(12,14,20," + base + ")" },
          "--dsw-alias-bg-layer-1": { light: "rgba(255,255,255," + panel + ")", dark: "rgba(24,26,34," + panel + ")" },
          "--dsw-alias-bg-layer-2": { light: "rgba(255,255,255," + panel + ")", dark: "rgba(30,33,42," + panel + ")" },
          "--dsw-specific-sidebar-fill": { light: "rgba(255,255,255," + panel + ")", dark: "rgba(20,22,30," + panel + ")" }
        });
      }

      // ================= 昼夜循环 =================
      function dayTint() {
        const d = new Date();
        const h = d.getHours() + d.getMinutes() / 60;
        let color;
        if (h >= 5 && h < 7) color = "rgba(255, 170, 110, 0.20)";       // 晨
        else if (h >= 7 && h < 17) color = "rgba(255, 255, 255, 0.05)";   // 昼
        else if (h >= 17 && h < 19) color = "rgba(255, 140, 90, 0.18)";   // 暮
        else color = "rgba(30, 50, 130, 0.22)";                            // 夜
        setVar("--dswm-daytint", color);
      }
      const dayTimer = setInterval(dayTint, 5 * 60 * 1000);
      dayTint();

      // ================= 自适应风格（分析 → 动作模式 + 色板） =================
      let currentStyle = { palette: PRESETS.aurora.palette, accent: PRESETS.aurora.accent, mode: "balanced", glow: 0.7 };

      function deriveStyle(analysis) {
        if (cfg.style !== "auto") {
          const p = PRESETS[cfg.style] || PRESETS.aurora;
          return { palette: p.palette, accent: p.accent, mode: "balanced", glow: 0.7 };
        }
        if (!analysis) return Object.assign({}, currentStyle);
        const motion = clamp01(analysis.motion);
        const brightness = clamp01(analysis.brightness);
        const mode = motion > 0.45 ? "calm" : motion < 0.12 ? "lively" : "balanced";
        const glow = brightness < 0.35 ? 1 : brightness > 0.7 ? 0.45 : 0.7;
        return {
          palette: analysis.palette && analysis.palette.length === 3 ? analysis.palette : PRESETS.aurora.palette,
          accent: analysis.accent || PRESETS.aurora.accent,
          mode,
          glow
        };
      }

      function applyStyle() {
        const s = currentStyle;
        setVar("--dswm-c1", s.palette[0]);
        setVar("--dswm-c2", s.palette[1]);
        setVar("--dswm-c3", s.palette[2]);
        setVar("--dswm-accent", s.accent);
        setVar("--dswm-glow-op", (s.glow * 0.22).toFixed(3));
        setVar("--dswm-vig-base", String(s.glow * 0.32));
        wallEl.setAttribute("data-action", s.mode);
        const i = Math.max(0.2, Number(cfg.intensity) || 1);
        setVar("--dswm-kb2", (11 / i).toFixed(2) + "s");
        setVar("--dswm-sweep-dur", (7 / i).toFixed(2) + "s");
        wallEl.setAttribute("data-kenburns", cfg.kenburns ? "1" : "0");
        wallEl.setAttribute("data-crt", cfg.fx && cfg.fx.crt ? "1" : "0");
        wallEl.setAttribute("data-daynight", cfg.fx && cfg.fx.daynight ? "1" : "0");
        wallEl.classList.toggle("dswm-disabled", !cfg.enabled);
        currentColors = s.palette.concat([s.accent]);
        applyAlpha();
      }

      // ================= 后台分析（ImageDecoder 取帧 → 色板/亮度/动态能量） =================
      async function computeAnalysis(url, mime) {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const S = 48;
        const c = document.createElement("canvas");
        c.width = S;
        c.height = S;
        const g = c.getContext("2d", { willReadFrequently: true });
        const frames = [];
        if (typeof ImageDecoder !== "undefined") {
          try {
            const dec = new ImageDecoder({ data: buf, type: (mime || "").startsWith("video/") ? (mime || "video/mp4") : (mime || "image/gif") });
            await dec.tracks.ready;
            const track = dec.tracks.selectedTrack;
            const total = Math.max(1, track && track.frameCount || 1);
            const sampleCount = Math.min(10, total);
            for (let i = 0; i < sampleCount; i++) {
              const idx = Math.floor((i / Math.max(1, sampleCount - 1)) * (total - 1));
              const r = await dec.decode({ frameIndex: idx });
              frames.push(r.image);
            }
            dec.close();
          } catch { frames.length = 0; }
        }
        if (frames.length === 0) {
          const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("image load failed"));
            im.src = url;
          });
          frames.push(img);
        }
        const buckets = new Map();
        let sumLuma = 0, sumSat = 0, n = 0;
        let prevLuma = null, diffSum = 0, diffCount = 0;
        for (const f of frames) {
          g.clearRect(0, 0, S, S);
          g.drawImage(f, 0, 0, S, S);
          const d = g.getImageData(0, 0, S, S).data;
          const lumaArr = new Float32Array(S * S);
          for (let p = 0, i = 0; p < d.length; p += 4, i++) {
            const r = d[p], gg = d[p + 1], b = d[p + 2];
            const luma = 0.299 * r + 0.587 * gg + 0.114 * b;
            lumaArr[i] = luma;
            sumLuma += luma;
            const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
            const sat = mx === 0 ? 0 : (mx - mn) / mx;
            sumSat += sat;
            n++;
            if (sat > 0.12) {
              const bk = Math.floor(rgbHue(r, gg, b) / 30);
              const bkt = buckets.get(bk) || { r: 0, g: 0, b: 0, count: 0 };
              bkt.r += r; bkt.g += gg; bkt.b += b; bkt.count++;
              buckets.set(bk, bkt);
            }
          }
          if (prevLuma !== null) {
            let dsum = 0;
            for (let i = 0; i < lumaArr.length; i++) dsum += Math.abs(lumaArr[i] - prevLuma[i]);
            diffSum += dsum / lumaArr.length / 255;
            diffCount++;
          }
          prevLuma = lumaArr;
          if (typeof f.close === "function") f.close();
        }
        const brightness = sumLuma / (n * 255);
        const saturation = sumSat / n;
        const motion = diffCount > 0 ? Math.min(1, (diffSum / diffCount) * 3) : 0;
        const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
        const palette = sorted.slice(0, 3).map((b) => rgbToHex(b.r / b.count, b.g / b.count, b.b / b.count));
        while (palette.length < 3) palette.push(palette[0] || "#38bdf8");
        const accent = mixHex(palette[0], "#ffffff", 0.3);
        return { palette, accent, brightness, saturation, motion };
      }

      async function analyzeWallpaper(w) {
        const cached = cfg.analysis && cfg.analysis[w.id];
        if (cached) {
          applyAnalysis(w.id, cached);
          return;
        }
        store.set({ analyzing: w.id });
        try {
          const a = await computeAnalysis(w.url, w.mime);
          cfg.analysis = Object.assign({}, cfg.analysis, { [w.id]: a });
          saveConfig();
          applyAnalysis(w.id, a);
        } catch {
          applyAnalysis(w.id, null);
        }
        store.set({ analyzing: null });
      }

      function applyAnalysis(id, a) {
        currentStyle = deriveStyle(a);
        applyStyle();
        store.set({
          analysisInfo: a ? {
            brightness: Math.round(clamp01(a.brightness) * 100),
            saturation: Math.round(clamp01(a.saturation) * 100),
            motion: Math.round(clamp01(a.motion) * 100),
            mode: currentStyle.mode
          } : null
        });
      }

      // ================= 壁纸媒体层 =================
      function makeMedia(w) {
        if ((w.mime || "").startsWith("video/")) {
          const v = document.createElement("video");
          v.src = w.url;
          v.muted = true;
          v.loop = true;
          v.autoplay = true;
          v.playsInline = true;
          v.setAttribute("playsinline", "");
          return v;
        }
        const img = document.createElement("img");
        img.src = w.url;
        img.alt = w.name || w.id;
        img.draggable = false;
        return img;
      }

      async function applyWallpaper(id) {
        const all = state.users.concat(state.builtins);
        const w = all.find((x) => x.id === id);
        if (!w) return;
        cfg.wallpaperId = id;
        saveConfig();
        store.set({ current: w });
        disposeShader();
        mediaWrap.innerHTML = "";
        if (w.kind === "shader") {
          applyShaderWallpaper(w);
          return;
        }
        const el = makeMedia(w);
        mediaWrap.appendChild(el);
        const ready = () => mediaWrap.classList.add("dswm-loaded");
        if (el.tagName === "VIDEO") {
          el.addEventListener("loadeddata", ready, { once: true });
        } else {
          if (el.complete) ready();
          else el.addEventListener("load", ready, { once: true });
        }
        analyzeWallpaper(w);
      }

      function allWallpapers() {
        return state.users.concat(state.builtins);
      }

      // ================= WebGL 着色器壁纸（手写 raw GLSL，零依赖） =================
      const SHADER_VERT = `
        attribute vec2 a_pos;
        varying vec2 v_uv;
        void main() {
          v_uv = a_pos * 0.5 + 0.5;
          gl_Position = vec4(a_pos, 0.0, 1.0);
        }
      `;
      const SHADER_NOISE = `
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
          return v;
        }
      `;
      const SHADER_COMMON = `
        precision highp float;
        varying vec2 v_uv;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform float u_speed;
        uniform float u_intensity;
        uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_c3;
      `;
      const SHADER_PRESETS = {
        "shader-aurora": {
          name: "极光",
          hex: ["#33e0b8", "#8a7bff", "#f47bd0"],
          accent: "rgba(125, 224, 198, 0.6)",
          rgb: [[0.2, 0.88, 0.72], [0.54, 0.48, 1.0], [0.96, 0.48, 0.82]],
          frag: SHADER_COMMON + SHADER_NOISE + `
            void main() {
              vec2 uv = v_uv;
              float t = u_time * u_speed;
              vec2 p = vec2(uv.x * 2.0 - 1.0, (uv.y * 2.0 - 1.0) * (u_resolution.y / u_resolution.x));
              float n = fbm(p * 2.5 + vec2(t * 0.12, -t * 0.08));
              float band = sin((uv.y + n * 0.35) * 5.5 + t * 0.25) * 0.5 + 0.5;
              vec3 col = mix(u_c1, u_c2, band);
              col = mix(col, u_c3, n * 0.6);
              col *= 0.6 + 0.4 * u_intensity;
              float vig = smoothstep(1.35, 0.35, distance(p, vec2(0.0)));
              col *= 0.7 + 0.3 * vig;
              gl_FragColor = vec4(col, 1.0);
            }
          `
        },
        "shader-lava": {
          name: "熔岩",
          hex: ["#fb923c", "#e11d48", "#facc15"],
          accent: "rgba(251, 146, 60, 0.6)",
          rgb: [[0.98, 0.57, 0.24], [0.88, 0.11, 0.28], [0.98, 0.8, 0.08]],
          frag: SHADER_COMMON + SHADER_NOISE + `
            void main() {
              vec2 uv = v_uv;
              float t = u_time * u_speed;
              vec2 p = vec2(uv.x * 2.0 - 1.0, (uv.y * 2.0 - 1.0) * (u_resolution.y / u_resolution.x));
              float n = fbm(p * 2.0 + vec2(t * 0.16, 0.0));
              n += fbm(p * 4.0 - vec2(0.0, t * 0.1)) * 0.4;
              float v = smoothstep(0.25, 0.85, n);
              vec3 col = mix(u_c1, u_c2, v);
              col = mix(col, u_c3, smoothstep(0.7, 1.0, n));
              col *= 0.55 + 0.45 * u_intensity;
              float vig = smoothstep(1.3, 0.4, distance(p, vec2(0.0)));
              col *= 0.72 + 0.28 * vig;
              gl_FragColor = vec4(col, 1.0);
            }
          `
        },
        "shader-nebula": {
          name: "星云",
          hex: ["#8b5cf6", "#06b6d4", "#ec4899"],
          accent: "rgba(139, 92, 246, 0.6)",
          rgb: [[0.55, 0.36, 0.96], [0.02, 0.71, 0.83], [0.93, 0.28, 0.6]],
          frag: SHADER_COMMON + SHADER_NOISE + `
            void main() {
              vec2 uv = v_uv;
              float t = u_time * u_speed;
              vec2 p = vec2(uv.x * 2.0 - 1.0, (uv.y * 2.0 - 1.0) * (u_resolution.y / u_resolution.x));
              float ang = t * 0.05;
              mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
              vec2 q = rot * p * 1.4;
              float n1 = fbm(q + vec2(t * 0.05, 0.0));
              float n2 = fbm(q * 1.8 - vec2(0.0, t * 0.06));
              float star = step(0.985, fbm(p * 8.0 + vec2(t * 0.02))) * 0.8;
              vec3 col = mix(u_c1, u_c2, n1);
              col = mix(col, u_c3, n2 * 0.7);
              col += vec3(0.9, 0.95, 1.0) * star * 0.5;
              col *= 0.5 + 0.5 * u_intensity;
              gl_FragColor = vec4(col, 1.0);
            }
          `
        }
      };

      function shaderPalette(id) {
        return SHADER_PRESETS[id] || SHADER_PRESETS["shader-aurora"];
      }      function compileShader(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.warn("dsh-mood-wallpaper: shader compile failed", gl.getShaderInfoLog(s));
          gl.deleteShader(s);
          return null;
        }
        return s;
      }
      function initShader(id) {
        disposeShader();
        const canvas = document.createElement("canvas");
        canvas.className = "dswm-shader";
        mediaWrap.appendChild(canvas);
        let gl = null;
        try {
          gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        } catch { gl = null; }
        if (!gl) {
          canvas.remove();
          canvas.className = "dswm-shader-fallback";
          canvas.style.background = "linear-gradient(135deg, " + shaderPalette(id).hex.join(",") + ")";
          mediaWrap.appendChild(canvas);
          return;
        }
        const vs = compileShader(gl, gl.VERTEX_SHADER, SHADER_VERT);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, shaderPalette(id).frag);
        if (!vs || !fs) { canvas.remove(); return; }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.warn("dsh-mood-wallpaper: program link failed", gl.getProgramInfoLog(prog));
          canvas.remove();
          return;
        }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        shader = {
          gl, canvas, prog, id,
          locTime: gl.getUniformLocation(prog, "u_time"),
          locRes: gl.getUniformLocation(prog, "u_resolution"),
          locSpeed: gl.getUniformLocation(prog, "u_speed"),
          locInt: gl.getUniformLocation(prog, "u_intensity"),
          locC1: gl.getUniformLocation(prog, "u_c1"),
          locC2: gl.getUniformLocation(prog, "u_c2"),
          locC3: gl.getUniformLocation(prog, "u_c3"),
          raf: null
        };
        resizeShader();
        renderShaderFrame(0);
        if (!reducedMotion) shader.raf = requestAnimationFrame(shaderLoop);
      }
      function resizeShader() {
        if (!shader) return;
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        const w = Math.max(2, Math.round(mediaWrap.clientWidth * dpr));
        const h = Math.max(2, Math.round(mediaWrap.clientHeight * dpr));
        if (shader.canvas.width !== w || shader.canvas.height !== h) {
          shader.canvas.width = w;
          shader.canvas.height = h;
        }
        shader.gl.viewport(0, 0, w, h);
        shader.gl.uniform2f(shader.locRes, w, h);
      }
      function renderShaderFrame(t) {
        const s = shader;
        if (!s) return;
        const gl = s.gl;
        const pal = shaderPalette(s.id);
        gl.uniform1f(s.locTime, t);
        gl.uniform1f(s.locSpeed, machineState === "thinking" ? 2.2 : machineState === "done" ? 1.5 : 1);
        gl.uniform1f(s.locInt, Math.max(0.2, Number(cfg.intensity) || 1));
        gl.uniform3f(s.locC1, pal.rgb[0][0], pal.rgb[0][1], pal.rgb[0][2]);
        gl.uniform3f(s.locC2, pal.rgb[1][0], pal.rgb[1][1], pal.rgb[1][2]);
        gl.uniform3f(s.locC3, pal.rgb[2][0], pal.rgb[2][1], pal.rgb[2][2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      function shaderLoop() {
        if (!shader) return;
        if (document.hidden) { shader.raf = null; return; }
        renderShaderFrame(performance.now() / 1000);
        shader.raf = requestAnimationFrame(shaderLoop);
      }
      function disposeShader() {
        if (!shader) return;
        if (shader.raf) cancelAnimationFrame(shader.raf);
        try {
          const ext = shader.gl.getExtension("WEBGL_lose_context");
          if (ext) ext.loseContext();
        } catch { /* ignore */ }
        shader = null;
      }

      function applyShaderWallpaper(w) {
        const pal = shaderPalette(w.id);
        currentStyle = { palette: pal.hex, accent: pal.accent, mode: "balanced", glow: 0.6 };
        applyStyle();
        store.set({ analyzing: null, analysisInfo: { shader: true } });
        initShader(w.id);
      }

      // ================= 列表 / 导入 / 删除 =================
      async function loadWallpapers() {
        try {
          const res = await fetch(API + "/list");
          const data = await res.json();
          if (!data || !data.ok) {
            store.set({ error: (data && data.error) || "壁纸列表加载失败" });
            return;
          }
          const users = data.users || [];
          const builtins = data.builtins || [];
          store.set({ users, builtins, error: null });
          const all = users.concat(builtins);
          if (all.length === 0) {
            store.set({ error: "没有可用壁纸" });
            return;
          }
          let target = cfg.wallpaperId && all.some((w) => w.id === cfg.wallpaperId) ? cfg.wallpaperId : all[0].id;
          await applyWallpaper(target);
        } catch (e) {
          store.set({ error: String((e && e.message) || e) });
        }
      }

      async function importFile(file) {
        store.set({ importing: true, error: null });
        try {
          const res = await fetch(API + "/import?name=" + encodeURIComponent(file.name), { method: "POST", body: file });
          const data = await res.json();
          if (!data || !data.ok) throw new Error((data && data.error) || "导入失败");
          cfg.wallpaperId = data.wallpaper.id;
          saveConfig();
          await loadWallpapers();
        } catch (e) {
          store.set({ error: String((e && e.message) || e) });
        }
        store.set({ importing: false });
      }

      async function removeWallpaper(id) {
        try {
          await fetch(API + "/delete?name=" + encodeURIComponent(id), { method: "POST" });
          if (cfg.analysis && cfg.analysis[id]) {
            const next = Object.assign({}, cfg.analysis);
            delete next[id];
            cfg.analysis = next;
          }
          if (cfg.wallpaperId === id) cfg.wallpaperId = null;
          saveConfig();
          await loadWallpapers();
        } catch (e) {
          store.set({ error: String((e && e.message) || e) });
        }
      }

      function reanalyze() {
        if (!state.current) return;
        if (cfg.analysis && cfg.analysis[state.current.id]) {
          const next = Object.assign({}, cfg.analysis);
          delete next[state.current.id];
          cfg.analysis = next;
          saveConfig();
        }
        analyzeWallpaper(state.current);
      }

      // ================= 粒子引擎（Canvas，按状态/特效切换动作） =================
      let particles = [];
      let engineState = "idle";
      let raf = null;
      let currentColors = PRESETS.aurora.palette.concat([PRESETS.aurora.accent]);
      let reducedMotion = false;
      try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { reducedMotion = false; }

      // ---- 会思考的代码雨（字符取自真实对话 token） ----
      const RAIN_FALLBACK = "アイウエオカキクケコサシスセソタチツテト01X$#&*+=<>";
      function initRain() {
        const cols = Math.max(24, Math.floor(innerWidth / 26));
        rain = [];
        for (let i = 0; i < cols; i++) {
          rain.push({
            x: i * (innerWidth / cols),
            y: Math.random() * innerHeight,
            baseSpeed: 0.6 + Math.random() * 1.6,
            speed: 0.6,
            len: 3 + Math.floor(Math.random() * 10)
          });
        }
      }
      initRain();
      // 思考时从 partial 实时收集字符（token 源：对话真实内容）
      let tokenBuf = [];
      function feedTokens(snap) {
        if (!snap || !snap.partial || !snap.partial.blocks) return;
        for (const b of snap.partial.blocks) {
          if ((b.kind === "text" || b.kind === "reasoning") && b.text) {
            for (const ch of b.text) {
              if (ch.trim()) tokenBuf.push(ch);
            }
          }
        }
        if (tokenBuf.length > 600) tokenBuf.splice(0, tokenBuf.length - 600);
      }
      function rainChar() {
        if (tokenBuf.length > 0) return tokenBuf[Math.floor(Math.random() * tokenBuf.length)];
        return RAIN_FALLBACK[Math.floor(Math.random() * RAIN_FALLBACK.length)];
      }

      // ---- 敲击能量场 ----
      const keystrokes = [];
      function onKeyDown(e) {
        if (!cfg.enabled || reducedMotion) return;
        if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta" || e.key === "CapsLock") return;
        if (cfg.fx && cfg.fx.keyboard) {
          const now = Date.now();
          keystrokes.push(now);
          if (keystrokes.length > 80) keystrokes.shift();
          const intensity = Math.max(0.2, Number(cfg.intensity) || 1);
          spawnKeyboardSparks(intensity);
        }
        if (cfg.fx && cfg.fx.keysound) pluck();
        ensureAudioGesture();
      }
      window.addEventListener("keydown", onKeyDown);

      function spawnKeyboardSparks(intensity) {
        const n = Math.round(2 * intensity);
        for (let i = 0; i < n && particles.length < 130; i++) {
          const x = Math.random() * innerWidth;
          particles.push({
            x,
            y: innerHeight * (0.78 + Math.random() * 0.08),
            r: 1 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -(1.2 + Math.random() * 2) * intensity,
            a: 0.5 + Math.random() * 0.35,
            tw: Math.random() * Math.PI * 2,
            c: currentColors[Math.floor(Math.random() * currentColors.length)],
            spark: true
          });
        }
        if (Math.random() < 0.25) {
          particles.push({
            x: Math.random() * innerWidth,
            y: innerHeight * 0.8,
            r: 2 + Math.random() * 3,
            vx: 0, vy: 0, a: 0.5, tw: 0,
            c: currentColors[1] || currentColors[0],
            ring: true
          });
        }
      }

      // ---- 键盘乐章（敲击即合成器，默认关） ----
      const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 698.46, 783.99];
      let noteIdx = 0;
      function pluck() {
        if (!audioCtx || !cfg.fx || !cfg.fx.keysound) return;
        const o = audioCtx.createOscillator();
        o.type = "triangle";
        o.frequency.value = PENTA[noteIdx % PENTA.length];
        noteIdx++;
        const g = audioCtx.createGain();
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.18);
      }

      // ---- 思维投影：工具节点 ----
      let toolNodes = [];
      let knownTools = new Set();
      function spawnToolNode(name) {
        if (!cfg.fx || !cfg.fx.thought) return;
        toolNodes.push({
          name,
          icon: toolIcon(name),
          x: innerWidth * (0.18 + Math.random() * 0.64),
          y: innerHeight * (0.2 + Math.random() * 0.45),
          t0: performance.now(),
          life: 4200
        });
        if (toolNodes.length > 8) toolNodes.shift();
      }
      function syncTools(snap) {
        const names = (snap && snap.runningCalls || []).map((c) => c.name);
        for (const n of names) {
          if (!knownTools.has(n)) {
            knownTools.add(n);
            if (machineState === "thinking") spawnToolNode(n);
          }
        }
      }
      function resetTools() {
        toolNodes = [];
        knownTools = new Set();
      }

      // ---- 环境音（WebAudio 纯合成，无素材） ----
      let audioCtx = null;
      let amb = null;
      let gestureHooked = false;
      function ensureAudio() {
        if (audioCtx) return audioCtx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          audioCtx = new AC();
          const len = audioCtx.sampleRate * 2;
          const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
          const noise = audioCtx.createBufferSource();
          noise.buffer = buf;
          noise.loop = true;
          const filter = audioCtx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.value = 900;
          filter.Q.value = 0.6;
          const noiseGain = audioCtx.createGain();
          noiseGain.gain.value = 0;
          noise.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(audioCtx.destination);
          const osc = audioCtx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = 110;
          const osc2 = audioCtx.createOscillator();
          osc2.type = "sine";
          osc2.frequency.value = 165;
          const padGain = audioCtx.createGain();
          padGain.gain.value = 0;
          const lfo = audioCtx.createOscillator();
          lfo.frequency.value = 0.08;
          const lfoGain = audioCtx.createGain();
          lfoGain.gain.value = 0.004;
          lfo.connect(lfoGain);
          lfoGain.connect(padGain.gain);
          osc.connect(padGain);
          osc2.connect(padGain);
          padGain.connect(audioCtx.destination);
          noise.start();
          osc.start();
          osc2.start();
          lfo.start();
          amb = { noiseGain, filter, padGain };
          return audioCtx;
        } catch {
          return null;
        }
      }
      function ensureAudioGesture() {
        if (!cfg.fx || !cfg.fx.sound || !cfg.enabled) return;
        if (gestureHooked || audioCtx) return;
        gestureHooked = true;
        const kick = () => {
          const ac = ensureAudio();
          if (ac && ac.state === "suspended") ac.resume();
          window.removeEventListener("pointerdown", kick);
          window.removeEventListener("keydown", kick);
        };
        window.addEventListener("pointerdown", kick, { once: true });
        window.addEventListener("keydown", kick, { once: true });
      }
      function ambState(s) {
        if (!amb || !audioCtx) return;
        const base = cfg.fx && cfg.fx.sound && cfg.enabled ? 1 : 0;
        if (s === "thinking") {
          amb.noiseGain.gain.setTargetAtTime(0.035 * base, audioCtx.currentTime, 0.6);
          amb.filter.frequency.setTargetAtTime(1600, audioCtx.currentTime, 0.6);
          amb.padGain.gain.setTargetAtTime(0.02 * base, audioCtx.currentTime, 0.6);
        } else if (s === "done") {
          amb.noiseGain.gain.setTargetAtTime(0.02 * base, audioCtx.currentTime, 0.4);
          amb.filter.frequency.setTargetAtTime(900, audioCtx.currentTime, 0.4);
          amb.padGain.gain.setTargetAtTime(0.012 * base, audioCtx.currentTime, 0.4);
          blip();
        } else {
          amb.noiseGain.gain.setTargetAtTime(0.012 * base, audioCtx.currentTime, 0.8);
          amb.filter.frequency.setTargetAtTime(900, audioCtx.currentTime, 0.8);
          amb.padGain.gain.setTargetAtTime(0.008 * base, audioCtx.currentTime, 0.8);
        }
      }
      function blip() {
        if (!audioCtx || !amb) return;
        const o = audioCtx.createOscillator();
        o.type = "sine";
        o.frequency.value = 660;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.05, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + 0.4);
      }

      // ---- 鼠标视差 + 尾迹粒子 ----
      let mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
      let lastTrail = 0;
      function onPointerMove(e) {
        if (!cfg.enabled) return;
        if (cfg.fx && cfg.fx.parallax) {
          mouse.tx = e.clientX / innerWidth;
          mouse.ty = e.clientY / innerHeight;
        }
        if (cfg.fx && cfg.fx.trail && !reducedMotion) {
          const now = performance.now();
          if (now - lastTrail > 28 && particles.length < 150) {
            lastTrail = now;
            particles.push({
              x: e.clientX,
              y: e.clientY,
              r: 0.8 + Math.random() * 1.6,
              vx: 0, vy: 0,
              a: 0.22 + Math.random() * 0.16,
              tw: 0,
              c: currentColors[Math.floor(Math.random() * currentColors.length)],
              trail: true
            });
          }
        }
      }
      window.addEventListener("pointermove", onPointerMove);

      // ---- 可见性暂停 ----
      function onVisibility() {
        if (document.hidden) {
          if (raf) { cancelAnimationFrame(raf); raf = null; }
          if (shader && shader.raf) { cancelAnimationFrame(shader.raf); shader.raf = null; }
          if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
        } else {
          if (!raf) raf = requestAnimationFrame(tick);
          if (shader && !shader.raf && !reducedMotion) shader.raf = requestAnimationFrame(shaderLoop);
          if (audioCtx && audioCtx.state === "suspended" && cfg.fx && cfg.fx.sound && cfg.enabled) audioCtx.resume();
        }
      }
      document.addEventListener("visibilitychange", onVisibility);

      function spawnAmbient(n) {
        for (let i = 0; i < n && particles.length < 110; i++) {
          particles.push({
            x: Math.random() * innerWidth,
            y: innerHeight + 20 + Math.random() * innerHeight * 0.3,
            r: 0.8 + Math.random() * 2.4,
            vy: -(0.15 + Math.random() * 0.5) * (0.8 + cfg.intensity * 0.4),
            vx: (Math.random() - 0.5) * 0.3,
            a: 0.12 + Math.random() * 0.25,
            tw: Math.random() * Math.PI * 2,
            c: currentColors[Math.floor(Math.random() * currentColors.length)]
          });
        }
      }

      function burst(cx, cy, n) {
        for (let i = 0; i < n && particles.length < 150; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 1.5 + Math.random() * 5;
          particles.push({
            x: cx,
            y: cy,
            r: 1 + Math.random() * 3,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 0.6,
            a: 0.5 + Math.random() * 0.4,
            tw: Math.random() * Math.PI * 2,
            c: currentColors[Math.floor(Math.random() * currentColors.length)],
            burst: true
          });
        }
      }

      function engineSetState(s) {
        engineState = s;
        if (s === "done") {
          burst(innerWidth / 2, innerHeight * 0.42, Math.round(60 * cfg.intensity));
          for (const tn of toolNodes) {
            burst(tn.x, tn.y, 10);
          }
          toolNodes = [];
          knownTools = new Set();
        }
        ambState(s);
      }

      function tick() {
        if (document.hidden) { raf = null; return; }
        pctx.clearRect(0, 0, innerWidth, innerHeight);

        // 鼠标视差平滑
        mouse.x += (mouse.tx - mouse.x) * 0.05;
        mouse.y += (mouse.ty - mouse.y) * 0.05;
        const px = (mouse.x - 0.5) * 26;
        const py = (mouse.y - 0.5) * 18;
        glowEl.style.transform = "translate3d(" + px + "px," + py + "px,0)";

        // 敲击能量场：输入密度 → 粒子速度加成
        const nowMs = Date.now();
        while (keystrokes.length > 0 && keystrokes[0] < nowMs - 1200) keystrokes.shift();
        const typingRate = keystrokes.length / 1.2;

        const target = engineState === "thinking"
          ? Math.round(26 * cfg.intensity)
          : engineState === "done" ? 8 : 12;
        let ambient = 0;
        for (const p of particles) if (!p.burst && !p.spark && !p.ring) ambient++;
        if (ambient < target) spawnAmbient(target - ambient);

        // 思维投影：思考时粒子向核心汇聚
        const cx = innerWidth / 2, cy = innerHeight * 0.42;
        const converge = engineState === "thinking" && cfg.fx && cfg.fx.thought ? 0.00035 : 0;

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.tw += 0.05;
          if (converge && !p.burst && !p.ring) {
            p.vx += (cx - p.x) * converge;
            p.vy += (cy - p.y) * converge;
          }
          if (p.spark) {
            p.vy -= 0.02 * typingRate;
          }
          if (p.trail) {
            p.a *= 0.94;
          }
          if (p.burst) {
            p.vy += 0.02;
            p.a *= 0.985;
          }
          const alpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
          if (alpha <= 0.01) {
            particles.splice(i, 1);
            continue;
          }
          pctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          pctx.fillStyle = p.c;
          if (p.ring) {
            p.r += 0.5;
            pctx.strokeStyle = p.c;
            pctx.lineWidth = 1.5;
            pctx.globalAlpha = Math.max(0, alpha * 0.8);
            pctx.beginPath();
            pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            pctx.stroke();
            if (p.r > 42) {
              particles.splice(i, 1);
              continue;
            }
          } else {
            pctx.beginPath();
            pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            pctx.fill();
          }
          if (p.y < -30 || p.x < -30 || p.x > innerWidth + 30 || p.y > innerHeight + 60) particles.splice(i, 1);
        }
        pctx.globalAlpha = 1;

        // 会思考的代码雨：字符来自真实对话 token，思考时雨势暴涨
        if (cfg.fx && cfg.fx.coderain && !reducedMotion) {
          const intense = engineState === "thinking";
          const speedMul = intense ? 2.4 : 0.55;
          const alphaBase = intense ? 0.38 : 0.11;
          pctx.font = "13px 'Cascadia Mono', Consolas, 'Courier New', monospace";
          pctx.textAlign = "left";
          for (const col of rain) {
            col.speed += (col.baseSpeed * speedMul - col.speed) * 0.06;
            col.y += col.speed;
            if (col.y > innerHeight + 30) col.y = -20 - Math.random() * 90;
            pctx.fillStyle = currentColors[1] || "#38bdf8";
            pctx.globalAlpha = alphaBase;
            pctx.fillText(rainChar(), col.x, col.y);
            if (col.len > 1) {
              pctx.globalAlpha = alphaBase * 0.35;
              for (let j = 1; j < col.len; j++) pctx.fillText(rainChar(), col.x, col.y - j * 14);
            }
          }
          pctx.globalAlpha = 1;
        }

        // 思维投影：绘制工具节点
        if (engineState === "thinking" && cfg.fx && cfg.fx.thought) {
          const t = performance.now();
          pctx.textAlign = "center";
          pctx.textBaseline = "middle";
          for (let i = toolNodes.length - 1; i >= 0; i--) {
            const tn = toolNodes[i];
            const age = t - tn.t0;
            if (age > tn.life) { toolNodes.splice(i, 1); continue; }
            const life = 1 - age / tn.life;
            const bob = Math.sin(t / 700 + tn.x) * 6;
            const y = tn.y + bob;
            pctx.font = "20px sans-serif";
            pctx.globalAlpha = 0.85 * life;
            pctx.fillText(tn.icon, tn.x, y);
            pctx.font = "12px sans-serif";
            pctx.globalAlpha = 0.65 * life;
            pctx.fillStyle = "#ffffff";
            pctx.shadowColor = "rgba(0,0,0,0.6)";
            pctx.shadowBlur = 6;
            pctx.fillText(tn.name.length > 22 ? tn.name.slice(0, 21) + "…" : tn.name, tn.x, y + 22);
            pctx.shadowBlur = 0;
          }
          pctx.globalAlpha = 1;
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);

      // ================= 状态机：idle / thinking / done =================
      let machineState = "idle";
      let wasActive = false;
      let doneTimer = null;

      function isActive(snap) {
        if (!snap) return false;
        if (snap.openState !== "open") return false;
        if (snap.partial) return true;
        if (snap.runningCalls && snap.runningCalls.length > 0) return true;
        if (snap.turnTimings) {
          for (const t of snap.turnTimings.values()) {
            if (t && t.startTime !== void 0 && t.endTime === void 0) return true;
          }
        }
        return false;
      }

      function setMachine(next) {
        if (machineState === next) return;
        machineState = next;
        wallEl.setAttribute("data-state", next);
        engineSetState(next);
        if (next === "thinking" && cfg.doneFx && doneTimer) {
          clearTimeout(doneTimer);
          doneTimer = null;
        }
      }

      function onSnapshot(snap) {
        if (!cfg.enabled) {
          setMachine("idle");
          wasActive = isActive(snap);
          return;
        }
        const active = isActive(snap);
        if (active) {
          feedTokens(snap);
          syncTools(snap);
        }
        if (active && !wasActive) {
          setMachine("thinking");
        } else if (!active && wasActive) {
          if (cfg.doneFx) {
            setMachine("done");
            if (!doneTimer) {
              doneTimer = setTimeout(() => {
                doneTimer = null;
                if (machineState === "done") setMachine("idle");
              }, 1700);
            }
          } else {
            setMachine("idle");
          }
        }
        wasActive = active;
      }

      // ================= 会话观察 =================
      let unsubList = null;
      let unsubSession = null;
      function observeCurrent() {
        if (unsubSession) { unsubSession(); unsubSession = null; }
        let list = null;
        try { list = ctx.sessions.list.getSnapshot(); } catch { list = null; }
        const sid = list && list.current;
        if (!sid) { onSnapshot(null); return; }
        let binding = null;
        try { binding = ctx.sessions.binding(sid); } catch { binding = null; }
        if (!binding || !binding.session) { onSnapshot(null); return; }
        const session = binding.session;
        unsubSession = session.subscribe(() => onSnapshot(session.getSnapshot()));
        onSnapshot(session.getSnapshot());
      }
      unsubList = ctx.sessions.list.subscribe(observeCurrent);
      observeCurrent();

      // ================= 配置写入 =================
      function applyConfig(patch) {
        Object.assign(cfg, patch);
        saveConfig();
        store.set(patch);
        applyStyle();
        if (patch.enabled !== void 0) {
          if (!cfg.enabled) setMachine("idle");
          else onSnapshot(null);
        }
        if (patch.wallpaperId !== void 0 && patch.wallpaperId !== state.current?.id) {
          applyWallpaper(patch.wallpaperId);
        }
        if (patch.style !== void 0 || patch.intensity !== void 0) {
          applyAnalysis(state.current ? state.current.id : null, cfg.analysis && state.current ? cfg.analysis[state.current.id] : null);
        }
        if (patch.fx !== void 0) {
          if (patch.fx.sound && !audioCtx) ensureAudioGesture();
          if (!patch.fx.sound && audioCtx) ambState("idle");
        }
      }

      applyStyle();

      // ================= 设置页 UI =================
      function FxToggle({ label, hint, checked, onChange }) {
        return h("div", { className: "dswm-row" }, [
          h("div", { className: "dswm-grow" }, [
            h("div", { className: "dswm-hint", style: { fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-primary)" } }, label),
            h("div", { className: "dswm-hint" }, hint)
          ]),
          h("label", { className: "dswm-switch" }, [
            h("input", { type: "checkbox", checked, "aria-label": label, onChange }),
            h("span", { className: "dswm-track" }),
            h("span", { className: "dswm-thumb" })
          ])
        ]);
      }

      function SettingsView() {
        const [snap, setSnap] = React.useState(store.get());
        React.useEffect(() => store.subscribe(setSnap), []);

        const all = snap.users.concat(snap.builtins);
        const stateLabel = snap.enabled
          ? machineState === "thinking" ? "思考中 · Thinking" : machineState === "done" ? "完成 · Done" : "空闲 · Idle"
          : "已停用 · Off";
        const fileInputRef = React.useRef(null);

        function onPick(e) {
          const file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (file) importFile(file);
        }
        function setFx(key, value) {
          applyConfig({ fx: Object.assign({}, cfg.fx, { [key]: value }) });
        }

        const thumb = (w) => {
          if (w.kind === "shader") {
            const pal = shaderPalette(w.id);
            return h("div", {
              style: {
                width: "100%", height: "84px",
                background: "linear-gradient(135deg, " + pal.hex.join(",") + ")",
                position: "relative"
              }
            }, h("span", {
              style: {
                position: "absolute", left: 6, bottom: 4,
                fontSize: "10px", color: "#fff",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)"
              }
            }, "⚡ WebGL"));
          }
          if ((w.mime || "").startsWith("video/")) {
            return h("video", { src: w.url, muted: true, loop: true, playsInline: true, preload: "metadata" });
          }
          return h("img", { src: w.url, alt: w.name });
        };

        return h("div", { className: "dswm-page" }, [
          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-row" }, [
              h("div", { className: "dswm-grow" }, [
                h("div", { className: "dswm-title" }, "状态壁纸 · Mood Wallpaper"),
                h("div", { className: "dswm-hint" }, "后台分析壁纸（主色调/亮度/动态能量），状态机 idle / thinking / done 自动切换动作；空闲时壁纸本身也保持动态")
              ]),
              h("label", { className: "dswm-switch" }, [
                h("input", {
                  type: "checkbox",
                  checked: snap.enabled,
                  "aria-label": "启用状态壁纸",
                  onChange: (e) => applyConfig({ enabled: e.target.checked })
                }),
                h("span", { className: "dswm-track" }),
                h("span", { className: "dswm-thumb" })
              ])
            ]),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-hint" }, "当前状态"),
              h("span", { className: "dswm-state-pill" }, stateLabel),
              snap.analysisInfo
                ? (snap.analysisInfo.shader
                  ? h("span", { className: "dswm-hint" }, "实时着色器 · WebGL 60fps")
                  : h("span", { className: "dswm-hint" }, "亮度 " + snap.analysisInfo.brightness + "% · 饱和度 " + snap.analysisInfo.saturation + "% · 动感 " + snap.analysisInfo.motion + "% · " + (snap.analysisInfo.mode === "lively" ? "活泼" : snap.analysisInfo.mode === "calm" ? "克制" : "均衡") + "模式"))
                : snap.analyzing
                  ? h("span", { className: "dswm-hint" }, "分析中…")
                  : null
            ]),
            snap.error ? h("div", { className: "dswm-error" }, snap.error) : null
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-row" }, [
              h("div", { className: "dswm-grow" }, [
                h("div", { className: "dswm-title" }, "壁纸"),
                h("div", { className: "dswm-hint" }, "点击应用；GIF/APNG/SVG/MP4/WebM 会持续动态播放")
              ]),
              h("input", {
                ref: fileInputRef,
                type: "file",
                accept: ".gif,.mp4,.webm,.apng,.png,.jpg,.jpeg,.webp,.svg,.bmp,.avif,image/*,video/*",
                style: { display: "none" },
                onChange: onPick
              }),
              h("button", {
                className: "dswm-btn dswm-btn-primary",
                onClick: () => fileInputRef.current && fileInputRef.current.click(),
                disabled: snap.importing
              }, snap.importing ? "导入中…" : "导入壁纸")
            ]),
            all.length === 0
              ? h("div", { className: "dswm-hint" }, "暂无壁纸")
              : h("div", { className: "dswm-grid" }, all.map((w) => h("div", {
                  key: w.id,
                  className: "dswm-cell" + (snap.current && snap.current.id === w.id ? " dswm-sel" : ""),
                  onClick: () => applyConfig({ wallpaperId: w.id })
                }, [
                  thumb(w),
                  h("div", { className: "dswm-badge" }, w.kind === "user" ? "导入" : "内置"),
                  w.kind === "user"
                    ? h("button", {
                        className: "dswm-del",
                        title: "删除",
                        onClick: (e) => { e.stopPropagation(); removeWallpaper(w.id); }
                      }, "×")
                    : null,
                  h("div", { className: "dswm-cell-name" }, w.name),
                  snap.analyzing === w.id ? h("div", { className: "dswm-analyzing" }, "分析中…") : null
                ]))),
            h("div", { className: "dswm-row" }, [
              h("button", { className: "dswm-btn", onClick: reanalyze, disabled: !snap.current }, "重新分析当前壁纸"),
              h("span", { className: "dswm-hint" }, "分析结果缓存于 localStorage")
            ])
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "状态机与动效"),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "叠加风格"),
              h("select", {
                className: "dswm-select dswm-grow",
                value: snap.style,
                onChange: (e) => applyConfig({ style: e.target.value })
              }, [
                h("option", { value: "auto" }, "自动（随壁纸分析）"),
                ...Object.keys(PRESETS).map((key) => h("option", { value: key }, PRESETS[key].label))
              ])
            ]),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "动效强度"),
              h("select", {
                className: "dswm-select dswm-grow",
                value: snap.intensity,
                onChange: (e) => applyConfig({ intensity: Number(e.target.value) })
              }, INTENSITIES.map((it) => h("option", { value: it.value }, it.label)))
            ]),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "Ken Burns"),
              h("label", { className: "dswm-switch" }, [
                h("input", {
                  type: "checkbox",
                  checked: snap.kenburns,
                  "aria-label": "慢速缩放平移",
                  onChange: (e) => applyConfig({ kenburns: e.target.checked })
                }),
                h("span", { className: "dswm-track" }),
                h("span", { className: "dswm-thumb" })
              ]),
              h("span", { className: "dswm-hint" }, "壁纸缓慢缩放平移（静态图也动起来）")
            ]),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "完成动效"),
              h("label", { className: "dswm-switch" }, [
                h("input", {
                  type: "checkbox",
                  checked: snap.doneFx,
                  "aria-label": "思考完成时播放完成动效",
                  onChange: (e) => applyConfig({ doneFx: e.target.checked })
                }),
                h("span", { className: "dswm-track" }),
                h("span", { className: "dswm-thumb" })
              ]),
              h("span", { className: "dswm-hint" }, "思考结束时光环+粒子爆散")
            ])
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "特效与氛围 · Effects & Vibes"),
            FxToggle({
              label: "敲击能量场",
              hint: "敲键盘泛起能量火花，节奏随输入密度增强",
              checked: snap.fx.keyboard,
              onChange: (e) => setFx("keyboard", e.target.checked)
            }),
            FxToggle({
              label: "思维投影",
              hint: "思考时粒子向核心汇聚，工具调用浮现图标节点",
              checked: snap.fx.thought,
              onChange: (e) => setFx("thought", e.target.checked)
            }),
            FxToggle({
              label: "CRT 终端美学",
              hint: "扫描线 + 暗角 + 轻微闪烁，复古终端观感",
              checked: snap.fx.crt,
              onChange: (e) => setFx("crt", e.target.checked)
            }),
            FxToggle({
              label: "昼夜循环",
              hint: "按本地时间染色（晨/昼/暮/夜）",
              checked: snap.fx.daynight,
              onChange: (e) => setFx("daynight", e.target.checked)
            }),
            FxToggle({
              label: "鼠标视差",
              hint: "光层随鼠标微移，景深感",
              checked: snap.fx.parallax,
              onChange: (e) => setFx("parallax", e.target.checked)
            }),
            FxToggle({
              label: "环境音",
              hint: "WebAudio 纯合成雨声+低音垫，思考时渐强、完成一声提示；首次交互后启动",
              checked: snap.fx.sound,
              onChange: (e) => setFx("sound", e.target.checked)
            }),
            FxToggle({
              label: "会思考的代码雨",
              hint: "字符取自真实对话 token，思考时雨势暴涨",
              checked: snap.fx.coderain,
              onChange: (e) => setFx("coderain", e.target.checked)
            }),
            FxToggle({
              label: "鼠标尾迹",
              hint: "指针拖出与壁纸主色联动的粒子流",
              checked: snap.fx.trail,
              onChange: (e) => setFx("trail", e.target.checked)
            }),
            FxToggle({
              label: "键盘乐章",
              hint: "敲击即合成器（五声音阶），默认关",
              checked: snap.fx.keysound,
              onChange: (e) => setFx("keysound", e.target.checked)
            }),
            h("div", { className: "dswm-hint" }, "页面不可见时自动暂停全部动画/音频；系统开启「减少动态效果」时自动降级。")
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "背景透明化"),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "背景透明度"),
              h("input", {
                className: "dswm-slider",
                type: "range", min: 0, max: 100, step: 5,
                value: snap.baseAlpha,
                onChange: (e) => applyConfig({ baseAlpha: Number(e.target.value) })
              }),
              h("span", { className: "dswm-hint dswm-num" }, snap.baseAlpha + "%")
            ]),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "面板透明度"),
              h("input", {
                className: "dswm-slider",
                type: "range", min: 0, max: 100, step: 5,
                value: snap.panelAlpha,
                onChange: (e) => applyConfig({ panelAlpha: Number(e.target.value) })
              }),
              h("span", { className: "dswm-hint dswm-num" }, snap.panelAlpha + "%")
            ]),
            h("div", { className: "dswm-hint" }, "背景透明度越低，壁纸越明显；与壁纸轮换/换肤插件可共存（各自独立图层）。")
          ]),

          h("div", { className: "dswm-hint" }, "配置与分析缓存保存在浏览器 localStorage；导入的壁纸存于 $DSH_HOME/dsh-mood-wallpaper/。")
        ]);
      }

      ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register(
        { name: "settings.section", id: "mood-wallpaper", order: 30, label: "状态壁纸 · Mood" },
        () => h("div", { className: "dswm-page" }, h(SettingsView))
      )), "dsh-mood-wallpaper: settings section");

      // ================= 启动 =================
      loadWallpapers();

      // ================= 卸载清理 =================
      ctx.effect(() => () => {
        if (raf) cancelAnimationFrame(raf);
        disposeShader();
        if (unsubList) unsubList();
        if (unsubSession) unsubSession();
        if (doneTimer) clearTimeout(doneTimer);
        clearInterval(dayTimer);
        if (disposeOverrides) disposeOverrides();
        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("visibilitychange", onVisibility);
        if (audioCtx && audioCtx.state === "running") audioCtx.close();
        if (wallEl && wallEl.parentNode) wallEl.parentNode.removeChild(wallEl);
        styleEl.remove();
      }, "dsh-mood-wallpaper: cleanup");
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
