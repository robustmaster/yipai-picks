import type { PickInput, PickItem } from "./shared/types";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: R2Bucket;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};

type PickRow = {
  id: string;
  name: string;
  avatar_image: string | null;
  intro: string | null;
  platform: string | null;
  tags: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_COOKIE = "yipai_admin_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === "/api/picks" && request.method === "GET") {
        return listPicks(env);
      }

      if (pathname === "/api/admin/login" && request.method === "POST") {
        return loginAdmin(request, env);
      }

      if (pathname === "/api/admin/logout" && request.method === "POST") {
        return logoutAdmin(request);
      }

      if (pathname === "/api/admin/session" && request.method === "GET") {
        const session = await getAdminSession(request, env);
        if (!session) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }
        return json({ authenticated: true, username: session.username });
      }

      if (pathname === "/api/admin/picks" && request.method === "POST") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return createPick(request, env);
      }

      const pickMatch = pathname.match(/^\/api\/admin\/picks\/([^/]+)$/);
      if (pickMatch && request.method === "PUT") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return updatePick(pickMatch[1], request, env);
      }

      if (pickMatch && request.method === "DELETE") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return deletePick(pickMatch[1], env);
      }

      if (pathname === "/api/admin/avatar" && request.method === "POST") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return uploadAvatar(request, env);
      }

      if (pathname.startsWith("/media/") && request.method === "GET") {
        return getMedia(pathname, env);
      }

      if (pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, { status: 404 });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }

      console.error(error);
      return json({ error: "Internal server error" }, { status: 500 });
    }
  }
};

async function listPicks(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `select id, name, avatar_image, intro, platform, tags, sort_order, created_at, updated_at
     from picks
     order by sort_order asc, created_at desc`
  ).all<PickRow>();

  return json({ picks: (results ?? []).map(toPickItem) });
}

async function createPick(request: Request, env: Env): Promise<Response> {
  const input = normalizePickInput(await readJson(request));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into picks
       (id, name, avatar_image, intro, platform, tags, sort_order, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      input.name,
      input.avatar_image,
      input.intro,
      input.platform,
      JSON.stringify(input.tags),
      input.sort_order,
      now,
      now
    )
    .run();

  const pick = await getPickById(id, env);
  return json({ pick }, { status: 201 });
}

async function updatePick(id: string, request: Request, env: Env): Promise<Response> {
  const existing = await getPickById(id, env);
  if (!existing) {
    return json({ error: "Pick not found" }, { status: 404 });
  }

  const input = normalizePickInput(await readJson(request));
  const now = new Date().toISOString();

  await env.DB.prepare(
    `update picks
     set name = ?, avatar_image = ?, intro = ?, platform = ?, tags = ?, sort_order = ?, updated_at = ?
     where id = ?`
  )
    .bind(
      input.name,
      input.avatar_image,
      input.intro,
      input.platform,
      JSON.stringify(input.tags),
      input.sort_order,
      now,
      id
    )
    .run();

  const pick = await getPickById(id, env);
  return json({ pick });
}

async function deletePick(id: string, env: Env): Promise<Response> {
  await env.DB.prepare("delete from picks where id = ?").bind(id).run();
  return json({ ok: true });
}

async function getPickById(id: string, env: Env): Promise<PickItem | null> {
  const row = await env.DB.prepare(
    `select id, name, avatar_image, intro, platform, tags, sort_order, created_at, updated_at
     from picks
     where id = ?`
  )
    .bind(id)
    .first<PickRow>();

  return row ? toPickItem(row) : null;
}

async function uploadAvatar(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    return json({ error: "Image must be smaller than 5MB" }, { status: 413 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Missing image file" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: "Image must be smaller than 5MB" }, { status: 413 });
  }

  const key = `avatars/${crypto.randomUUID()}.${extensionFromMime(file.type)}`;
  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });

  return json({ key, url: `/media/${key}` }, { status: 201 });
}

async function getMedia(pathname: string, env: Env): Promise<Response> {
  const key = decodeURIComponent(pathname.slice("/media/".length));
  if (!isSafeObjectKey(key)) {
    return json({ error: "Invalid media key" }, { status: 400 });
  }

  const object = await env.IMAGES.get(key);
  if (!object) {
    return json({ error: "Media not found" }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}

function normalizePickInput(value: unknown): Required<PickInput> {
  const input = isRecord(value) ? value : {};
  const name = stringValue(input.name).trim();
  if (!name) {
    throw new HttpError("Name is required", 400);
  }

  return {
    name,
    avatar_image: nullableString(input.avatar_image),
    intro: nullableString(input.intro),
    platform: stringValue(input.platform).trim(),
    tags: normalizeTags(input.tags),
    sort_order: normalizeSortOrder(input.sort_order)
  };
}

function toPickItem(row: PickRow): PickItem {
  const avatarImage = row.avatar_image || null;

  return {
    id: row.id,
    name: row.name,
    avatar_image: avatarImage,
    avatar_url: avatarImage ? `/media/${avatarImage}` : null,
    intro: row.intro || null,
    platform: row.platform || "",
    tags: parseTags(row.tags),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

async function loginAdmin(request: Request, env: Env): Promise<Response> {
  const configuredPassword = getAdminPassword(env);
  if (!configuredPassword) {
    return json({ error: "Admin password is not configured" }, { status: 503 });
  }

  const body = await readJson(request);
  const input = isRecord(body) ? body : {};
  const username = stringValue(input.username).trim();
  const password = stringValue(input.password);
  const expectedUsername = getAdminUsername(env);

  if (username !== expectedUsername || !constantTimeEqual(password, configuredPassword)) {
    return json({ error: "Invalid username or password" }, { status: 401 });
  }

  const session = await createSessionCookie(expectedUsername, request, env);
  return json(
    { authenticated: true, username: expectedUsername },
    {
      headers: {
        "set-cookie": session
      }
    }
  );
}

function logoutAdmin(request: Request): Response {
  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearSessionCookie(request)
      }
    }
  );
}

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  if (!getAdminPassword(env)) {
    return json({ error: "Admin password is not configured" }, { status: 503 });
  }

  const session = await getAdminSession(request, env);
  if (session) {
    return null;
  }

  return json({ error: "Unauthorized" }, { status: 401 });
}

async function getAdminSession(request: Request, env: Env): Promise<{ username: string } | null> {
  const password = getAdminPassword(env);
  if (!password) return null;

  const cookie = parseCookies(request.headers.get("cookie")).get(ADMIN_COOKIE);
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = await signSession(payload, password);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const data = JSON.parse(base64UrlDecode(payload)) as { username?: unknown; exp?: unknown };
    if (typeof data.username !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: data.username };
  } catch {
    return null;
  }
}

async function createSessionCookie(username: string, request: Request, env: Env): Promise<string> {
  const password = getAdminPassword(env);
  if (!password) {
    throw new HttpError("Admin password is not configured", 503);
  }

  const payload = base64UrlEncode(
    JSON.stringify({
      username,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
    })
  );
  const signature = await signSession(payload, password);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${ADMIN_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function signSession(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) continue;
    cookies.set(name, valueParts.join("="));
  }

  return cookies;
}

function getAdminUsername(env: Env): string {
  return env.ADMIN_USERNAME?.trim() || "admin";
}

function getAdminPassword(env: Env): string {
  return env.ADMIN_PASSWORD || "";
}

function base64UrlEncode(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function normalizeTags(value: unknown): string[] {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,，]/)
      : [];

  return Array.from(
    new Set(
      rawTags
        .map((tag) => stringValue(tag).trim())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return normalizeTags(parsed);
  } catch {
    return [];
  }
}

function normalizeSortOrder(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : 0;
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text || null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

function isSafeObjectKey(key: string): boolean {
  return Boolean(key) && !key.startsWith("/") && !key.includes("..");
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
