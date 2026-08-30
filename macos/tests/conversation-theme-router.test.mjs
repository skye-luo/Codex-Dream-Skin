import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  classifyMentorTheme,
  chooseTheme,
  DEFAULT_MENTOR_THEME_ID,
  decideThemeAction,
  extractConversationId,
  parseThemeIds,
  publishTheme,
  selectedDomConversationContext,
  selectedDomConversationId,
  selectMainShellTargets,
  selectConversationTarget,
} from "../scripts/conversation-theme-router.mjs";

assert.deepEqual(parseThemeIds("mentor-demis-ai, mentor-elon-build,mentor-demis-ai"), [
  "mentor-demis-ai",
  "mentor-elon-build",
]);
assert.equal(parseThemeIds(""), null);
assert.throws(() => parseThemeIds("mentor-ok,../escape"), /Invalid --theme-ids list/);
assert.equal(selectedDomConversationId(["local:thread-a"]), "local:thread-a");
assert.equal(selectedDomConversationId(["local:thread-a", "local:thread-a"]), "local:thread-a");
assert.equal(selectedDomConversationId(["local:thread-a", "local:thread-b"]), null);
assert.equal(selectedDomConversationId(["", null, "x".repeat(241)]), null);
assert.deepEqual(selectedDomConversationContext([
  { conversationId: "local:thread-a", title: "创建一个应用" },
]), { conversationId: "local:thread-a", title: "创建一个应用" });
assert.equal(selectedDomConversationContext([
  { conversationId: "local:a", title: "A" },
  { conversationId: "local:b", title: "B" },
]), null);

assert.equal(
  extractConversationId("app://codex/local/019f7074-0906-7cf3-ab4f-4d8649235f9d"),
  "019f7074-0906-7cf3-ab4f-4d8649235f9d",
);
assert.equal(extractConversationId("app://codex/remote/remote-thread-7?view=task"), "remote-thread-7");
assert.equal(extractConversationId("app://codex/hotkey-window/thread/quick%20chat"), "quick chat");
assert.equal(extractConversationId("app://codex/thread/thread_123"), "thread_123");
assert.equal(extractConversationId("app://codex/settings"), null);
assert.equal(extractConversationId("not a route"), null);

const target = selectConversationTarget([
  { type: "page", url: "app://codex/local/abc", id: "one" },
  { type: "worker", url: "app://codex/local/ignored", id: "worker" },
]);
assert.equal(target?.conversationId, "abc");
assert.equal(selectConversationTarget([
  { type: "page", url: "app://codex/local/abc", id: "one" },
  { type: "page", url: "app://codex/remote/def", id: "two" },
]), null, "Ambiguous multi-window state must not trigger an automatic switch");
assert.deepEqual(selectMainShellTargets([
  { type: "page", title: "Codex", url: "app://-/index.html", id: "main" },
  {
    type: "page",
    title: "Codex",
    url: "app://-/index.html?initialRoute=%2Favatar-overlay",
    id: "pet",
  },
  { type: "webview", url: "https://chatgpt.com", id: "web" },
]).map((item) => item.id), ["main"], "Auxiliary pet pages must not block Lisa as the new-task default");

const mentorThemes = [
  "mentor-demis-ai",
  "mentor-elon-build",
  "mentor-duan-invest",
  "mentor-lisa-life",
];

const [commonShell, startShell] = await Promise.all([
  fs.readFile(new URL("../scripts/common-macos.sh", import.meta.url), "utf8"),
  fs.readFile(new URL("../scripts/start-dream-skin-macos.sh", import.meta.url), "utf8"),
]);
const [autostartShell, verifyShell] = await Promise.all([
  fs.readFile(new URL("../scripts/autostart-dream-skin-macos.sh", import.meta.url), "utf8"),
  fs.readFile(new URL("../scripts/verify-dream-skin-macos.sh", import.meta.url), "utf8"),
]);
assert.match(
  commonShell,
  /CONVERSATION_ROUTER_PID="\$pid"/,
  "The router launcher must publish its PID without requiring command substitution.",
);
assert.match(
  startShell,
  /launch_conversation_router "\$PORT" >\/dev\/null\s+ROUTER_PID="\$CONVERSATION_ROUTER_PID"/,
  "The start path must launch the router in the long-lived shell instead of command substitution.",
);
assert.doesNotMatch(
  startShell,
  /ROUTER_PID="\$\(launch_conversation_router/,
  "The router must not be launched from a short-lived command-substitution process.",
);
assert.match(
  autostartShell,
  /conversation_router_is_running "\$PORT"[\s\S]{0,300}launch_conversation_router "\$PORT"/,
  "The persistent restart agent must recover a missing conversation router.",
);
assert.match(
  verifyShell,
  /conversation_router_is_running "\$PORT"/,
  "Live verification must fail when the conversation router is absent.",
);

const selected = chooseTheme("thread-a", mentorThemes, {});
assert.equal(chooseTheme("thread-a", mentorThemes, {}), selected, "Legacy assignment remains stable");
assert.equal(
  chooseTheme("thread-a", mentorThemes, { "thread-a": "mentor-duan-invest" }),
  "mentor-duan-invest",
);

assert.deepEqual(classifyMentorTheme("新建任务", mentorThemes), {
  themeId: DEFAULT_MENTOR_THEME_ID, matched: false, mentor: "lisa",
});
assert.equal(classifyMentorTheme("研究新的推理模型", mentorThemes).themeId, "mentor-demis-ai");
assert.equal(classifyMentorTheme("创建 GPT 宠物形象", mentorThemes).themeId, "mentor-elon-build");
assert.equal(classifyMentorTheme("分析这家公司长期投资价值", mentorThemes).themeId, "mentor-duan-invest");
assert.equal(classifyMentorTheme("改善 ADHD 专注与生活节奏", mentorThemes).themeId, "mentor-lisa-life");
assert.equal(classifyMentorTheme("随便聊聊", mentorThemes).themeId, "mentor-lisa-life");

assert.deepEqual(decideThemeAction({
  conversationId: "thread-a",
  conversationTitle: "创建 GPT 宠物形象",
  themeIds: mentorThemes,
  assignments: {},
  liveThemeId: "mentor-lisa-life",
  previousConversationId: null,
  routerAppliedThemeId: null,
}), {
  type: "assign-and-switch",
  conversationId: "thread-a",
  themeId: "mentor-elon-build",
  mentor: "elon",
  matched: true,
});

assert.deepEqual(decideThemeAction({
  conversationId: "thread-a",
  conversationTitle: "研究推理模型",
  themeIds: mentorThemes,
  assignments: { "thread-a": "mentor-demis-ai" },
  manualOverrides: { "thread-a": true },
  liveThemeId: "mentor-elon-build",
  previousConversationId: "thread-a",
  routerAppliedThemeId: null,
}), {
  type: "record-override",
  conversationId: "thread-a",
  themeId: "mentor-elon-build",
}, "A manual theme change should become the conversation's new sticky assignment");

assert.equal(decideThemeAction({
  conversationId: "thread-locked",
  conversationTitle: "长期投资分析",
  themeIds: mentorThemes,
  assignments: { "thread-locked": "mentor-demis-ai" },
  classificationLocks: { "thread-locked": true },
  liveThemeId: "mentor-demis-ai",
  previousConversationId: "thread-locked",
  routerAppliedThemeId: null,
}).reason, "already-active", "A classified conversation must not oscillate when its generated title changes");

assert.deepEqual(decideThemeAction({
  conversationId: "thread-b",
  conversationTitle: "长期投资分析",
  themeIds: mentorThemes,
  assignments: { "thread-b": "mentor-duan-invest" },
  liveThemeId: "mentor-lisa-life",
  previousConversationId: "thread-a",
  routerAppliedThemeId: "mentor-lisa-life",
}), {
  type: "switch",
  conversationId: "thread-b",
  themeId: "mentor-duan-invest",
});

assert.equal(decideThemeAction({
  conversationId: "thread-b",
  conversationTitle: "长期投资分析",
  themeIds: mentorThemes,
  assignments: { "thread-b": "mentor-duan-invest" },
  liveThemeId: "mentor-lisa-life",
  previousConversationId: "thread-b",
  routerAppliedThemeId: "mentor-duan-invest",
}).reason, "waiting-router");

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mentor-router-test-"));
try {
  const libraryDir = path.join(temporary, "themes");
  const themeDir = path.join(temporary, "active");
  const sourceDir = path.join(libraryDir, "mentor-lisa-life");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "background.png"), "not-empty");
  await fs.writeFile(path.join(sourceDir, "theme.json"), JSON.stringify({
    schemaVersion: 1,
    id: "mentor-lisa-life",
    name: "苏姿丰 · 生活引领局",
    image: "background.png",
  }));
  await publishTheme("mentor-lisa-life", { libraryDir, themeDir });
  const active = JSON.parse(await fs.readFile(path.join(themeDir, "theme.json"), "utf8"));
  assert.equal(active.id, "mentor-lisa-life");
  assert.equal(active.image, "background-mentor-lisa-life.png");
  assert.equal(await fs.readFile(path.join(themeDir, active.image), "utf8"), "not-empty");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log("conversation theme router tests passed");
