import { DEFAULT_SITE_SETTINGS } from "./shared/types";
import type { PickInput, PickItem, PickLinkType, SiteSettings, SiteSettingsInput } from "./shared/types";

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
  link_type: PickLinkType | null;
  link_value: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
};

type PickImageFields = {
  avatar_image: string | null;
  link_type: PickLinkType | null;
  link_value: string | null;
};
type PickImageReferenceRow = Pick<PickRow, "avatar_image" | "link_type" | "link_value">;
type SiteSettingsRow = SiteSettings & { updated_at: string };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ANALYTICS_CODE_LENGTH = 20_000;
const RASTER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const SITE_ICON_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const ORPHAN_IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;
const ADMIN_COOKIE = "yipai_admin_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
let schemaReady: Promise<void> | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === "/api/picks" && request.method === "GET") {
        return await listPicks(env);
      }

      if (pathname === "/api/settings" && request.method === "GET") {
        return await getSiteSettings(env);
      }

      if (pathname === "/api/admin/login" && request.method === "POST") {
        return await loginAdmin(request, env);
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
        return await createPick(request, env);
      }

      if (pathname === "/api/admin/settings" && request.method === "PUT") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return await updateSiteSettings(request, env, ctx);
      }

      const pickMatch = pathname.match(/^\/api\/admin\/picks\/([^/]+)$/);
      if (pickMatch && request.method === "PUT") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return await updatePick(pickMatch[1], request, env, ctx);
      }

      if (pickMatch && request.method === "DELETE") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return await deletePick(pickMatch[1], env, ctx);
      }

      if (pathname === "/api/admin/avatar" && request.method === "POST") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return await uploadImage(request, env, "avatars");
      }

      if (pathname === "/api/admin/link-image" && request.method === "POST") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return await uploadImage(request, env, "links");
      }

      if (pathname === "/api/admin/site-icon" && request.method === "POST") {
        const adminResponse = await requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return await uploadImage(request, env, "site-icons");
      }

      if (pathname.startsWith("/media/") && request.method === "GET") {
        return await getMedia(pathname, env);
      }

      if (pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, { status: 404 });
      }

      return await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }

      console.error(error);
      return json({ error: "Internal server error" }, { status: 500 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      cleanupOrphanedImages(env, controller.scheduledTime).catch((error) => {
        console.error("Scheduled image cleanup failed", error);
      })
    );
  }
} satisfies ExportedHandler<Env>;

async function listPicks(env: Env): Promise<Response> {
  await ensureSchema(env);

  const { results } = await env.DB.prepare(
    `select id, name, avatar_image, intro, platform, link_type, link_value, tags, created_at, updated_at
     from picks
     order by random()`
  ).all<PickRow>();

  return json({ picks: (results ?? []).map(toPickItem) });
}

async function getSiteSettings(env: Env): Promise<Response> {
  return json({ settings: await readSiteSettings(env) });
}

async function updateSiteSettings(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  await ensureSchema(env);
  const previousSettings = await readSiteSettings(env);
  const settings = normalizeSiteSettings(await readJson(request));
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into site_settings (id, site_name, owner_label, owner_url, favicon_image, analytics_code, updated_at)
     values (1, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set
       site_name = excluded.site_name,
       owner_label = excluded.owner_label,
       owner_url = excluded.owner_url,
       favicon_image = excluded.favicon_image,
       analytics_code = excluded.analytics_code,
       updated_at = excluded.updated_at`
  )
    .bind(
      settings.site_name,
      settings.owner_label,
      settings.owner_url,
      settings.favicon_image,
      settings.analytics_code,
      now
    )
    .run();

  if (previousSettings.favicon_image !== settings.favicon_image) {
    scheduleUnreferencedImageCleanup(ctx, env, [previousSettings.favicon_image]);
  }

  return json({ settings });
}

async function readSiteSettings(env: Env): Promise<SiteSettings> {
  await ensureSchema(env);
  const row = await env.DB.prepare(
    "select site_name, owner_label, owner_url, favicon_image, analytics_code, updated_at from site_settings where id = 1"
  ).first<SiteSettingsRow>();

  return row
    ? {
        site_name: row.site_name,
        owner_label: row.owner_label,
        owner_url: row.owner_url,
        favicon_image: row.favicon_image || "",
        analytics_code: row.analytics_code || ""
      }
    : DEFAULT_SITE_SETTINGS;
}

async function createPick(request: Request, env: Env): Promise<Response> {
  await ensureSchema(env);

  const input = normalizePickInput(await readJson(request));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into picks
       (id, name, avatar_image, intro, platform, link_type, link_value, tags, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      input.name,
      input.avatar_image,
      input.intro,
      input.platform,
      input.link_type,
      input.link_value,
      JSON.stringify(input.tags),
      now,
      now
    )
    .run();

  const pick = await getPickById(id, env);
  return json({ pick }, { status: 201 });
}

async function updatePick(id: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  await ensureSchema(env);

  const existing = await getPickById(id, env);
  if (!existing) {
    return json({ error: "Pick not found" }, { status: 404 });
  }

  const input = normalizePickInput(await readJson(request));
  const previousImageKeys = imageKeysForPick(existing);
  const nextImageKeys = new Set(imageKeysForPick(input));
  const now = new Date().toISOString();

  await env.DB.prepare(
    `update picks
     set name = ?, avatar_image = ?, intro = ?, platform = ?, link_type = ?, link_value = ?, tags = ?, updated_at = ?
     where id = ?`
  )
    .bind(
      input.name,
      input.avatar_image,
      input.intro,
      input.platform,
      input.link_type,
      input.link_value,
      JSON.stringify(input.tags),
      now,
      id
    )
    .run();

  scheduleUnreferencedImageCleanup(
    ctx,
    env,
    previousImageKeys.filter((key) => !nextImageKeys.has(key))
  );

  const pick = await getPickById(id, env);
  return json({ pick });
}

async function deletePick(id: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  await ensureSchema(env);

  const existing = await getPickById(id, env);
  await env.DB.prepare("delete from picks where id = ?").bind(id).run();
  if (existing) {
    scheduleUnreferencedImageCleanup(ctx, env, imageKeysForPick(existing));
  }
  return json({ ok: true });
}

async function getPickById(id: string, env: Env): Promise<PickItem | null> {
  await ensureSchema(env);

  const row = await env.DB.prepare(
    `select id, name, avatar_image, intro, platform, link_type, link_value, tags, created_at, updated_at
     from picks
     where id = ?`
  )
    .bind(id)
    .first<PickRow>();

  return row ? toPickItem(row) : null;
}

async function uploadImage(
  request: Request,
  env: Env,
  folder: "avatars" | "links" | "site-icons"
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    return json({ error: "Image must be smaller than 5MB" }, { status: 413 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Missing image file" }, { status: 400 });
  }

  const allowedTypes = folder === "site-icons" ? SITE_ICON_TYPES : RASTER_IMAGE_TYPES;
  if (!allowedTypes.has(file.type)) {
    return json({ error: "Unsupported image format" }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: "Image must be smaller than 5MB" }, { status: 413 });
  }

  const key = `${folder}/${crypto.randomUUID()}.${extensionFromMime(file.type)}`;
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

function scheduleUnreferencedImageCleanup(ctx: ExecutionContext, env: Env, keys: string[]): void {
  const candidates = Array.from(new Set(keys.filter(isManagedImageKey)));
  if (!candidates.length) return;

  ctx.waitUntil(
    deleteUnreferencedImageKeys(env, candidates).catch((error) => {
      console.error("Immediate image cleanup failed", { keys: candidates, error });
    })
  );
}

async function deleteUnreferencedImageKeys(env: Env, candidates: string[]): Promise<number> {
  const referencedKeys = await getReferencedImageKeys(env);
  const unreferencedKeys = candidates.filter((key) => !referencedKeys.has(key));
  if (!unreferencedKeys.length) return 0;

  await env.IMAGES.delete(unreferencedKeys);
  console.log("Deleted unreferenced R2 images", { keys: unreferencedKeys });
  return unreferencedKeys.length;
}

async function cleanupOrphanedImages(env: Env, scheduledTime: number): Promise<void> {
  const referencedKeys = await getReferencedImageKeys(env);
  const cutoff = scheduledTime - ORPHAN_IMAGE_GRACE_MS;
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const page = await env.IMAGES.list({ cursor, limit: 1000 });
    scanned += page.objects.length;

    const orphanedKeys = page.objects
      .filter(
        (object) =>
          isManagedImageKey(object.key) && object.uploaded.getTime() <= cutoff && !referencedKeys.has(object.key)
      )
      .map((object) => object.key);

    if (orphanedKeys.length) {
      await env.IMAGES.delete(orphanedKeys);
      deleted += orphanedKeys.length;
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  console.log("Completed scheduled R2 image cleanup", { scanned, deleted });
}

async function getReferencedImageKeys(env: Env): Promise<Set<string>> {
  await ensureSchema(env);
  const { results } = await env.DB.prepare("select avatar_image, link_type, link_value from picks").all<PickImageReferenceRow>();
  const settings = await env.DB.prepare("select favicon_image from site_settings where id = 1").first<{
    favicon_image: string | null;
  }>();
  const keys = new Set<string>();

  for (const row of results ?? []) {
    for (const key of imageKeysForPick(row)) {
      keys.add(key);
    }
  }

  if (isManagedImageKey(settings?.favicon_image)) {
    keys.add(settings.favicon_image);
  }

  return keys;
}

function imageKeysForPick(pick: PickImageFields): string[] {
  const keys: string[] = [];
  if (isManagedImageKey(pick.avatar_image)) keys.push(pick.avatar_image);
  if (pick.link_type === "image" && isManagedImageKey(pick.link_value)) keys.push(pick.link_value);
  return Array.from(new Set(keys));
}

async function ensureSchema(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = createSchema(env).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}

async function createSchema(env: Env): Promise<void> {
  await env.DB.prepare(
    `create table if not exists picks (
        id text primary key,
        name text not null,
        avatar_image text,
        intro text,
        platform text not null default '',
        link_type text not null default '',
        link_value text,
        tags text not null default '[]',
        sort_order integer not null default 0,
        created_at text not null,
        updated_at text not null
      )`
  ).run();

  await ensureColumns(env, "picks", [
    ["link_type", "alter table picks add column link_type text not null default ''"],
    ["link_value", "alter table picks add column link_value text"]
  ]);

  await env.DB.prepare(
    `create table if not exists site_settings (
       id integer primary key check (id = 1),
       site_name text not null,
       owner_label text not null default '',
       owner_url text not null default '',
       favicon_image text not null default '',
       analytics_code text not null default '',
       updated_at text not null
     )`
  ).run();

  await ensureColumns(env, "site_settings", [
    ["favicon_image", "alter table site_settings add column favicon_image text not null default ''"],
    ["analytics_code", "alter table site_settings add column analytics_code text not null default ''"]
  ]);

  await env.DB.prepare(
    `insert or ignore into site_settings
       (id, site_name, owner_label, owner_url, favicon_image, analytics_code, updated_at)
     values (1, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      DEFAULT_SITE_SETTINGS.site_name,
      DEFAULT_SITE_SETTINGS.owner_label,
      DEFAULT_SITE_SETTINGS.owner_url,
      DEFAULT_SITE_SETTINGS.favicon_image,
      DEFAULT_SITE_SETTINGS.analytics_code,
      new Date().toISOString()
    )
    .run();
}

async function ensureColumns(
  env: Env,
  table: "picks" | "site_settings",
  columns: [string, string][]
): Promise<void> {
  const { results } = await env.DB.prepare(`pragma table_info(${table})`).all<{ name: string }>();
  const existingColumns = new Set((results ?? []).map((column) => column.name));
  const missingColumns = columns.filter(([name]) => !existingColumns.has(name));

  if (!missingColumns.length) return;

  for (const [, statement] of missingColumns) {
    try {
      await env.DB.prepare(statement).run();
    } catch (error) {
      if (error instanceof Error && /duplicate column name/i.test(error.message)) continue;
      throw error;
    }
  }
}

function normalizePickInput(value: unknown): Required<PickInput> {
  const input = isRecord(value) ? value : {};
  const name = stringValue(input.name).trim();
  if (!name) {
    throw new HttpError("Name is required", 400);
  }

  const link = normalizePickLink(input.link_type, input.link_value);

  return {
    name,
    avatar_image: nullableString(input.avatar_image),
    intro: nullableString(input.intro),
    platform: stringValue(input.platform).trim(),
    link_type: link.type,
    link_value: link.value,
    tags: normalizeTags(input.tags)
  };
}

function normalizeSiteSettings(value: unknown): SiteSettingsInput {
  const input = isRecord(value) ? value : {};
  const siteName = stringValue(input.site_name).trim();
  const ownerLabel = stringValue(input.owner_label).trim();
  const ownerUrl = stringValue(input.owner_url).trim();
  const faviconImage = stringValue(input.favicon_image).trim();
  const analyticsCode = stringValue(input.analytics_code).trim();

  if (!siteName) throw new HttpError("Site name is required", 400);
  if (siteName.length > 60) throw new HttpError("Site name must be 60 characters or fewer", 400);
  if (ownerLabel.length > 40) throw new HttpError("Owner label must be 40 characters or fewer", 400);
  if (ownerUrl.length > 500) throw new HttpError("Owner URL must be 500 characters or fewer", 400);
  if (faviconImage && !isManagedSiteIconKey(faviconImage)) {
    throw new HttpError("Site icon must be uploaded through the site icon endpoint", 400);
  }
  if (analyticsCode.length > MAX_ANALYTICS_CODE_LENGTH) {
    throw new HttpError(`Analytics code must be ${MAX_ANALYTICS_CODE_LENGTH} characters or fewer`, 400);
  }

  if (ownerUrl) {
    try {
      const url = new URL(ownerUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      throw new HttpError("Owner URL must be a valid HTTP or HTTPS URL", 400);
    }
  }

  return {
    site_name: siteName,
    owner_label: ownerLabel,
    owner_url: ownerUrl,
    favicon_image: faviconImage,
    analytics_code: analyticsCode
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
    link_type: normalizePickLinkType(row.link_type),
    link_value: row.link_value || null,
    tags: parseTags(row.tags),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizePickLink(type: unknown, value: unknown): { type: PickLinkType; value: string | null } {
  const linkType = normalizePickLinkType(type);
  const linkValue = nullableString(value);

  if (!linkType || !linkValue) {
    return { type: "", value: null };
  }

  return { type: linkType, value: linkValue };
}

function normalizePickLinkType(value: unknown): PickLinkType {
  const type = stringValue(value).trim();
  return type === "url" || type === "image" || type === "text" ? type : "";
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

function isManagedImageKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    isSafeObjectKey(value) &&
    (value.startsWith("avatars/") || value.startsWith("links/") || value.startsWith("site-icons/"))
  );
}

function isManagedSiteIconKey(value: unknown): value is string {
  return typeof value === "string" && isSafeObjectKey(value) && value.startsWith("site-icons/");
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
