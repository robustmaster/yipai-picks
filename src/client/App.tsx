import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PickInput, PickItem } from "../shared/types";

type PicksResponse = {
  picks: PickItem[];
};

type PickResponse = {
  pick: PickItem;
};

type UploadResponse = {
  key: string;
  url: string;
};

type PickForm = {
  id?: string;
  name: string;
  avatar_image: string;
  intro: string;
  platform: string;
  tags: string;
  sort_order: string;
};

const emptyForm: PickForm = {
  name: "",
  avatar_image: "",
  intro: "",
  platform: "",
  tags: "",
  sort_order: "0"
};

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <AdminPage /> : <PublicPage />;
}

function PublicPage() {
  const { picks, loading, error, refresh } = usePicks();
  const [activeTag, setActiveTag] = useState("全部");
  const [query, setQuery] = useState("");

  const tags = useMemo(() => {
    const allTags = new Set<string>();
    picks.forEach((pick) => pick.tags.forEach((tag) => allTags.add(tag)));
    return ["全部", ...Array.from(allTags).sort((a, b) => a.localeCompare(b, "zh-CN"))];
  }, [picks]);

  const filteredPicks = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return picks.filter((pick) => {
      const matchesTag = activeTag === "全部" || pick.tags.includes(activeTag);
      const matchesQuery =
        !keyword ||
        [pick.name, pick.platform, pick.intro ?? "", ...pick.tags]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return matchesTag && matchesQuery;
    });
  }, [activeTag, picks, query]);

  return (
    <main className="page-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Yipai Picks</p>
          <h1>值得关注的人</h1>
          <p className="lead">整理我认为值得持续关注的创作者、博客作者和内容源。</p>
        </div>
        <a className="admin-link" href="/admin">
          管理
        </a>
      </header>

      <section className="toolbar" aria-label="筛选">
        <label className="search-field">
          <span>搜索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="名字、平台或简介"
          />
        </label>

        <div className="tag-row" role="list" aria-label="领域标签">
          {tags.map((tag) => (
            <button
              className={tag === activeTag ? "tag-button active" : "tag-button"}
              key={tag}
              onClick={() => setActiveTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <StatusBlock title="加载失败" text={error} actionLabel="重试" onAction={refresh} />
      ) : loading ? (
        <PickGridSkeleton />
      ) : filteredPicks.length ? (
        <section className="pick-grid" aria-label="推荐列表">
          {filteredPicks.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </section>
      ) : (
        <StatusBlock
          title={picks.length ? "没有匹配结果" : "还没有推荐项"}
          text={picks.length ? "换个标签或搜索词试试。" : "进入管理页添加第一位作者。"}
        />
      )}
    </main>
  );
}

function PickCard({ pick }: { pick: PickItem }) {
  return (
    <article className="pick-card">
      <div className="pick-card-main">
        <Avatar pick={pick} />
        <div>
          <div className="pick-title-row">
            <h2>{pick.name}</h2>
            {pick.platform ? <span className="platform-pill">{pick.platform}</span> : null}
          </div>
          {pick.intro ? <p className="pick-intro">{pick.intro}</p> : null}
        </div>
      </div>

      {pick.tags.length ? (
        <div className="pick-tags">
          {pick.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Avatar({ pick }: { pick: PickItem }) {
  if (pick.avatar_url) {
    return <img className="avatar" src={pick.avatar_url} alt={`${pick.name} 头像`} loading="lazy" />;
  }

  return (
    <div className="avatar avatar-placeholder" aria-hidden="true">
      {pick.name.slice(0, 1)}
    </div>
  );
}

function PickGridSkeleton() {
  return (
    <section className="pick-grid" aria-label="加载中">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="pick-card skeleton-card" key={index}>
          <div className="skeleton avatar" />
          <div className="skeleton skeleton-line wide" />
          <div className="skeleton skeleton-line" />
        </div>
      ))}
    </section>
  );
}

function AdminPage() {
  const { picks, loading, error, refresh, setPicks } = usePicks();
  const [token, setToken] = useState(() => localStorage.getItem("admin_token") ?? "");
  const [form, setForm] = useState<PickForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (token) {
      localStorage.setItem("admin_token", token);
    } else {
      localStorage.removeItem("admin_token");
    }
  }, [token]);

  const sortedPicks = useMemo(
    () => [...picks].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN")),
    [picks]
  );

  function editPick(pick: PickItem) {
    setMessage("");
    setForm({
      id: pick.id,
      name: pick.name,
      avatar_image: pick.avatar_image ?? "",
      intro: pick.intro ?? "",
      platform: pick.platform,
      tags: pick.tags.join("，"),
      sort_order: String(pick.sort_order)
    });
  }

  async function savePick(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const payload: PickInput = {
      name: form.name,
      avatar_image: form.avatar_image || null,
      intro: form.intro || null,
      platform: form.platform,
      tags: splitTags(form.tags),
      sort_order: Number(form.sort_order) || 0
    };

    try {
      const url = form.id ? `/api/admin/picks/${form.id}` : "/api/admin/picks";
      const response = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        headers: adminHeaders(token),
        body: JSON.stringify(payload)
      });

      const data = await parseResponse<PickResponse>(response);
      if (form.id) {
        setPicks((current) => current.map((pick) => (pick.id === data.pick.id ? data.pick : pick)));
      } else {
        setPicks((current) => [...current, data.pick]);
      }

      setForm(emptyForm);
      setMessage("已保存");
    } catch (saveError) {
      setMessage(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deletePick(pick: PickItem) {
    if (!window.confirm(`删除「${pick.name}」？`)) return;

    try {
      const response = await fetch(`/api/admin/picks/${pick.id}`, {
        method: "DELETE",
        headers: adminHeaders(token)
      });
      await parseResponse<{ ok: boolean }>(response);
      setPicks((current) => current.filter((item) => item.id !== pick.id));
      if (form.id === pick.id) {
        setForm(emptyForm);
      }
      setMessage("已删除");
    } catch (deleteError) {
      setMessage(errorMessage(deleteError));
    }
  }

  async function uploadAvatar(file: File) {
    setMessage("");
    const data = new FormData();
    data.set("file", file);

    try {
      const response = await fetch("/api/admin/avatar", {
        method: "POST",
        headers: adminHeaders(token, false),
        body: data
      });
      const upload = await parseResponse<UploadResponse>(response);
      setForm((current) => ({ ...current, avatar_image: upload.key }));
      setMessage("头像已上传");
    } catch (uploadError) {
      setMessage(errorMessage(uploadError));
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>管理 Picks</h1>
        </div>
        <a className="admin-link" href="/">
          返回前台
        </a>
      </header>

      <section className="admin-token">
        <label className="field">
          <span>管理令牌</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="如果设置了 ADMIN_TOKEN，在这里填写"
            type="password"
          />
        </label>
      </section>

      <div className="admin-layout">
        <section className="editor-panel">
          <div className="panel-heading">
            <h2>{form.id ? "编辑推荐项" : "新增推荐项"}</h2>
            <button className="text-button" type="button" onClick={() => setForm(emptyForm)}>
              新建
            </button>
          </div>

          <form className="pick-form" onSubmit={savePick}>
            <label className="field">
              <span>名字</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>

            <label className="field">
              <span>平台</span>
              <input
                value={form.platform}
                onChange={(event) => setForm({ ...form, platform: event.target.value })}
                placeholder="B站、抖音、微信公众号、博客"
              />
            </label>

            <label className="field">
              <span>简介</span>
              <textarea
                value={form.intro}
                onChange={(event) => setForm({ ...form, intro: event.target.value })}
                rows={4}
              />
            </label>

            <label className="field">
              <span>标签</span>
              <input
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="政治，体育，心理"
              />
            </label>

            <label className="field">
              <span>排序</span>
              <input
                inputMode="numeric"
                value={form.sort_order}
                onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
              />
            </label>

            <label className="field">
              <span>头像</span>
              <input
                accept="image/*"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {form.avatar_image ? (
              <div className="avatar-preview">
                <img src={`/media/${form.avatar_image}`} alt="头像预览" />
                <code>{form.avatar_image}</code>
              </div>
            ) : null}

            <div className="form-actions">
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "保存中..." : "保存"}
              </button>
              {message ? <span className="form-message">{message}</span> : null}
            </div>
          </form>
        </section>

        <section className="list-panel">
          <div className="panel-heading">
            <h2>已有推荐项</h2>
            <button className="text-button" onClick={refresh} type="button">
              刷新
            </button>
          </div>

          {error ? (
            <StatusBlock title="加载失败" text={error} />
          ) : loading ? (
            <p className="muted">加载中...</p>
          ) : sortedPicks.length ? (
            <div className="admin-list">
              {sortedPicks.map((pick) => (
                <article className="admin-list-item" key={pick.id}>
                  <Avatar pick={pick} />
                  <div>
                    <h3>{pick.name}</h3>
                    <p>{[pick.platform, pick.tags.join(" / ")].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="row-actions">
                    <button className="text-button" type="button" onClick={() => editPick(pick)}>
                      编辑
                    </button>
                    <button className="danger-button" type="button" onClick={() => void deletePick(pick)}>
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">还没有推荐项。</p>
          )}
        </section>
      </div>
    </main>
  );
}

function usePicks() {
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/picks");
      const data = await parseResponse<PicksResponse>(response);
      setPicks(data.picks);
    } catch (fetchError) {
      setError(errorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { picks, setPicks, loading, error, refresh };
}

function StatusBlock({
  title,
  text,
  actionLabel,
  onAction
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="status-block">
      <h2>{title}</h2>
      <p>{text}</p>
      {actionLabel && onAction ? (
        <button className="primary-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

function adminHeaders(token: string, includeJson = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJson) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function splitTags(tags: string): string[] {
  return Array.from(
    new Set(
      tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}
