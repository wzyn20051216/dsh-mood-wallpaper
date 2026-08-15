/**
 * dsh-mood-wallpaper — browser half (v2: wallpaper-aware state engine).
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
 *           │                   │                     │
 *       壁纸自身动画          光带+粒子+加速KenBurns     光环+闪光+粒子爆散
 *       +慢速KenBurns        +暗角脉冲（按亮度自适应）      （一次性，按色板）
 *       +氛围呼吸光
 *
 *   空闲时壁纸本身保持动态（GIF/视频/SVG 动画 + Ken Burns），绝不死板。
 *
 * 实现要点：
 *   - 壁纸层独立 <div>（z-index:-1）+ 私有 <style>，类前缀 dswm-
 *   - 媒体元素 <img>（GIF/SVG/静态）或 <video muted loop autoplay>（MP4/WebM）
 *   - 分析在浏览器后台完成（ImageDecoder，无 ImageDecoder 时回退首帧），
 *     结果缓存到 localStorage，重启不重复分析
 *   - 状态输入来自当前会话 ConversationSnapshot（partial/runningCalls/turnTimings）
 *   - 配置存 localStorage；分析缓存可随壁纸列表由 host 持久化
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

    function loadConfig() {
      try {
        const raw = localStorage.getItem(CFG_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        const parsed = JSON.parse(raw);
        return Object.assign({}, DEFAULTS, parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        return Object.assign({}, DEFAULTS);
      }
    }

    function saveConfig() {
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      } catch { /* 写入失败不阻断 */ }
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
      let cfg = loadConfig();

      // ================= 小型内存 store（设置页用；含配置字段，UI 单数据源） =================
      const listeners = new Set();
      const state = Object.assign({
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
        set(patch) { Object.assign(state, patch); for (const l of listeners) l(state); },
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
        '<canvas class="dswm-canvas"></canvas>';
      document.body.appendChild(wallEl);

      const mediaWrap = wallEl.querySelector(".dswm-media");
      const canvas = wallEl.querySelector(".dswm-canvas");
      const pctx = canvas.getContext("2d");

      function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(innerWidth * dpr);
        canvas.height = Math.round(innerHeight * dpr);
        canvas.style.width = innerWidth + "px";
        canvas.style.height = innerHeight + "px";
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        mediaWrap.innerHTML = "";
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

      // ================= 粒子引擎（Canvas，按状态切换动作） =================
      let particles = [];
      let engineState = "idle";
      let raf = null;
      let currentColors = PRESETS.aurora.palette.concat([PRESETS.aurora.accent]);

      function spawnAmbient(n) {
        for (let i = 0; i < n && particles.length < 90; i++) {
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
        for (let i = 0; i < n && particles.length < 120; i++) {
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
        }
      }

      function tick() {
        pctx.clearRect(0, 0, innerWidth, innerHeight);
        const target = engineState === "thinking"
          ? Math.round(30 * cfg.intensity)
          : engineState === "done" ? 8 : 12;
        let ambient = 0;
        for (const p of particles) if (!p.burst) ambient++;
        if (ambient < target) spawnAmbient(target - ambient);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.tw += 0.05;
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
          pctx.beginPath();
          pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          pctx.fill();
          if (p.y < -30 || p.x < -30 || p.x > innerWidth + 30 || p.y > innerHeight + 60) particles.splice(i, 1);
        }
        pctx.globalAlpha = 1;
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
      }

      applyStyle();

      // ================= 设置页 UI =================
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

        const thumb = (w) => {
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
                ? h("span", { className: "dswm-hint" }, "亮度 " + snap.analysisInfo.brightness + "% · 饱和度 " + snap.analysisInfo.saturation + "% · 动感 " + snap.analysisInfo.motion + "% · " + (snap.analysisInfo.mode === "lively" ? "活泼" : snap.analysisInfo.mode === "calm" ? "克制" : "均衡") + "模式")
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
              h("span", { className: "dswm-hint" }, "分析结果缓存于 localStorage；删除缓存后重新分析")
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
        if (unsubList) unsubList();
        if (unsubSession) unsubSession();
        if (doneTimer) clearTimeout(doneTimer);
        if (disposeOverrides) disposeOverrides();
        window.removeEventListener("resize", resizeCanvas);
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
