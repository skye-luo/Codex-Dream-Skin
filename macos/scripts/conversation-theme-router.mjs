import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultStateRoot = path.join(
  process.env.HOME ?? "",
  "Library",
  "Application Support",
  "CodexDreamSkinStudio",
);

const ROUTE_PATTERNS = [
  /^\/local\/([^/?#]+)\/?$/,
  /^\/remote\/([^/?#]+)\/?$/,
  /^\/hotkey-window\/thread\/([^/?#]+)\/?$/,
  /^\/thread\/([^/?#]+)\/?$/,
];

export const DEFAULT_MENTOR_THEME_ID = "mentor-lisa-life";
const MENTOR_THEME_IDS = {
  demis: "mentor-demis-ai",
  elon: "mentor-elon-build",
  duan: "mentor-duan-invest",
  lisa: DEFAULT_MENTOR_THEME_ID,
};

const MENTOR_KEYWORDS = {
  duan: [
    ["投资", 5], ["股票", 5], ["估值", 5], ["财报", 5], ["现金流", 5],
    ["价值投资", 6], ["长期主义", 5], ["资产", 4], ["商业模式", 4],
    ["invest", 5], ["stock", 5], ["valuation", 5], ["portfolio", 5],
  ],
  demis: [
    ["人工智能", 4], ["ai", 3], ["模型", 3], ["llm", 3], ["agent", 3],
    ["gpt", 2], ["算法", 4], ["研究", 4], ["探索", 4], ["论文", 4],
    ["评测", 3], ["deepmind", 5], ["science", 3], ["推理", 3],
  ],
  elon: [
    ["build", 5], ["实现", 4], ["开发", 4], ["编码", 4], ["代码", 4],
    ["修复", 4], ["部署", 4], ["安装", 4], ["创建", 4], ["制作", 4],
    ["设计", 4], ["产品", 3], ["项目", 3], ["网站", 4], ["app", 3],
    ["mvp", 4], ["创业", 5], ["事业", 5], ["hackathon", 4], ["自动化", 4],
  ],
  lisa: [
    ["生活", 5], ["健康", 5], ["关系", 4], ["家庭", 5], ["情绪", 5],
    ["休息", 4], ["习惯", 4], ["成长", 4], ["选择", 3], ["旅行", 4],
    ["职业", 3], ["女性", 4], ["adhd", 5], ["专注", 4], ["life", 5],
    ["health", 5], ["career", 3],
  ],
};

export function classifyMentorTheme(title, availableThemeIds = Object.values(MENTOR_THEME_IDS)) {
  const available = new Set(Array.isArray(availableThemeIds) ? availableThemeIds : []);
  const fallback = available.has(DEFAULT_MENTOR_THEME_ID)
    ? DEFAULT_MENTOR_THEME_ID
    : [...available][0] ?? null;
  const normalized = String(title ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized || /^(新建任务|新任务|未命名|new task|untitled)$/.test(normalized)) {
    return { themeId: fallback, matched: false, mentor: "lisa" };
  }

  const scores = Object.fromEntries(Object.keys(MENTOR_KEYWORDS).map((mentor) => [mentor, 0]));
  for (const [mentor, keywords] of Object.entries(MENTOR_KEYWORDS)) {
    for (const [keyword, weight] of keywords) {
      if (normalized.includes(keyword)) scores[mentor] += weight;
    }
    if (!available.has(MENTOR_THEME_IDS[mentor])) scores[mentor] = -1;
  }
  const priority = ["duan", "demis", "elon", "lisa"];
  const mentor = priority.reduce((best, candidate) => (
    scores[candidate] > scores[best] ? candidate : best
  ), priority[0]);
  if (scores[mentor] <= 0) return { themeId: fallback, matched: false, mentor: "lisa" };
  return { themeId: MENTOR_THEME_IDS[mentor], matched: true, mentor };
}

export function extractConversationId(value) {
  let url;
  try {
    url = new URL(value, "app://codex");
  } catch {
    return null;
  }
  for (const pattern of ROUTE_PATTERNS) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    try {
      const decoded = decodeURIComponent(match[1]);
      return decoded.length > 0 && decoded.length <= 240 ? decoded : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function chooseTheme(conversationId, themeIds, assignments = {}) {
  if (!conversationId || !Array.isArray(themeIds) || themeIds.length === 0) return null;
  const existing = assignments[conversationId];
  if (themeIds.includes(existing)) return existing;
  return themeIds[stableHash(conversationId) % themeIds.length];
}

export function selectConversationTarget(targets) {
  const candidates = (Array.isArray(targets) ? targets : [])
    .filter((target) => target?.type === "page" && typeof target.url === "string")
    .map((target) => ({ ...target, conversationId: extractConversationId(target.url) }))
    .filter((target) => target.conversationId);
  if (candidates.length !== 1) return null;
  return candidates[0];
}

export function selectMainShellTargets(targets) {
  return (Array.isArray(targets) ? targets : []).filter((target) => {
    if (target?.type !== "page" || typeof target.url !== "string") return false;
    try {
      const url = new URL(target.url);
      if (url.protocol !== "app:") return false;
      // Pet/avatar overlays are independent transparent pages. They must not
      // make the main new-task surface look like an ambiguous multi-window UI.
      return !url.searchParams.get("initialRoute");
    } catch {
      return false;
    }
  });
}

export function selectedDomConversationId(values) {
  if (!Array.isArray(values)) return null;
  const ids = [...new Set(values.filter((value) => (
    typeof value === "string" && value.length > 0 && value.length <= 240
  )))];
  return ids.length === 1 ? ids[0] : null;
}

export function selectedDomConversationContext(values) {
  if (!Array.isArray(values)) return null;
  const contexts = values.filter((value) => (
    value && typeof value === "object"
    && typeof value.conversationId === "string"
    && value.conversationId.length > 0
    && value.conversationId.length <= 240
  ));
  const ids = [...new Set(contexts.map((value) => value.conversationId))];
  if (ids.length !== 1) return null;
  const context = contexts.find((value) => value.conversationId === ids[0]);
  return {
    conversationId: ids[0],
    title: typeof context?.title === "string" ? context.title.slice(0, 500) : "",
  };
}

function validatedDebuggerUrl(target, port) {
  const value = new URL(target.webSocketDebuggerUrl);
  const expectedPath = `/devtools/page/${target.id}`;
  if (
    value.protocol !== "ws:"
    || value.hostname !== "127.0.0.1"
    || Number(value.port) !== port
    || value.pathname !== expectedPath
    || value.username
    || value.password
    || value.search
    || value.hash
  ) {
    throw new Error("Rejected a CDP WebSocket URL outside the loopback page target");
  }
  return value.href;
}

async function selectedConversationContextInPage(target, port) {
  if (!target?.id || !target?.webSocketDebuggerUrl) return null;
  const ws = new WebSocket(validatedDebuggerUrl(target, port));
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket open timed out")), 1500);
      ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP WebSocket open failed"));
      }, { once: true });
    });
    const response = await new Promise((resolve, reject) => {
      const id = 1;
      const timeout = setTimeout(() => reject(new Error("Conversation ID inspection timed out")), 1500);
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timeout);
        resolve(message);
      });
      ws.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            const root = document.documentElement;
            const capture = () => {
              const rows = Array.from(document.querySelectorAll(
                '[data-app-action-sidebar-thread-id]'
              ));
              const activeRows = rows.filter((element) => element.getAttribute(
                'data-app-action-sidebar-thread-active'
              ) === 'true');
              const active = [...new Set(activeRows
                .map((element) => element.getAttribute(
                  'data-app-action-sidebar-thread-id'
                ))
                .filter(Boolean))];
              if (active.length === 1) {
                root.dataset.dreamConversationId = active[0];
                root.dataset.dreamConversationTitle = activeRows[0]?.getAttribute(
                  'data-app-action-sidebar-thread-title'
                ) || '';
              } else if (rows.length > 0) {
                delete root.dataset.dreamConversationId;
                delete root.dataset.dreamConversationTitle;
              }
              return root.dataset.dreamConversationId
                ? [{
                    conversationId: root.dataset.dreamConversationId,
                    title: root.dataset.dreamConversationTitle || '',
                  }]
                : [];
            };
            if (!globalThis.__dreamConversationObserver) {
              globalThis.__dreamConversationObserver = new MutationObserver(capture);
              globalThis.__dreamConversationObserver.observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: [
                  'data-app-action-sidebar-thread-active',
                  'data-app-action-sidebar-thread-id',
                  'data-app-action-sidebar-thread-title',
                ],
              });
            }
            return capture();
          })()`,
          returnByValue: true,
        },
      }));
    });
    if (response.error || response.result?.exceptionDetails) return null;
    return selectedDomConversationContext(response.result?.result?.value);
  } finally {
    ws.close();
  }
}

async function activeConversationContext(targets, port) {
  const direct = selectConversationTarget(targets);
  if (direct) return { conversationId: direct.conversationId, title: "" };

  const pages = (Array.isArray(targets) ? targets : [])
    .filter((target) => target?.type === "page" && target?.url?.startsWith("app://"));
  const contexts = await Promise.all(
    pages.map((target) => selectedConversationContextInPage(target, port)),
  );
  return selectedDomConversationContext(contexts);
}

export function decideThemeAction({
  conversationId,
  conversationTitle = "",
  themeIds,
  assignments,
  manualOverrides = {},
  classificationLocks = {},
  liveThemeId,
  previousConversationId,
  routerAppliedThemeId,
}) {
  if (!conversationId) return { type: "none", reason: "no-conversation" };
  const classification = classifyMentorTheme(conversationTitle, themeIds);
  const existingThemeId = themeIds.includes(assignments[conversationId])
    ? assignments[conversationId]
    : null;
  const assignedThemeId = existingThemeId && (
    manualOverrides[conversationId]
    || classificationLocks[conversationId]
    || !classification.matched
  )
    ? existingThemeId
    : classification.themeId;
  if (!assignedThemeId) return { type: "none", reason: "no-themes" };

  if (!existingThemeId || existingThemeId !== assignedThemeId) {
    return {
      type: "assign-and-switch",
      conversationId,
      themeId: assignedThemeId,
      mentor: classification.mentor,
      matched: classification.matched,
    };
  }

  const stayedOnConversation = previousConversationId === conversationId;
  if (stayedOnConversation && routerAppliedThemeId && liveThemeId !== routerAppliedThemeId) {
    return { type: "none", reason: "waiting-router", conversationId, themeId: assignedThemeId };
  }
  const changedOutsideRouter = stayedOnConversation
    && liveThemeId
    && liveThemeId !== assignedThemeId
    && liveThemeId !== routerAppliedThemeId
    && themeIds.includes(liveThemeId);
  if (changedOutsideRouter) {
    return { type: "record-override", conversationId, themeId: liveThemeId };
  }

  if (liveThemeId !== assignedThemeId) {
    return { type: "switch", conversationId, themeId: assignedThemeId };
  }
  return { type: "none", reason: "already-active", conversationId, themeId: assignedThemeId };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function assertPlainDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a plain directory`);
}

export async function publishTheme(themeId, { libraryDir, themeDir }) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(themeId)) throw new Error("Invalid theme id");
  await assertPlainDirectory(libraryDir, "Theme library");
  const libraryReal = await fs.realpath(libraryDir);
  const sourceDir = path.join(libraryDir, themeId);
  await assertPlainDirectory(sourceDir, "Theme source");
  const sourceReal = await fs.realpath(sourceDir);
  if (!sourceReal.startsWith(`${libraryReal}${path.sep}`)) throw new Error("Theme source escaped library");

  const configPath = path.join(sourceDir, "theme.json");
  const configStat = await fs.lstat(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink()) throw new Error("Theme config must be a plain file");
  const theme = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (theme?.id !== themeId) throw new Error("Theme id does not match its directory");
  if (typeof theme.image !== "string" || path.basename(theme.image) !== theme.image) {
    throw new Error("Theme image must be a local filename");
  }
  const imagePath = path.join(sourceDir, theme.image);
  const imageStat = await fs.lstat(imagePath);
  if (!imageStat.isFile() || imageStat.isSymbolicLink()) throw new Error("Theme image must be a plain file");
  if (imageStat.size < 1 || imageStat.size > 16 * 1024 * 1024) throw new Error("Theme image size is invalid");
  const imageReal = await fs.realpath(imagePath);
  if (!imageReal.startsWith(`${sourceReal}${path.sep}`)) throw new Error("Theme image escaped its pack");

  try {
    await assertPlainDirectory(themeDir, "Active theme directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(themeDir, { recursive: true, mode: 0o700 });
  }
  const extension = path.extname(theme.image).toLowerCase();
  if (!/^\.(png|jpe?g|webp)$/.test(extension)) throw new Error("Unsupported theme image type");
  const imageName = `background-${themeId}${extension}`;
  const imageTemporary = path.join(themeDir, `.${imageName}.tmp-${process.pid}`);
  const configTemporary = path.join(themeDir, `.theme.json.tmp-${process.pid}`);
  const activeImage = path.join(themeDir, imageName);
  try {
    await fs.copyFile(imagePath, imageTemporary, constants.COPYFILE_EXCL);
    await fs.chmod(imageTemporary, 0o600);
    await fs.rename(imageTemporary, activeImage);
    const activeTheme = { ...theme, image: imageName };
    await fs.writeFile(configTemporary, `${JSON.stringify(activeTheme, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(configTemporary, path.join(themeDir, "theme.json"));
    for (const entry of await fs.readdir(themeDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === "theme.json" || entry.name === imageName) continue;
      await fs.unlink(path.join(themeDir, entry.name));
    }
  } finally {
    await fs.rm(imageTemporary, { force: true });
    await fs.rm(configTemporary, { force: true });
  }
  return activeThemeSummary(theme);
}

function activeThemeSummary(theme) {
  return { themeId: theme.id, themeName: theme.name || theme.id };
}

export function parseThemeIds(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !/^[A-Za-z0-9_-]{1,80}$/.test(id))) {
    throw new Error("Invalid --theme-ids list");
  }
  return [...new Set(ids)];
}

async function themeIdsIn(libraryDir, allowedThemeIds = null) {
  const entries = await fs.readdir(libraryDir, { withFileTypes: true });
  const allowed = Array.isArray(allowedThemeIds) ? new Set(allowedThemeIds) : null;
  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{1,80}$/.test(entry.name)) continue;
    if (allowed && !allowed.has(entry.name)) continue;
    try {
      const theme = JSON.parse(await fs.readFile(path.join(libraryDir, entry.name, "theme.json"), "utf8"));
      if (theme?.id === entry.name) ids.push(entry.name);
    } catch {}
  }
  return ids.sort();
}

async function liveThemeId(themeDir) {
  const theme = await readJson(path.join(themeDir, "theme.json"), null);
  return typeof theme?.id === "string" ? theme.id : null;
}

async function listTargets(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error("CDP target list was not an array");
    return value.filter((item) => item?.url?.startsWith("app://"));
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const options = {
    port: 9341,
    pollMs: 800,
    once: false,
    stateRoot: defaultStateRoot,
    themeIds: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--poll-ms") options.pollMs = Number(argv[++index]);
    else if (arg === "--state-root") options.stateRoot = path.resolve(argv[++index]);
    else if (arg === "--switch-script") index += 1; // Backward-compatible, no longer invoked.
    else if (arg === "--theme-ids") options.themeIds = parseThemeIds(argv[++index]);
    else if (arg === "--once") options.once = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error("Invalid --port");
  }
  if (!Number.isInteger(options.pollMs) || options.pollMs < 250 || options.pollMs > 10000) {
    throw new Error("Invalid --poll-ms");
  }
  options.libraryDir = path.join(options.stateRoot, "themes");
  options.themeDir = path.join(options.stateRoot, "theme");
  options.mappingFile = path.join(options.stateRoot, "conversation-themes.json");
  return options;
}

async function run(options) {
  let previousConversationId = null;
  let routerAppliedThemeId = null;
  let emptyConversationPasses = 0;
  const assignmentsDocument = await readJson(options.mappingFile, {
    schemaVersion: 1,
    assignments: {},
    manualOverrides: {},
    classificationLocks: {},
  });
  if (assignmentsDocument?.schemaVersion !== 1 || typeof assignmentsDocument.assignments !== "object") {
    throw new Error("Unsupported conversation theme mapping format");
  }
  if (!assignmentsDocument.manualOverrides || typeof assignmentsDocument.manualOverrides !== "object") {
    assignmentsDocument.manualOverrides = {};
  }
  if (!assignmentsDocument.classificationLocks || typeof assignmentsDocument.classificationLocks !== "object") {
    assignmentsDocument.classificationLocks = {};
  }

  while (true) {
    try {
      const [targets, themeIds, currentThemeId] = await Promise.all([
        listTargets(options.port),
        themeIdsIn(options.libraryDir, options.themeIds),
        liveThemeId(options.themeDir),
      ]);
      const context = await activeConversationContext(targets, options.port);
      const conversationId = context?.conversationId ?? null;
      let action;
      if (!conversationId && selectMainShellTargets(targets).length === 1) {
        emptyConversationPasses += 1;
        action = emptyConversationPasses >= 2 && currentThemeId !== DEFAULT_MENTOR_THEME_ID
          ? { type: "default-new-task", themeId: DEFAULT_MENTOR_THEME_ID }
          : { type: "none", reason: "new-task-debounce" };
      } else {
        emptyConversationPasses = 0;
        action = decideThemeAction({
          conversationId,
          conversationTitle: context?.title ?? "",
          themeIds,
          assignments: assignmentsDocument.assignments,
          manualOverrides: assignmentsDocument.manualOverrides,
          classificationLocks: assignmentsDocument.classificationLocks,
          liveThemeId: currentThemeId,
          previousConversationId,
          routerAppliedThemeId,
        });
      }

      if (action.type === "assign-and-switch" || action.type === "record-override") {
        assignmentsDocument.assignments[action.conversationId] = action.themeId;
        assignmentsDocument.manualOverrides[action.conversationId] = action.type === "record-override";
        assignmentsDocument.classificationLocks[action.conversationId] = action.type === "record-override"
          || action.matched === true;
        await writeJsonAtomic(options.mappingFile, assignmentsDocument);
      }
      if (
        action.type === "assign-and-switch"
        || action.type === "switch"
        || action.type === "default-new-task"
      ) {
        await publishTheme(action.themeId, options);
        routerAppliedThemeId = action.themeId;
      } else if (action.type === "record-override") {
        routerAppliedThemeId = null;
      }
      previousConversationId = conversationId;
      if (options.once) {
        process.stdout.write(`${JSON.stringify(action)}\n`);
        return;
      }
    } catch (error) {
      if (options.once) throw error;
      console.error(`[conversation-theme-router] ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
