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
 * v4 新增「创作平台化」（本版）：
 *   - 自适应性能档位：平均 FPS → 60/30/15 分档；电池供电降着色器分辨率；
 *     高上下文压力/大量工具调用减非关键特效；WebGL 上下文丢失自动恢复；
 *     设置页展示大致 GPU/CPU 开销
 *   - 记忆星图：壁纸层记忆可视化（问题=恒星/决策·工具·注入=轨道节点/错误=红色脉冲/
 *     固定记忆=金色星座，点击节点查看详情）
 *   - 场景编排器 Scene Studio：可视化编排 + idle/thinking/tool/approval/error/done
 *     状态预览 + scene.json 导出/导入 + 跨插件应用（dsh:scene 同步桌宠/HUD）
 *   - 多 Agent 任务现场：后台任务光点舰船态势（运行沿轨道/等待批准琥珀停靠/
 *     完成返回中心/失败故障波纹）
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
        keysound: false,
        alerts: true,
        whale: true,
        glass: false,
        starmap: true,
        fleet: true
      },
      analysis: {},
      /** 性能档位策略：auto（按平均 FPS 自动）| 60 | 30 | 15（手动锁定）。 */
      perfMode: "auto",
      /** 粒子密度倍率（Scene Studio 编排用）。 */
      particleDensity: 1,
      /** 壁纸/状态转场时长 ms（Scene Studio 编排用）。 */
      transitionMs: 500
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

    /** 从快照 content/block 结构抽取纯文本。 */
    function contentText(c) {
      if (!c) return "";
      if (typeof c === "string") return c;
      if (Array.isArray(c)) return c.map((b) => (b && b.text) || "").join(" ");
      if (typeof c === "object" && c.text) return c.text;
      return "";
    }
    function shortText(s, n) {
      const t = (s || "").replace(/\s+/g, " ").trim();
      return t.length > n ? t.slice(0, n - 1) + "…" : t;
    }
    function hexToRgba(hex, a) {
      try {
        const n = parseInt(hex.slice(1), 16);
        return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
      } catch {
        return "rgba(56,189,248," + a + ")";
      }
    }

    /** 场景皮肤：一键应用「壁纸 + 风格 + 特效 + 透明度」组合（皮肤中心轻量版）。 */
    const SCENE_SKINS = {
      "深海鲸语": { label: "深海鲸语", wallpaper: "shader-abyss", style: "auto", whale: true, coderain: false, crt: false, daynight: false, glass: true, keyboard: true, thought: true, baseAlpha: 50, panelAlpha: 68 },
      "极光夜航": { label: "极光夜航", wallpaper: "shader-aurora", style: "auto", whale: false, coderain: true, crt: false, daynight: true, glass: false, keyboard: true, thought: true, baseAlpha: 60, panelAlpha: 80 },
      "熔岩引擎": { label: "熔岩引擎", wallpaper: "shader-lava", style: "ember", whale: false, coderain: false, crt: true, daynight: false, glass: false, keyboard: true, thought: true, baseAlpha: 50, panelAlpha: 70 },
      "静默极简": { label: "静默极简", wallpaper: "aurora.svg", style: "mono", whale: false, coderain: false, crt: false, daynight: false, glass: false, keyboard: false, thought: false, trail: false, baseAlpha: 85, panelAlpha: 92 }
    };

    /** 鲸鱼台词（伙伴化彩蛋）。 */
    const WHALE_LINES = ["咕噜～", "🐋 一起写代码吧", "要加油哦！", "深海很安静，适合专注", "嘶… 我在听你思考", "潜下去啦～"];

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
      // ================= 早期清理注册器（防止初始化中途抛错导致 DOM/监听/订阅泄漏） =================
      const disposables = [];
      ctx.effect(() => () => {
        while (disposables.length) {
          try { disposables.pop()(); } catch { /* ignore */ }
        }
      }, "dsh-mood-wallpaper: early-cleanup");

      // ================= 配置 =================
      cfg = loadConfig();

      // ================= 小型内存 store（设置页用；含配置字段，UI 单数据源） =================
      const listeners = new Set();
      let state = Object.assign({
        users: [],
        builtins: [],
        folder: [],
        folderPath: "",
        current: null,
        analyzing: null,
        analysisInfo: null,
        importing: false,
        error: null,
        perf: null,
        scenePreview: null,
        sceneName: null
      }, cfg);
      const store = {
        get: () => state,
        set(patch) { state = Object.assign({}, state, patch); for (const l of listeners) l(state); },
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
      };

      // ================= 自适应性能档位（实时性能治理） =================
      // 自动检测平均 FPS → 60/30/15 三档；电池供电降着色器分辨率；
      // 高上下文压力/大量工具调用减非关键特效；WebGL 上下文丢失自动恢复；
      // 设置页展示大致 GPU/CPU 开销。perfMode 可手动锁定档位。
      const perf = {
        fps: 60,
        tier: "high",        // high(60) / medium(30) / low(15)
        target: 60,
        resScale: 1,         // 着色器渲染分辨率缩放（低档/电池 → 缩小）
        reduce: false,       // 软降级：关闭/弱化非关键特效（不写入配置）
        batteryDischarging: false,
        batteryLow: false,
        pressure: 0,         // 上下文压力 0-100
        toolLoad: 0,         // 并发工具调用数
        contextLost: false
      };
      let perfBattery = null;
      let currentSession = null;
      let lastFrameT = 0;
      let fpsAccum = 0;
      let fpsFrames = 0;
      let lastParticleRender = 0;
      let lastShaderRender = 0;

      function tierBaseScale(tier) {
        return tier === "high" ? 1 : tier === "medium" ? 0.7 : 0.5;
      }
      function tierTarget(tier) {
        return tier === "high" ? 60 : tier === "medium" ? 30 : 15;
      }
      function classifyFps(fps) {
        if (cfg.perfMode === "60") return "high";
        if (cfg.perfMode === "30") return "medium";
        if (cfg.perfMode === "15") return "low";
        // 滞回：升级阈值高于降级阈值，避免档位抖动
        if (perf.tier === "high") return fps < 38 ? (fps < 22 ? "low" : "medium") : "high";
        if (perf.tier === "medium") return fps < 22 ? "low" : (fps > 50 ? "high" : "medium");
        return fps > 40 ? (fps > 52 ? "high" : "medium") : "low";
      }

      function perfSnapshot() {
        return {
          fps: Math.round(perf.fps),
          tier: perf.tier,
          target: perf.target,
          mode: cfg.perfMode || "auto",
          battery: perf.batteryDischarging ? (perf.batteryLow ? "低电量" : "放电中") : (perfBattery ? "充电中" : "未知"),
          shaderPixels: shader ? shader.canvas.width + "×" + shader.canvas.height : "—",
          particleCount: particles.length,
          rainCols: rain.length,
          pressure: perf.pressure,
          toolLoad: perf.toolLoad,
          contextLost: perf.contextLost
        };
      }

      function applyPerf() {
        const stressed = perf.pressure >= 70 || perf.toolLoad >= 5;
        const reduce = perf.tier === "low" || (perf.tier === "medium" && stressed) || reducedMotion;
        if (reduce !== perf.reduce) {
          perf.reduce = reduce;
          // 肯本斯缩放平移属非关键特效：低档/高压下关闭
          wallEl.setAttribute("data-kenburns", (cfg.kenburns && !perf.reduce) ? "1" : "0");
        }
        // 节流同步到 store：仅档位/较大 FPS 变化/压力变化时触发设置页重渲染
        const snap = perfSnapshot();
        const prev = state.perf;
        if (!prev || prev.tier !== snap.tier || prev.pressure !== snap.pressure
          || Math.abs(prev.fps - snap.fps) >= 4 || prev.contextLost !== snap.contextLost) {
          store.set({ perf: snap });
        }
      }

      function updatePerf(fps) {
        perf.fps = fps;
        const tier = classifyFps(fps);
        const batScale = perf.batteryLow ? 0.6 : 1; // 电池低电量：着色器分辨率再降一档
        if (tier !== perf.tier) {
          perf.tier = tier;
          perf.target = tierTarget(tier);
        }
        const newScale = tierBaseScale(perf.tier) * batScale;
        if (newScale !== perf.resScale) {
          perf.resScale = newScale;
          if (shader) resizeShader(); // 档位/电池变化 → 即时调着色器分辨率
        }
        applyPerf();
      }

      function readPressure() {
        try {
          const face = currentSession && currentSession.projections && currentSession.projections.faceOf("contextPressure");
          const p = face ? face.getSnapshot() : null;
          if (p && p.contextWindow && p.projectedTokens) {
            return Math.min(100, Math.round((p.projectedTokens / p.contextWindow) * 100));
          }
        } catch { /* ignore */ }
        return 0;
      }

      function initBattery() {
        try {
          if (!navigator.getBattery) return;
          navigator.getBattery().then((b) => {
            perfBattery = b;
            const update = () => {
              perf.batteryDischarging = !!b.discharging;
              perf.batteryLow = b.level <= 0.2 || (b.discharging && b.level <= 0.4);
              updatePerf(perf.fps); // 电池状态变化 → 立即重算档位/分辨率
            };
            update();
            b.addEventListener("levelchange", update);
            b.addEventListener("chargingchange", update);
            disposables.push(() => {
              try { b.removeEventListener("levelchange", update); } catch { /* ignore */ }
              try { b.removeEventListener("chargingchange", update); } catch { /* ignore */ }
            });
          }).catch(() => { /* 浏览器不支持电池 API 时静默 */ });
        } catch { /* ignore */ }
      }

      // ---- WebGL 上下文丢失自动恢复 ----
      function onContextLost(e) {
        if (!shader) return;
        if (e && e.preventDefault) e.preventDefault();
        perf.contextLost = true;
        if (shader.raf) { cancelAnimationFrame(shader.raf); shader.raf = null; }
        applyPerf();
      }
      function onContextRestored() {
        perf.contextLost = false;
        const id = shader ? shader.id : null;
        if (shader && shader.canvas && shader.canvas.parentNode) shader.canvas.remove();
        shader = null;
        if (id) initShader(id);
      }

      // ================= 私有样式 =================
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-dsh-mood-wallpaper", "true");
      document.head.appendChild(styleEl);
      disposables.push(() => { if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); });
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
        /* ---- 记忆星图（壁纸层记忆可视化） ---- */
        #dswm-wall .dswm-star {
          position: absolute; inset: 0; width: 100%; height: 100%;
          pointer-events: auto; cursor: crosshair; opacity: 0.9;
        }
        .dswm-star-pop {
          position: fixed; z-index: 9000; max-width: 340px;
          padding: 10px 12px; border-radius: 12px;
          background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #1f222b) 92%, transparent);
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12));
          box-shadow: 0 8px 26px rgba(0,0,0,0.35);
          color: var(--dsw-alias-label-primary, #e5e7eb);
          font-size: 12px; line-height: 18px; pointer-events: auto;
        }
        .dswm-star-pop .dswm-star-pop-title { font-weight: 600; margin-bottom: 4px; }
        .dswm-star-pop .dswm-star-pop-text {
          color: var(--dsw-alias-label-secondary, #9ca3af);
          word-break: break-word; max-height: 120px; overflow: auto;
        }
        .dswm-star-pop .dswm-star-pop-sub { color: var(--dsw-alias-label-secondary, #9ca3af); margin-top: 6px; font-size: 11px; }
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

        /* ---- 警报氛围层（错误/待命） ---- */
        #dswm-wall .dswm-alert {
          position: absolute; inset: 0; opacity: 0; pointer-events: none;
          transition: opacity 0.5s ease;
        }
        #dswm-wall[data-alert="error"] .dswm-alert {
          opacity: 1;
          background: radial-gradient(ellipse at 50% 45%, transparent 42%, rgba(239, 68, 68, 0.30) 100%);
          animation: dswmAlertPulse 1.2s ease-in-out infinite;
        }
        #dswm-wall[data-alert="pending"] .dswm-alert {
          opacity: 1;
          background: radial-gradient(ellipse at 50% 50%, rgba(251, 191, 36, 0.14) 0%, transparent 62%);
          animation: dswmAlertPulse 2.4s ease-in-out infinite;
        }
        @keyframes dswmAlertPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

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

        /* ---- 玻璃材质（透明 UI 精华：强化通透 + 高光） ---- */
        #dswm-wall .dswm-glass {
          position: absolute; inset: 0; opacity: 0; pointer-events: none;
          background: linear-gradient(135deg, rgba(255,255,255,0.10) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.06) 100%);
          mix-blend-mode: overlay;
          transition: opacity 0.6s ease;
        }
        #dswm-wall[data-glass="1"] .dswm-glass { opacity: 1; }

        /* ---- 鲸鱼巡游（深海彩蛋：思考加速潜游、完成跃出水面） ---- */
        #dswm-wall .dswm-whale {
          position: absolute; left: 0; bottom: 10%; width: 180px;
          opacity: 0.55; pointer-events: auto; cursor: pointer;
          color: var(--dswm-accent, #2dd4bf);
          filter: drop-shadow(0 0 14px var(--dswm-accent, rgba(45,212,191,0.5)));
          transition: opacity 0.4s ease;
        }
        #dswm-wall .dswm-whale:hover { opacity: 0.85; }
        #dswm-wall .dswm-whale svg { display: block; width: 100%; height: auto; }
        #dswm-wall[data-whale="1"][data-state="idle"] .dswm-whale { animation: dswmWhaleCruise 80s linear infinite; }
        #dswm-wall[data-whale="1"][data-state="thinking"] .dswm-whale { animation: dswmWhaleFast 24s linear infinite; opacity: 0.7; }
        #dswm-wall[data-whale="1"][data-state="done"] .dswm-whale { animation: dswmWhaleBreach 2.2s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; opacity: 0.85; }
        @keyframes dswmWhaleCruise {
          0% { transform: translateX(-20vw) translateY(0); }
          25% { transform: translateX(20vw) translateY(-1.5vh); }
          50% { transform: translateX(60vw) translateY(0.8vh); }
          75% { transform: translateX(95vw) translateY(-1.2vh); }
          100% { transform: translateX(115vw) translateY(0); }
        }
        @keyframes dswmWhaleFast {
          0% { transform: translateX(-20vw) translateY(0) rotate(0deg); }
          20% { transform: translateX(12vw) translateY(-2.5vh) rotate(-3deg); }
          45% { transform: translateX(45vw) translateY(1.5vh) rotate(2deg); }
          70% { transform: translateX(78vw) translateY(-3vh) rotate(-4deg); }
          100% { transform: translateX(115vw) translateY(0) rotate(0deg); }
        }
        @keyframes dswmWhaleBreach {
          0% { transform: translateX(5vw) translateY(0) rotate(0deg); }
          35% { transform: translateX(32vw) translateY(-34vh) rotate(-28deg); }
          60% { transform: translateX(58vw) translateY(6vh) rotate(8deg); }
          85% { transform: translateX(85vw) translateY(-4vh) rotate(-6deg); }
          100% { transform: translateX(115vw) translateY(0) rotate(0deg); opacity: 0; }
        }
        /* 鲸鱼台词气泡 */
        #dswm-wall .dswm-whale-say {
          position: fixed; pointer-events: none; z-index: 8005;
          padding: 6px 12px; border-radius: 12px;
          background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #1f222b) 88%, transparent);
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12));
          color: var(--dsw-alias-label-primary, #e5e7eb);
          font-size: 12px; line-height: 18px; white-space: nowrap;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          animation: dswmWhaleSay 3.2s ease-out forwards;
        }
        @keyframes dswmWhaleSay {
          0% { opacity: 0; transform: translateY(8px) scale(0.9); }
          12% { opacity: 1; transform: translateY(0) scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-26px) scale(1); }
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
        .dswm-input {
          box-sizing: border-box; height: 32px; padding: 0 10px;
          background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
          font-family: inherit; font-size: 13px; line-height: 20px; outline: none; min-width: 0;
        }
        .dswm-input:focus { border-color: var(--dsw-alias-brand-primary); }
        .dswm-switch input:focus-visible ~ .dswm-track { box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary); }
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
      wallEl.setAttribute("data-action", "balanced");      wallEl.innerHTML =
        '<div class="dswm-media"></div>' +
        '<div class="dswm-glow"></div>' +
        '<div class="dswm-vignette"></div>' +
        '<canvas class="dswm-star"></canvas>' +
        '<div class="dswm-sweep"></div>' +
        '<div class="dswm-flash"></div>' +
        '<div class="dswm-ring"></div>' +
        '<div class="dswm-daytint"></div>' +
        '<div class="dswm-crt"></div>' +
        '<div class="dswm-alert"></div>' +
        '<div class="dswm-glass"></div>' +
        '<div class="dswm-whale"><svg viewBox="0 0 220 80" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 46 C 18 30, 42 22, 72 27 C 104 32, 142 42, 176 48 C 190 51, 204 53, 216 56 L 205 61 C 197 58, 187 56, 177 55 C 166 64, 146 68, 122 62 C 92 55, 55 50, 30 47 C 20 46, 13 47, 12 46 Z"/><path fill="currentColor" d="M58 42 C 63 54, 73 60, 85 58 C 77 50, 69 44, 58 42 Z"/><circle fill="currentColor" cx="92" cy="38" r="3.2"/></svg></div>' +
        '<canvas class="dswm-canvas"></canvas>';
      document.body.appendChild(wallEl);
      disposables.push(() => { if (wallEl && wallEl.parentNode) wallEl.parentNode.removeChild(wallEl); });

      const mediaWrap = wallEl.querySelector(".dswm-media");
      const glowEl = wallEl.querySelector(".dswm-glow");
      const canvas = wallEl.querySelector(".dswm-canvas");
      const pctx = canvas.getContext("2d");
      const starCanvas = wallEl.querySelector(".dswm-star");
      const sctx = starCanvas.getContext("2d");

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
        starCanvas.width = canvas.width;
        starCanvas.height = canvas.height;
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        initRain();
        resizeShader();
      }
      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();
      disposables.push(() => window.removeEventListener("resize", resizeCanvas));

      const setVar = (name, value) => wallEl.style.setProperty(name, value);

      // ================= 鲸鱼伙伴化：点击互动（冒泡 + 台词） =================
      const whaleEl = wallEl.querySelector(".dswm-whale");
      if (whaleEl) {
        whaleEl.addEventListener("click", () => {
          if (!cfg.fx || !cfg.fx.whale) return;
          const line = WHALE_LINES[Math.floor(Math.random() * WHALE_LINES.length)];
          const bubble = document.createElement("div");
          bubble.className = "dswm-whale-say";
          bubble.textContent = line;
          const r = whaleEl.getBoundingClientRect();
          bubble.style.left = Math.max(8, r.left + r.width / 2 - 44) + "px";
          bubble.style.top = Math.max(8, r.top - 30) + "px";
          document.body.appendChild(bubble);
          setTimeout(() => { if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 3300);
          for (let i = 0; i < 6 && particles.length < 150; i++) {
            particles.push({
              x: r.left + Math.random() * r.width,
              y: r.top + Math.random() * 10,
              r: 2 + Math.random() * 3,
              vx: (Math.random() - 0.5) * 0.4,
              vy: -(0.6 + Math.random() * 0.8),
              a: 0.5,
              tw: Math.random() * Math.PI * 2,
              c: currentColors[1] || "#2dd4bf",
              spark: true
            });
          }
        });
      }

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
      disposables.push(() => clearInterval(dayTimer));
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
        // 转场时长（Scene Studio）：壁纸层淡入淡出速度
        const trans = Math.max(120, Number(cfg.transitionMs) || 500);
        wallEl.style.transition = "opacity " + (trans / 1000).toFixed(2) + "s ease";
        wallEl.setAttribute("data-kenburns", (cfg.kenburns && !perf.reduce) ? "1" : "0");
        wallEl.setAttribute("data-crt", cfg.fx && cfg.fx.crt ? "1" : "0");
        wallEl.setAttribute("data-daynight", cfg.fx && cfg.fx.daynight ? "1" : "0");
        wallEl.setAttribute("data-whale", cfg.fx && cfg.fx.whale ? "1" : "0");
        wallEl.setAttribute("data-glass", cfg.fx && cfg.fx.glass ? "1" : "0");
        wallEl.classList.toggle("dswm-disabled", !cfg.enabled);
        currentColors = s.palette.concat([s.accent]);
        applyAlpha();
        // 跨插件"情绪联动"：把当前壁纸强调色广播给 dsh-ui-hud 等插件
        try {
          window.dispatchEvent(new CustomEvent("dsh-mood-wallpaper:style", {
            detail: { accent: s.accent, palette: s.palette }
          }));
        } catch { /* ignore */ }
      }

      // ================= 极简模式（收到 dsh-ui-hud 广播 → 应用静默极简皮肤） =================
      let preMinimalSkin = null;
      function onMinimalEvent(e) {
        const minimal = e && e.detail && e.detail.minimal;
        if (minimal) {
          if (!preMinimalSkin) preMinimalSkin = state.skinKey || null;
          applySkin("静默极简");
        } else if (preMinimalSkin) {
          const k = preMinimalSkin;
          preMinimalSkin = null;
          if (k && SCENE_SKINS[k]) applySkin(k);
        }
      }
      window.addEventListener("dsh:minimal", onMinimalEvent);
      disposables.push(() => window.removeEventListener("dsh:minimal", onMinimalEvent));

      // ================= 后台分析（ImageDecoder 取帧 → 色板/亮度/动态能量） =================
      async function computeAnalysis(url, mime) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed: " + res.status);
        const buf = await res.arrayBuffer();
        const S = 48;
        const c = document.createElement("canvas");
        c.width = S;
        c.height = S;
        const g = c.getContext("2d", { willReadFrequently: true });
        const frames = [];
        let decoder = null;
        if (typeof ImageDecoder !== "undefined") {
          try {
            decoder = new ImageDecoder({ data: buf, type: (mime || "").startsWith("video/") ? (mime || "video/mp4") : (mime || "image/gif") });
            await decoder.tracks.ready;
            const track = decoder.tracks.selectedTrack;
            const total = Math.max(1, track && track.frameCount || 1);
            const sampleCount = Math.min(10, total);
            for (let i = 0; i < sampleCount; i++) {
              const idx = Math.floor((i / Math.max(1, sampleCount - 1)) * (total - 1));
              const r = await decoder.decode({ frameIndex: idx });
              frames.push(r.image);
            }
          } catch { frames.length = 0; }
          finally {
            try { if (decoder) decoder.close(); } catch { /* ignore */ }
          }
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
        const all = allWallpapers();
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
        return state.users.concat(state.folder).concat(state.builtins);
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
        },
        "shader-abyss": {
          name: "深海",
          hex: ["#0a2540", "#0e7490", "#2dd4bf"],
          accent: "rgba(45, 212, 191, 0.6)",
          rgb: [[0.04, 0.15, 0.25], [0.05, 0.45, 0.56], [0.18, 0.83, 0.75]],
          frag: SHADER_COMMON + SHADER_NOISE + `
            void main() {
              vec2 uv = v_uv;
              float t = u_time * u_speed;
              vec2 p = vec2(uv.x * 2.0 - 1.0, (uv.y * 2.0 - 1.0) * (u_resolution.y / u_resolution.x));
              // 深海水体噪波
              float n = fbm(p * 2.0 + vec2(t * 0.06, -t * 0.04));
              // 生物荧光微粒（上浮）
              vec2 q = vec2(uv.x * 6.0, uv.y * 9.0 - t * 0.25);
              float plankton = step(0.975, fbm(q));
              float plankton2 = step(0.985, fbm(q * 1.7 + vec2(3.7, 9.1) - vec2(0.0, t * 0.18)));
              // 顶部天光
              float light = smoothstep(0.0, 0.35, uv.y) * 0.22;
              vec3 base = mix(u_c1, u_c2, n * 0.7 + 0.3);
              vec3 col = base;
              col += light * u_c3 * 0.4;
              col += u_c3 * plankton * 0.9;
              col += mix(u_c2, u_c3, 0.5) * plankton2 * 0.7;
              col *= 0.55 + 0.45 * u_intensity;
              float vig = smoothstep(1.3, 0.45, distance(p, vec2(0.0, 0.15)));
              col *= 0.7 + 0.3 * vig;
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
        // WebGL 上下文丢失自动恢复：丢失暂停，恢复后重建着色器
        canvas.addEventListener("webglcontextlost", onContextLost, false);
        canvas.addEventListener("webglcontextrestored", onContextRestored, false);
        shader._onLost = onContextLost;
        shader._onRestored = onContextRestored;
        resizeShader();
        renderShaderFrame(0);
        if (!reducedMotion) shader.raf = requestAnimationFrame(shaderLoop);
        disposables.push(() => { if (shader && shader.raf) cancelAnimationFrame(shader.raf); });
      }
      function resizeShader() {
        if (!shader) return;
        // 分辨率随性能档位/电池状态缩放（perf.resScale）
        const dpr = Math.min(1.5, window.devicePixelRatio || 1) * perf.resScale;
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
        const now = performance.now();
        if (now - lastShaderRender < 1000 / perf.target) {
          shader.raf = requestAnimationFrame(shaderLoop);
          return;
        }
        lastShaderRender = now;
        renderShaderFrame(now / 1000);
        shader.raf = requestAnimationFrame(shaderLoop);
      }
      function disposeShader() {
        if (!shader) return;
        if (shader.raf) cancelAnimationFrame(shader.raf);
        // 先摘除上下文监听，避免手动 loseContext 误触发 onContextLost
        if (shader._onLost && shader.canvas) {
          try { shader.canvas.removeEventListener("webglcontextlost", shader._onLost, false); } catch { /* ignore */ }
        }
        if (shader._onRestored && shader.canvas) {
          try { shader.canvas.removeEventListener("webglcontextrestored", shader._onRestored, false); } catch { /* ignore */ }
        }
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
          const folder = data.folder || [];
          store.set({ users, builtins, folder, error: null });
          const all = users.concat(folder).concat(builtins);
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

      // 读取 host 配置（自定义壁纸文件夹）
      async function loadHostConfig() {
        try {
          const res = await fetch(API + "/config");
          const data = await res.json();
          if (data && data.ok && data.config) {
            store.set({ folderPath: (data.config.folder || "") });
          }
        } catch { /* 忽略 */ }
      }

      async function setFolder(path) {
        store.set({ error: null });
        try {
          const res = await fetch(API + "/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ folder: String(path || "").trim() })
          });
          const data = await res.json();
          if (!data || !data.ok) throw new Error((data && data.error) || "保存失败");
          store.set({ folderPath: String(path || "").trim() });
          await loadWallpapers();
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
      // 思考时从 partial 实时收集字符（token 源：对话真实内容）+ 流速统计
      let tokenBuf = [];
      let tokenRate = 0;
      let lastTokenCount = 0;
      let lastTokenTime = 0;
      function feedTokens(snap) {
        if (!snap || !snap.partial || !snap.partial.blocks) return;
        let count = 0;
        for (const b of snap.partial.blocks) {
          if ((b.kind === "text" || b.kind === "reasoning") && b.text) {
            count += b.text.length;
            for (const ch of b.text) {
              if (ch.trim()) tokenBuf.push(ch);
            }
          }
        }
        const now = performance.now();
        if (lastTokenCount > 0) {
          const dt = (now - lastTokenTime) / 1000;
          if (dt > 0.01) {
            const inst = (count - lastTokenCount) / dt;
            tokenRate = tokenRate === 0 ? inst : tokenRate * 0.7 + inst * 0.3;
          }
        }
        lastTokenCount = count;
        lastTokenTime = now;
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
      disposables.push(() => window.removeEventListener("keydown", onKeyDown));

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
        if (cfg.fx && cfg.fx.trail && !reducedMotion && !perf.reduce) {
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
      disposables.push(() => window.removeEventListener("pointermove", onPointerMove));

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
      disposables.push(() => document.removeEventListener("visibilitychange", onVisibility));

      function spawnAmbient(n) {
        for (let i = 0; i < n && particles.length < 110; i++) {
          particles.push({
            x: Math.random() * innerWidth,
            y: innerHeight + 20 + Math.random() * innerHeight * 0.3,
            r: 0.8 + Math.random() * 2.4,
            vy: -(0.15 + Math.random() * 0.5) * (0.8 + (Number(cfg.intensity) || 1) * 0.4),
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
        const now = performance.now();
        // FPS 采样（即使跳帧也统计，保证档位判断准确）
        if (lastFrameT > 0) {
          const dt = now - lastFrameT;
          if (dt > 0) { fpsAccum += dt; fpsFrames++; }
        }
        lastFrameT = now;
        if (fpsAccum >= 500) {
          updatePerf(fpsFrames * 1000 / fpsAccum);
          fpsAccum = 0; fpsFrames = 0;
        }
        if (document.hidden) { raf = null; return; }
        // 帧率档位跳帧：低档减少实际渲染次数
        if (now - lastParticleRender < 1000 / perf.target) {
          raf = requestAnimationFrame(tick);
          return;
        }
        lastParticleRender = now;

        // 记忆星图 + 多 Agent 任务现场（独立画布，低档/减少动态时隐藏）
        if (!reducedMotion && perf.tier !== "low" && cfg.fx && (cfg.fx.starmap || cfg.fx.fleet)) {
          if (cfg.fx.starmap) drawStarMap(now);
          else sctx.clearRect(0, 0, innerWidth, innerHeight);
          if (cfg.fx.fleet) drawFleet(now);
        } else {
          sctx.clearRect(0, 0, innerWidth, innerHeight);
        }

        pctx.clearRect(0, 0, innerWidth, innerHeight);

        // 鼠标视差平滑（非关键特效：高压/低档时关闭）
        if (!perf.reduce) {
          mouse.x += (mouse.tx - mouse.x) * 0.05;
          mouse.y += (mouse.ty - mouse.y) * 0.05;
          const px = (mouse.x - 0.5) * 26;
          const py = (mouse.y - 0.5) * 18;
          glowEl.style.transform = "translate3d(" + px + "px," + py + "px,0)";
        }

        // 敲击能量场：输入密度 → 粒子速度加成
        const nowMs = Date.now();
        while (keystrokes.length > 0 && keystrokes[0] < nowMs - 1200) keystrokes.shift();
        const typingRate = keystrokes.length / 1.2;

        // token 速率驱动：思考时粒子密度随真实流速自适应（上限 2x）
        const rateBoost = engineState === "thinking" ? 1 + Math.min(1, tokenRate / 40) : 1;
        const density = Math.max(0.2, Number(cfg.particleDensity) || 1);
        const target = engineState === "thinking"
          ? Math.round(24 * cfg.intensity * rateBoost * density)
          : engineState === "done" ? Math.round(8 * density) : Math.round(12 * density);
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
          // 高压/低档：代码雨列减半（非关键特效降级）
          const rainStep = perf.reduce ? 2 : 1;
          for (let ri = 0; ri < rain.length; ri += rainStep) {
            const col = rain[ri];
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
      disposables.push(() => { if (raf) cancelAnimationFrame(raf); });

      // ================= 警报氛围层（错误 / 待命） =================
      let alertState = null;
      let alertTimer = null;
      let seenErrorSeqs = new Set();
      function setAlert(a) {
        if (alertState === a) return;
        alertState = a;
        wallEl.setAttribute("data-alert", a || "");
      }
      function evaluateAlert(snap) {
        if (!cfg.fx || !cfg.fx.alerts) { setAlert(null); return; }
        // 实时错误 / 待命优先
        let live = null;
        if (snap) {
          if (snap.promptError || snap.lastAgentError) live = "error";
          else if (snap.pending && snap.pending.length > 0) live = "pending";
        }
        if (live) {
          setAlert(live);
          if (alertTimer) { clearTimeout(alertTimer); alertTimer = null; }
          return;
        }
        // 历史错误节点（turn-error / tool-result.isError）→ 每个 seq 一次性提示 6s
        let fresh = false;
        if (snap && snap.nodes) {
          for (const n of snap.nodes) {
            if ((n.kind === "turn-error" || (n.kind === "tool-result" && n.isError)) && n.seq !== void 0 && !seenErrorSeqs.has(n.seq)) {
              seenErrorSeqs.add(n.seq);
              fresh = true;
            }
          }
          // M1：历史错误 seq 集合有界，防止无界增长
          if (seenErrorSeqs.size > 200) {
            const it = seenErrorSeqs.values();
            for (let i = 0; i < 100; i++) { const v = it.next(); if (v.done) break; seenErrorSeqs.delete(v.value); }
          }
        }
        if (fresh) {
          setAlert("error");
          if (alertTimer) clearTimeout(alertTimer);
          alertTimer = setTimeout(() => {
            alertTimer = null;
            if (alertState === "error") setAlert(null);
          }, 6000);
          return;
        }
        if (alertState) setAlert(null);
      }

      // ================= 记忆星图（壁纸层记忆可视化） =================
      // 用户问题=恒星；决策/工具调用/上下文注入=轨道节点；错误=红色脉冲点；
      // 被固定记忆=金色星座连线；点击节点查看详情。
      const PINS_KEY = "dsh-ui-hud.pins";
      let memoryGraph = { stars: [], orbits: [], errors: [] };
      let starPositions = [];
      let starPop = null;

      function loadPins() {
        try {
          const raw = localStorage.getItem(PINS_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      }

      function buildMemoryGraph(snap) {
        const stars = [], orbits = [], errors = [];
        const pins = loadPins();
        const pinSeqs = new Set(pins.map((p) => p.seq));
        if (snap && snap.nodes) {
          for (const n of snap.nodes) {
            if (n.kind === "user") {
              const text = contentText(n.content);
              if (text) stars.push({ seq: n.seq, text: shortText(text, 90), isPin: pinSeqs.has(n.seq) });
            } else if (n.kind === "tool-result") {
              const name = (n.call && n.call.name) || n.callId || "工具";
              const text = shortText(contentText(n.content), 90);
              if (n.isError) errors.push({ seq: n.seq, name: "⚠️ " + name, text });
              else orbits.push({ seq: n.seq, kind: "tool", name, text, isPin: pinSeqs.has(n.seq) });
            } else if (n.kind === "assistant") {
              const text = shortText((n.blocks || []).map((b) => (b.text || "")).join(" "), 90);
              if (text) orbits.push({ seq: n.seq, kind: "decision", name: "决策", text, isPin: pinSeqs.has(n.seq) });
            } else if (n.kind === "context") {
              const prov = n.provenance;
              const name = (prov && (prov.role || prov.producerName)) || "注入";
              orbits.push({ seq: n.seq, kind: "context", name: "📥 " + name, text: shortText(contentText(n.content), 90), isPin: pinSeqs.has(n.seq) });
            } else if (n.kind === "turn-error") {
              errors.push({ seq: n.seq, name: "⚠️ 回合错误", text: shortText(n.message || "", 90) });
            }
          }
        }
        memoryGraph = {
          stars: stars.slice(-6),
          orbits: orbits.slice(-30),
          errors: errors.slice(-8)
        };
      }

      function computeStarLayout(now) {
        const cx = innerWidth * 0.5, cy = innerHeight * 0.42;
        const t = now / 1000;
        const positions = [];
        const g = memoryGraph;
        const ringBase = Math.max(84, innerWidth * 0.14);
        if (g.stars.length > 0) {
          const last = g.stars[g.stars.length - 1];
          positions.push({ type: "star", seq: last.seq, x: cx, y: cy, r: 13 + 3 * Math.sin(t * 0.7), name: "问题", text: last.text, isPin: last.isPin });
        }
        g.orbits.forEach((o, i) => {
          const ring = ringBase + Math.floor(i / 10) * 52;
          const angle = (i / Math.max(1, g.orbits.length)) * Math.PI * 2 + t * 0.04;
          positions.push({
            type: o.kind, seq: o.seq,
            x: cx + Math.cos(angle) * ring,
            y: cy + Math.sin(angle) * ring * 0.55,
            r: o.kind === "tool" ? 4 : 3.4,
            name: o.name, text: o.text, isPin: o.isPin
          });
        });
        g.errors.forEach((e, i) => {
          const angle = (i / Math.max(1, g.errors.length)) * Math.PI * 2 + Math.PI + t * 0.09;
          positions.push({
            type: "error", seq: e.seq,
            x: cx + Math.cos(angle) * (ringBase + 88),
            y: cy + Math.sin(angle) * (ringBase + 88) * 0.5,
            r: 3 + 1.5 * (0.5 + 0.5 * Math.sin(t * 4 + i)),
            name: e.name, text: e.text
          });
        });
        return positions;
      }

      function drawStarMap(now) {
        sctx.clearRect(0, 0, innerWidth, innerHeight);
        const g = memoryGraph;
        if (g.stars.length + g.orbits.length + g.errors.length === 0) return;
        const positions = computeStarLayout(now);
        starPositions = positions;
        const c1 = currentColors[0] || "#38bdf8";
        const c2 = currentColors[1] || "#a78bfa";
        sctx.save();
        sctx.globalCompositeOperation = "lighter";
        // 被固定记忆：金色星座连线
        const pinned = positions.filter((p) => p.isPin);
        if (pinned.length > 1) {
          sctx.strokeStyle = "rgba(245,158,11,0.30)";
          sctx.lineWidth = 1;
          sctx.beginPath();
          pinned.forEach((p, i) => { if (i === 0) sctx.moveTo(p.x, p.y); else sctx.lineTo(p.x, p.y); });
          const star = positions.find((p) => p.type === "star");
          if (star) sctx.lineTo(star.x, star.y);
          sctx.stroke();
        }
        for (const p of positions) {
          if (p.type === "star") {
            const grad = sctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.4);
            grad.addColorStop(0, "rgba(255,255,255,0.95)");
            grad.addColorStop(0.3, hexToRgba(c1, 0.5));
            grad.addColorStop(1, "rgba(0,0,0,0)");
            sctx.fillStyle = grad;
            sctx.beginPath(); sctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2); sctx.fill();
            sctx.fillStyle = "#fff";
            sctx.beginPath(); sctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2); sctx.fill();
          } else if (p.type === "error") {
            sctx.fillStyle = "rgba(239,68,68,0.9)";
            sctx.beginPath(); sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); sctx.fill();
            sctx.strokeStyle = "rgba(239,68,68,0.5)";
            sctx.lineWidth = 1;
            sctx.beginPath(); sctx.arc(p.x, p.y, p.r + 3 + 2 * Math.sin(now / 220), 0, Math.PI * 2); sctx.stroke();
          } else {
            const col = p.type === "tool" ? hexToRgba(c1, 0.9) : p.type === "context" ? hexToRgba(c2, 0.9) : "rgba(167,139,250,0.9)";
            if (p.isPin) {
              sctx.strokeStyle = "rgba(245,158,11,0.9)";
              sctx.lineWidth = 1.4;
              sctx.beginPath(); sctx.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); sctx.stroke();
            }
            sctx.fillStyle = col;
            sctx.beginPath(); sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); sctx.fill();
          }
        }
        sctx.restore();
      }

      // 点击节点 → 详情气泡
      function showStarPop(p, x, y) {
        closeStarPop();
        const pop = document.createElement("div");
        pop.className = "dswm-star-pop";
        const title = document.createElement("div");
        title.className = "dswm-star-pop-title";
        title.textContent = p.name || (p.type === "star" ? "问题" : p.type);
        const text = document.createElement("div");
        text.className = "dswm-star-pop-text";
        text.textContent = p.text || "（无文本）";
        const sub = document.createElement("div");
        sub.className = "dswm-star-pop-sub";
        sub.textContent = (p.type === "star" ? "🌟 恒星" : p.type === "error" ? "🔴 错误脉冲" : p.type === "tool" ? "🔧 工具调用" : p.type === "context" ? "📥 上下文注入" : "✦ 决策节点") + " · seq " + p.seq + (p.isPin ? " · ★已固定" : "");
        pop.appendChild(title);
        pop.appendChild(text);
        pop.appendChild(sub);
        document.body.appendChild(pop);
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, x - pw / 2)) + "px";
        pop.style.top = Math.max(8, Math.min(innerHeight - ph - 8, y - ph - 16)) + "px";
        starPop = pop;
        setTimeout(() => { if (starPop === pop) closeStarPop(); }, 5000);
      }
      function closeStarPop() {
        if (starPop && starPop.parentNode) starPop.parentNode.removeChild(starPop);
        starPop = null;
      }
      function onStarClick(e) {
        if (!cfg.fx || !cfg.fx.starmap) return;
        const rect = starCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let best = null, bestD = 16;
        for (const p of starPositions) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) showStarPop(best, e.clientX, e.clientY);
        else closeStarPop();
      }
      starCanvas.addEventListener("click", onStarClick);
      disposables.push(() => { starCanvas.removeEventListener("click", onStarClick); closeStarPop(); });

      // ================= 多 Agent 任务现场（后台任务态势可视化） =================
      // 每个后台任务=一艘光点舰船：运行=沿轨道移动；工具调用=连接线；
      // 等待批准=停靠变琥珀色；完成=返回中心淡出；失败=故障波纹。
      const agentMap = new Map();

      function agentStatus(s) {
        const v = String(s || "").toLowerCase();
        if (/(fail|error)/.test(v)) return "failed";
        if (/(wait|pend|approv|block)/.test(v)) return "waiting";
        if (/(run|active|work|exec)/.test(v)) return "running";
        if (/(stop|done|complete|finish|success)/.test(v)) return "done";
        return "running";
      }

      function buildAgentFleet() {
        const seenActive = new Set();
        let fallback = 0;
        try {
          const list = ctx.sessions.list.getSnapshot();
          const bySession = list && list.jobsBySession;
          if (bySession) {
            for (const sid of Object.keys(bySession)) {
              const arr = bySession[sid];
              if (!Array.isArray(arr)) continue;
              for (const j of arr) {
                const id = j && (j.id || j.name || ("agent-" + (fallback++)));
                const status = agentStatus(j && j.status);
                if (status === "done") {
                  const prev = agentMap.get(id);
                  if (prev && prev.status !== "done") { prev.status = "done"; prev.fadeT0 = Date.now(); }
                  continue;
                }
                seenActive.add(id);
                const now = Date.now();
                const prev = agentMap.get(id);
                if (!prev) {
                  agentMap.set(id, { id, sid, status, label: (j && (j.label || j.name)) || "Agent", since: now, angle: Math.random() * Math.PI * 2, x: null, y: null, glitchT0: status === "failed" ? now : 0, fadeT0: 0 });
                } else {
                  if (prev.status === "done") prev.fadeT0 = 0;
                  prev.status = status;
                  prev.label = (j && (j.label || j.name)) || prev.label;
                  if (status === "failed" && !prev.glitchT0) prev.glitchT0 = now;
                }
              }
            }
          }
        } catch { /* ignore */ }
        const now = Date.now();
        for (const [id, a] of agentMap) {
          if (!seenActive.has(id) && a.status !== "done") { a.status = "done"; a.fadeT0 = now; }
        }
        for (const [id, a] of agentMap) {
          if (a.status === "done" && now - a.fadeT0 > 3000) agentMap.delete(id);
          else if (a.status === "failed" && now - a.glitchT0 > 5000 && !seenActive.has(id)) { a.status = "done"; a.fadeT0 = now; }
        }
        if (agentMap.size > 60) {
          const it = agentMap.keys();
          for (let i = 0; i < 30; i++) { const v = it.next(); if (v.done) break; agentMap.delete(v.value); }
        }
      }

      function drawFleet(now) {
        const t = now / 1000;
        const cx = innerWidth * 0.5, cy = innerHeight * 0.42;
        const baseR = Math.max(96, innerWidth * 0.17);
        const entries = [...agentMap.values()];
        if (entries.length === 0) return;
        const accent = currentColors[1] || "#38bdf8";
        const thinking = machineState === "thinking";
        const running = entries.filter((a) => a.status === "running");
        // 工具调用连接线：当前会话思考中 → 连线到运行中的 agent
        if (thinking && running.length > 0) {
          sctx.strokeStyle = "rgba(125,211,252,0.18)";
          sctx.lineWidth = 1;
          for (const a of running) {
            if (a.x == null) continue;
            sctx.beginPath();
            sctx.moveTo(cx, cy);
            sctx.lineTo(a.x, a.y);
            sctx.stroke();
          }
        }
        let i = 0;
        for (const a of entries) {
          const fade = a.status === "done" ? Math.max(0, 1 - (now - a.fadeT0) / 3000) : 1;
          if (fade <= 0) continue;
          if (a.status === "running") {
            a.angle += 0.02;
            const ring = baseR + (i % 3) * 46;
            a.x = cx + Math.cos(a.angle) * ring;
            a.y = cy + Math.sin(a.angle) * ring * 0.6;
          } else if (a.status === "waiting") {
            const ring = baseR * 0.42;
            a.x = cx + Math.cos(a.angle) * ring;
            a.y = cy + Math.sin(a.angle) * ring;
          } else if (a.status === "failed") {
            if (a.x == null) { a.x = cx + Math.cos(a.angle) * baseR; a.y = cy + Math.sin(a.angle) * baseR * 0.6; }
          } else {
            // done → 返回中心淡出
            a.x = a.x == null ? cx + Math.cos(a.angle) * 20 : cx + (a.x - cx) * 0.9;
            a.y = a.y == null ? cy + Math.sin(a.angle) * 14 : cy + (a.y - cy) * 0.9;
          }
          sctx.globalAlpha = fade * (a.status === "waiting" ? 0.75 + 0.25 * Math.sin(t * 3) : 0.9);
          if (a.status === "failed") {
            const jx = (Math.random() - 0.5) * 8;
            const jy = (Math.random() - 0.5) * 8;
            sctx.fillStyle = "rgba(239,68,68,0.95)";
            sctx.beginPath(); sctx.arc(a.x + jx, a.y + jy, 4, 0, Math.PI * 2); sctx.fill();
            sctx.strokeStyle = "rgba(239,68,68,0.55)";
            sctx.lineWidth = 1.2;
            sctx.beginPath(); sctx.arc(a.x + jx, a.y + jy, 6 + 5 * (0.5 + 0.5 * Math.sin(t * 6)), 0, Math.PI * 2); sctx.stroke();
          } else if (a.status === "waiting") {
            sctx.fillStyle = "rgba(245,158,11,0.95)";
            sctx.beginPath(); sctx.arc(a.x, a.y, 3.6, 0, Math.PI * 2); sctx.fill();
            sctx.strokeStyle = "rgba(245,158,11,0.5)";
            sctx.lineWidth = 1;
            sctx.beginPath(); sctx.arc(a.x, a.y, 7, 0, Math.PI * 2); sctx.stroke();
          } else if (a.status === "done") {
            sctx.fillStyle = hexToRgba(accent, 0.6);
            sctx.beginPath(); sctx.arc(a.x, a.y, 2.6, 0, Math.PI * 2); sctx.fill();
          } else {
            sctx.fillStyle = hexToRgba(accent, 0.95);
            sctx.beginPath(); sctx.arc(a.x, a.y, 3.2, 0, Math.PI * 2); sctx.fill();
            sctx.fillStyle = hexToRgba(accent, 0.35);
            sctx.beginPath(); sctx.arc(a.x, a.y, 7, 0, Math.PI * 2); sctx.fill();
          }
          i++;
        }
        sctx.globalAlpha = 1;
      }

      // ================= 状态机：idle / thinking / done =================
      let machineState = "idle";
      let wasActive = false;
      let doneTimer = null;
      let lastSnap = null;
      let previewUntil = 0;
      let previewTimer = null;

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

      // Scene Studio 状态预览：临时强制一个状态（4s 后恢复实时）
      function previewState(state, alert) {
        previewUntil = Date.now() + 4000;
        setMachine(state);
        setAlert(alert);
        if (state === "thinking") {
          if (cfg.fx && cfg.fx.thought) { spawnToolNode("tool"); spawnToolNode("read"); spawnToolNode("write"); }
        }
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
          previewTimer = null;
          previewUntil = 0;
          onSnapshot(lastSnap); // 恢复实时状态机
        }, 4000);
      }

      function onSnapshot(snap) {
        lastSnap = snap;
        const inPreview = Date.now() < previewUntil;
        // 实时性能治理输入：上下文压力 + 并发工具调用数
        perf.pressure = readPressure();
        perf.toolLoad = snap && snap.runningCalls ? snap.runningCalls.length : 0;
        applyPerf();
        buildMemoryGraph(snap);
        const active = isActive(snap);
        if (inPreview) { wasActive = active; return; } // 预览模式：冻结状态机 + 警报
        evaluateAlert(snap);
        if (!cfg.enabled) {
          setMachine("idle");
          wasActive = active;
          return;
        }
        if (active) {
          feedTokens(snap);
          syncTools(snap);
        } else {
          tokenRate = 0;
          lastTokenCount = 0;
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
        currentSession = null;
        let list = null;
        try { list = ctx.sessions.list.getSnapshot(); } catch { list = null; }
        buildAgentFleet();
        const sid = list && list.current;
        if (!sid) { onSnapshot(null); return; }
        let binding = null;
        try { binding = ctx.sessions.binding(sid); } catch { binding = null; }
        if (!binding || !binding.session) { onSnapshot(null); return; }
        const session = binding.session;
        currentSession = session;
        unsubSession = session.subscribe(() => onSnapshot(session.getSnapshot()));
        disposables.push(() => { if (unsubSession) unsubSession(); });
        onSnapshot(session.getSnapshot());
      }
      unsubList = ctx.sessions.list.subscribe(observeCurrent);
      disposables.push(() => { if (unsubList) unsubList(); });
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
        if (patch.perfMode !== void 0) {
          updatePerf(perf.fps); // 手动档位立即生效
        }
      }

      // ================= 场景皮肤：一键应用组合 =================
      function applySkin(key) {
        const skin = SCENE_SKINS[key];
        if (!skin) return;
        const fx = Object.assign({}, cfg.fx);
        for (const k of ["whale", "coderain", "crt", "daynight", "glass", "keyboard", "thought", "trail"]) {
          if (skin[k] !== void 0) fx[k] = skin[k];
        }
        store.set({ skinKey: key });
        applyConfig({ wallpaperId: skin.wallpaper, style: skin.style, fx, baseAlpha: skin.baseAlpha, panelAlpha: skin.panelAlpha });
      }

      applyStyle();

      // ================= 场景编排器 Scene Studio（scene.json 创作平台） =================
      const SCENES_KEY = "dsh-mood-wallpaper.scenes";
      const SCENE_SCHEMA = "dsh-scene/v1";
      const PET_OPTIONS = [
        { value: "whale", label: "🐋 鲸鱼" },
        { value: "cat", label: "🐱 招财猫" },
        { value: "penguin", label: "🐧 企鹅" },
        { value: "ghost", label: "👻 小幽灵" },
        { value: "dino", label: "🦖 小恐龙" },
        { value: "none", label: "🚫 无桌宠" }
      ];
      const FX_NAMES = [
        ["keyboard", "敲击能量场"], ["thought", "思维投影"], ["coderain", "代码雨"],
        ["trail", "鼠标尾迹"], ["parallax", "鼠标视差"], ["daynight", "昼夜循环"],
        ["crt", "CRT 美学"], ["glass", "玻璃材质"], ["whale", "鲸鱼巡游"],
        ["alerts", "警报氛围"], ["sound", "环境音"], ["keysound", "键盘乐章"], ["starmap", "记忆星图"]
      ];

      function normalizeScene(s) {
        return Object.assign({}, s, {
          fx: Object.assign({}, DEFAULTS.fx, s.fx && typeof s.fx === "object" ? s.fx : {}),
          hud: Object.assign({ hud: true, memory: true }, s.hud && typeof s.hud === "object" ? s.hud : {}),
          pet: s.pet || "whale"
        });
      }
      function loadScenes() {
        try {
          const raw = localStorage.getItem(SCENES_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(arr)) return [];
          return arr.filter((s) => s && typeof s === "object").map(normalizeScene);
        } catch {
          return [];
        }
      }
      function persistScenes(list) {
        try { localStorage.setItem(SCENES_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* ignore */ }
      }

      function currentScene(name) {
        return {
          schema: SCENE_SCHEMA,
          name: name || "未命名场景",
          wallpaper: cfg.wallpaperId || "shader-abyss",
          style: cfg.style || "auto",
          intensity: Number(cfg.intensity) || 1,
          particleDensity: Number(cfg.particleDensity) || 1,
          transitionMs: Number(cfg.transitionMs) || 500,
          baseAlpha: cfg.baseAlpha,
          panelAlpha: cfg.panelAlpha,
          kenburns: !!cfg.kenburns,
          doneFx: !!cfg.doneFx,
          fx: Object.assign({}, cfg.fx),
          pet: "whale",
          hud: { hud: true, memory: true }
        };
      }

      function applyScene(scene) {
        if (!scene || typeof scene !== "object") return false;
        const fx = Object.assign({}, cfg.fx, scene.fx && typeof scene.fx === "object" ? scene.fx : {});
        applyConfig({
          style: scene.style || "auto",
          intensity: Number(scene.intensity) || 1,
          particleDensity: Number(scene.particleDensity) || 1,
          transitionMs: Number(scene.transitionMs) || 500,
          baseAlpha: Number(scene.baseAlpha) || 70,
          panelAlpha: Number(scene.panelAlpha) || 85,
          kenburns: !!scene.kenburns,
          doneFx: !!scene.doneFx,
          fx
        });
        if (scene.wallpaper) applyConfig({ wallpaperId: scene.wallpaper });
        store.set({ sceneName: scene.name || "导入场景" });
        // 跨插件：桌宠形象 + HUD 布局
        try {
          window.dispatchEvent(new CustomEvent("dsh:scene", {
            detail: {
              pet: scene.pet || "whale",
              hud: scene.hud && typeof scene.hud === "object" ? scene.hud : null
            }
          }));
        } catch { /* ignore */ }
        return true;
      }

      function exportScene(scene) {
        try {
          const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = (scene.name || "scene").replace(/[^\w\u4e00-\u9fa5-]+/g, "_") + ".scene.json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
          store.set({ error: "导出失败：" + String((e && e.message) || e) });
        }
      }

      function importSceneText(text) {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("不是有效 JSON 对象");
          const scene = normalizeScene(parsed);
          if (!applyScene(scene)) throw new Error("场景字段无效");
          const list = loadScenes().filter((s) => s.name !== scene.name).concat([scene]);
          persistScenes(list);
          return true;
        } catch (e) {
          store.set({ error: "导入失败：" + String((e && e.message) || e) });
          return false;
        }
      }

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
        const [folderDraft, setFolderDraft] = React.useState(snap.folderPath || "");
        React.useEffect(() => { setFolderDraft(snap.folderPath || ""); }, [snap.folderPath]);

        const all = snap.users.concat(snap.folder).concat(snap.builtins);
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
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "壁纸文件夹"),
              h("input", {
                className: "dswm-input dswm-grow",
                value: folderDraft,
                placeholder: "E:\\wallpapers（可放非系统盘，动态壁纸直接生效）",
                spellCheck: false,
                onChange: (e) => setFolderDraft(e.target.value),
                onKeyDown: (e) => { if (e.key === "Enter") setFolder(folderDraft); }
              }),
              h("button", { className: "dswm-btn dswm-btn-primary", onClick: () => setFolder(folderDraft) }, "应用")
            ]),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-hint" }, snap.folderPath ? "文件夹已启用：" + snap.folderPath : "留空关闭文件夹壁纸"),
              h("span", { className: "dswm-hint" }, snap.folder.length > 0 ? "（" + snap.folder.length + " 张）" : "")
            ]),
            all.length === 0
              ? h("div", { className: "dswm-hint" }, "暂无壁纸")
              : h("div", { className: "dswm-grid" }, all.map((w) => h("div", {
                  key: w.id,
                  className: "dswm-cell" + (snap.current && snap.current.id === w.id ? " dswm-sel" : ""),
                  onClick: () => applyConfig({ wallpaperId: w.id })
                }, [
                  thumb(w),
                  h("div", { className: "dswm-badge" }, w.kind === "user" ? "导入" : w.kind === "folder" ? "文件夹" : "内置"),
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
            h("div", { className: "dswm-title" }, "性能治理 · Performance"),
            h("div", { className: "dswm-row" }, [
              h("span", { className: "dswm-label" }, "档位策略"),
              h("select", {
                className: "dswm-select dswm-grow",
                value: snap.perfMode || "auto",
                onChange: (e) => applyConfig({ perfMode: e.target.value })
              }, [
                h("option", { value: "auto" }, "自动（按平均 FPS 分档）"),
                h("option", { value: "60" }, "锁定 60 FPS"),
                h("option", { value: "30" }, "锁定 30 FPS"),
                h("option", { value: "15" }, "锁定 15 FPS")
              ])
            ]),
            h("div", { className: "dswm-row", style: { flexWrap: "wrap", gap: "8px" } },
              (snap.perf
                ? [
                    h("span", { className: "dswm-state-pill" }, "FPS " + snap.perf.fps),
                    h("span", { className: "dswm-state-pill" }, (snap.perf.tier === "high" ? "高" : snap.perf.tier === "medium" ? "中" : "低") + "档 · " + snap.perf.target + "fps"),
                    h("span", { className: "dswm-state-pill" }, "🔋 " + snap.perf.battery),
                    h("span", { className: "dswm-state-pill" }, "GPU " + snap.perf.shaderPixels),
                    h("span", { className: "dswm-state-pill" }, "粒子 " + snap.perf.particleCount + " · 雨列 " + snap.perf.rainCols),
                    snap.perf.pressure > 0 ? h("span", { className: "dswm-state-pill" }, "上下文 " + snap.perf.pressure + "%") : null,
                    snap.perf.toolLoad > 0 ? h("span", { className: "dswm-state-pill" }, "工具 " + snap.perf.toolLoad) : null,
                    snap.perf.contextLost ? h("span", { className: "dswm-state-pill" }, "WebGL 恢复中…") : null
                  ].filter(Boolean)
                : [h("span", { className: "dswm-hint" }, "正在采样平均 FPS…")])),
            h("div", { className: "dswm-hint" },
              "自动检测平均 FPS → 60/30/15 三档；电池供电自动降低着色器分辨率；高上下文压力（≥70%）或大量工具调用（≥5 并发）时减少非关键特效；WebGL 上下文丢失后自动重建。")
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "场景皮肤 · Scene Skins"),
            h("div", { className: "dswm-row", style: { flexWrap: "wrap" } },
              Object.keys(SCENE_SKINS).map((key) => h("button", {
                className: "dswm-btn" + (snap.skinKey === key ? " dswm-btn-primary" : ""),
                onClick: () => applySkin(key)
              }, SCENE_SKINS[key].label))),
            h("div", { className: "dswm-hint" }, "一键应用「壁纸 + 风格 + 特效 + 通透度」组合：深海鲸语 / 极光夜航 / 熔岩引擎 / 静默极简")
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
            FxToggle({
              label: "警报氛围",
              hint: "错误 → 红色警报脉冲；等待批准/提问 → 琥珀色待命光",
              checked: snap.fx.alerts,
              onChange: (e) => setFx("alerts", e.target.checked)
            }),
            FxToggle({
              label: "鲸鱼巡游",
              hint: "一只鲸鱼在壁纸里巡游：思考加速潜游、完成时跃出水面 🐋（点它会有回应）",
              checked: snap.fx.whale,
              onChange: (e) => setFx("whale", e.target.checked)
            }),
            FxToggle({
              label: "玻璃材质",
              hint: "透明玻璃化：更通透的背景 + 高光质感（透明 UI 精华）",
              checked: snap.fx.glass,
              onChange: (e) => setFx("glass", e.target.checked)
            }),
            FxToggle({
              label: "记忆星图",
              hint: "壁纸层记忆可视化：问题=恒星、决策/工具/注入=轨道节点、错误=红色脉冲、固定记忆=金色星座，点击节点看详情",
              checked: snap.fx.starmap,
              onChange: (e) => setFx("starmap", e.target.checked)
            }),
            FxToggle({
              label: "多 Agent 任务现场",
              hint: "后台任务=光点舰船：运行沿轨道移动、等待批准停靠变琥珀、完成返回中心、失败故障波纹；HUD 显示精确数据",
              checked: snap.fx.fleet,
              onChange: (e) => setFx("fleet", e.target.checked)
            }),
            h("div", { className: "dswm-hint" }, "页面不可见时自动暂停全部动画/音频；系统开启「减少动态效果」时自动降级；性能低档时记忆星图/任务现场自动隐藏。")
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

      // ================= 场景编排器 Scene Studio（设置页） =================
      function SceneStudioView() {
        const [snap, setSnap] = React.useState(store.get());
        React.useEffect(() => store.subscribe(setSnap), []);
        const [draft, setDraft] = React.useState(() => currentScene(""));
        const [scenes, setScenes] = React.useState(loadScenes());
        const fileRef = React.useRef(null);

        const all = snap.users.concat(snap.folder).concat(snap.builtins);
        const set = (patch) => setDraft(Object.assign({}, draft, patch));
        const setFx = (key, value) => set({ fx: Object.assign({}, draft.fx, { [key]: value }) });

        function onImport(e) {
          const file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (importSceneText(String(reader.result || ""))) {
              const list = loadScenes();
              setScenes(list);
              setDraft(list[list.length - 1]);
            }
          };
          reader.readAsText(file);
        }

        const label = (t) => h("span", { className: "dswm-label" }, t);
        const sliderRow = (t, field, min, max, step, fmt) => h("div", { className: "dswm-row" }, [
          label(t),
          h("input", {
            className: "dswm-slider", type: "range", min, max, step,
            value: draft[field],
            onChange: (e) => set({ [field]: Number(e.target.value) })
          }),
          h("span", { className: "dswm-hint dswm-num" }, fmt(draft[field]))
        ]);
        const switchRow = (t, field, hint2) => h("div", { className: "dswm-row" }, [
          label(t),
          h("label", { className: "dswm-switch" }, [
            h("input", { type: "checkbox", checked: !!draft[field], onChange: (e) => set({ [field]: e.target.checked }) }),
            h("span", { className: "dswm-track" }),
            h("span", { className: "dswm-thumb" })
          ]),
          h("span", { className: "dswm-hint" }, hint2)
        ]);

        return h("div", { className: "dswm-page" }, [
          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-row" }, [
              h("div", { className: "dswm-grow" }, [
                h("div", { className: "dswm-title" }, "场景编排器 · Scene Studio"),
                h("div", { className: "dswm-hint" }, "可视化编排壁纸 + 着色器 + 桌宠 + 音效 + HUD 布局，导出 scene.json 一键分享")
              ]),
              h("input", { ref: fileRef, type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: onImport }),
              h("button", { className: "dswm-btn dswm-btn-primary", onClick: () => fileRef.current && fileRef.current.click() }, "📥 导入场景")
            ]),
            h("div", { className: "dswm-row" }, [
              label("场景名"),
              h("input", { className: "dswm-input dswm-grow", value: draft.name, spellCheck: false, placeholder: "给场景起个名字", onChange: (e) => set({ name: e.target.value }) })
            ]),
            h("div", { className: "dswm-row" }, [
              h("button", { className: "dswm-btn dswm-btn-primary", onClick: () => applyScene(draft) }, "▶ 应用场景"),
              h("button", { className: "dswm-btn", onClick: () => exportScene(draft) }, "📤 导出 scene.json"),
              h("button", {
                className: "dswm-btn",
                onClick: () => {
                  const name = (draft.name || "未命名").trim();
                  const list = loadScenes().filter((s) => s.name !== name).concat([draft]);
                  persistScenes(list);
                  setScenes(list);
                  store.set({ sceneName: name });
                }
              }, "💾 保存到本地")
            ])
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "状态预览 · State Preview"),
            h("div", { className: "dswm-row", style: { flexWrap: "wrap", gap: "8px" } },
              [["idle", "空闲", null], ["thinking", "思考", null], ["tool", "工具", null], ["approval", "待批准", "pending"], ["error", "错误", "error"], ["done", "完成", null]]
                .map(([key, lb, alert]) => h("button", {
                  className: "dswm-btn" + (snap.scenePreview === key ? " dswm-btn-primary" : ""),
                  onClick: () => {
                    store.set({ scenePreview: key });
                    if (key === "tool") previewState("thinking", null);
                    else if (key === "approval") previewState("idle", "pending");
                    else if (key === "error") previewState("idle", "error");
                    else previewState(key, null);
                  }
                }, lb)))
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "壁纸 / 风格 / 桌宠 / HUD"),
            h("div", { className: "dswm-row" }, [
              label("壁纸"),
              h("select", { className: "dswm-select dswm-grow", value: draft.wallpaper || "", onChange: (e) => set({ wallpaper: e.target.value }) }, [
                h("option", { value: "" }, "（不改变）"),
                ...all.map((w) => h("option", { value: w.id }, (w.kind === "shader" ? "⚡ " : "") + w.name))
              ])
            ]),
            h("div", { className: "dswm-row" }, [
              label("叠加风格"),
              h("select", { className: "dswm-select dswm-grow", value: draft.style || "auto", onChange: (e) => set({ style: e.target.value }) }, [
                h("option", { value: "auto" }, "自动（随壁纸分析）"),
                ...Object.keys(PRESETS).map((k) => h("option", { value: k }, PRESETS[k].label))
              ])
            ]),
            h("div", { className: "dswm-row" }, [
              label("桌宠形象"),
              h("select", { className: "dswm-select dswm-grow", value: draft.pet || "whale", onChange: (e) => set({ pet: e.target.value }) },
                PET_OPTIONS.map((p) => h("option", { value: p.value }, p.label)))
            ]),
            h("div", { className: "dswm-row" }, [
              label("HUD 状态栏"),
              h("label", { className: "dswm-switch" }, [
                h("input", { type: "checkbox", checked: draft.hud.hud, onChange: (e) => set({ hud: Object.assign({}, draft.hud, { hud: e.target.checked }) }) }),
                h("span", { className: "dswm-track" }), h("span", { className: "dswm-thumb" })
              ]),
              label("记忆抽屉"),
              h("label", { className: "dswm-switch" }, [
                h("input", { type: "checkbox", checked: draft.hud.memory, onChange: (e) => set({ hud: Object.assign({}, draft.hud, { memory: e.target.checked }) }) }),
                h("span", { className: "dswm-track" }), h("span", { className: "dswm-thumb" })
              ])
            ])
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "转场 / 粒子 / 通透度"),
            sliderRow("动效强度", "intensity", 0.6, 1.6, 0.2, (v) => v + "×"),
            sliderRow("粒子密度", "particleDensity", 0.2, 2, 0.1, (v) => v + "×"),
            sliderRow("转场时长", "transitionMs", 200, 1500, 50, (v) => v + "ms"),
            sliderRow("背景透明度", "baseAlpha", 0, 100, 5, (v) => v + "%"),
            sliderRow("面板透明度", "panelAlpha", 0, 100, 5, (v) => v + "%"),
            switchRow("Ken Burns", "kenburns", "壁纸缓慢缩放平移"),
            switchRow("完成动效", "doneFx", "思考结束光环+粒子爆散")
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "特效组合 · Effects"),
            h("div", { className: "dswm-row", style: { flexWrap: "wrap", gap: "8px" } },
              FX_NAMES.map(([key, lb]) => {
                const on = draft.fx && draft.fx[key];
                return h("button", {
                  className: "dswm-btn" + (on ? " dswm-btn-primary" : ""),
                  onClick: () => setFx(key, !on)
                }, (on ? "✓ " : "") + lb);
              }))
          ]),

          h("div", { className: "dswm-card" }, [
            h("div", { className: "dswm-title" }, "已保存场景 · Saved Scenes"),
            scenes.length === 0
              ? h("div", { className: "dswm-hint" }, "还没有保存的场景。编排好后点「保存到本地」或「导出 scene.json」分享。")
              : h("div", { className: "dswm-row", style: { flexWrap: "wrap", gap: "8px" } },
                  scenes.map((s) => h("button", {
                    className: "dswm-btn" + (draft.name === s.name ? " dswm-btn-primary" : ""),
                    onClick: () => { setDraft(Object.assign({}, s)); applyScene(s); }
                  }, s.name))),
            h("div", { className: "dswm-hint" }, "scene.json 可一键导入他人分享的场景包；应用时跨插件同步桌宠形象与 HUD 布局。")
          ])
        ]);
      }

      ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register(
        { name: "settings.section", id: "scene-studio", order: 33, label: "场景编排器 · Scene Studio" },
        () => h("div", { className: "dswm-page" }, h(SceneStudioView))
      )), "dsh-mood-wallpaper: scene studio section");

      // ================= 启动 =================
      loadWallpapers();
      loadHostConfig();
      initBattery();

      // ================= 卸载清理 =================
      ctx.effect(() => () => {
        if (raf) cancelAnimationFrame(raf);
        disposeShader();
        if (unsubList) unsubList();
        if (unsubSession) unsubSession();
        if (doneTimer) clearTimeout(doneTimer);
        if (alertTimer) clearTimeout(alertTimer);
        clearInterval(dayTimer);
        if (disposeOverrides) disposeOverrides();
        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("visibilitychange", onVisibility);
        if (audioCtx) { try { audioCtx.close(); } catch { /* ignore */ } }
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
