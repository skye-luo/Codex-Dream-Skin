#!/usr/bin/env node

const CDP_URL = process.env.CODEX_CDP_URL || "http://127.0.0.1:9341";
const textIndex = process.argv.indexOf("--text");
const textQuery = textIndex >= 0 ? process.argv[textIndex + 1] : "";
const selectorIndex = process.argv.indexOf("--selector");
const selectorQuery = selectorIndex >= 0 ? process.argv[selectorIndex + 1] : "";
const clickIndex = process.argv.indexOf("--click-text");
const clickText = clickIndex >= 0 ? process.argv[clickIndex + 1] : "";
const clickSelectorIndex = process.argv.indexOf("--click-selector");
const clickSelector = clickSelectorIndex >= 0 ? process.argv[clickSelectorIndex + 1] : "";
const scrollTextIndex = process.argv.indexOf("--scroll-text");
const scrollText = scrollTextIndex >= 0 ? process.argv[scrollTextIndex + 1] : "";
const scrollSelectorIndex = process.argv.indexOf("--scroll-selector");
const scrollSelector = scrollSelectorIndex >= 0 ? process.argv[scrollSelectorIndex + 1] : "";

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
  const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10_000);
  const onMessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== id) return;
    ws.removeEventListener("message", onMessage);
    clearTimeout(timeout);
    if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
    else resolve(message.result);
  };
  ws.addEventListener("message", onMessage);
  ws.send(JSON.stringify({ id, method, params }));
});

if (clickText || clickSelector) {
  const clickResponse = await call("Runtime.evaluate", {
    expression: `(() => {
      const label = ${JSON.stringify(clickText)};
      const selector = ${JSON.stringify(clickSelector)};
      const controls = [
        ...document.querySelectorAll('aside.app-shell-left-panel button,aside.app-shell-left-panel a,aside.app-shell-left-panel [role="button"],aside.app-shell-left-panel [role="link"]'),
        ...document.querySelectorAll('button,a,[role="button"],[role="link"]'),
      ];
      const candidate = selector ? document.querySelector(selector) : controls.find((element) => {
        const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
        const rect = element.getBoundingClientRect();
        return text === label && rect.width > 0 && rect.height > 0;
      });
      if (!candidate) return null;
      const rect = candidate.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`,
    returnByValue: true,
  });
  const point = clickResponse.result.value;
  if (!point) throw new Error(`No visible control matched ${JSON.stringify(clickText || clickSelector)}.`);
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
}

if (scrollText || scrollSelector) {
  const scrollResponse = await call("Runtime.evaluate", {
    expression: `(() => {
      const label = ${JSON.stringify(scrollText)};
      const selector = ${JSON.stringify(scrollSelector)};
      const candidate = selector ? document.querySelector(selector) : [...document.querySelectorAll('body *')].find((element) => {
        const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
        return text === label && ![...element.children].some((child) =>
          (child.innerText || child.textContent || '').replace(/\\s+/g, ' ').trim() === label);
      });
      if (!candidate) return false;
      candidate.scrollIntoView({ block: 'center', inline: 'nearest' });
      return true;
    })()`,
    returnByValue: true,
  });
  if (!scrollResponse.result.value) throw new Error(`No element matched ${JSON.stringify(scrollText || scrollSelector)} for scrolling.`);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

const expression = `(() => {
  const query = ${JSON.stringify(textQuery)};
  const selector = ${JSON.stringify(selectorQuery)};
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
      && style.display !== 'none' && style.visibility !== 'hidden' && +style.opacity > 0;
  };
  const describe = (element) => ({
    tag: element.tagName.toLowerCase(),
    id: element.id,
    classes: [...element.classList],
    role: element.getAttribute('role'),
    styleAttribute: element.getAttribute('style'),
    data: Object.fromEntries([...element.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => [attribute.name, attribute.value])),
  });
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  const paintedColor = (value) => {
    if (!colorContext) return null;
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = 'rgba(1, 2, 3, 0.004)';
    colorContext.fillStyle = value;
    colorContext.fillRect(0, 0, 1, 1);
    return [...colorContext.getImageData(0, 0, 1, 1).data];
  };
  const styleOf = (element) => {
    const style = getComputedStyle(element);
    const pseudoStyle = (name) => {
      const pseudo = getComputedStyle(element, name);
      return {
        content: pseudo.content,
        backgroundColor: pseudo.backgroundColor,
        backgroundImage: pseudo.backgroundImage,
        opacity: pseudo.opacity,
        display: pseudo.display,
      };
    };
    const rect = element.getBoundingClientRect();
    return {
      ...describe(element),
      color: style.color,
      fill: style.webkitTextFillColor,
      backgroundColor: style.backgroundColor,
      paintedBackground: paintedColor(style.backgroundColor),
      backgroundImage: style.backgroundImage,
      opacity: style.opacity,
      transition: style.transition,
      animation: style.animation,
      animations: element.getAnimations?.().map((animation) => ({
        currentTime: animation.currentTime,
        playState: animation.playState,
        effect: animation.effect?.getTiming?.() || null,
      })) || [],
      isolation: style.isolation,
      mixBlendMode: style.mixBlendMode,
      pseudos: {
        before: pseudoStyle('::before'),
        after: pseudoStyle('::after'),
      },
      tokens: Object.fromEntries([
        '--ds-bg', '--ds-panel', '--ds-text', '--ds-muted',
        '--color-text', '--color-text-secondary', '--color-text-tertiary',
        '--color-surface', '--color-surface-elevated-secondary',
        '--color-background-primary', '--color-codex-description',
      ].map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value)),
      rect: [rect.x, rect.y, rect.width, rect.height].map((value) => +value.toFixed(1)),
    };
  };
  const nodes = [...document.querySelectorAll(selector || 'body *')].filter((element) => {
    if (!visible(element)) return false;
    const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    return selector ? true : query ? text.includes(query) : element.matches('[contenteditable="true"],textarea,input,.composer-surface-chrome');
  });
  const leaves = nodes.filter((element) => ![...element.children].some((child) => {
    const text = (child.innerText || child.textContent || '').replace(/\\s+/g, ' ').trim();
    return selector ? child.matches(selector) : query ? text.includes(query) : child.matches('[contenteditable="true"],textarea,input,.composer-surface-chrome');
  }));
  return {
    url: location.href,
    theme: getComputedStyle(document.documentElement).getPropertyValue('--dream-skin-name').trim(),
    state: {
      themeId: window.__CODEX_DREAM_SKIN_STATE__?.themeId || null,
      revision: window.__CODEX_DREAM_SKIN_STATE__?.revision || null,
      styleHasActivityBlueFix: Boolean(document.getElementById('codex-dream-skin-style')?.textContent.includes('#075a9e')),
      activityRuleSelectors: [...(document.getElementById('codex-dream-skin-style')?.sheet?.cssRules || [])]
        .filter((rule) => rule.selectorText?.includes('[role="tooltip"]'))
        .map((rule) => ({
          selector: rule.selectorText || null,
          matches: rule.selectorText
            ? [...document.querySelectorAll('[role="tooltip"]')].some((element) => element.matches(rule.selectorText))
            : false,
          cssText: rule.cssText,
        })),
      bodyRules: [...(document.getElementById('codex-dream-skin-style')?.sheet?.cssRules || [])]
        .filter((rule) => rule.selectorText?.includes('codex-dream-skin body'))
        .slice(0, 12)
        .map((rule) => ({
          selector: rule.selectorText,
          matches: document.body?.matches(rule.selectorText) || false,
          cssText: rule.cssText,
        })),
    },
    root: styleOf(document.documentElement),
    matches: leaves.slice(0, 12).map((element) => {
      const chain = [];
      for (let current = element; current && chain.length < 24; current = current.parentElement) chain.push(styleOf(current));
      return { text: (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300), chain };
    }),
  };
})()`;

const response = await call("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
});
if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
console.log(JSON.stringify(response.result.value, null, 2));
ws.close();
