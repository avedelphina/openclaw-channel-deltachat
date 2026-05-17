#!/usr/bin/env node
import fs from "fs";
import { execSync } from "child_process";

const type = process.argv[2] || "patch";
if (!["patch", "minor", "major"].includes(type)) {
  console.error("Usage: node scripts/release.mjs [patch|minor|major]");
  process.exit(1);
}

// Bump version in package.json without creating a git tag
execSync(`npm version ${type} --no-git-tag-version`, { stdio: "inherit" });

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const today = new Date().toISOString().slice(0, 10);

// Sync version in openclaw.plugin.json if it exists
const pluginJsonPath = "openclaw.plugin.json";
if (fs.existsSync(pluginJsonPath)) {
  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
  pluginJson.version = version;
  fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + "\n");
}

let changelog = fs.readFileSync("CHANGELOG.md", "utf8");
if (!changelog.includes("## [Unreleased]")) {
  console.error("CHANGELOG.md is missing an [Unreleased] section.");
  process.exit(1);
}

changelog = changelog.replace(
  "## [Unreleased]",
  `## [Unreleased]\n\n## [${version}] - ${today}`,
);
fs.writeFileSync("CHANGELOG.md", changelog);

execSync("git add package.json CHANGELOG.md openclaw.plugin.json", { stdio: "inherit" });
execSync(`git commit -m "chore(release): v${version}"`, { stdio: "inherit" });
execSync(`git tag v${version}`, { stdio: "inherit" });
execSync("git push", { stdio: "inherit" });
execSync(`git push origin v${version}`, { stdio: "inherit" });

console.log(`\n✅ Released v${version}`);
