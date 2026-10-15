// Publish the current package.json version: build every installer and upload them to this repo's
// GitHub Releases (haonguyenstech/studylens) as release vX.Y.Z, notes from CHANGELOG.md.
// The app's updater reads the "latest release". Also uploads copies under fixed names
// (StudyLens-mac-arm64.dmg…) so the README's download buttons always get the newest build.
// Needs `gh auth login` with repo scope, and the Windows cross-build tools (see README).
//   1. bump "version" in package.json and src-tauri/Cargo.toml   2. add a "## X.Y.Z" section to CHANGELOG.md   3. npm run release
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const m = new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b.*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(changelog);
if (!m) { console.error(`CHANGELOG.md has no "## ${version}" section`); process.exit(1); }
const notes = m[1].trim();
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit" }); if (r.status !== 0) process.exit(r.status ?? 1); };
const REPO = "haonguyenstech/studylens";

console.log(`Releasing StudyLens ${version}…`);
run("node", ["scripts/pack.mjs", "mac"]);
run("node", ["scripts/pack.mjs", "win"]);
const files = ["mac-arm64.dmg", "mac-arm64.zip", "mac-x64.dmg", "mac-x64.zip"].map((s) => `release/StudyLens-${version}-${s}`).concat(`release/StudyLens-Setup-${version}.exe`);
// Fixed-name copies for https://github.com/<repo>/releases/latest/download/<name>
mkdirSync("release/stable", { recursive: true });
const stable = [[`StudyLens-${version}-mac-arm64.dmg`, "StudyLens-mac-arm64.dmg"], [`StudyLens-${version}-mac-x64.dmg`, "StudyLens-mac-x64.dmg"], [`StudyLens-Setup-${version}.exe`, "StudyLens-Setup-win-x64.exe"]];
for (const [from, to] of stable) copyFileSync(`release/${from}`, `release/stable/${to}`);
run("gh", ["release", "create", `v${version}`, "-R", REPO, "--title", `StudyLens ${version}`, "--notes", notes, ...files, ...stable.map(([, to]) => `release/stable/${to}`)]);
console.log(`Done: https://github.com/${REPO}/releases/tag/v${version}`);
