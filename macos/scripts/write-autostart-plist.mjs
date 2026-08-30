#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [target, label, watcher, port, stdoutPath, stderrPath] = process.argv.slice(2);
if (!target || !label || !watcher || !port || !stdoutPath || !stderrPath) {
  throw new Error("Usage: write-autostart-plist.mjs <target> <label> <watcher> <port> <stdout> <stderr>");
}
if (!/^com\.openai\.codex-dream-skin-studio\.[a-z-]+$/.test(label)) {
  throw new Error("Invalid launch agent label");
}
if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("Invalid loopback port");
}

const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${xml(watcher)}</string>
    <string>--watch</string>
    <string>--port</string>
    <string>${xml(port)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xml(stderrPath)}</string>
</dict>
</plist>
`;

fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const temporary = `${target}.${process.pid}.tmp`;
fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
fs.renameSync(temporary, target);
