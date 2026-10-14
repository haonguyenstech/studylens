// Publish the current package.json version: build every installer and upload them to this repo's
// GitHub Releases (haonguyenstech/studylens) as release vX.Y.Z, notes from CHANGELOG.md.
// The app's updater reads the "latest release". Also uploads copies under fixed names
// (StudyLens-mac-arm64.dmg…) so the README's download buttons always get the newest build.
// Needs `gh auth login` with repo scope.
//   1. bump "version" in package.json   2. add a "## X.Y.Z" section to CHANGELOG.md   3. npm run release
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const m = new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b.*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(changelog);
if (!m) { console.error(`CHANGELOG.md has no "## ${version}" section`); process.exit(1); }
const notes = m[1].trim();
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const env = { ...process.env, GH_TOKEN: token };
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit", env }); if (r.status !== 0) process.exit(r.status ?? 1); };

console.log(`Releasing StudyLens ${version}…`);
run("npm", ["run", "build"]);
run("npx", ["electron-builder", "--mac", "--win", "--publish", "always"]);
// electron-builder leaves the release body empty; the in-app "What's new" reads it, so set it here.
const REPO = "haonguyenstech/studylens";
run("gh", ["release", "edit", `v${version}`, "-R", REPO, "--title", `StudyLens ${version}`, "--notes", notes]);
// Fixed-name copies for https://github.com/<repo>/releases/latest/download/<name>
mkdirSync("release/stable", { recursive: true });
const stable = [[`StudyLens-${version}-mac-arm64.dmg`, "StudyLens-mac-arm64.dmg"], [`StudyLens-${version}-mac-x64.dmg`, "StudyLens-mac-x64.dmg"], [`StudyLens-Setup-${version}.exe`, "StudyLens-Setup-win-x64.exe"]];
for (const [from, to] of stable) copyFileSync(`release/${from}`, `release/stable/${to}`);
run("gh", ["release", "upload", `v${version}`, "-R", REPO, "--clobber", ...stable.map(([, to]) => `release/stable/${to}`)]);
console.log(`Done: https://github.com/${REPO}/releases/tag/v${version}`);
