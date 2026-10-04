import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { GET, POST } from "../app/api/[...path]/route.ts";
import { env } from "./env.mjs";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const publicOrigin = new URL(
  process.env.PUBLIC_ORIGIN || `http://${host}:${port}`,
);
if (
  !/^https?:$/.test(publicOrigin.protocol) ||
  publicOrigin.pathname !== "/" ||
  publicOrigin.search ||
  publicOrigin.hash ||
  publicOrigin.username ||
  publicOrigin.password
)
  throw new Error(
    "PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials",
  );
const clientRoot = await realpath(
  fileURLToPath(new URL("../client/", import.meta.url)),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const security = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};
const allowedHosts = new Set([
  publicOrigin.host,
  `${host}:${port}`,
  `localhost:${port}`,
]);
const views = new Set([
  "/",
  "/overview",
  "/evaluation",
  "/data",
  "/playground",
  "/vision",
  "/review",
  "/monitoring",
  "/developers",
  "/settings",
  "/about",
]);
let active = 0;
let stopping = false;

async function send(response, res, head = false) {
  const headers = { ...security, ...Object.fromEntries(response.headers) };
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  if (head || !response.body) return res.end();
  await pipeline(Readable.fromWeb(response.body), res);
}
const errorResponse = (status, message) =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  try {
    if (stopping || active >= 4)
      return await send(
        errorResponse(503, "Server is busy. Please retry."),
        res,
      );
    if (!allowedHosts.has(req.headers.host))
      return await send(errorResponse(421, "Unrecognized host."), res);
    const url = new URL(req.url, publicOrigin);
    if (url.origin !== publicOrigin.origin)
      return await send(errorResponse(400, "Invalid request target."), res);
    if (url.pathname.startsWith("/api/")) {
      if (!["GET", "POST"].includes(req.method))
        return await send(errorResponse(405, "Use GET or POST."), res);
      if (Number(req.headers["content-length"] || 0) > 900000)
        return await send(
          errorResponse(413, "Maximum upload size is 900 KB."),
          res,
        );
      active++;
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        // This process binds only loopback; Nginx overwrites X-Real-IP. Never trust a client-supplied CF header.
        headers.set(
          "cf-connecting-ip",
          req.headers["x-real-ip"] || req.socket.remoteAddress || "local",
        );
        const request = new Request(url, {
          method: req.method,
          headers,
          ...(req.method === "POST"
            ? { body: Readable.toWeb(req), duplex: "half" }
            : {}),
        });
        const handler = req.method === "GET" ? GET : POST;
        const path = url.pathname.slice(5).split("/").map(decodeURIComponent);
        await send(
          await handler(request, { params: Promise.resolve({ path }) }),
          res,
        );
      } finally {
        active--;
      }
      return;
    }
    if (!["GET", "HEAD"].includes(req.method))
      return await send(errorResponse(405, "Use GET or HEAD."), res);
    const path = decodeURIComponent(url.pathname);
    if (
      path.includes("\0") ||
      path.split("/").some((part) => part.startsWith("."))
    )
      return await send(errorResponse(404, "File not found."), res);
    const candidate = resolve(
      clientRoot,
      "." + (views.has(path.replace(/\/$/, "") || "/") ? "/index.html" : path),
    );
    if (!candidate.startsWith(clientRoot + sep))
      return await send(errorResponse(404, "File not found."), res);
    let actual, info;
    try {
      actual = await realpath(candidate);
      info = await stat(actual);
    } catch {
      return await send(errorResponse(404, "File not found."), res);
    }
    if (!actual.startsWith(clientRoot + sep) || !info.isFile())
      return await send(errorResponse(404, "File not found."), res);
    res.writeHead(200, {
      ...security,
      "Content-Type": types[extname(actual)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": path.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    if (req.method === "HEAD") res.end();
    else await pipeline(createReadStream(actual), res);
  } catch (error) {
    if (!res.headersSent)
      await send(
        errorResponse(
          error instanceof URIError ? 400 : 500,
          "Unable to complete the request.",
        ),
        res,
      );
    else res.destroy();
    if (!req.destroyed && error?.code !== "ERR_STREAM_PREMATURE_CLOSE")
      console.error("HTTP request failed", error?.code || error?.name);
  } finally {
    // Discard an unread rejected request body so the HTTP connection can finish.
    if (!req.destroyed && !req.readableEnded) req.resume();
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
server.listen(port, host, () =>
  console.log(
    JSON.stringify({
      service: "marginloom",
      runtime: "node-sqlite",
      address: `${host}:${port}`,
      publicOrigin: publicOrigin.origin,
      rssMiB: Math.round(process.memoryUsage().rss / 1048576),
    }),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopping = true;
    server.close(() => {
      env.DB.close();
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10000).unref();
  });
