import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { PickInput, PickItem, PickLinkType } from "../shared/types";

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
  link_type: PickLinkType;
  link_value: string;
  tags: string;
  sort_order: string;
};

type EditorState = {
  mode: "create" | "edit";
  form: PickForm;
};

const emptyForm: PickForm = {
  name: "",
  avatar_image: "",
  intro: "",
  platform: "",
  link_type: "",
  link_value: "",
  tags: "",
  sort_order: "0"
};

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <AdminPage /> : <PublicPage />;
}

function PublicPage() {
  const { picks, loading, error, refresh } = usePicks();
  const { activeTag, filteredPicks, setActiveTag, tags } = useTagFilter(picks);

  return (
    <main className="page-shell">
      <Topbar
        actions={
          <a className="nav-link" href="/admin">
            管理
          </a>
        }
      />

      <TagFilter activeTag={activeTag} onChange={setActiveTag} tags={tags} />

      <PickGrid
        emptyText={picks.length ? "换个标签试试。" : "还没有推荐项。"}
        emptyTitle={picks.length ? "没有匹配结果" : "还没有推荐项"}
        error={error}
        loading={loading}
        onRetry={refresh}
        picks={filteredPicks}
      />
    </main>
  );
}

function Topbar({ actions }: { actions: ReactNode }) {
  return (
    <header className="topbar">
      <a className="brand" href="/">
        一派 Picks
      </a>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

function TagFilter({
  activeTag,
  onChange,
  tags
}: {
  activeTag: string;
  onChange: (tag: string) => void;
  tags: string[];
}) {
  return (
    <section className="filter-panel" aria-label="筛选">
      <div className="tag-row" role="list" aria-label="领域标签">
        {tags.map((tag) => (
          <button
            className={tag === activeTag ? "tag-button active" : "tag-button"}
            key={tag}
            onClick={() => onChange(tag)}
            type="button"
          >
            {tag}
          </button>
        ))}
      </div>
    </section>
  );
}

function PickGrid({
  emptyText,
  emptyTitle,
  error,
  loading,
  onRetry,
  picks,
  renderActions
}: {
  emptyText: string;
  emptyTitle: string;
  error: string;
  loading: boolean;
  onRetry: () => void;
  picks: PickItem[];
  renderActions?: (pick: PickItem) => ReactNode;
}) {
  if (error) {
    return <StatusBlock title="加载失败" text={error} actionLabel="重试" onAction={onRetry} />;
  }

  if (loading) {
    return <PickGridSkeleton />;
  }

  if (!picks.length) {
    return <StatusBlock title={emptyTitle} text={emptyText} />;
  }

  return (
    <section className="pick-grid" aria-label="推荐列表">
      {picks.map((pick) => (
        <PickCard actions={renderActions?.(pick)} key={pick.id} pick={pick} />
      ))}
    </section>
  );
}

function PickCard({ actions, pick }: { actions?: ReactNode; pick: PickItem }) {
  const hasActions = Boolean(actions) || hasPickLink(pick);

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
        {hasActions ? (
          <div className="card-actions">
            <PickLinkAction pick={pick} />
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PickLinkAction({ pick }: { pick: PickItem }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!hasPickLink(pick)) return null;

  if (pick.link_type === "url") {
    return (
      <a className="link-action" href={normalizeHref(pick.link_value)} rel="noreferrer" target="_blank">
        访问
      </a>
    );
  }

  return (
    <>
      <button className="link-action" type="button" onClick={() => setViewerOpen(true)}>
        {pick.link_type === "image" ? "图片" : "文本"}
      </button>
      {viewerOpen ? <PickLinkModal onClose={() => setViewerOpen(false)} pick={pick} /> : null}
    </>
  );
}

function PickLinkModal({ onClose, pick }: { onClose: () => void; pick: PickItem }) {
  const [copied, setCopied] = useState(false);
  const linkValue = pick.link_value ?? "";

  async function copyText() {
    await navigator.clipboard.writeText(linkValue);
    setCopied(true);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section aria-label={`${pick.name} 链接`} aria-modal="true" className="modal-panel link-modal" role="dialog">
        <div className="modal-heading">
          <h2>{pick.name}</h2>
          <button className="secondary-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        {pick.link_type === "image" ? (
          <img className="link-image-preview" src={`/media/${linkValue}`} alt={`${pick.name} 链接图片`} />
        ) : (
          <>
            <pre className="link-text-value">{linkValue}</pre>
            <button className="primary-button compact-button" type="button" onClick={() => void copyText()}>
              {copied ? "已复制" : "复制"}
            </button>
          </>
        )}
      </section>
    </div>
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

  return <AdminDashboard onLogout={() => setSession(null)} />;
}

function AdminStatus({ title, text }: { title: string; text: string }) {
  return (
    <main className="admin-shell centered-shell">
      <section className="login-panel">
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
          <h1>登录后台</h1>
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

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { picks, loading, error, refresh, setPicks } = usePicks();
  const { activeTag, filteredPicks, setActiveTag, tags } = useTagFilter(picks);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const sortedPicks = useMemo(
    () => [...filteredPicks].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN")),
    [filteredPicks]
  );

  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin"
    }).catch(() => undefined);
    onLogout();
  }

  function handleUnauthorized(errorValue: unknown) {
    if (isUnauthorizedError(errorValue)) {
      onLogout();
    }
  }

  function openCreate() {
    setEditor({ mode: "create", form: emptyForm });
  }

  function openEdit(pick: PickItem) {
    setEditor({ mode: "edit", form: pickToForm(pick) });
  }

  function handleSaved(savedPick: PickItem) {
    setPicks((current) => {
      const exists = current.some((pick) => pick.id === savedPick.id);
      return exists ? current.map((pick) => (pick.id === savedPick.id ? savedPick : pick)) : [...current, savedPick];
    });
    setEditor(null);
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
    } catch (deleteError) {
      handleUnauthorized(deleteError);
      window.alert(errorMessage(deleteError));
    }
  }

  return (
    <main className="page-shell">
      <Topbar
        actions={
          <>
            <button className="primary-button compact-button" onClick={openCreate} type="button">
              新增
            </button>
            <button className="secondary-button" type="button" onClick={() => void logout()}>
              退出
            </button>
          </>
        }
      />

      <TagFilter activeTag={activeTag} onChange={setActiveTag} tags={tags} />

      <PickGrid
        emptyText={picks.length ? "换个标签试试。" : "点击右上角新增。"}
        emptyTitle={picks.length ? "没有匹配结果" : "还没有推荐项"}
        error={error}
        loading={loading}
        onRetry={refresh}
        picks={sortedPicks}
        renderActions={(pick) => (
          <>
            <button className="text-button" type="button" onClick={() => openEdit(pick)}>
              编辑
            </button>
            <button className="danger-button" type="button" onClick={() => void deletePick(pick)}>
              删除
            </button>
          </>
        )}
      />

      {editor ? (
        <PickEditorModal
          initialForm={editor.form}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
          onUnauthorized={onLogout}
        />
      ) : null}
    </main>
  );
}

function PickEditorModal({
  initialForm,
  mode,
  onClose,
  onSaved,
  onUnauthorized
}: {
  initialForm: PickForm;
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: (pick: PickItem) => void;
  onUnauthorized: () => void;
}) {
  const [form, setForm] = useState<PickForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function handleError(errorValue: unknown) {
    setMessage(errorMessage(errorValue));
    if (isUnauthorizedError(errorValue)) {
      onUnauthorized();
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
      link_type: form.link_type,
      link_value: form.link_value || null,
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
      onSaved(data.pick);
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setSaving(false);
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
      handleError(uploadError);
    }
  }

  async function uploadLinkImage(file: File) {
    setMessage("");
    const data = new FormData();
    data.set("file", file);

    try {
      const response = await fetch("/api/admin/link-image", {
        method: "POST",
        credentials: "same-origin",
        body: data
      });
      const upload = await parseResponse<UploadResponse>(response);
      setForm((current) => ({ ...current, link_value: upload.key }));
      setMessage("链接图片已上传");
    } catch (uploadError) {
      handleError(uploadError);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section aria-labelledby="pick-editor-title" aria-modal="true" className="modal-panel" role="dialog">
        <div className="modal-heading">
          <h2 id="pick-editor-title">{mode === "edit" ? "编辑推荐项" : "新增推荐项"}</h2>
          <button className="secondary-button" type="button" onClick={onClose}>
            关闭
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

          <div className="link-editor">
            <div className="form-grid">
              <label className="field">
                <span>链接类型</span>
                <select
                  value={form.link_type}
                  onChange={(event) =>
                    setForm({ ...form, link_type: event.target.value as PickLinkType, link_value: "" })
                  }
                >
                  <option value="">不设置</option>
                  <option value="url">URL</option>
                  <option value="image">图片</option>
                  <option value="text">文本</option>
                </select>
              </label>

              {form.link_type === "url" ? (
                <label className="field">
                  <span>URL</span>
                  <input
                    value={form.link_value}
                    onChange={(event) => setForm({ ...form, link_value: event.target.value })}
                    placeholder="https://example.com"
                  />
                </label>
              ) : null}
            </div>

            {form.link_type === "text" ? (
              <label className="field">
                <span>文本</span>
                <textarea
                  value={form.link_value}
                  onChange={(event) => setForm({ ...form, link_value: event.target.value })}
                  rows={3}
                />
              </label>
            ) : null}

            {form.link_type === "image" ? (
              <div className="avatar-upload">
                <div className="avatar-preview">
                  {form.link_value ? (
                    <>
                      <img src={`/media/${form.link_value}`} alt="链接图片预览" />
                      <code>{form.link_value}</code>
                    </>
                  ) : (
                    <span className="muted">尚未上传链接图片</span>
                  )}
                </div>

                <div className="upload-actions">
                  <label className="file-button">
                    上传图片
                    <input
                      accept="image/*"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadLinkImage(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {form.link_value ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, link_value: "" }))}
                    >
                      移除
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="form-actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "保存中..." : "保存"}
            </button>
            {message ? <span className="form-message">{message}</span> : null}
          </div>
        </form>
      </section>
    </div>
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

function useTagFilter(picks: PickItem[]) {
  const [activeTag, setActiveTag] = useState("全部");

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

  const filteredPicks = useMemo(
    () => picks.filter((pick) => activeTag === "全部" || pick.tags.includes(activeTag)),
    [activeTag, picks]
  );

  return { activeTag, filteredPicks, setActiveTag, tags };
}

function pickToForm(pick: PickItem): PickForm {
  return {
    id: pick.id,
    name: pick.name,
    avatar_image: pick.avatar_image ?? "",
    intro: pick.intro ?? "",
    platform: pick.platform,
    link_type: pick.link_type,
    link_value: pick.link_value ?? "",
    tags: pick.tags.join("，"),
    sort_order: String(pick.sort_order)
  };
}

function hasPickLink(pick: PickItem): pick is PickItem & { link_value: string } {
  return Boolean(pick.link_type && pick.link_value);
}

function normalizeHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
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
