#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const CDP_URL = process.env.CODEX_CDP_URL || "http://127.0.0.1:9341";
const outIndex = process.argv.indexOf("--out");
const outputRoot = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : "verification/live-ui-audit");
const failOnContrast = process.argv.includes("--fail-on-contrast");
const failOnSkip = process.argv.includes("--fail-on-skip");
const expectedThemeIndex = process.argv.indexOf("--expect-theme");
const expectedTheme = expectedThemeIndex >= 0 ? process.argv[expectedThemeIndex + 1] : "";
const scenariosIndex = process.argv.indexOf("--scenarios");
const requestedScenarios = new Set(
  scenariosIndex >= 0 ? process.argv[scenariosIndex + 1].split(",").filter(Boolean) : [],
);
const preserveCurrentState = process.argv.includes("--preserve-current-state");

const targets = await (await fetch(`${CDP_URL}/json/list`)).json();
const target = targets.find((entry) => entry.type === "page" && entry.url === "app://-/index.html");
if (!target) throw new Error(`No main Codex page target found at ${CDP_URL}.`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let callId = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++callId;
  const timeoutMs = ["Page.captureScreenshot", "Runtime.evaluate"].includes(method) ? 30_000 : 10_000;
  const cleanup = () => {
    ws.removeEventListener("message", onMessage);
    clearTimeout(timeout);
  };
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error(`CDP timeout after ${timeoutMs}ms: ${method}`));
  }, timeoutMs);
  const onMessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== id) return;
    cleanup();
    if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
    else resolve(message.result);
  };
  ws.addEventListener("message", onMessage);
  ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const response = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTheme(name, timeoutMs = 5000) {
  if (!name) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await evaluate(`(() => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--dream-skin-name').trim();
      return raw.replace(/^["']|["']$/g, '');
    })()`);
    if (current === name) return true;
    await pause(100);
  }
  return false;
}

async function waitForRendererSettled(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const settled = await evaluate(`(() => {
      const root = document.documentElement;
      const settings = [...document.querySelectorAll('input')].some((input) => {
        const placeholder = String(input.getAttribute('placeholder') || '').normalize('NFKC').toLowerCase();
        return placeholder.includes('搜索设置') || placeholder.includes('search settings');
      });
      if (settings) {
        return root.getAttribute('data-dream-surface') === 'native'
          && !root.classList.contains('codex-dream-skin');
      }
      const bodyStyle = document.body ? getComputedStyle(document.body) : null;
      const bodyChannels = bodyStyle?.backgroundColor.match(/[\\d.]+/g)?.slice(0, 3).map(Number) || [];
      const bodyBrightness = bodyChannels.length === 3
        ? (bodyChannels[0] + bodyChannels[1] + bodyChannels[2]) / 3
        : null;
      const shell = root.getAttribute('data-dream-shell');
      const palettePainted = shell === 'dark'
        ? bodyBrightness !== null && bodyBrightness < 110
        : shell === 'light' && bodyBrightness !== null && bodyBrightness > 145;
      const themeName = getComputedStyle(root).getPropertyValue('--dream-skin-name').trim();
      return root.getAttribute('data-dream-surface') === 'workspace'
        && root.classList.contains('codex-dream-skin')
        && root.getAttribute('data-dream-theme-transition') !== 'true'
        && document.getElementById('codex-dream-skin-style')
        && bodyStyle?.backgroundImage !== 'none'
        && root.getAttribute('data-dream-art-ready') === 'true'
        && themeName.length > 0
        && palettePainted;
    })()`);
    if (settled) return true;
    await pause(80);
  }
  return false;
}

async function escapeMenus() {
  for (let count = 0; count < 2; count += 1) {
    const hasPortal = await evaluate(`(() => [...document.querySelectorAll('[role="menu"],[role="dialog"],[role="listbox"]')]
      .some((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }))()`);
    if (!hasPortal) break;
    await call("Input.dispatchKeyEvent", {
      type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
    });
  }
  // Radix keeps a short close transition after Escape. Activating another
  // keyboard-driven trigger during that transition is ignored even though the
  // button can already receive focus.
  await pause(300);
}

async function clickTrigger(trigger) {
  if (trigger.key && trigger.selector) {
    await call("Page.bringToFront");
    const focused = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(trigger.selector)});
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      element.focus();
      return document.activeElement === element;
    })()`);
    if (!focused) return false;
    const key = trigger.key;
    const code = key === " " ? "Space" : key;
    const windowsVirtualKeyCode = key === " " ? 32 : 13;
    await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    await pause(350);
    return true;
  }
  const point = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll('button,[role="menuitem"],a')];
    const trigger = ${JSON.stringify(trigger)};
    const element = trigger.selector ? document.querySelector(trigger.selector) : candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) return false;
      if (trigger.aria) return candidate.getAttribute('aria-label') === trigger.aria;
      const text = (candidate.innerText || candidate.textContent || '').replace(/\\s+/g, ' ').trim();
      return trigger.text ? text === trigger.text : text.startsWith(trigger.textPrefix || '');
    });
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      alreadyOpen: element.getAttribute('aria-expanded') === 'true' && !!document.querySelector('[role="menu"],[role="dialog"],[role="listbox"]'),
    };
  })()`);
  if (!point) return false;
  if (point.alreadyOpen) return true;
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1,
  });
  await pause(350);
  return true;
}

async function waitForExpectation(expectation, timeoutMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matched = await evaluate(`(() => {
      const expectation = ${JSON.stringify(expectation)};
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
          && style.display !== 'none' && style.visibility !== 'hidden' && +style.opacity > 0;
      };
      const portals = [...document.querySelectorAll('[role="menu"],[role="dialog"],[role="listbox"],[role="tooltip"]')]
        .filter(visible);
      if (expectation.selector) {
        const element = document.querySelector(expectation.selector);
        if (!element || !visible(element)) return false;
      }
      if (expectation.role && !portals.some((element) => element.getAttribute('role') === expectation.role)) return false;
      if (expectation.text && !portals.some((element) => (element.innerText || '').includes(expectation.text))) return false;
      return true;
    })()`);
    if (matched) return true;
    await pause(80);
  }
  return false;
}

const auditExpression = String.raw`(() => {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const parseColor = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized === 'none' || !colorContext) return null;
    if (colorCache.has(normalized)) return colorCache.get(normalized);
    try {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = 'rgba(1, 2, 3, 0.004)';
      colorContext.fillStyle = normalized;
      colorContext.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
      const parsed = { r, g, b, a: alpha / 255 };
      colorCache.set(normalized, parsed);
      return parsed;
    } catch {
      colorCache.set(normalized, null);
      return null;
    }
  };
  const over = (front, back) => {
    const a = front.a + back.a * (1 - front.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
      g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
      b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
      a,
    };
  };
  const luminance = (color) => {
    const channel = (value) => {
      const n = value / 255;
      return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
    };
    return .2126 * channel(color.r) + .7152 * channel(color.g) + .0722 * channel(color.b);
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
  };
  const describe = (element) => {
    const classes = [...element.classList].filter((name) => !name.startsWith('group')).slice(0, 5);
    return element.tagName.toLowerCase()
      + (element.id ? '#' + element.id : '')
      + classes.map((name) => '.' + name).join('')
      + (element.getAttribute('role') ? '[role=' + element.getAttribute('role') + ']' : '');
  };
  const visible = (element, rect) => {
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.matches(':disabled,[aria-disabled="true"],[data-disabled]')) return false;
      if (node.classList.contains('sr-only') || style.clip === 'rect(0px, 0px, 0px, 0px)'
        || style.clipPath === 'inset(50%)') return false;
      if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) return false;
    }
    return true;
  };
  const entries = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    const element = node.parentElement;
    if (!text || !element || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!visible(element, rect)) continue;
    const style = getComputedStyle(element);
    const fill = parseColor(style.webkitTextFillColor);
    const color = fill || parseColor(style.color);
    if (!color) continue;
    let opacity = 1;
    const layers = [];
    let imageBacked = false;
    let portal = false;
    let surface = null;
    for (let current = element; current; current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      opacity *= Number.isFinite(+currentStyle.opacity) ? +currentStyle.opacity : 1;
      if (currentStyle.backgroundImage !== 'none') {
        imageBacked = true;
        // Computed gradients resolve CSS variables to concrete colors. Treat
        // the leading scrim color as the painted layer over background-color;
        // otherwise image-backed dark themes are incorrectly audited against
        // Codex's native white surface below the gradient.
        const colorToken = currentStyle.backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0];
        const imageColor = parseColor(colorToken);
        if (imageColor && imageColor.a > 0) {
          layers.push(imageColor);
          surface ||= describe(current);
        }
      }
      const background = parseColor(currentStyle.backgroundColor);
      if (background && background.a > 0) {
        layers.push(background);
        surface ||= describe(current);
      }
      if (['menu', 'dialog', 'alertdialog', 'listbox', 'tooltip'].includes(current.getAttribute('role'))) portal = true;
    }
    let background = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) background = over(layer, background);
    const painted = over({ ...color, a: color.a * opacity }, background);
    const ratio = contrast(painted, background);
    const fontSize = parseFloat(style.fontSize) || 16;
    const fontWeight = parseInt(style.fontWeight, 10) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const minimum = large ? 3 : 4.5;
    entries.push({
      text: text.slice(0, 100), selector: describe(element), surface,
      ratio: +ratio.toFixed(2), minimum, fail: ratio < minimum,
      foreground: style.webkitTextFillColor || style.color,
      background: 'rgb(' + [background.r, background.g, background.b].map((n) => Math.round(n)).join(', ') + ')',
      fontSize, fontWeight, opacity: +opacity.toFixed(3), portal, imageBacked,
      rect: [rect.x, rect.y, rect.width, rect.height].map((n) => +n.toFixed(1)),
    });
  }
  const deduped = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = [entry.text, entry.selector, entry.foreground, entry.background, entry.portal].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  const failures = deduped.filter((entry) => entry.fail).sort((a, b) => a.ratio - b.ratio);
  return {
    url: location.href,
    theme: getComputedStyle(document.documentElement).getPropertyValue('--dream-skin-name').trim().replace(/^["']|["']$/g, ''),
    visibleTextNodes: entries.length,
    uniqueTextStyles: deduped.length,
    failures,
    portalFailures: failures.filter((entry) => entry.portal),
  };
})()`;

const scenarioCatalog = [
  { id: "baseline", triggers: [] },
  {
    id: "new-chat",
    triggers: [{ text: "新对话" }],
    expect: { selector: '[data-codex-composer-root][data-composer-placement="home"]' },
  },
  {
    id: "profile-menu",
    triggers: [{ text: "Yitian Luo" }],
    expect: { role: "menu", text: "退出登录" },
  },
  {
    id: "settings-page",
    triggers: [
      { text: "Yitian Luo" },
      { textPrefix: "设置" },
    ],
    expect: { selector: 'input[placeholder*="搜索设置"]' },
  },
  {
    id: "quota-menu",
    triggers: [
      { text: "Yitian Luo" },
      { textPrefix: "使用情况" },
    ],
    expect: { role: "menu", text: "升级套餐，获取更多使用额度" },
  },
  { id: "help-menu", triggers: [{ aria: "打开帮助菜单" }], expect: { role: "menu", text: "键盘快捷键" } },
  { id: "chat-menu", triggers: [{ aria: "聊天操作" }], expect: { role: "menu", text: "重命名聊天" } },
  { id: "model-menu", triggers: [{ selector: "[data-codex-intelligence-trigger=\"true\"]" }], expect: { role: "menu" } },
  { id: "access-menu", triggers: [{ text: "完全访问" }], expect: { role: "menu", text: "完全访问权限" } },
  { id: "attachment-menu", triggers: [{ aria: "添加文件等内容" }], expect: { role: "menu" } },
];
const scenarios = requestedScenarios.size
  ? scenarioCatalog.filter((scenario) => requestedScenarios.has(scenario.id))
  : scenarioCatalog;
if (!scenarios.length) throw new Error("No requested live audit scenarios matched the scenario catalog.");

await fs.mkdir(outputRoot, { recursive: true });
if (!await waitForTheme(expectedTheme)) {
  throw new Error(`Expected live theme ${JSON.stringify(expectedTheme)} was not applied within 5 seconds.`);
}
// Theme variables appear before the renderer has finished the next paint and
// image-backed surface pass. Auditing in that gap reads native light colors
// even though the captured frame is already dark, producing update-startup
// false positives. Wait through two paint/debounce cycles before sampling.
await pause(650);
const results = [];
for (const [scenarioIndex, scenario] of scenarios.entries()) {
  if (!(preserveCurrentState && scenarioIndex === 0)) await escapeMenus();
  let opened = false;
  let skipReason = "";
  const attempts = scenario.triggers.length ? 2 : 1;
  for (let attempt = 0; attempt < attempts && !opened; attempt += 1) {
    if (attempt > 0) await escapeMenus();
    opened = true;
    for (const trigger of scenario.triggers) {
      if (!await clickTrigger(trigger)) {
        opened = false;
        skipReason = `trigger-not-visible: ${JSON.stringify(trigger)}`;
        break;
      }
    }
    if (opened && scenario.expect && !await waitForExpectation(scenario.expect)) {
      opened = false;
      skipReason = `expected-state-not-visible: ${JSON.stringify(scenario.expect)}`;
    }
  }
  if (!opened) {
    results.push({ id: scenario.id, status: "skipped", reason: skipReason });
    continue;
  }
  if (!await waitForRendererSettled()) {
    results.push({ id: scenario.id, status: "skipped", reason: "renderer-not-settled" });
    continue;
  }
  await pause(150);
  const audit = await evaluate(auditExpression);
  const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshot = path.join(outputRoot, `${scenario.id}.png`);
  await fs.writeFile(screenshot, Buffer.from(capture.data, "base64"));
  results.push({ id: scenario.id, status: "tested", screenshot, ...audit });
}
if (!preserveCurrentState) await escapeMenus();
ws.close();

const summary = {
  createdAt: new Date().toISOString(),
  targetId: target.id,
  tested: results.filter((entry) => entry.status === "tested").length,
  skipped: results.filter((entry) => entry.status === "skipped").length,
  totalFailures: results.reduce((sum, entry) => sum + (entry.failures?.length || 0), 0),
  portalFailures: results.reduce((sum, entry) => sum + (entry.portalFailures?.length || 0), 0),
  scenarios: results,
};
await fs.writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(summary, null, 2)}\n`);

const lines = [
  "# Codex Dream Skin live contrast audit",
  "",
  `- Tested states: ${summary.tested}`,
  `- Skipped states: ${summary.skipped}`,
  `- Low-contrast findings: ${summary.totalFailures}`,
  `- Low-contrast portal findings: ${summary.portalFailures}`,
  "",
];
for (const scenario of results) {
  if (scenario.status === "skipped") {
    lines.push(`## ${scenario.id}: skipped`, "", `Reason: ${scenario.reason}`, "");
    continue;
  }
  lines.push(`## ${scenario.id}`, "", `Screenshot: ${path.basename(scenario.screenshot)}`, "");
  const failures = scenario.failures || [];
  if (!failures.length) lines.push("No computed contrast failures.", "");
  for (const finding of failures.slice(0, 30)) {
    lines.push(`- ${finding.ratio}:1 (needs ${finding.minimum}:1) — ${JSON.stringify(finding.text)} — ${finding.selector}`);
  }
  if (failures.length > 30) lines.push(`- … ${failures.length - 30} more in report.json`);
  lines.push("");
}
await fs.writeFile(path.join(outputRoot, "report.md"), `${lines.join("\n")}\n`);

console.log(JSON.stringify({
  outputRoot,
  tested: summary.tested,
  skipped: summary.skipped,
  totalFailures: summary.totalFailures,
  portalFailures: summary.portalFailures,
}, null, 2));
if (failOnContrast && summary.totalFailures > 0) process.exitCode = 1;
if (failOnSkip && summary.skipped > 0) process.exitCode = 1;
