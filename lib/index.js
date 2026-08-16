/**
 * dsh-mood-wallpaper — node half.
 *
 * 壁纸感知的动态壁纸引擎（状态机）：本半区负责壁纸资产的托管与配置持久化。
 *
 * 路由（最长前缀优先，与 client-modules 的 /plugins bundle 路由共存）：
 *   GET  /list                        内置 + 用户导入壁纸清单（存储目录优先）
 *   GET  /asset/<name>                提供字节（用户存储目录 → 插件 assets 目录）
 *   POST /import?name=<name>          接收上传字节，写入用户存储目录
 *   POST /delete?name=<name>          删除用户导入的壁纸
 *   GET  /config                      读取持久化配置（$DSH_HOME/dsh-mood-wallpaper/config.json）
 *   POST /config                      保存持久化配置
 *
 * 兼容性约定：自定义路由前缀 /plugins/mood-wallpaper（与 client-modules
 * 按包名提供的 /plugins/dsh-mood-wallpaper/client.js 区分开，避免拦截
 * 客户端 bundle）、配置文件名、行 id（mood-wallpaper）均唯一。
 */
import { readFile, writeFile, readdir, stat, mkdir, unlink } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

/** Cordis 插件名（patch 行 id）。 */
const name = "mood-wallpaper";
/** 依赖的服务。 */
const inject = ["webServer"];

const here = dirname(fileURLToPath(import.meta.url));
/** 随插件分发的内置壁纸目录（开源仓库内）。 */
const ASSETS_DIR = join(here, "..", "assets");

const EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif|svg|apng|mp4|webm|ogg)$/i;
const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  apng: "image/apng",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg"
};
/** 单张壁纸字节上限。 */
const MAX_BYTES = 48 * 1024 * 1024;

/** DSH 配置根目录。 */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
/** 本插件用户数据目录（导入的壁纸 + 配置）。 */
function storageDir() {
  return join(dshHome(), "dsh-mood-wallpaper");
}
function configPath() {
  return join(storageDir(), "config.json");
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(body));
}

/** 读取请求体为 Buffer（二进制安全，带大小上限）。 */
function readBodyBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** 名称清洗：仅允许文件名，禁止路径穿越。 */
function safeName(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const base = basename(decodeURIComponent(raw));
  if (base === "" || base === "." || base === ".." || !EXT_RE.test(base)) return null;
  return base;
}

function entryFor(id, kind, size) {
  const ext = id.split(".").pop().toLowerCase();
  return {
    id,
    name: id,
    kind,
    ext,
    size,
    url: "/plugins/mood-wallpaper/asset/" + encodeURIComponent(id),
    mime: MIME[ext] || "application/octet-stream"
  };
}

async function listStorage() {
  const dir = storageDir();
  const out = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const id = safeName(entry.name);
      if (id === null) continue;
      if (id === "config.json") continue;
      let size = 0;
      try {
        size = (await stat(join(dir, entry.name))).size;
      } catch { /* skip */ }
      out.push(entryFor(id, "user", size));
    }
  } catch { /* 目录不存在 = 无用户壁纸 */ }
  return out;
}

/** 内置着色器壁纸（WebGL 实时渲染，客户端处理，无文件）。 */
const SHADER_BUILTINS = [
  { id: "shader-aurora", name: "着色器 · 极光" },
  { id: "shader-lava", name: "着色器 · 熔岩" },
  { id: "shader-nebula", name: "着色器 · 星云" }
];

async function listBuiltins() {
  const out = [];
  try {
    const entries = await readdir(ASSETS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const id = safeName(entry.name);
      if (id === null) continue;
      let size = 0;
      try {
        size = (await stat(join(ASSETS_DIR, entry.name))).size;
      } catch { /* skip */ }
      out.push(entryFor(id, "builtin", size));
    }
  } catch { /* assets 缺失 = 无内置 */ }
  for (const s of SHADER_BUILTINS) {
    out.push({ id: s.id, name: s.name, kind: "shader", url: null, mime: null, size: 0 });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function readConfig() {
  try {
    const body = await readFile(configPath(), "utf8");
    const c = JSON.parse(body);
    return c && typeof c === "object" ? c : {};
  } catch {
    return {};
  }
}

/** 列出自定义壁纸文件夹中的图片（壁纸放非系统盘，不占 C 盘）。 */
async function listFolder() {
  const cfg = await readConfig();
  const folder = (cfg.folder || "").trim();
  if (!folder) return [];
  const out = [];
  try {
    const st = await stat(folder);
    if (!st.isDirectory()) return [];
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const id = safeName(entry.name);
      if (id === null) continue;
      let size = 0;
      try {
        size = (await stat(join(folder, entry.name))).size;
      } catch { /* skip */ }
      out.push(entryFor(id, "folder", size));
    }
  } catch { /* 文件夹不可用 = 空 */ }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function handleList(req, res) {
  try {
    const users = await listStorage();
    const builtins = await listBuiltins();
    const folder = await listFolder();
    sendJson(res, 200, { ok: true, users, builtins, folder });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String((error && error.message) || error) });
  }
}

async function handleAsset(req, res, rawName) {
  if (rawName === void 0) {
    res.writeHead(400);
    res.end();
    return;
  }
  const id = safeName(rawName);
  if (id === null) {
    res.writeHead(400);
    res.end();
    return;
  }
  const candidates = [join(storageDir(), id), join(ASSETS_DIR, id)];
  try {
    const cfg = await readConfig();
    const folder = (cfg.folder || "").trim();
    if (folder) candidates.push(join(folder, id));
  } catch { /* ignore */ }
  for (const filePath of candidates) {
    try {
      const st = await stat(filePath);
      if (!st.isFile() || st.size > MAX_BYTES) continue;
      const body = await readFile(filePath);
      const ext = id.split(".").pop().toLowerCase();
      res.writeHead(200, {
        "content-type": MIME[ext] || "application/octet-stream",
        "content-length": String(body.length),
        "cache-control": "no-cache"
      });
      res.end(body);
      return;
    } catch { /* try next */ }
  }
  res.writeHead(404);
  res.end();
}

async function handleImport(req, res, query) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  const id = safeName(query.get("name") || "");
  if (id === null) {
    sendJson(res, 400, { ok: false, error: "文件名不合法（支持图片/GIF/APNG/SVG/MP4/WebM）" });
    return;
  }
  try {
    const body = await readBodyBuffer(req, MAX_BYTES);
    if (body.length === 0) {
      sendJson(res, 400, { ok: false, error: "空文件" });
      return;
    }
    const dir = storageDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, id), body);
    sendJson(res, 200, { ok: true, wallpaper: entryFor(id, "user", body.length) });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
  }
}

async function handleDelete(req, res, query) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  const id = safeName(query.get("name") || "");
  if (id === null) {
    sendJson(res, 400, { ok: false, error: "文件名不合法" });
    return;
  }
  try {
    await unlink(join(storageDir(), id));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
  }
}

async function handleConfigGet(req, res) {
  try {
    const body = await readFile(configPath(), "utf8");
    let config = null;
    try {
      config = JSON.parse(body);
    } catch {
      config = null;
    }
    sendJson(res, 200, { ok: true, config });
  } catch (error) {
    if (error && error.code === "ENOENT") sendJson(res, 200, { ok: true, config: null });
    else sendJson(res, 500, { ok: false, error: String((error && error.message) || error) });
  }
}

async function handleConfigPost(req, res) {
  try {
    const raw = await readBodyBuffer(req, 2 * 1024 * 1024);
    const config = JSON.parse(raw.toString("utf8"));
    if (typeof config !== "object" || config === null || Array.isArray(config)) {
      throw new Error("config must be a JSON object");
    }
    await mkdir(storageDir(), { recursive: true });
    await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
  }
}

function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/plugins/mood-wallpaper",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://x");
      const rest = url.pathname.split("/").filter(Boolean).slice(2);
      const head = rest[0];
      if (head === "list") return handleList(req, res);
      if (head === "asset") return handleAsset(req, res, rest[1]);
      if (head === "import") return handleImport(req, res, url.searchParams);
      if (head === "delete") return handleDelete(req, res, url.searchParams);
      if (head === "config") {
        if (req.method === "GET" || req.method === "HEAD") return handleConfigGet(req, res);
        if (req.method === "POST") return handleConfigPost(req, res);
        res.writeHead(405);
        res.end();
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    }
  }), "dsh-mood-wallpaper: routes");
}

export { apply, inject, name };
