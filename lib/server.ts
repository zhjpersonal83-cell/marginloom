import { env } from "cloudflare:workers";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB)
    throw new HttpError(503, "Database is unavailable. Please try again.");
  return env.DB;
}
export async function digest(text: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(b))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export const uid = () => crypto.randomUUID();
export async function writeAudit(
  workspace: string,
  action: string,
  detail: string,
) {
  await db()
    .prepare(
      "INSERT INTO audit (id,workspace_id,action,detail,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(uid(), workspace, action, detail, Date.now())
    .run();
}
export function checkMutation(request: Request) {
  // Custom header forces browser preflight; no cross-origin CORS permissions are emitted.
  if (
    request.headers.get("x-marginloom-client") !== "1" &&
    !request.headers.get("authorization")?.startsWith("Bearer ")
  )
    throw new HttpError(403, "Missing CSRF protection header.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "Cross-origin writes are not allowed.");
}
export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 900000) {
      await reader.cancel();
      throw new HttpError(413, "Maximum upload size is 900 KB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let i = 0;
  for (const c of chunks) {
    bytes.set(c, i);
    i += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export async function rateLimit(key: string, max = 60) {
  await db().batch([
    db().prepare("DELETE FROM counters WHERE expires_at<?").bind(Date.now()),
    db().prepare("DELETE FROM sessions WHERE expires_at<?").bind(Date.now()),
  ]);
  const minute = Math.floor(Date.now() / 60000),
    id = `${key}:${minute}`;
  const row = await db()
    .prepare(
      "INSERT INTO counters (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(id, Date.now() + 120000)
    .first<{ count: number }>();
  if (row && row.count > max)
    throw new HttpError(429, "Rate limit reached. Try again in a minute.");
}
export async function identity(
  request: Request,
): Promise<{
  workspace: string;
  role: "owner";
  kind: "api" | "demo" | "account";
}> {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const key = await db()
      .prepare("SELECT workspace_id FROM api_keys WHERE token_hash=?")
      .bind(await digest(bearer.slice(7)))
      .first<{ workspace_id: string }>();
    if (!key) throw new HttpError(401, "Invalid API key.");
    return { workspace: key.workspace_id, role: "owner", kind: "api" };
  }
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("marginloom_session="))
    ?.slice(19);
  if (!token) throw new HttpError(401, "Open a demo workspace first.");
  const session = await db()
    .prepare(
      "SELECT workspace_id FROM sessions WHERE token_hash=? AND expires_at>?",
    )
    .bind(await digest(token), Date.now())
    .first<{ workspace_id: string }>();
  if (!session)
    throw new HttpError(401, "Session expired. Open a new demo workspace.");
  return { workspace: session.workspace_id, role: "owner", kind: "demo" };
}
export async function newSession(request: Request) {
  checkMutation(request);
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  await rateLimit("session:" + (await digest(ip)), 20);
  try {
    const existing = await identity(request);
    return { ...existing, cookie: null };
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 401) throw e;
  }
  const workspace = uid(),
    token = uid() + uid(),
    now = Date.now();
  await db().batch([
    db()
      .prepare("INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)")
      .bind(workspace, "My reliability workspace", now),
    db()
      .prepare(
        "INSERT INTO sessions (token_hash,workspace_id,expires_at) VALUES (?,?,?)",
      )
      .bind(await digest(token), workspace, now + 7 * 86400000),
    db()
      .prepare(
        "INSERT INTO audit (id,workspace_id,action,detail,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        uid(),
        workspace,
        "workspace.created",
        "Isolated demo workspace opened",
        now,
      ),
  ]);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    workspace,
    role: "owner",
    kind: "demo",
    cookie: `marginloom_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`,
  };
}
export function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      ...extra,
    },
  });
}
