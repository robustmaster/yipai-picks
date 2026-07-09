import type { PickInput, PickItem } from "./shared/types";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: R2Bucket;
  ADMIN_TOKEN?: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === "/api/picks" && request.method === "GET") {
        return listPicks(env);
      }

      if (pathname === "/api/admin/picks" && request.method === "POST") {
        const adminResponse = requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return createPick(request, env);
      }

      const pickMatch = pathname.match(/^\/api\/admin\/picks\/([^/]+)$/);
      if (pickMatch && request.method === "PUT") {
        const adminResponse = requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return updatePick(pickMatch[1], request, env);
      }

      if (pickMatch && request.method === "DELETE") {
        const adminResponse = requireAdmin(request, env);
        if (adminResponse) return adminResponse;
        return deletePick(pickMatch[1], env);
      }

      if (pathname === "/api/admin/avatar" && request.method === "POST") {
        const adminResponse = requireAdmin(request, env);
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

function requireAdmin(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN) {
    return null;
  }

  const expected = `Bearer ${env.ADMIN_TOKEN}`;
  if (request.headers.get("authorization") === expected) {
    return null;
  }

  return json({ error: "Unauthorized" }, { status: 401 });
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
