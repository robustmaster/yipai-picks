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

type SessionResponse = {
  authenticated: boolean;
  username: string;
};

type AdminSession = {
  username: string;
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

  useEffect(() => {
    if (!tags.includes(activeTag)) {
      setActiveTag("全部");
    }
  }, [activeTag, tags]);

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
      <header className="topbar">
        <a className="brand" href="/">
          一派 Picks
        </a>
        <a className="nav-link" href="/admin">
          管理
        </a>
      </header>

      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Personal directory</p>
          <h1>
            我持续关注的创作者和<span className="nowrap">内容源</span>
          </h1>
          <p className="lead">一个更克制的个人名录，只放真正值得回访的人、博客和账号。</p>
        </div>

        <dl className="hero-stats" aria-label="统计">
          <div>
            <dt>{picks.length}</dt>
            <dd>推荐项</dd>
          </div>
          <div>
            <dt>{Math.max(tags.length - 1, 0)}</dt>
            <dd>领域标签</dd>
          </div>
          <div>
            <dt>{filteredPicks.length}</dt>
            <dd>当前结果</dd>
          </div>
        </dl>
      </section>

      <section className="filter-panel" aria-label="筛选">
        <label className="search-box">
          <span>搜索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="名字、平台、标签或简介"
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
      <div className="pick-card-head">
        <Avatar pick={pick} />
        <div className="pick-heading">
          <h2>{pick.name}</h2>
          {pick.platform ? <span>{pick.platform}</span> : null}
        </div>
      </div>

      {pick.intro ? <p className="pick-intro">{pick.intro}</p> : <p className="pick-intro muted">暂无简介</p>}

      <div className="pick-card-foot">
        {pick.tags.length ? (
          <div className="pick-tags">
            {pick.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : (
          <span className="muted">未设置标签</span>
        )}
      </div>
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
          <div className="pick-card-head">
            <div className="skeleton avatar" />
            <div className="skeleton-stack">
              <div className="skeleton skeleton-line wide" />
              <div className="skeleton skeleton-line short" />
            </div>
          </div>
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-line" />
        </div>
      ))}
    </section>
  );
}

function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/admin/session", { credentials: "same-origin" });
        if (response.status === 401) {
          if (active) setSession(null);
          return;
        }

        const data = await parseResponse<SessionResponse>(response);
        if (active) {
          setSession({ username: data.username });
        }
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setChecking(false);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return <AdminStatus title="正在检查登录状态" text="请稍候。" />;
  }

  if (!session) {
    return <AdminLogin onSuccess={(nextSession) => setSession(nextSession)} />;
  }

  return <AdminDashboard session={session} onLogout={() => setSession(null)} />;
}

function AdminStatus({ title, text }: { title: string; text: string }) {
  return (
    <main className="admin-shell centered-shell">
      <section className="login-panel">
        <p className="eyebrow">Admin</p>
        <h1>{title}</h1>
        <p className="lead">{text}</p>
      </section>
    </main>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: (session: AdminSession) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ username, password })
      });
      const data = await parseResponse<SessionResponse>(response);
      setPassword("");
      onSuccess({ username: data.username });
    } catch (loginError) {
      setMessage(errorMessage(loginError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-shell centered-shell">
      <section className="login-panel">
        <div className="login-heading">
          <p className="eyebrow">Admin</p>
          <h1>登录后台</h1>
          <p>使用 Cloudflare 环境变量里配置的用户名和密码。</p>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <label className="field">
            <span>账号</span>
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="primary-button full-button" disabled={saving} type="submit">
            {saving ? "登录中..." : "登录"}
          </button>
          {message ? <p className="form-message error">{message}</p> : null}
        </form>

        <a className="nav-link" href="/">
          返回前台
        </a>
      </section>
    </main>
  );
}

function AdminDashboard({
  session,
  onLogout
}: {
  session: AdminSession;
  onLogout: () => void;
}) {
  const { picks, loading, error, refresh, setPicks } = usePicks();
  const [form, setForm] = useState<PickForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const sortedPicks = useMemo(
    () => [...picks].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN")),
    [picks]
  );

  const tagCount = useMemo(() => new Set(picks.flatMap((pick) => pick.tags)).size, [picks]);

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

  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin"
    }).catch(() => undefined);
    onLogout();
  }

  function handleAdminError(errorValue: unknown) {
    setMessage(errorMessage(errorValue));
    if (isUnauthorizedError(errorValue)) {
      onLogout();
    }
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
        headers: jsonHeaders(),
        credentials: "same-origin",
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
      handleAdminError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deletePick(pick: PickItem) {
    if (!window.confirm(`删除「${pick.name}」？`)) return;

    try {
      const response = await fetch(`/api/admin/picks/${pick.id}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      await parseResponse<{ ok: boolean }>(response);
      setPicks((current) => current.filter((item) => item.id !== pick.id));
      if (form.id === pick.id) {
        setForm(emptyForm);
      }
      setMessage("已删除");
    } catch (deleteError) {
      handleAdminError(deleteError);
    }
  }

  async function uploadAvatar(file: File) {
    setMessage("");
    const data = new FormData();
    data.set("file", file);

    try {
      const response = await fetch("/api/admin/avatar", {
        method: "POST",
        credentials: "same-origin",
        body: data
      });
      const upload = await parseResponse<UploadResponse>(response);
      setForm((current) => ({ ...current, avatar_image: upload.key }));
      setMessage("头像已上传");
    } catch (uploadError) {
      handleAdminError(uploadError);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>管理 Picks</h1>
          <p className="lead">维护公开页展示的创作者、平台和领域标签。</p>
        </div>
        <div className="admin-actions">
          <span className="session-badge">{session.username}</span>
          <button className="secondary-button" type="button" onClick={() => void logout()}>
            退出
          </button>
          <a className="nav-link" href="/">
            前台
          </a>
        </div>
      </header>

      <section className="admin-overview" aria-label="概览">
        <div>
          <strong>{picks.length}</strong>
          <span>推荐项</span>
        </div>
        <div>
          <strong>{tagCount}</strong>
          <span>标签</span>
        </div>
        <div>
          <strong>{form.id ? "编辑" : "新增"}</strong>
          <span>当前模式</span>
        </div>
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
            <div className="form-grid">
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
            </div>

            <label className="field">
              <span>简介</span>
              <textarea
                value={form.intro}
                onChange={(event) => setForm({ ...form, intro: event.target.value })}
                rows={4}
              />
            </label>

            <div className="form-grid">
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
            </div>

            <div className="avatar-upload">
              <div className="avatar-preview">
                {form.avatar_image ? (
                  <>
                    <img src={`/media/${form.avatar_image}`} alt="头像预览" />
                    <code>{form.avatar_image}</code>
                  </>
                ) : (
                  <span className="muted">尚未上传头像</span>
                )}
              </div>

              <div className="upload-actions">
                <label className="file-button">
                  上传头像
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
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, avatar_image: "" }))}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            </div>

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
                    <p>{[pick.platform, pick.tags.join(" / ")].filter(Boolean).join(" · ") || "未设置平台和标签"}</p>
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
      const response = await fetch("/api/picks", { credentials: "same-origin" });
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
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await response.json()) as T & { error?: string })
    : ({} as T & { error?: string });

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with ${response.status}`, response.status);
  }

  return data;
}

function jsonHeaders(): HeadersInit {
  return {
    "content-type": "application/json"
  };
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

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
