#!/usr/bin/env node
// The copy of templates/workflow-bootstrap.mjs from timurproko/MyWorkflows that this repository runs from its
// `prepare` script and its `pre-push` hook, so every agent that installs dependencies or pushes has the shared
// delivery workflow.
// It downloads timurproko/MyWorkflows to ~/.workflow when this machine does not have it, then lets that copy keep
// itself current and link its skill and `delivery` command. This file is the one piece a repository must carry,
// because something has to exist before the download does; everything else lives in the shared repository.
//
// Invariant: it never fails its caller. Offline or without access, installing dependencies and pushing still work.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SOURCE_URL = "https://github.com/timurproko/MyWorkflows.git";
const root = join(homedir(), ".workflow");
const command = join(root, "bin", "delivery.mjs");
// Rationale: output goes to stderr so a caller that reads this process's stdout (a hook, a script) is not disturbed.
const options = { stdio: ["ignore", 2, 2], windowsHide: true, timeout: 120_000 };

try {
  // Rationale: CI runners get the workflow from the reusable workflow, not from a machine copy.
  if (!process.env.CI && !process.env.WORKFLOW_BOOTSTRAP_SKIP) {
    if (!existsSync(join(root, ".git"))) spawnSync("git", ["clone", "--quiet", SOURCE_URL, root], options);
    if (existsSync(command)) spawnSync(process.execPath, [command, "bootstrap"], options);
    else console.error(`shared workflow not available: could not download ${SOURCE_URL} to ${root}`);
  }
} catch (error) {
  console.error(`shared workflow bootstrap skipped: ${error.message}`);
}
