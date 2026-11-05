/**
 * Renders a Markdown file through GitHub's own renderer and opens it in the browser, styled like
 * github.com with hover copy buttons on code blocks. Run with
 * `pnpm preview:readme [file.md]` (default README.md). Requires an
 * authenticated `gh`. Relative images resolve against the repository checkout, so local assets
 * show before they are pushed. Nothing is committed, pushed, or published.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rebasePreviewFragmentLinks } from "./readme-preview-links.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const source = resolve(root, process.argv[2] ?? "README.md");
const origin = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
const context = /github[^:/]*[:/](.+?)(?:\.git)?$/u.exec(origin)?.[1];

const body = execFileSync("gh", ["api", "-X", "POST", "markdown", "--input", "-"], {
  encoding: "utf8",
  input: JSON.stringify({ text: readFileSync(source, "utf8"), mode: "gfm", ...(context ? { context } : {}) }),
});
const directory = join(tmpdir(), "readme-preview");
const output = join(directory, "index.html");
const renderedBody = rebasePreviewFragmentLinks(body, pathToFileURL(output).href);

const COPY = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';
const DONE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="#3fb950"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview: ${source.slice(root.length + 1)}</title>
<base href="${pathToFileURL(dirname(source)).href}/">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
<style>
body{margin:0;background:#fff}@media(prefers-color-scheme:dark){body{background:#0d1117}}
.markdown-body{box-sizing:border-box;max-width:880px;margin:32px auto;padding:32px;border:1px solid #d0d7de;border-radius:6px}
.markdown-body pre{position:relative}
.cp{position:absolute;top:8px;right:8px;width:32px;height:32px;display:grid;place-items:center;padding:0;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;color:#59636e;cursor:pointer;opacity:0;transition:opacity .15s}
.markdown-body pre:hover .cp{opacity:1}
@media(prefers-color-scheme:dark){.markdown-body{border-color:#3d444d}.cp{border-color:#3d444d;background:#212830;color:#9198a1}}
</style></head>
<body><article class="markdown-body">
${renderedBody}
</article>
<script>
document.querySelectorAll("pre").forEach(pre => {
  const text = pre.innerText.trim(), button = document.createElement("button");
  button.className = "cp"; button.title = "Copy"; button.innerHTML = ${JSON.stringify(COPY)};
  button.onclick = () => { navigator.clipboard.writeText(text); button.innerHTML = ${JSON.stringify(DONE)}; setTimeout(() => { button.innerHTML = ${JSON.stringify(COPY)}; }, 1200); };
  pre.appendChild(button);
});
</script></body></html>
`;

mkdirSync(directory, { recursive: true });
writeFileSync(output, page);
process.stdout.write(`${output}\n`);

const [command, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", output]]
  : process.platform === "darwin" ? ["open", [output]] : ["xdg-open", [output]];
spawn(command, args, { detached: true, stdio: "ignore" }).unref();
