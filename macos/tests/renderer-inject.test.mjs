import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(macosRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(macosRoot, "assets", "dream-skin.css"), "utf8");

assert.doesNotMatch(
  css,
  /main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\)\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.doesNotMatch(
  css,
  /main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\):not\(\.dream-skin-home-shell\)\s*>\s*\*\s*\{[^}]*\bposition\s*:/,
  "Task-route child layering must not overwrite the native header position.",
);
assert.doesNotMatch(
  css,
  /\.dream-skin-home\s*>\s*div:first-child/,
  "Home layout must not assume the first child is content because newer builds prepend a home-banners wrapper.",
);
assert.match(
  css,
  /\.dream-skin-home\s*>\s*div:has\(\.group\\\/home-suggestions\)\s*\{[\s\S]{0,120}min-height:\s*100% !important;/,
  "Home layout must anchor to the stable suggestion-bearing content container across old and new DOM structures.",
);
assert.match(
  css,
  /html\.codex-dream-skin\s+:is\([\s\S]{0,500}text-token-conversation-summary[\s\S]{0,220}color:\s*rgb\(var\(--ds-text-rgb\) \/ \.80\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Secondary task and portal text must use an explicit readable color without stacked native opacity.",
);
assert.match(
  css,
  /data-app-action-sidebar-thread-active="true"\]\s*\*[\s\S]{0,120}color:\s*var\(--ds-text\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "The selected sidebar task must remain readable after a mentor theme switch.",
);
assert.match(
  css,
  /--thread-resource-card-row-padding-x[\s\S]{0,500}bg-token-bg-primary[\s\S]{0,500}bg-token-input-background[\s\S]{0,500}bg-token-bg-fog[\s\S]{0,500}bg-token-editor-background[\s\S]{0,500}background-color:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.94\) !important;/,
  "Progress pills, portal approvals, menus, file cards, and turn diffs must not retain a translucent light native surface.",
);
assert.match(
  css,
  /html\.codex-dream-skin\s+\[data-codex-approval-surface\][\s\S]{0,240}background:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.98\) !important;[\s\S]{0,240}box-shadow:\s*0 18px 50px/,
  "Short-window file-edit approvals must be themed by their stable document-level surface marker.",
);
assert.match(
  css,
  /main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\)\s+aside[\s\S]{0,100}\[style\*="background-color: var\(--color-background-panel"\][\s\S]{0,180}background-color:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.98\) !important;[\s\S]{0,120}color:\s*var\(--ds-text\) !important;/,
  "Scheduled-task setting cards must not retain native white panels under themed light foregrounds.",
);
assert.match(
  css,
  /main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\)[\s\S]{0,100}aside:has\(file-tree-container\)\s*\{[\s\S]{0,220}color-scheme:\s*light !important;[\s\S]{0,220}background:\s*var\(--color-token-main-surface-primary\) !important;/,
  "The file editor workspace must retain its native paired light surface and syntax foregrounds.",
);
assert.match(
  css,
  /aside:has\(file-tree-container\)\s+:is\([\s\S]{0,260}\.cm-editor,[\s\S]{0,180}file-tree-container[\s\S]{0,180}background-color:\s*var\(--color-token-main-surface-primary\) !important;/,
  "Markdown, source diffs, and the file tree must share one readable light workspace surface.",
);
assert.match(
  css,
  /aside:has\(file-tree-container\)\s+:is\([\s\S]{0,220}text-token-button-tertiary-foreground[\s\S]{0,180}color:\s*var\(--color-token-foreground\) !important;/,
  "Editor toolbar buttons must restore native dark foregrounds on the light workspace.",
);
assert.match(
  css,
  /aside:has\(file-tree-container\)\s+::selection\s*\{[\s\S]{0,160}background:\s*#99c5f6 !important;[\s\S]{0,120}-webkit-text-fill-color:\s*#101820 !important;/,
  "Selected editor text must remain readable after the workspace surface is restored.",
);
assert.match(
  css,
  /\[data-tab-id\]:has\(> \[role="tab"\]\[aria-selected="true"\]\)[\s\S]{0,180}> \[role="tab"\]\[aria-selected="true"\][\s\S]{0,360}\[data-app-shell-tab-close-button="true"\][\s\S]{0,180}color:\s*var\(--color-token-foreground\) !important;[\s\S]{0,100}-webkit-text-fill-color:\s*currentColor !important;/,
  "Selected spreadsheet and artifact tabs must pair their native light pill with dark filename and close-button ink.",
);
assert.match(
  css,
  /:is\(\.app-shell-main-content-top-fade, \[class\*="_MainContentTopFade_"\]\)\s*\{[\s\S]{0,120}display:\s*none !important;[\s\S]{0,100}background:\s*transparent !important;/,
  "Both legacy and current main-content fade nodes must not paint a white strip over dark mentor art.",
);
assert.match(
  css,
  /html\.codex-dream-skin\s+\[class\*="!text-token-input-placeholder-foreground"\][\s\S]{0,180}-webkit-text-fill-color:\s*rgb\(var\(--ds-text-rgb\) \/ \.78\) !important;/,
  "The important placeholder utility must override its final glyph fill without cascading through semantic diff descendants.",
);
assert.match(
  css,
  /data-radix-menu-content[\s\S]{0,120}\[role="menuitem"\]\[class\*="!text-token-foreground"\][\s\S]{0,180}-webkit-text-fill-color:\s*var\(--ds-text\) !important;/,
  "Important foreground utilities inside nested account menus must not paint dark ink on dark themed portals.",
);
assert.match(
  css,
  /\[role="tooltip"\]\s*\{[\s\S]{0,180}background:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.98\) !important;[\s\S]{0,180}-webkit-text-fill-color:\s*var\(--ds-text\) !important;/,
  "Attention and ordinary tooltips must share one paired, readable theme surface.",
);
assert.match(
  css,
  /\[role="tooltip"\]\[class\*="!bg-token-text-link-foreground"\][\s\S]{0,180}--color-token-text-link-foreground:\s*#075a9e;[\s\S]{0,120}background:\s*#075a9e !important;[\s\S]{0,180}-webkit-text-fill-color:\s*#fff !important;/,
  "The important blue activity callout must use an AA-safe blue with white ink.",
);
assert.match(
  css,
  /data-radix-menu-content[\s\S]{0,120}text-token-editor-warning-foreground[\s\S]{0,160}-webkit-text-fill-color:\s*#f59a63 !important;/,
  "Full-access warnings must retain semantic orange at AA contrast on dark menus.",
);
assert.match(
  css,
  /button\[aria-label\^="切换模式"\][\s\S]{0,220}color:\s*rgb\(var\(--ds-text-rgb\) \/ \.92\) !important;/,
  "The Codex mode label must remain readable even when a mentor accent is too dark for body-sized text.",
);
assert.match(
  css,
  /button\[class~="bg-token-foreground"\][\s\S]{0,180}background:\s*color-mix\(in srgb, var\(--ds-accent\) 58%, var\(--ds-text\) 42%\) !important;/,
  "Primary action fills must be light enough for their dark on-accent label across all mentor palettes.",
);
assert.match(
  css,
  /text-token-git-decoration-deleted-resource-foreground[\s\S]{0,160}-webkit-text-fill-color:\s*#ff7b72 !important;/,
  "Deletion counters must retain semantic red at AA contrast on dark mentor cards.",
);
assert.match(
  css,
  /\[role="menu"\]:not\(\[class\*="bg-surface-elevated-secondary"\]\)\s+\[class\*="_ViewToggleContent_"\][\s\S]{0,160}-webkit-text-fill-color:\s*var\(--ds-text\) !important;/,
  "Legacy dark model menus need skin ink; native elevated menus must retain their semantic label colors.",
);
assert.match(
  css,
  /loading-shimmer-pure-text[\s\S]{0,180}cadencedShimmerSweep[\s\S]{0,180}-webkit-text-fill-color:\s*rgb\(var\(--ds-text-rgb\) \/ \.58\) !important;[\s\S]{0,260}cadencedShimmerHighlight[\s\S]{0,180}-webkit-text-fill-color:\s*rgb\(var\(--ds-text-rgb\) \/ \.88\) !important;/,
  "Both phases of running activity shimmer text must remain readable on the immersive task background.",
);
assert.match(
  css,
  /group\/activity-header[\s\S]{0,180}span:not\(\.loading-shimmer-pure-text\):not\(\[class\*="cadencedShimmer"\]\)[\s\S]{0,180}-webkit-text-fill-color:\s*rgb\(var\(--ds-text-rgb\) \/ \.76\) !important;/,
  "Completed activity summaries must override the generated light-shell descendant ink.",
);
assert.match(
  css,
  /data-markdown-text-style="assistant-message"[\s\S]{0,420}:is\([\s\S]{0,220}\bp, li,[\s\S]{0,260}-webkit-text-fill-color:\s*var\(--ds-text\) !important;/,
  "Generated assistant Markdown blocks must not retain native light-shell ink on dark mentor art.",
);
assert.match(
  css,
  /data-user-message-bubble="true"[\s\S]{0,420}:is\([\s\S]{0,220}\bp, li,[\s\S]{0,260}-webkit-text-fill-color:\s*var\(--ds-text\) !important;/,
  "Generated user Markdown blocks must not retain native dark ink on dark mentor art.",
);
assert.match(
  template,
  /data-codex-composer-root[\s\S]{0,120}data-composer-surface-variant[\s\S]{0,520}composer-surface-chrome[\s\S]{0,240}dreamSkinComposerSurface/,
  "The current stable composer surface must receive the semantic skin class instead of relying on a CSS-module hash.",
);
assert.match(
  template,
  /initialRoute=[\s\S]{0,100}avatar-overlay[\s\S]{0,180}compact-window[\s\S]{0,700}skipped:\s*"auxiliary-surface"/,
  "The renderer must refuse to theme the compact Codex Pet overlay.",
);
assert.match(
  template,
  /isNativeSystemSurface[\s\S]{0,260}搜索设置[\s\S]{0,80}search settings/,
  "Settings must be detected as a native system surface and excluded from the mentor skin.",
);
assert.match(
  template,
  /if \(isNativeSystemSurface\(\)\)[\s\S]{0,160}suspendForNativeSystemSurface\(root\)/,
  "Every route pass must suspend the skin when the native settings surface is visible.",
);
assert.match(
  template,
  /suspendForNativeSystemSurface[\s\S]{0,420}classList\.remove\("codex-dream-skin"\)[\s\S]{0,260}data-dream-surface[\s\S]{0,80}"native"/,
  "Settings suspension must remove the skin class while retaining the observer needed to restore task pages.",
);
assert.match(
  template,
  /getAttribute\("data-dream-surface"\) === "native"\) rootPass = true;/,
  "Returning from Settings must force a complete root re-application.",
);
assert.match(
  css,
  /data-dream-surface="native"[\s\S]{0,180}\.text-tertiary[\s\S]{0,260}color:\s*#5f6368 !important;[\s\S]{0,160}opacity:\s*1 !important;/,
  "Native light settings pages must keep their own surfaces while faint utility labels remain readable.",
);
const injectorSource = await fs.readFile(path.join(macosRoot, "scripts", "injector.mjs"), "utf8");
assert.ok(
  template.includes(`const SHELL_MAIN_SELECTOR = 'main[data-app-shell-main-surface="default"], main.main-surface';`) &&
    template.includes("const selectShellMain = () => document.querySelector(SHELL_MAIN_SELECTOR)"),
  "The renderer must support both the current stable main-surface attribute and the legacy class name.",
);
assert.match(
  injectorSource,
  /SHELL_MAIN_SELECTOR\s*=\s*'main\[data-app-shell-main-surface="default"\], main\.main-surface'/,
  "CDP discovery and verification must recognize the current Codex main-surface contract.",
);
assert.match(
  injectorSource,
  /const operationToken = options\.mode === "once" \|\| options\.mode === "remove"[\s\S]{0,100}\? options\.operationToken[\s\S]{0,40}: null;/,
  "Silent automatic theme routing must not invent an operation token or show a progress popup.",
);
assert.ok(
  injectorSource.includes("const homeTitle = home?.querySelector(") &&
    injectorSource.includes("const homeFrame = box(home);") &&
    injectorSource.includes("const hero = box(heroAnchor);"),
  "Restart verification must locate the home hero from stable title/card signals instead of brittle first-child depth.",
);
assert.match(
  injectorSource,
  /result\.homeFrame\?\.visible[\s\S]{0,360}result\.visibleCardCount > 0/,
  "Restart verification must accept a correctly sized home frame with either a title hero or visible suggestion cards.",
);
assert.match(
  css,
  /data-dream-theme-transition="true"[\s\S]{0,900}dream-skin-theme-reveal/,
  "Mentor changes should use the short non-interactive reveal transition.",
);
assert.match(
  css,
  /prefers-reduced-motion:\s*reduce[\s\S]{0,600}data-dream-theme-transition="true"/,
  "The mentor transition must be disabled when reduced motion is requested.",
);

assert.doesNotMatch(
  css,
  /background-image:\s*var\(--dream-skin-art\),\s*var\(--dream-skin-art\)/,
  "The home hero must not stack duplicate copies of the selected image.",
);
assert.match(
  css,
  /data-dream-art-safe="left"[\s\S]{0,140}--ds-art-position:\s*100% var\(--ds-focus-y\);/,
  "A left text-safe image must preserve its right-side subject on narrower windows.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*auto 100% !important;/,
  "Wide home artwork must not leave an unpainted half-card by fitting only to height.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*100% 100%,\s*100% 100%,\s*100% auto;/,
  "Wide task artwork must cover the full route instead of ending above the composer.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,500}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide ambient task artwork should cover the full application window.",
);
assert.match(
  css,
  /data-dream-task-mode="banner"[\s\S]{0,900}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide banner task artwork should use the same full-window wallpaper contract as ambient routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\)\.dream-skin-home-shell\)[\s\S]{0,100}body\s*\{[\s\S]{0,300}background-image:\s*var\(--dream-skin-art\) !important;/,
  "Wide home artwork should use the same full-window image as utility routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\)\.dream-skin-home-shell\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide home artwork must honor the configured focal point instead of forcing a centered crop.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,260}data-dream-art-wide="true"\]:has\(main:is\(\.main-surface, \[data-app-shell-main-surface="default"\]\):not\(\.dream-skin-home-shell\)\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide task artwork must retain the same focal point as the home route.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]\s+\.composer-surface-chrome\s*\{[\s\S]{0,500}backdrop-filter:\s*none !important;/,
  "Wide artwork should use one uniform composer surface without a split blur layer.",
);
assert.match(
  css,
  /--ds-immersive-composer-solid:\s*rgb\(var\(--ds-panel-rgb\) \/ \.74\);/,
  "The light composer should retain enough transparency to reveal the selected artwork.",
);
assert.match(
  css,
  /data-dream-shell="light"\]\[data-dream-art-wide="true"\][\s\S]{0,100}\.composer-surface-chrome\s*\{[\s\S]{0,400}backdrop-filter:\s*blur\(8px\) saturate\(102%\) !important;/,
  "The translucent light composer should softly separate text from detailed artwork.",
);
assert.match(
  template,
  /data-composer-home-utility-bar-position[\s\S]{0,260}data-composer-placement="home"[\s\S]{0,500}dream-skin-home-utility/,
  "The renderer should recognize the stable native home utility-bar attributes.",
);
assert.match(
  css,
  /data-composer-surface-variant\][\s\S]{0,260}> \[data-composer-layout\][\s\S]{0,220}background:\s*transparent !important;/,
  "The native light composer body must not cover the themed new-chat surface.",
);
assert.match(
  css,
  /data-composer-home-utility-bar-position[\s\S]{0,220}data-composer-placement="home"[\s\S]{0,420}background:\s*var\(--ds-immersive-composer-solid\) !important;/,
  "The new-chat utility bar must use the same readable immersive surface as the composer.",
);
assert.match(
  css,
  /aside\.app-shell-left-panel button\.bg-token-charts-blue[\s\S]{0,180}background:\s*#0b5f9f !important;[\s\S]{0,120}-webkit-text-fill-color:\s*#fff !important;/,
  "The compact sidebar update badge must use a dark enough blue for white text.",
);
assert.match(
  css,
  /data-testid="app-shell-header-context-menu-surface"[\s\S]{0,260}bg-primary-soft-alpha[\s\S]{0,180}color:\s*#1a1c1f !important;/,
  "The 26.810 light titlebar action buttons must retain dark readable ink.",
);
assert.match(
  css,
  /data-above-composer-portal="true"[\s\S]{0,220}bg-background-primary-soft[\s\S]{0,420}background:\s*rgb\(var\(--ds-panel-2-rgb\) \/ \.98\) !important;/,
  "The stable above-composer change summary must use a paired dark surface.",
);
assert.match(
  css,
  /data-above-composer-portal="true"[\s\S]{0,180}\.text-codex-git-added[\s\S]{0,120}#4ade80 !important;/,
  "The 26.810 added counter must remain semantic and readable on the themed summary pill.",
);
assert.match(
  css,
  /data-radix-menu-content\]\[class\*="bg-surface-elevated-secondary"\][\s\S]{0,220}--color-codex-description:\s*#5f6368;[\s\S]{0,500}\.text-warning[\s\S]{0,120}#a33600 !important;/,
  "The 26.810 native light menus must use AA-safe secondary and warning colors.",
);
assert.match(
  css,
  /data-browser-sidebar-webview-host-root[\s\S]{0,180}@container\/diff-header[\s\S]{0,180}#3f4348 !important;[\s\S]{0,500}text-codex-git-added[\s\S]{0,100}#087a2f !important;[\s\S]{0,400}text-codex-git-deleted[\s\S]{0,100}#b42318 !important;/,
  "The native-light review pane header must not inherit dark-theme diff colors.",
);
assert.match(
  css,
  /data-thread-find-target="conversation"\] \.text-tertiary[\s\S]{0,140}-webkit-text-fill-color:\s*rgb\(var\(--ds-text-rgb\) \/ \.76\) !important;/,
  "The 26.810 message timestamp must not inherit native light-shell tertiary ink.",
);
assert.match(
  css,
  /data-codex-composer-root\][\s\S]{0,120}bg-background-primary-soft\/70[\s\S]{0,140}-webkit-text-fill-color:\s*#3f4348 !important;/,
  "Attachment actions on the native light composer row must retain dark readable ink.",
);
assert.match(
  css,
  /aside\.app-shell-left-panel\s*\{[\s\S]{0,420}--color-text:\s*var\(--ds-text\);[\s\S]{0,260}--color-codex-description:/,
  "The 26.810 sidebar semantic text palette must be rebound at its stable boundary.",
);
assert.match(
  css,
  /--thread-resource-card-row-padding-x[\s\S]{0,500}--color-surface-elevated-secondary:[\s\S]{0,500}\.text-codex-description[\s\S]{0,180}-webkit-text-fill-color:/,
  "The 26.810 resource card must pair its semantic foreground and surface palette.",
);
assert.match(
  css,
  /text-token-git-decoration-deleted-resource-foreground[\s\S]{0,120}\.text-codex-git-deleted[\s\S]{0,180}#ff7b72 !important;/,
  "Both legacy and 26.810 deletion counters must retain AA-safe semantic red.",
);
assert.match(
  css,
  /\.dream-skin-home:has\(\.dream-skin-home-utility\)[\s\S]{0,120}\.composer-surface-chrome\s*\{[\s\S]{0,180}border-radius:\s*22px !important;/,
  "The new-chat composer must retain all four rounded corners below the utility bar.",
);
assert.match(
  css,
  /\.group\\\/home-suggestions button > span:first-child > span:first-child\s*\{[\s\S]{0,180}place-items:\s*center !important;[\s\S]{0,100}justify-content:\s*center !important;[\s\S]{0,100}align-items:\s*center !important;/,
  "Suggestion icons must remain centered when Codex adds a native justify-start utility.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\)[\s\S]{0,100}color:\s*var\(--ds-muted\) !important;/,
  "Composer controls must remain readable when Codex native tokens lag behind a forced dark appearance.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\) \*\s*\{[\s\S]{0,80}color:\s*currentColor !important;/,
  "Nested labels inside composer controls must inherit the corrected theme color.",
);
assert.match(
  css,
  /\.composer-surface-chrome p\.placeholder::after\s*\{[\s\S]{0,120}color:\s*rgb\(var\(--ds-muted-rgb\) \/ \.82\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Composer placeholder text must not inherit a stale native color with double opacity.",
);
assert.match(
  css,
  /header\.app-header-tint\s*\{[\s\S]{0,180}background:\s*transparent !important;/,
  "Wide artwork should not paint a separate opaque header band.",
);
assert.match(
  css,
  /\.thread-scroll-container \.bg-gradient-to-t:is\(\.from-token-main-surface-primary, \.from-surface\)\s*\{[\s\S]{0,100}background:\s*transparent !important;/,
  "Wide artwork should remove both legacy and 26.810 native fades behind the sticky composer.",
);
assert.match(
  css,
  /div\.sticky:has\(input\[type="text"\]\)[\s\S]{0,100}background:\s*transparent !important;/,
  "Search routes should not retain the native opaque sticky band.",
);
assert.match(
  css,
  /\[class~="bg-token-main-surface-primary"\]\[class~="h-full"\]\[class~="w-full"\][\s\S]{0,100}background:\s*transparent !important;/,
  "Full-size utility route wrappers should not hide the selected artwork.",
);

function createStyleDeclaration() {
  const values = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) ?? ""; },
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...names) { for (const name of names) values.add(name); },
    remove(...names) { for (const name of names) values.delete(name); },
    contains(name) { return values.has(name); },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
  };
}

function createFixture(theme, {
  nativeShell = "light",
  analysisFixture = null,
  analysisCache = null,
} = {}) {
  let fixtureShell = nativeShell;
  const nodes = new Map();
  const attributes = new Map();
  const bodyAttributes = new Map();
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  let nextTimer = 1;
  let nextBlob = 1;
  const rootStyle = createStyleDeclaration();
  const root = {
    className: nativeShell === "dark" ? "electron-dark" : "electron-light",
    classList: createClassList(),
    style: rootStyle,
    appendChild(node) {
      node.parentElement = root;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return bodyAttributes.get(name) ?? null; },
    setAttribute(name, value) { bodyAttributes.set(name, String(value)); },
  };
  const shellBox = { left: 280, top: 36, width: 1000, height: 764 };
  const shellMain = {
    classList: createClassList(),
    getBoundingClientRect() {
      return { ...shellBox };
    },
  };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    const childNodes = new Map();
    const element = {
      id: "",
      dataset: {},
      style: createStyleDeclaration(),
      classList: createClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      setAttribute() {},
      querySelector(selector) {
        if (!childNodes.has(selector)) childNodes.set(selector, { textContent: "" });
        return childNodes.get(selector);
      },
      remove() { if (element.id) nodes.delete(element.id); },
    };
    return element;
  };

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === 'main[data-app-shell-main-surface="default"], main.main-surface') return shellMain;
      return null;
    },
    querySelectorAll() { return []; },
  };
  const mediaQuery = {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const revokedUrls = [];
  const window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      mediaQuery.matches = fixtureShell === "dark";
      return mediaQuery;
    },
  };
  if (analysisCache) window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__ = analysisCache;
  if (analysisFixture) {
    window.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }
  const context = {
    window,
    document,
    location: { href: "app://-/index.html" },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.observations = [];
        observers.push(this);
      }
      observe(target, options) { this.observations.push({ target, options }); }
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        resizeObservers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    URL: {
      createObjectURL() { return `blob:fixture-${nextBlob++}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    getComputedStyle() {
      const skinShell = root.classList.contains("codex-dream-skin")
        ? (attributes.get("data-dream-shell") || "dark") : fixtureShell;
      return {
        colorScheme: skinShell,
        backgroundColor: fixtureShell === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)",
      };
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    cancelAnimationFrame() {},
  };
  const payloadFor = (nextTheme, cssText = ".fixture { color: blue; }") => template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(cssText))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(nextTheme))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(cssText))
    .replace(
      "__DREAM_SKIN_PAYLOAD_REVISION_JSON__",
      JSON.stringify(`${nextTheme.id}:${cssText}`),
    );
  const flushTimers = (maximumDelay = Infinity) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay <= maximumDelay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };

  return {
    attributes,
    body,
    bodyAttributes,
    context,
    flushTimers,
    nodes,
    observers,
    payload: payloadFor(theme),
    payloadFor,
    revokedUrls,
    resizeObservers,
    root,
    rootStyle,
    shellBox,
    timers,
    window,
    setNativeShell(value) { fixtureShell = value; },
  };
}

const defaults = createFixture({
  id: "default-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
const defaultResult = vm.runInNewContext(defaults.payload, defaults.context);
assert.equal(defaultResult.installed, true);
assert.equal(defaults.attributes.get("data-dream-shell"), "light");
assert.equal(defaults.attributes.get("data-dream-art-safe-area"), "center");
assert.equal(defaults.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(defaults.attributes.get("data-dream-art-ready"), "false");
assert.equal(defaults.rootStyle.values.get("--dream-art-position"), "50.00% 50.00%");
const defaultMetrics = defaults.window.__CODEX_DREAM_SKIN_STATE__.metrics;
assert.equal(defaultMetrics.rootPasses, 1);
assert.equal(defaultMetrics.routePasses, 1);
assert.equal(defaultMetrics.layoutReads, 1);
assert.ok(
  defaults.observers[1].observations.every(({ options }) =>
    !options.attributeFilter?.includes("style")),
  "Root observers must not feed skin-owned inline style writes back into applyRootState.",
);
defaults.observers[1].callback([{ type: "attributes", attributeName: "class", target: defaults.root }]);
defaults.flushTimers(64);
assert.equal(
  defaultMetrics.rootPasses,
  1,
  "Transient root mutations must not recompute an unchanged shell.",
);
for (let index = 0; index < 50; index += 1) defaults.observers[0].callback([]);
assert.equal(defaults.timers.size, 1, "Mutation bursts should coalesce into one scheduled ensure.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.rootPasses, 1, "Subtree mutations must not recompute root theme tokens.");
assert.equal(defaultMetrics.routePasses, 2);
assert.equal(defaultMetrics.layoutReads, 1, "Subtree mutations must not force shell layout reads.");
assert.equal(defaults.resizeObservers.length, 1);
assert.ok(defaults.resizeObservers[0].target);
defaults.shellBox.left = 196;
defaults.shellBox.width = 1084;
defaults.resizeObservers[0].callback([]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.layoutReads, 2, "Shell ResizeObserver changes must refresh chrome geometry.");
const defaultChrome = defaults.nodes.get("codex-dream-skin-chrome");
assert.equal(defaultChrome.style.values.get("left"), "196px");
assert.equal(defaultChrome.style.values.get("width"), "1084px");

// Auto appearance must continue following the native shell after the skin is
// already installed. The fixture makes the injected root color-scheme win
// whenever our class remains on <html>, so a temporary native probe is needed
// for each light → dark → light transition.
const shellFollow = createFixture({
  id: "shell-follow",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
shellFollow.root.className = "";
vm.runInNewContext(shellFollow.payload, shellFollow.context);
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");
shellFollow.setNativeShell("dark");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "dark");
shellFollow.setNativeShell("light");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");

defaults.root.className = "";
defaults.body.setAttribute("data-theme", "dark");
defaults.observers[1].callback([{ type: "attributes", target: defaults.body }]);
defaults.flushTimers(64);
assert.equal(defaults.attributes.get("data-dream-shell"), "dark", "Body theme changes must apply without the fallback interval.");

const synchronousWide = createFixture({
  id: "synchronous-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "wide-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
});
vm.runInNewContext(synchronousWide.payload, synchronousWide.context);
assert.equal(synchronousWide.attributes.get("data-dream-art-wide"), "true");
assert.equal(synchronousWide.attributes.get("data-dream-art-aspect"), "wide");
assert.equal(synchronousWide.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(synchronousWide.attributes.get("data-dream-art-ready"), "false");

const cachedAnalysis = {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
  safeArea: "left",
  focusX: 0.72,
  focusY: 0.48,
  accentRgb: { r: 180, g: 90, b: 110 },
};
const cached = createFixture({
  id: "cached-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "cached-art",
  artMetadata: synchronousWide.window.__CODEX_DREAM_SKIN_STATE__.artMetadata,
}, { analysisCache: new Map([["cached-art", cachedAnalysis]]) });
vm.runInNewContext(cached.payload, cached.context);
assert.equal(cached.attributes.get("data-dream-art-ready"), "true");
assert.equal(cached.attributes.get("data-dream-art-safe-area"), "left");
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisCacheHits, 1);
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisRuns, 0);

const previousWideState = synchronousWide.window.__CODEX_DREAM_SKIN_STATE__;
const stableStyle = synchronousWide.nodes.get("codex-dream-skin-style");
vm.runInNewContext(synchronousWide.payloadFor({
  id: "switched-wide",
  appearance: "dark",
  art: { safeArea: "right", taskMode: "ambient" },
  artKey: "switched-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
}, ".fixture { color: red; }"), synchronousWide.context);
assert.equal(synchronousWide.nodes.get("codex-dream-skin-style"), stableStyle);
assert.equal(stableStyle.textContent, ".fixture { color: red; }");
assert.equal(stableStyle.dataset.dreamSkinVersion, "test");
assert.equal(synchronousWide.rootStyle.values.get("--dream-skin-art"), 'url("blob:fixture-2")');
assert.deepEqual(synchronousWide.revokedUrls, ["blob:fixture-1"]);
assert.equal(previousWideState.cleanup(), false, "An old async cleanup must not remove the new theme.");

const brightPixels = new Uint8ClampedArray(96 * 32 * 4);
for (let offset = 0; offset < brightPixels.length; offset += 4) {
  brightPixels[offset] = 245;
  brightPixels[offset + 1] = 224;
  brightPixels[offset + 2] = 224;
  brightPixels[offset + 3] = 255;
}
const nativeDark = createFixture({
  id: "native-dark-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
}, {
  nativeShell: "dark",
  analysisFixture: { naturalWidth: 2400, naturalHeight: 800, pixels: brightPixels },
});
vm.runInNewContext(nativeDark.payload, nativeDark.context);
await Promise.resolve();
await Promise.resolve();
nativeDark.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeDark.window.__CODEX_DREAM_SKIN_STATE__.analysis.shell, "light");
assert.equal(nativeDark.attributes.get("data-dream-shell"), "dark");
assert.match(nativeDark.rootStyle.values.get("--ds-bg"), /^#[0-9a-f]{6}$/);
assert.ok(Number.parseInt(nativeDark.rootStyle.values.get("--ds-bg").slice(1), 16) < 0x303030);

const explicit = createFixture({
  id: "explicit-contract",
  appearance: "dark",
  art: { focusX: 0.15, focusY: 0.8, safeArea: "none", taskMode: "off" },
});
const explicitResult = vm.runInNewContext(explicit.payload, explicit.context);
assert.equal(explicitResult.shell, "dark");
assert.equal(explicit.attributes.get("data-dream-shell"), "dark");
assert.equal(explicit.attributes.get("data-dream-art-safe-area"), "none");
assert.equal(explicit.attributes.get("data-dream-art-safe"), "none");
assert.equal(explicit.attributes.get("data-dream-art-task-mode"), "off");
assert.equal(explicit.rootStyle.values.get("--dream-art-position"), "15.00% 80.00%");
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.analysis, null);

const banner = createFixture({
  id: "banner-contract",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "banner" },
  artMetadata: {
    width: 2560,
    height: 1440,
    ratio: 2560 / 1440,
    wide: true,
    aspect: "ultrawide",
    taskMode: "banner",
    safeArea: "left",
    focusX: 0.72,
    focusY: 0.44,
  },
});
vm.runInNewContext(banner.payload, banner.context);
assert.equal(banner.attributes.get("data-dream-art-wide"), "true");
assert.equal(banner.attributes.get("data-dream-art-task-mode"), "banner");
assert.equal(banner.attributes.get("data-dream-task-mode"), "banner");

assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.attributes.has("data-dream-shell"), false);
assert.equal(explicit.attributes.has("data-dream-art-safe-area"), false);
assert.equal(explicit.attributes.has("data-dream-art-task-mode"), false);
assert.equal(explicit.rootStyle.values.has("--dream-art-position"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(explicit.revokedUrls, ["blob:fixture-1"]);
await Promise.resolve();
await Promise.resolve();
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__, undefined);

console.log("PASS: renderer honors adaptive art metadata, fallback, and cleanup behavior.");
