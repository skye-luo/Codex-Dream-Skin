import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { earlyPayloadFor, isAuxiliaryAppTargetUrl } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function createFixture({ auxiliary = false } = {}) {
  const observers = [];
  const timers = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false, settingsShell: false, settingsSidebar: false };
  const context = {
    window: { installs: [] },
    location: { href: auxiliary ? "app://-/index.html?initialRoute=%2Favatar-overlay" : "app://-/index.html" },
    document: {
      documentElement: { classList: { contains: (name) => auxiliary && name === "compact-window" } },
      querySelector(selector) {
        if (selector === 'main[data-app-shell-main-surface="default"], main.main-surface') {
          return markers.shell ? {} : null;
        }
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        if (selector === 'div.zoom-adjusted-viewport:has(> div.app-shell-left-panel) > div.relative.isolate.flex-1') {
          return markers.settingsShell ? {} : null;
        }
        if (selector === "div.app-shell-left-panel") return markers.settingsSidebar ? {} : null;
        return null;
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.connected = true;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  return { context, markers, observers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");

const settingsRoute = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("settings")', "settings"), settingsRoute.context);
settingsRoute.markers.settingsShell = true;
settingsRoute.markers.settingsSidebar = true;
settingsRoute.observers[0].callback([]);
assert.deepEqual(
  settingsRoute.context.window.installs,
  ["settings"],
  "The current classless settings route must still accept the skin payload.",
);

const avatarOverlay = createFixture({ auxiliary: true });
avatarOverlay.markers.shell = true;
avatarOverlay.markers.sidebar = true;
vm.runInNewContext(earlyPayloadFor('window.installs.push("avatar")', "avatar"), avatarOverlay.context);
assert.deepEqual(avatarOverlay.context.window.installs, [], "The Codex Pet overlay must never receive the skin payload.");
assert.equal(isAuxiliaryAppTargetUrl("app://-/index.html?initialRoute=%2Favatar-overlay"), true);
assert.equal(isAuxiliaryAppTargetUrl("app://-/index.html"), false);

const generations = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.markers.shell = true;
generations.markers.sidebar = true;
for (const observer of generations.observers) observer.callback([]);
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

const commonSource = await fs.readFile(path.resolve(here, "../scripts/common-macos.sh"), "utf8");
const startSource = await fs.readFile(path.resolve(here, "../scripts/start-dream-skin-macos.sh"), "utf8");
const autostartSource = await fs.readFile(path.resolve(here, "../scripts/autostart-dream-skin-macos.sh"), "utf8");
const verifySource = await fs.readFile(path.resolve(here, "../scripts/verify-dream-skin-macos.sh"), "utf8");
assert.match(
  startSource,
  /live-contrast-audit\.mjs[\s\S]*--scenarios baseline[\s\S]*--fail-on-contrast[\s\S]*stop_conversation_router[\s\S]*--remove[\s\S]*mark_state_incompatible/,
  "Startup must fail closed to the native renderer when its live compatibility audit fails.",
);
assert.match(
  commonSource,
  /mark_state_incompatible\(\)[\s\S]*state\.session = "incompatible";[\s\S]*state\.injectorPid = 0;/,
  "A failed app-version compatibility check must persist a non-retrying state.",
);
assert.match(
  autostartSource,
  /session" != "incompatible"[\s\S]*stopped\|paused\|incompatible/,
  "Autostart must not loop on an app version that failed live validation.",
);
assert.match(
  verifySource,
  /live-contrast-audit\.mjs[\s\S]*--preserve-current-state[\s\S]*--fail-on-contrast/,
  "Manual verification must include the visible renderer, not only injection markers.",
);

const discoveryStart = source.indexOf("record.earlyScriptId = await registerEarly");
const probeStart = source.indexOf("const probe = await waitForCodexProbe", discoveryStart);
assert.ok(discoveryStart >= 0 && probeStart > discoveryStart, "Early registration must happen before full shell probing.");
assert.match(
  source,
  /finally\s*\{[\s\S]*Promise\.all\(\[\.\.\.sessions\.values\(\)\][\s\S]*removeEarly\(record\)/,
  "Watcher shutdown must unregister persistent Page scripts before closing CDP sessions.",
);
assert.match(
  source,
  /const earlyApplied = await session\.evaluate\([\s\S]*if \(!earlyApplied\) \{[\s\S]*applyToSession/,
  "The watcher must not run the full payload twice after a successful early install.",
);

console.log("PASS: early injection is shell-guarded, generation-safe, and removed on shutdown.");
