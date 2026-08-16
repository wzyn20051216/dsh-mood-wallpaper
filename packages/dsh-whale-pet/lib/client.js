/**
 * dsh-whale-pet — browser half. 自研多形象桌宠 🐋🐱🐧👻🦖
 *
 * - 独立悬浮（z-index 9200），可拖动，位置/大小/开关持久化 localStorage
 * - 随 agent 状态联动：空闲漂浮、思考加速、完成跃水/弹跳庆祝
 * - 多形象：内置 5 个自研原创 SVG 角色 + 自定义形象上传
 *   （自己的表情包/角色图/GIF 都能做桌宠，本地个人使用）
 * - 点击互动冒泡说话；快捷键 Ctrl+Shift+W 显示/隐藏；设置分节「鲸鱼桌宠」
 *
 * 原创性：内置形象全部自研 SVG；自定义形象是用户自己的素材（不进开源仓库）。
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
    const MAX_CUSTOM = 3;
    const MAX_IMG = 3 * 1024 * 1024; // 单张 ≤3MB

    const DEFAULTS = {
      visible: true,
      size: 120,
      opacity: 0.9,
      talk: true,
      petId: "whale",
      customPets: []
    };

    const LINES = [
      "咕噜～",
      "🐋 一起写代码吧",
      "深海很安静，适合专注",
      "我在听你思考哦",
      "游一圈回来～",
      "要加油鸭！",
      "嘶……这个思路不错",
      "今晚也要早点睡",
      "摸鱼被抓到了吧～",
      "干得漂亮！"
    ];

    // ================= 内置原创形象（自研 SVG） =================
    const BUILTIN_PETS = {
      whale: {
        name: "鲸鱼",
        anim: "dswpAnimWhale",
        svg: '<svg viewBox="0 0 240 90" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dswp-g-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs><g class="dswp-part-anim">' +
          '<g class="dswp-spout"><circle cx="172" cy="14" r="5" fill="#a5f3fc"/><circle cx="176" cy="10" r="4" fill="#a5f3fc"/><circle cx="180" cy="14" r="3" fill="#a5f3fc"/></g>' +
          '<path fill="url(#dswp-g-w)" d="M14 52 C 22 34, 52 26, 88 32 C 122 38, 160 48, 196 54 C 210 57, 222 58, 232 61 L 222 66 C 214 63, 204 61, 194 60 C 184 70, 162 74, 134 67 C 102 59, 60 54, 34 51 C 22 50, 14 52, 14 52 Z"/>' +
          '<path fill="rgba(255,255,255,0.25)" d="M40 40 C 60 34, 90 34, 120 40 C 100 34, 70 32, 40 40 Z"/>' +
          '<path fill="rgba(15,60,80,0.55)" d="M66 46 C 71 58, 80 64, 92 62 C 84 54, 77 48, 66 46 Z"/>' +
          '<circle cx="100" cy="44" r="3.6" fill="#082f3d"/><circle cx="101.4" cy="42.8" r="1.2" fill="#e0faff"/>' +
          '<g class="dswp-tail"><path fill="url(#dswp-g-w)" d="M232 61 C 240 55, 240 44, 232 40 C 236 46, 236 56, 232 61 Z"/><path fill="url(#dswp-g-w)" d="M232 61 C 240 67, 240 76, 232 80 C 236 75, 236 65, 232 61 Z"/></g>' +
          '</g></svg>'
      },
      cat: {
        name: "招财猫",
        anim: "dswpAnimCat",
        svg: '<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dswp-g-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1e0"/><stop offset="1" stop-color="#f5c99a"/></linearGradient></defs>' +
          '<path fill="url(#dswp-g-c)" d="M24 40 L24 18 L40 30 L58 16 L76 30 L92 18 L92 40 C 96 58, 94 78, 82 90 C 66 104, 50 104, 34 90 C 22 78, 20 58, 24 40 Z"/>' +
          '<path fill="#ffd9ec" d="M40 46 C 48 56, 68 56, 76 46 C 72 60, 44 60, 40 46 Z"/>' +
          '<circle cx="46" cy="52" r="2.6" fill="#3d2b1f"/><circle cx="70" cy="52" r="2.6" fill="#3d2b1f"/>' +
          '<path fill="#f27d9c" d="M54 58 C 56 62, 60 62, 62 58 C 60 60, 56 60, 54 58 Z"/>' +
          '<path fill="#e8b57f" d="M42 52 C 38 50, 30 50, 26 54 C 32 52, 40 52, 42 52 Z"/><path fill="#e8b57f" d="M74 52 C 78 50, 86 50, 90 54 C 84 52, 76 52, 74 52 Z"/>' +
          '<g class="dswp-paw"><path fill="#e8b57f" d="M60 78 C 66 80, 70 88, 70 96 L 50 96 C 50 88, 54 80, 60 78 Z"/></g>' +
          '<circle cx="66" cy="86" r="4" fill="#c0392b"/><circle cx="66" cy="86" r="1.6" fill="#fdebd0"/>' +
          '</svg>'
      },
      penguin: {
        name: "企鹅",
        anim: "dswpAnimPenguin",
        svg: '<svg viewBox="0 0 110 120" xmlns="http://www.w3.org/2000/svg">' +
          '<ellipse cx="55" cy="66" rx="36" ry="44" fill="#1e293b"/>' +
          '<ellipse cx="55" cy="76" rx="24" ry="32" fill="#f1f5f9"/>' +
          '<path fill="#f59e0b" d="M55 94 L63 108 L47 108 Z"/>' +
          '<circle cx="44" cy="58" r="3.4" fill="#fff"/><circle cx="44" cy="58" r="1.6" fill="#0f172a"/>' +
          '<circle cx="66" cy="58" r="3.4" fill="#fff"/><circle cx="66" cy="58" r="1.6" fill="#0f172a"/>' +
          '<g class="dswp-wing"><path fill="#0b1520" d="M22 60 C 12 68, 10 84, 18 92 C 14 78, 16 66, 22 60 Z"/></g>' +
          '<g class="dswp-wing"><path fill="#0b1520" d="M88 60 C 98 68, 100 84, 92 92 C 96 78, 94 66, 88 60 Z"/></g>' +
          '<path fill="#ffb3c1" d="M38 70 C 42 76, 50 76, 52 70 C 50 72, 42 72, 38 70 Z"/>' +
          '</svg>'
      },
      ghost: {
        name: "小幽灵",
        anim: "dswpAnimGhost",
        svg: '<svg viewBox="0 0 110 120" xmlns="http://www.w3.org/2000/svg">' +
          '<path fill="#e2e8f0" d="M55 10 C 32 10, 18 30, 18 54 L 18 92 L 30 84 L 42 92 L 55 84 L 68 92 L 80 84 L 92 92 L 92 54 C 92 30, 78 10, 55 10 Z"/>' +
          '<circle cx="43" cy="50" r="4.6" fill="#0f172a"/><circle cx="67" cy="50" r="4.6" fill="#0f172a"/>' +
          '<circle cx="44.6" cy="48.4" r="1.8" fill="#fff"/><circle cx="68.6" cy="48.4" r="1.8" fill="#fff"/>' +
          '<path fill="#fda4af" d="M48 66 C 51 70, 59 70, 62 66 C 59 68, 51 68, 48 66 Z"/>' +
          '</svg>'
      },
      dino: {
        name: "小恐龙",
        anim: "dswpAnimDino",
        svg: '<svg viewBox="0 0 150 110" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dswp-g-d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#86efac"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>' +
          '<path fill="url(#dswp-g-d)" d="M20 40 C 24 22, 40 16, 56 18 L 66 28 C 78 26, 88 32, 92 42 C 104 44, 112 52, 112 62 C 112 74, 104 82, 92 84 C 88 96, 72 100, 56 96 C 42 92, 30 84, 24 72 C 16 62, 14 50, 20 40 Z"/>' +
          '<path fill="#16a34a" d="M56 18 L50 6 L62 12 Z M72 24 L76 12 L82 22 Z M88 32 L96 22 L98 34 Z"/>' +
          '<g class="dswp-tail"><path fill="url(#dswp-g-d)" d="M112 62 C 126 58, 140 62, 146 72 C 136 68, 122 68, 112 70 Z"/></g>' +
          '<circle cx="40" cy="46" r="4" fill="#052e16"/><circle cx="41.6" cy="44.6" r="1.6" fill="#fff"/>' +
          '<path fill="#fecaca" d="M60 52 C 64 56, 72 56, 74 52 C 72 54, 62 54, 60 52 Z"/>' +
          '</svg>'
      }
    };

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
      const disposables = [];
      ctx.effect(() => () => {
        while (disposables.length) {
          try { disposables.pop()(); } catch { /* ignore */ }
        }
      }, "dsh-whale-pet: early-cleanup");

      cfg = loadConfig();
      if (!cfg.pos) cfg.pos = { x: null, y: null };

      const listeners = new Set();
      let state = Object.assign({ machine: "idle", petName: BUILTIN_PETS[cfg.petId] ? BUILTIN_PETS[cfg.petId].name : "自定义" }, cfg);
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
          pointer-events: auto; touch-action: none; line-height: 0;
          transition: opacity 0.4s ease;
        }
        #dswp-whale:active { cursor: grabbing; }
        #dswp-whale.dswp-hidden { opacity: 0; pointer-events: none; }
        #dswp-whale img.dswp-img, #dswp-whale svg {
          display: block; width: 100%; height: auto;
        }
        #dswp-whale img.dswp-img {
          filter: drop-shadow(0 4px 18px rgba(0,0,0,0.25));
          border-radius: 12px; background: rgba(255,255,255,0.06);
        }
        #dswp-whale svg { filter: drop-shadow(0 4px 18px rgba(45,212,191,0.35)); }

        /* ---- 通用浮动 ---- */
        #dswp-whale .dswp-part-anim { animation: dswpFloat 6s ease-in-out infinite; transform-origin: 50% 60%; }
        @keyframes dswpFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-6px) rotate(-1.5deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-4px) rotate(1.5deg); }
        }
        /* 鲸鱼尾鳍 + 喷水 */
        #dswp-whale[data-pet="whale"] .dswp-tail { transform-origin: 130px 61px; animation: dswpTail 3.2s ease-in-out infinite; }
        #dswp-whale[data-pet="whale"] .dswp-spout circle { animation: dswpSpout 2.6s ease-out infinite; }
        #dswp-whale[data-pet="whale"] .dswp-spout circle:nth-child(2) { animation-delay: 0.3s; }
        #dswp-whale[data-pet="whale"] .dswp-spout circle:nth-child(3) { animation-delay: 0.6s; }
        @keyframes dswpTail { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(14deg); } }
        @keyframes dswpSpout { 0% { opacity: 0; transform: translateY(0) scale(0.4); } 30% { opacity: 0.8; } 100% { opacity: 0; transform: translateY(-26px) scale(1.1); } }
        /* 招财猫招手 */
        #dswp-whale[data-pet="cat"] .dswp-paw { transform-origin: 60px 96px; animation: dswpPaw 1.6s ease-in-out infinite; }
        @keyframes dswpPaw { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-16deg); } }
        /* 企鹅摇摆 */
        #dswp-whale[data-pet="penguin"] .dswp-part-anim { animation: dswpWaddle 2.4s ease-in-out infinite; }
        #dswp-whale[data-pet="penguin"] .dswp-wing { animation: dswpWing 1.2s ease-in-out infinite alternate; transform-origin: 22px 60px; }
        #dswp-whale[data-pet="penguin"] .dswp-wing:last-child { animation-name: dswpWingR; transform-origin: 88px 60px; }
        @keyframes dswpWaddle { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
        @keyframes dswpWing { from { transform: rotate(0deg); } to { transform: rotate(18deg); } }
        @keyframes dswpWingR { from { transform: rotate(0deg); } to { transform: rotate(-18deg); } }
        /* 幽灵漂浮 */
        #dswp-whale[data-pet="ghost"] .dswp-part-anim { animation: dswpHover 4.5s ease-in-out infinite; }
        @keyframes dswpHover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        /* 恐龙尾巴 */
        #dswp-whale[data-pet="dino"] .dswp-tail { transform-origin: 112px 64px; animation: dswpTail 1.4s ease-in-out infinite; }

        /* ---- 思考加速 ---- */
        #dswp-whale.dswp-thinking .dswp-part-anim { animation-duration: 1.4s; }
        #dswp-whale.dswp-thinking[data-pet="whale"] .dswp-tail { animation-duration: 0.9s; }
        #dswp-whale.dswp-thinking[data-pet="cat"] .dswp-paw { animation-duration: 0.7s; }
        #dswp-whale.dswp-thinking[data-pet="penguin"] .dswp-wing { animation-duration: 0.5s; }
        #dswp-whale.dswp-thinking[data-pet="dino"] .dswp-tail { animation-duration: 0.6s; }
        #dswp-whale.dswp-thinking img.dswp-img { animation: dswpBounce 0.9s ease-in-out infinite; }
        @keyframes dswpBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

        /* ---- 完成庆祝 ---- */
        #dswp-whale.dswp-done .dswp-part-anim, #dswp-whale.dswp-done img.dswp-img {
          animation: dswpJump 1.2s ease-out forwards;
        }
        @keyframes dswpJump {
          0% { transform: translate(0, 0) scale(1); }
          35% { transform: translate(0, -46px) scale(1.1) rotate(-8deg); }
          70% { transform: translate(0, 0) scale(0.95); }
          100% { transform: translate(0, 0) scale(1); }
        }

        /* ---- 台词气泡 & 泡泡 ---- */
        #dswp-whale .dswp-say {
          position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
          white-space: nowrap; padding: 6px 12px; border-radius: 12px; line-height: 18px;
          background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #1f222b) 90%, transparent);
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12));
          color: var(--dsw-alias-label-primary, #e5e7eb);
          font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
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
          opacity: 0; transition: opacity 0.3s ease; white-space: nowrap; pointer-events: none; line-height: 14px;
        }
        #dswp-whale:hover .dswp-hint { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          #dswp-whale * { animation: none !important; }
        }

        /* ---- 设置页 ---- */
        .dswp-page { padding: 4px 20px 28px; max-width: 640px; display: flex; flex-direction: column; gap: 16px; }
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
        .dswp-pets { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
        .dswp-pet {
          border: 2px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 8px;
          cursor: pointer; text-align: center; background: var(--dsw-alias-bg-layer-2); position: relative;
        }
        .dswp-pet:hover { border-color: var(--dsw-alias-border-l2); }
        .dswp-pet.dswp-sel { border-color: var(--dsw-alias-brand-primary); }
        .dswp-pet svg, .dswp-pet img { width: 100%; height: 64px; object-fit: contain; }
        .dswp-pet > div { line-height: 0; }
        .dswp-pet > div > svg { width: 100%; height: 64px; }
        .dswp-pet .dswp-pet-name { font-size: 12px; line-height: 18px; margin-top: 4px; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dswp-pet .dswp-del {
          position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border: 0; border-radius: 6px;
          background: rgba(220,38,38,0.85); color: #fff; font-size: 11px; cursor: pointer; line-height: 18px;
        }
        .dswp-btn {
          box-sizing: border-box; height: 32px; padding: 0 14px; cursor: pointer;
          background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; font-size: 13px;
        }
        .dswp-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
        .dswp-btn-primary:hover { opacity: 0.9; }
        .dswp-url-input {
          box-sizing: border-box; flex: 1; height: 32px; padding: 0 10px;
          background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
          font-size: 13px; outline: none; min-width: 0;
        }
        .dswp-url-input:focus { border-color: var(--dsw-alias-brand-primary); }
      `;

      // ================= 桌宠 DOM =================
      const pet = document.createElement("div");
      pet.id = "dswp-whale";
      pet.setAttribute("data-pet", cfg.petId);
      pet.title = "桌宠 · 拖动移动 / 点击互动 / Ctrl+Shift+W 隐藏";
      pet.innerHTML = '<div class="dswp-hint">拖动 · 点击 · Ctrl+Shift+W</div>';
      document.body.appendChild(pet);
      disposables.push(() => { if (pet && pet.parentNode) pet.parentNode.removeChild(pet); });

      function currentPet() {
        if (BUILTIN_PETS[cfg.petId]) return BUILTIN_PETS[cfg.petId];
        return (cfg.customPets || []).find((p) => p.id === cfg.petId) || null;
      }

      function renderPet() {
        const p = currentPet();
        pet.setAttribute("data-pet", cfg.petId);
        // 保留 hint
        const hint = pet.querySelector(".dswp-hint");
        pet.innerHTML = "";
        if (p && p.svg) {
          const wrap = document.createElement("span");
          wrap.innerHTML = p.svg;
          pet.appendChild(wrap.firstChild);
        } else if (p && p.dataUrl) {
          const img = document.createElement("img");
          img.className = "dswp-img";
          img.src = p.dataUrl;
          img.alt = p.name || "桌宠";
          pet.appendChild(img);
        } else {
          const wrap = document.createElement("span");
          wrap.innerHTML = BUILTIN_PETS.whale.svg;
          pet.appendChild(wrap.firstChild);
          pet.setAttribute("data-pet", "whale");
        }
        pet.appendChild(hint);
        store.set({ petName: (p && p.name) || "桌宠" });
      }

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
        if (!cfg.visible) return;
        const d = deriveMachine(snap);
        let m = d.m;
        if (!d.active && wasActive) m = "done";
        wasActive = d.active;
        pet.classList.remove("dswp-thinking", "dswp-done");
        if (m === "thinking") pet.classList.add("dswp-thinking");
        else if (m === "done") {
          pet.classList.add("dswp-done");
          if (cfg.talk) say(LINES[Math.floor(Math.random() * LINES.length)]);
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
          b.style.left = (r.width * (0.3 + Math.random() * 0.4)) + "px";
          b.style.top = (r.height * (0.1 + Math.random() * 0.2)) + "px";
          pet.appendChild(b);
          setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 2000);
        }
      }

      pet.addEventListener("click", () => {
        say(LINES[Math.floor(Math.random() * LINES.length)]);
        spawnBubbles(5);
      });
      pet.addEventListener("dblclick", () => {
        cfg.size = cfg.size >= 170 ? 90 : cfg.size + 40;
        saveConfig();
        applyVisual();
        say(cfg.size >= 170 ? "变大了，看得清吗～" : "缩回来了～");
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

      // 快捷键 Ctrl+Shift+W
      function onKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || "").toLowerCase() === "w") {
          e.preventDefault();
          applyConfig({ visible: !cfg.visible });
        }
      }
      window.addEventListener("keydown", onKeyDown);
      disposables.push(() => window.removeEventListener("keydown", onKeyDown));

      // 极简模式：收到 dsh-ui-hud 广播 → 临时隐藏桌宠（不改变用户设置）
      let minimalTemp = false;
      function onMinimalEvent(e) {
        minimalTemp = !!(e && e.detail && e.detail.minimal);
        pet.classList.toggle("dswp-hidden", !cfg.visible || minimalTemp);
      }
      window.addEventListener("dsh:minimal", onMinimalEvent);
      disposables.push(() => window.removeEventListener("dsh:minimal", onMinimalEvent));

      function applyConfig(patch) {
        Object.assign(cfg, patch);
        saveConfig();
        store.set(patch);
        if (patch.petId !== void 0) renderPet();
        applyVisual();
      }

      // ================= 自定义形象上传 =================
      function importPet(file) {
        if (!file) return;
        if (file.size > MAX_IMG) { say("图片太大了（≤3MB）～"); return; }
        if ((cfg.customPets || []).length >= MAX_CUSTOM) { say("自定义形象最多 3 个～"); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const id = "custom-" + Date.now();
          const pets = (cfg.customPets || []).concat([{ id, name: file.name.replace(/\.[^.]+$/, "") || "自定义", dataUrl: String(reader.result) }]);
          cfg.customPets = pets;
          cfg.petId = id;
          saveConfig();
          store.set({ customPets: pets });
          renderPet();
          applyVisual();
          say("换上新形象啦～");
        };
        reader.readAsDataURL(file);
      }

      function removePet(id) {
        const pets = (cfg.customPets || []).filter((p) => p.id !== id);
        cfg.customPets = pets;
        if (cfg.petId === id) cfg.petId = "whale";
        saveConfig();
        store.set({ customPets: pets });
        renderPet();
      }

      // 从 URL 拉取形象（fetch → blob → dataURL；跨域图源会失败，提示改用下载上传）
      async function importPetFromUrl(url, nameHint) {
        const raw = String(url || "").trim();
        if (!/^https?:\/\//i.test(raw)) { say("URL 不对哦～"); return; }
        try {
          const res = await fetch(raw, { mode: "cors" });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const blob = await res.blob();
          if (blob.size > MAX_IMG) { say("图片太大了（≤3MB）～"); return; }
          if ((cfg.customPets || []).length >= MAX_CUSTOM) { say("自定义形象最多 3 个～"); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const id = "custom-" + Date.now();
            const pets = (cfg.customPets || []).concat([{ id, name: (nameHint || raw.split("/").pop() || "自定义").replace(/\.[^.]+$/, "").slice(0, 18), dataUrl: String(reader.result) }]);
            cfg.customPets = pets;
            cfg.petId = id;
            saveConfig();
            store.set({ customPets: pets });
            renderPet();
            applyVisual();
            say("换上新形象啦～");
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          say("该图源不允许跨域，下载后上传吧～");
        }
      }

      // ================= 设置页 =================
      function SettingsView() {
        const [snap, setSnap] = React.useState(store.get());
        React.useEffect(() => store.subscribe(setSnap), []);
        const fileRef = React.useRef(null);
        const builtinKeys = Object.keys(BUILTIN_PETS);
        const custom = snap.customPets || [];

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

        const petCell = (id, name, inner, removable) => h("div", {
          key: id,
          className: "dswp-pet" + (snap.petId === id ? " dswp-sel" : ""),
          onClick: () => applyConfig({ petId: id })
        }, [
          removable ? h("button", { className: "dswp-del", title: "删除", onClick: (e) => { e.stopPropagation(); removePet(id); } }, "×") : null,
          h("div", { dangerouslySetInnerHTML: { __html: inner } }),
          h("div", { className: "dswp-pet-name" }, name)
        ]);

        return h("div", { className: "dswp-page" }, [
          h("div", { className: "dswp-card" }, [
            h("div", { className: "dswp-title" }, "鲸鱼桌宠 · Pet"),
            row("显示桌宠", "独立悬浮，可拖动 / 双击缩放", snap.visible, (e) => applyConfig({ visible: e.target.checked })),
            row("点击说话", "点击冒泡 + 随机台词", snap.talk, (e) => applyConfig({ talk: e.target.checked })),
            h("div", { className: "dswp-row" }, [
              h("span", { className: "dswp-label" }, "大小"),
              h("input", { className: "dswp-slider", type: "range", min: 70, max: 200, step: 5, value: snap.size, onChange: (e) => applyConfig({ size: Number(e.target.value) }) }),
              h("span", { className: "dswp-hint" }, snap.size + "px")
            ]),
            h("div", { className: "dswp-row" }, [
              h("span", { className: "dswp-label" }, "不透明度"),
              h("input", { className: "dswp-slider", type: "range", min: 30, max: 100, step: 5, value: Math.round(snap.opacity * 100), onChange: (e) => applyConfig({ opacity: Number(e.target.value) / 100 }) }),
              h("span", { className: "dswp-hint" }, Math.round(snap.opacity * 100) + "%")
            ]),
            h("div", { className: "dswp-hint" }, "快捷键 Ctrl+Shift+W 显示/隐藏；当前形象：" + (snap.petName || ""))
          ]),
          h("div", { className: "dswp-card" }, [
            h("div", { className: "dswp-title" }, "选择形象"),
            h("div", { className: "dswp-pets" },
              builtinKeys.map((key) => petCell(key, BUILTIN_PETS[key].name, BUILTIN_PETS[key].svg, false))
                .concat(custom.map((p) => petCell(p.id, p.name, '<img src="' + p.dataUrl + '" alt="' + p.name + '"/>', true)))
            ),
            h("div", { className: "dswp-row" }, [
              h("input", {
                ref: fileRef,
                type: "file",
                accept: "image/*,.gif",
                style: { display: "none" },
                onChange: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) importPet(f); }
              }),
              h("button", { className: "dswp-btn dswp-btn-primary", onClick: () => fileRef.current && fileRef.current.click() }, "上传自定义形象"),
              h("span", { className: "dswp-hint" }, "GIF/PNG/WebP ≤3MB，最多 3 个（自己的表情包也能当桌宠）")
            ]),
            h("div", { className: "dswp-row" }, [
              h("input", {
                className: "dswp-url-input",
                placeholder: "或粘贴图片 URL（https://…）",
                onKeyDown: (e) => { if (e.key === "Enter") importPetFromUrl(e.target.value); e.target.value = ""; }
              }),
              h("button", { className: "dswp-btn", onClick: (e) => { const inp = e.currentTarget.previousSibling; importPetFromUrl(inp && inp.value); if (inp) inp.value = ""; } }, "添加")
            ])
          ])
        ]);
      }

      ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register(
        { name: "settings.section", id: "whale-pet", order: 45, label: "鲸鱼桌宠 · Pet" },
        () => h("div", { className: "dswp-page" }, h(SettingsView))
      )), "dsh-whale-pet: settings section");

      renderPet();
      applyVisual();
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
