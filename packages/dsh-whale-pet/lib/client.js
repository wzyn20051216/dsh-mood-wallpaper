/**
 * dsh-whale-pet — browser half. 自研鲸鱼桌宠 🐋
 *
 * - 独立悬浮鲸鱼（z-index 9200），可按住拖动，位置/大小/开关持久化 localStorage
 * - 随 agent 状态联动：空闲漂浮、思考快速游动、完成跃水庆祝
 * - 点击互动：冒泡 + 随机台词；双击放大/缩小
 * - 快捷键 Ctrl+Shift+W 显示/隐藏；设置分节「鲸鱼桌宠」
 *
 * 原创性：全部自研（SVG 剪影、CSS 动画、交互逻辑），不参考任何第三方桌宠实现；
 * 状态输入来自官方 ctx.sessions 快照，无注入、不抓 DOM。
 */
window.__ModuleLoader__.load({
  id: "dsh-whale-pet",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;

    const name = "whale-pet";
    const inject = ["slots", "theme", "sessions"];

    const CFG_KEY = "dsh-whale-pet.config";

    const DEFAULTS = {
      visible: true,
      size: 120,
      opacity: 0.9,
      talk: true
    };

    /** 台词库（原创）。 */
    const LINES = [
      "咕噜～",
      "🐋 一起写代码吧",
      "深海很安静，适合专注",
      "我在听你思考哦",
      "游一圈回来～",
      "要加油鸭！",
      "嘶……这个思路不错",
      "今晚也要早点睡"
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

    let cfg;

    function saveConfig() {
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      } catch (e) {
        console.warn("dsh-whale-pet: saveConfig failed", e);
      }
    }

    function apply(ctx) {
      // ================= 早期清理注册器 =================
      const disposables = [];
      ctx.effect(() => () => {
        while (disposables.length) {
          try { disposables.pop()(); } catch { /* ignore */ }
        }
      }, "dsh-whale-pet: early-cleanup");

      cfg = loadConfig();
      if (!cfg.pos) cfg.pos = { x: null, y: null }; // null = 默认右下角

      const listeners = new Set();
      let state = Object.assign({ machine: "idle" }, cfg);
      const store = {
        get: () => state,
        set(patch) { state = Object.assign({}, state, patch); for (const l of listeners) l(state); },
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
      };

      // ================= 样式 =================
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-dsh-whale-pet", "true");
      document.head.appendChild(styleEl);
      disposables.push(() => { if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); });
      styleEl.textContent = `
        #dswp-whale {
          position: fixed; z-index: 9200; cursor: grab; user-select: none;
          pointer-events: auto; touch-action: none;
          transition: opacity 0.4s ease;
        }
        #dswp-whale:active { cursor: grabbing; }
        #dswp-whale.dswp-hidden { opacity: 0; pointer-events: none; }
        #dswp-whale svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 4px 18px rgba(45,212,191,0.35)); }
        /* 尾鳍摆动 */
        #dswp-whale .dswp-tail { transform-origin: 120px 44px; animation: dswpTail 3.2s ease-in-out infinite; }
        @keyframes dswpTail { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(14deg); } }
        /* 整体漂浮 */
        #dswp-whale .dswp-body { animation: dswpFloat 6s ease-in-out infinite; transform-origin: 110px 44px; }
        @keyframes dswpFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-6px) rotate(-1.5deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-4px) rotate(1.5deg); }
        }
        /* 思考：加速游动 */
        #dswp-whale.dswp-thinking .dswp-tail { animation-duration: 0.9s; }
        #dswp-whale.dswp-thinking .dswp-body { animation: dswpSwim 1.4s ease-in-out infinite; }
        @keyframes dswpSwim {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(7px, -5px) rotate(3deg); }
          50% { transform: translate(-6px, -8px) rotate(-3deg); }
          80% { transform: translate(6px, -3px) rotate(2deg); }
        }
        /* 完成：跃水庆祝（一次性） */
        #dswp-whale.dswp-done .dswp-body { animation: dswpBreach 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
        @keyframes dswpBreach {
          0% { transform: translate(0, 0) rotate(0deg); }
          30% { transform: translate(20px, -70px) rotate(-40deg); }
          55% { transform: translate(60px, -110px) rotate(-160deg); }
          80% { transform: translate(90px, -20px) rotate(-300deg); }
          100% { transform: translate(120px, 0) rotate(-360deg); }
        }
        /* 喷水 */
        #dswp-whale .dswp-spout circle { animation: dswpSpout 2.6s ease-out infinite; }
        #dswp-whale .dswp-spout circle:nth-child(2) { animation-delay: 0.3s; }
        #dswp-whale .dswp-spout circle:nth-child(3) { animation-delay: 0.6s; }
        @keyframes dswpSpout {
          0% { opacity: 0; transform: translateY(0) scale(0.4); }
          30% { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-26px) scale(1.1); }
        }
        #dswp-whale.dswp-thinking .dswp-spout circle { animation-duration: 1.4s; }
        /* 台词气泡 */
        #dswp-whale .dswp-say {
          position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
          white-space: nowrap; padding: 6px 12px; border-radius: 12px;
          background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #1f222b) 90%, transparent);
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12));
          color: var(--dsw-alias-label-primary, #e5e7eb);
          font-size: 12px; line-height: 18px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          animation: dswpSay 3.4s ease-out forwards;
        }
        @keyframes dswpSay {
          0% { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.9); }
          12% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(1); }
        }
        #dswp-whale .dswp-bubble {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, rgba(180,240,255,0.9), rgba(45,212,191,0.25));
          animation: dswpBubble 1.8s ease-out forwards; pointer-events: none;
        }
        @keyframes dswpBubble {
          0% { opacity: 0; transform: translateY(0) scale(0.5); }
          20% { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-70px) scale(1.1); }
        }
        #dswp-whale .dswp-hint {
          position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
          font-size: 10px; color: var(--dsw-alias-label-tertiary, #6b7280);
          opacity: 0; transition: opacity 0.3s ease; white-space: nowrap; pointer-events: none;
        }
        #dswp-whale:hover .dswp-hint { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          #dswp-whale * { animation: none !important; }
        }
        /* ---- 设置页 ---- */
        .dswp-page { padding: 4px 20px 28px; max-width: 620px; display: flex; flex-direction: column; gap: 16px; }
        .dswp-card {
          background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
        }
        .dswp-title { font-size: 15px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
        .dswp-row { display: flex; align-items: center; gap: 10px; }
        .dswp-grow { flex: 1; min-width: 0; }
        .dswp-label { font-size: 13px; color: var(--dsw-alias-label-secondary); flex: none; width: 92px; }
        .dswp-hint { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
        .dswp-slider { flex: 1; accent-color: var(--dsw-alias-brand-primary); }
        .dswp-switch { position: relative; width: 40px; height: 22px; flex: none; cursor: pointer; display: inline-block; }
        .dswp-switch input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
        .dswp-switch .dswp-track {
          position: absolute; inset: 0; border-radius: 11px;
          background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
          border: 1px solid var(--dsw-alias-border-l1); transition: background 0.15s ease;
        }
        .dswp-switch .dswp-thumb {
          position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
          background: var(--dsw-alias-label-secondary); transition: transform 0.15s ease, background 0.15s ease;
        }
        .dswp-switch input:checked ~ .dswp-track { background: var(--dsw-alias-brand-primary); border-color: transparent; }
        .dswp-switch input:checked ~ .dswp-thumb { transform: translateX(18px); background: #fff; }
        .dswp-switch input:focus-visible ~ .dswp-track { box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary); }
      `;

      // ================= 鲸鱼 DOM =================
      const pet = document.createElement("div");
      pet.id = "dswp-whale";
      pet.title = "鲸鱼桌宠 · 拖动移动 / 点击互动 / Ctrl+Shift+W 隐藏";
      pet.innerHTML =
        '<svg viewBox="0 0 240 90" xmlns="http://www.w3.org/2000/svg" width="240" height="90">' +
        '<defs><linearGradient id="dswp-body-g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs>' +
        '<g class="dswp-body">' +
        '<g class="dswp-spout">' +
        '<circle cx="172" cy="14" r="5" fill="#a5f3fc"/>' +
        '<circle cx="176" cy="10" r="4" fill="#a5f3fc"/>' +
        '<circle cx="180" cy="14" r="3" fill="#a5f3fc"/>' +
        '</g>' +
        '<path fill="url(#dswp-body-g)" d="M14 52 C 22 34, 52 26, 88 32 C 122 38, 160 48, 196 54 C 210 57, 222 58, 232 61 L 222 66 C 214 63, 204 61, 194 60 C 184 70, 162 74, 134 67 C 102 59, 60 54, 34 51 C 22 50, 14 52, 14 52 Z"/>' +
        '<path fill="rgba(255,255,255,0.25)" d="M40 40 C 60 34, 90 34, 120 40 C 100 34, 70 32, 40 40 Z"/>' +
        '<path fill="rgba(15,60,80,0.55)" d="M66 46 C 71 58, 80 64, 92 62 C 84 54, 77 48, 66 46 Z"/>' +
        '<circle class="dswp-eye" cx="100" cy="44" r="3.6" fill="#082f3d"/>' +
        '<circle cx="101.4" cy="42.8" r="1.2" fill="#e0faff"/>' +
        '<g class="dswp-tail">' +
        '<path fill="url(#dswp-body-g)" d="M232 61 C 240 55, 240 44, 232 40 C 236 46, 236 56, 232 61 Z"/>' +
        '<path fill="url(#dswp-body-g)" d="M232 61 C 240 67, 240 76, 232 80 C 236 75, 236 65, 232 61 Z"/>' +
        '</g>' +
        '</g>' +
        '</svg>' +
        '<div class="dswp-hint">拖动 · 点击 · Ctrl+Shift+W</div>';
      document.body.appendChild(pet);
      disposables.push(() => { if (pet && pet.parentNode) pet.parentNode.removeChild(pet); });

      // 大小与位置
      function applyVisual() {
        pet.style.width = cfg.size + "px";
        pet.style.opacity = String(cfg.opacity);
        if (cfg.pos && cfg.pos.x != null) {
          pet.style.left = cfg.pos.x + "px";
          pet.style.top = cfg.pos.y + "px";
          pet.style.right = "auto";
          pet.style.bottom = "auto";
        } else {
          pet.style.left = "auto";
          pet.style.top = "auto";
          pet.style.right = "24px";
          pet.style.bottom = "120px";
        }
        pet.classList.toggle("dswp-hidden", !cfg.visible);
      }

      // ================= 状态联动 =================
      let unsubList = null;
      let unsubSession = null;
      let lastSnap = null;
      let wasActive = false;

      function deriveMachine(snap) {
        if (!snap) return { m: "idle", active: false };
        if (snap.openState !== "open") return { m: "idle", active: false };
        if (snap.partial || (snap.runningCalls && snap.runningCalls.length > 0)) return { m: "thinking", active: true };
        if (snap.turnTimings) {
          for (const t of snap.turnTimings.values()) {
            if (t && t.startTime !== void 0 && t.endTime === void 0) return { m: "thinking", active: true };
          }
        }
        return { m: "idle", active: false };
      }

      function onSnapshot(snap) {
        lastSnap = snap;
        if (!cfg.visible) return;
        const d = deriveMachine(snap);
        let m = d.m;
        if (!d.active && wasActive) m = "done";
        wasActive = d.active;
        pet.classList.remove("dswp-thinking", "dswp-done");
        if (m === "thinking") pet.classList.add("dswp-thinking");
        else if (m === "done") {
          pet.classList.add("dswp-done");
          const doneLine = LINES[Math.floor(Math.random() * LINES.length)];
          say(doneLine);
        }
        store.set({ machine: m });
      }

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
        disposables.push(() => { if (unsubSession) unsubSession(); });
        onSnapshot(session.getSnapshot());
      }
      unsubList = ctx.sessions.list.subscribe(observeCurrent);
      disposables.push(() => { if (unsubList) unsubList(); });
      observeCurrent();

      // ================= 互动 =================
      function say(text) {
        if (!cfg.talk) return;
        const old = pet.querySelector(".dswp-say");
        if (old) old.remove();
        const bubble = document.createElement("div");
        bubble.className = "dswp-say";
        bubble.textContent = text;
        pet.appendChild(bubble);
        setTimeout(() => { if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 3500);
      }

      function spawnBubbles(n) {
        const r = pet.getBoundingClientRect();
        for (let i = 0; i < n; i++) {
          const b = document.createElement("div");
          b.className = "dswp-bubble";
          const s = 6 + Math.random() * 10;
          b.style.width = s + "px";
          b.style.height = s + "px";
          b.style.left = (r.width * (0.35 + Math.random() * 0.4)) + "px";
          b.style.top = (r.height * (0.15 + Math.random() * 0.2)) + "px";
          pet.appendChild(b);
          setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 2000);
        }
      }

      pet.addEventListener("click", () => {
        say(LINES[Math.floor(Math.random() * LINES.length)]);
        spawnBubbles(5);
      });
      pet.addEventListener("dblclick", () => {
        cfg.size = cfg.size >= 160 ? 100 : cfg.size + 30;
        saveConfig();
        applyVisual();
        say(cfg.size >= 160 ? "变大了，看得清吗～" : "缩回来了～");
      });

      // 拖拽
      let dragState = null;
      pet.addEventListener("pointerdown", (e) => {
        dragState = { dx: e.clientX - pet.offsetLeft, dy: e.clientY - pet.offsetTop };
        try { pet.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      });
      pet.addEventListener("pointermove", (e) => {
        if (!dragState) return;
        const x = Math.max(0, Math.min(innerWidth - pet.offsetWidth, e.clientX - dragState.dx));
        const y = Math.max(0, Math.min(innerHeight - pet.offsetHeight, e.clientY - dragState.dy));
        pet.style.left = x + "px";
        pet.style.top = y + "px";
        pet.style.right = "auto";
        pet.style.bottom = "auto";
        cfg.pos = { x, y };
      });
      pet.addEventListener("pointerup", () => { dragState = null; saveConfig(); });
      pet.addEventListener("pointercancel", () => { dragState = null; });
      disposables.push(() => {
        pet.removeEventListener("pointerdown", () => {});
        pet.removeEventListener("pointermove", () => {});
        pet.removeEventListener("pointerup", () => {});
        pet.removeEventListener("pointercancel", () => {});
      });

      // 快捷键 Ctrl+Shift+W
      function onKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || "").toLowerCase() === "w") {
          e.preventDefault();
          applyConfig({ visible: !cfg.visible });
        }
      }
      window.addEventListener("keydown", onKeyDown);
      disposables.push(() => window.removeEventListener("keydown", onKeyDown));

      function applyConfig(patch) {
        Object.assign(cfg, patch);
        saveConfig();
        store.set(patch);
        applyVisual();
      }

      // ================= 设置页 =================
      function SettingsView() {
        const [snap, setSnap] = React.useState(store.get());
        React.useEffect(() => store.subscribe(setSnap), []);
        const row = (label, hint, checked, onChange) => h("div", { className: "dswp-row" }, [
          h("div", { className: "dswp-grow" }, [
            h("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-primary)" } }, label),
            h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, hint)
          ]),
          h("label", { className: "dswp-switch" }, [
            h("input", { type: "checkbox", checked, onChange }),
            h("span", { className: "dswp-track" }),
            h("span", { className: "dswp-thumb" })
          ])
        ]);
        return h("div", { className: "dswp-page" }, [
          h("div", { className: "dswp-card" }, [
            h("div", { className: "dswp-title" }, "鲸鱼桌宠 · Whale Pet"),
            row("显示鲸鱼", "独立悬浮桌宠，可拖动 / 双击放大缩小", snap.visible, (e) => applyConfig({ visible: e.target.checked })),
            row("点击说话", "点击冒泡 + 随机台词；完成任务时跃水庆祝", snap.talk, (e) => applyConfig({ talk: e.target.checked })),
            h("div", { className: "dswp-row" }, [
              h("span", { className: "dswp-label" }, "大小"),
              h("input", {
                className: "dswp-slider",
                type: "range", min: 70, max: 200, step: 5,
                value: snap.size,
                onChange: (e) => applyConfig({ size: Number(e.target.value) })
              }),
              h("span", { className: "dswp-hint" }, snap.size + "px")
            ]),
            h("div", { className: "dswp-row" }, [
              h("span", { className: "dswp-label" }, "不透明度"),
              h("input", {
                className: "dswp-slider",
                type: "range", min: 30, max: 100, step: 5,
                value: Math.round(snap.opacity * 100),
                onChange: (e) => applyConfig({ opacity: Number(e.target.value) / 100 })
              }),
              h("span", { className: "dswp-hint" }, Math.round(snap.opacity * 100) + "%")
            ]),
            h("div", { className: "dswp-hint" }, "快捷键 Ctrl+Shift+W 显示/隐藏；拖动位置自动记忆。")
          ])
        ]);
      }

      ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register(
        { name: "settings.section", id: "whale-pet", order: 45, label: "鲸鱼桌宠 · Whale" },
        () => h("div", { className: "dswp-page" }, h(SettingsView))
      )), "dsh-whale-pet: settings section");

      applyVisual();
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
