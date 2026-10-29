import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDesign } from "./api/generate.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const publicFiles = new Set(["/index.html", "/styles.css", "/app.js", "/assets/bg.jpg"]);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw Object.assign(new Error("Request is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Send a valid JSON request."), { status: 400 }); }
}

createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/generate") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Use POST to generate a design." }));
    }
    try {
      const result = await generateDesign(await readJson(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(error.status || 500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.status ? error.message : "Something went wrong. Please try again." }));
    }
  }

  // Only serve the public front-end files; never .env, server source, etc.
  const requested = pathname === "/" ? "/index.html" : pathname;
  try {
    if (!publicFiles.has(requested)) throw new Error("not public");
    const content = await readFile(resolve(root, `.${requested}`));
    res.writeHead(200, { "Content-Type": types[extname(requested)], "X-Content-Type-Options": "nosniff" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, () => console.log(`Lovers AI Wedding Studio running at http://localhost:${port}`));
