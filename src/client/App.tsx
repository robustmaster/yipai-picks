import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AlertCircle,
  CircleUserRound,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Link2Off,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Type,
  Upload
} from "lucide-react";
import { DEFAULT_SITE_SETTINGS } from "../shared/types";
import type { PickInput, PickItem, PickLinkType, SiteSettings, SiteSettingsInput } from "../shared/types";
import { Button, ConfirmDialog, Dialog, IconButton, ToastProvider, useToast } from "./ui";

type PicksResponse = { picks: PickItem[] };
type PickResponse = { pick: PickItem };
type SiteSettingsResponse = { settings: SiteSettings };
type UploadResponse = { key: string; url: string };
type SessionResponse = { authenticated: boolean; username: string };
type AdminSession = { username: string };

type PickForm = {
  id?: string;
  name: string;
  avatar_image: string;
  intro: string;
  platform: string;
  link_type: PickLinkType;
  link_value: string;
  tags: string;
};

type PickFormErrors = Partial<Record<"name" | "link_value", string>>;
type SiteSettingsErrors = Partial<Record<keyof SiteSettings, string>>;
type EditorState = { mode: "create" | "edit"; form: PickForm };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const emptyForm: PickForm = {
  name: "",
  avatar_image: "",
  intro: "",
  platform: "",
  link_type: "",
  link_value: "",
  tags: ""
};

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return <ToastProvider>{isAdmin ? <AdminPage /> : <PublicPage />}</ToastProvider>;
}

function PublicPage() {
  const { picks, loading, error, refresh } = usePicks();
  const { settings } = useSiteSettings();
  const { activeTag, filteredPicks, setActiveTag, tags } = useTagFilter(picks);

  return (
    <main className="page-shell">
      <Topbar
        actions={
          <a className="button button-secondary button-sm nav-button" href="/admin">
            <Settings aria-hidden="true" size={16} />
            <span>管理</span>
          </a>
        }
        settings={settings}
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

function Topbar({ actions, settings }: { actions: ReactNode; settings: SiteSettings }) {
  return (
    <header className="topbar">
      <div className="brand-group">
        <a className="brand" href="/">
          {settings.site_name}
        </a>
        {settings.owner_label ? (
          settings.owner_url ? (
            <a className="brand-owner" href={settings.owner_url} rel="noreferrer" target="_blank">
              {settings.owner_label}
            </a>
          ) : (
            <span className="brand-owner">{settings.owner_label}</span>
          )
        ) : null}
      </div>
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
            aria-pressed={tag === activeTag}
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
  onEdit,
  onRetry,
  picks
}: {
  emptyText: string;
  emptyTitle: string;
  error: string;
  loading: boolean;
  onEdit?: (pick: PickItem) => void;
  onRetry: () => void;
  picks: PickItem[];
}) {
  if (error) {
    return <StatusBlock title="加载失败" text={error} actionLabel="重试" onAction={onRetry} />;
  }
  if (loading) return <PickGridSkeleton />;
  if (!picks.length) return <StatusBlock title={emptyTitle} text={emptyText} />;

  return (
    <section className="pick-grid" aria-label="推荐列表">
      {picks.map((pick) => (
        <PickCard key={pick.id} onEdit={onEdit} pick={pick} />
      ))}
    </section>
  );
}

function PickCard({ onEdit, pick }: { onEdit?: (pick: PickItem) => void; pick: PickItem }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const canAccess = hasPickLink(pick);
  const className = ["pick-card", onEdit ? "admin-pick-card" : "", canAccess ? "pick-card-clickable" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <article className={className}>
        {canAccess ? (
          pick.link_type === "url" ? (
            <a
              aria-label={`访问 ${pick.name}`}
              className="pick-card-target"
              href={normalizeHref(pick.link_value)}
              rel="noreferrer"
              target="_blank"
            />
          ) : (
            <button
              aria-label={`查看 ${pick.name} 的访问方式`}
              className="pick-card-target"
              onClick={() => setViewerOpen(true)}
              type="button"
            />
          )
        ) : null}
        {onEdit ? (
          <IconButton
            className="card-edit-button"
            icon={<Pencil aria-hidden="true" size={15} />}
            label={`编辑 ${pick.name}`}
            onClick={() => onEdit(pick)}
            size="sm"
            type="button"
            variant="secondary"
          />
        ) : null}
        <div className="pick-card-layout">
          <Avatar pick={pick} />
          <div className="pick-heading">
            <h2>{pick.name}</h2>
            {pick.platform ? <span>{pick.platform}</span> : null}
          </div>
          {pick.intro ? <p className="pick-intro">{pick.intro}</p> : null}
          {pick.tags.length ? (
            <div className="pick-tags">
              {pick.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      </article>
      {viewerOpen && canAccess && pick.link_type !== "url" ? (
        <PickAccessDialog onClose={() => setViewerOpen(false)} pick={pick} />
      ) : null}
    </>
  );
}

function PickAccessDialog({ onClose, pick }: { onClose: () => void; pick: PickItem & { link_value: string } }) {
  const { showToast } = useToast();

  return (
    <Dialog
      footer={
        <div className="dialog-footer-actions">
          {pick.link_type === "image" ? (
            <a
              className="button button-secondary button-md"
              href={`/media/${pick.link_value}`}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" size={16} />
              <span>新窗口打开</span>
            </a>
          ) : (
            <Button
              icon={<Copy aria-hidden="true" size={16} />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pick.link_value);
                  showToast("文本已复制", "success");
                } catch {
                  showToast("复制失败，请手动选择文本", "error");
                }
              }}
              type="button"
              variant="primary"
            >
              复制文本
            </Button>
          )}
        </div>
      }
      onClose={onClose}
      size="sm"
      title={pick.name}
    >
      {pick.link_type === "image" ? (
        <img className="link-image-preview" src={`/media/${pick.link_value}`} alt={`${pick.name} 链接图片`} />
      ) : (
        <pre className="link-text-value">{pick.link_value}</pre>
      )}
    </Dialog>
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
          <div className="pick-card-layout">
            <div className="skeleton avatar" />
            <div className="skeleton-stack">
              <div className="skeleton skeleton-line wide" />
              <div className="skeleton skeleton-line short" />
            </div>
            <div className="skeleton skeleton-line skeleton-intro" />
            <div className="pick-tags">
              <div className="skeleton skeleton-pill" />
            </div>
          </div>
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
    void (async () => {
      try {
        const response = await fetch("/api/admin/session", { credentials: "same-origin" });
        if (response.status === 401) {
          if (active) setSession(null);
          return;
        }
        const data = await parseResponse<SessionResponse>(response);
        if (active) setSession({ username: data.username });
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (checking) return <AdminStatus />;
  if (!session) return <AdminLogin onSuccess={setSession} />;
  return <AdminDashboard onUnauthorized={() => setSession(null)} />;
}

function AdminStatus() {
  return (
    <main className="admin-shell centered-shell">
      <section className="login-panel loading-panel">
        <div className="skeleton skeleton-line wide" />
        <div className="skeleton skeleton-line short" />
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
    } catch (error) {
      setMessage(errorMessage(error));
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
            <input autoComplete="username" data-autofocus required value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message ? (
            <p className="inline-alert inline-alert-error" role="alert">
              <AlertCircle aria-hidden="true" size={16} />
              <span>{message}</span>
            </p>
          ) : null}
          <Button className="full-button" loading={saving} type="submit" variant="primary">
            登录
          </Button>
        </form>
        <a className="button button-secondary button-md full-button login-back-link" href="/">
          返回前台
        </a>
      </section>
    </main>
  );
}

function AdminDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { picks, loading, error, refresh, setPicks } = usePicks();
  const { settings, setSettings } = useSiteSettings();
  const { activeTag, filteredPicks, setActiveTag, tags } = useTagFilter(picks);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    window.location.assign("/");
  }

  function handleSaved(savedPick: PickItem) {
    setPicks((current) => {
      const exists = current.some((pick) => pick.id === savedPick.id);
      return exists ? current.map((pick) => (pick.id === savedPick.id ? savedPick : pick)) : [...current, savedPick];
    });
    setEditor(null);
  }

  return (
    <main className="page-shell">
      <Topbar
        actions={
          <>
            <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => setEditor({ mode: "create", form: emptyForm })} size="sm" variant="primary">
              新增
            </Button>
            <AdminMenu onLogout={() => void logout()} onOpenSettings={() => setSettingsOpen(true)} />
          </>
        }
        settings={settings}
      />
      <TagFilter activeTag={activeTag} onChange={setActiveTag} tags={tags} />
      <PickGrid
        emptyText={picks.length ? "换个标签试试。" : "点击右上角新增。"}
        emptyTitle={picks.length ? "没有匹配结果" : "还没有推荐项"}
        error={error}
        loading={loading}
        onEdit={(pick) => setEditor({ mode: "edit", form: pickToForm(pick) })}
        onRetry={refresh}
        picks={filteredPicks}
      />
      {editor ? (
        <PickEditorDialog
          initialForm={editor.form}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onDeleted={(id) => {
            setPicks((current) => current.filter((pick) => pick.id !== id));
            setEditor(null);
          }}
          onSaved={handleSaved}
          onUnauthorized={onUnauthorized}
        />
      ) : null}
      {settingsOpen ? (
        <SiteSettingsDialog
          initialSettings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(savedSettings) => {
            setSettings(savedSettings);
            setSettingsOpen(false);
          }}
          onUnauthorized={onUnauthorized}
        />
      ) : null}
    </main>
  );
}

function AdminMenu({ onLogout, onOpenSettings }: { onLogout: () => void; onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="account-menu" ref={menuRef}>
      <IconButton
        aria-expanded={open}
        icon={<CircleUserRound aria-hidden="true" size={18} />}
        label="账户菜单"
        onClick={() => setOpen((current) => !current)}
        size="sm"
        variant="secondary"
      />
      {open ? (
        <div className="account-popover" role="menu">
          <Button
            icon={<Settings aria-hidden="true" size={16} />}
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            size="sm"
            variant="ghost"
          >
            网站设置
          </Button>
          <Button icon={<LogOut aria-hidden="true" size={16} />} onClick={onLogout} size="sm" variant="ghost">
            退出登录
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SiteSettingsDialog({
  initialSettings,
  onClose,
  onSaved,
  onUnauthorized
}: {
  initialSettings: SiteSettings;
  onClose: () => void;
  onSaved: (settings: SiteSettings) => void;
  onUnauthorized: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<SiteSettings>(initialSettings);
  const [errors, setErrors] = useState<SiteSettingsErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialSettings);
  const validationErrors = validateSiteSettings(form);
  const valid = Object.keys(validationErrors).length === 0;

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function validateField(field: keyof SiteSettings) {
    const nextErrors = validateSiteSettings(form);
    setErrors((current) => ({ ...current, [field]: nextErrors[field] }));
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateSiteSettings(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload: SiteSettingsInput = {
      site_name: form.site_name.trim(),
      owner_label: form.owner_label.trim(),
      owner_url: form.owner_url.trim()
    };

    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: jsonHeaders(),
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const data = await parseResponse<SiteSettingsResponse>(response);
      showToast("网站设置已保存", "success");
      onSaved(data.settings);
    } catch (error) {
      if (isUnauthorizedError(error)) onUnauthorized();
      showToast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog
        footer={
          <div className="dialog-footer-actions">
            <Button onClick={requestClose} type="button" variant="secondary">
              取消
            </Button>
            <Button
              disabled={!dirty || !valid}
              form="site-settings-form"
              loading={saving}
              type="submit"
              variant="primary"
            >
              保存
            </Button>
          </div>
        }
        onClose={requestClose}
        size="sm"
        title="网站设置"
      >
        <form className="pick-form" id="site-settings-form" onSubmit={saveSettings}>
          <Field label="网站名称" error={errors.site_name}>
            <input
              data-autofocus
              maxLength={60}
              onBlur={() => validateField("site_name")}
              onChange={(event) => setForm((current) => ({ ...current, site_name: event.target.value }))}
              placeholder="一派 Picks"
              value={form.site_name}
            />
          </Field>
          <Field label="署名文字" error={errors.owner_label}>
            <input
              maxLength={40}
              onBlur={() => validateField("owner_label")}
              onChange={(event) => setForm((current) => ({ ...current, owner_label: event.target.value }))}
              placeholder="@胡一派"
              value={form.owner_label}
            />
          </Field>
          <Field label="署名链接" error={errors.owner_url}>
            <input
              maxLength={500}
              onBlur={() => validateField("owner_url")}
              onChange={(event) => setForm((current) => ({ ...current, owner_url: event.target.value }))}
              placeholder="https://yipai.me"
              type="url"
              value={form.owner_url}
            />
          </Field>
        </form>
      </Dialog>

      {confirmDiscard ? (
        <ConfirmDialog
          confirmLabel="放弃修改"
          description="当前网站设置尚未保存，关闭后将无法恢复。"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onClose}
          tone="danger"
          title="放弃未保存的修改？"
        />
      ) : null}
    </>
  );
}

function PickEditorDialog({
  initialForm,
  mode,
  onClose,
  onDeleted,
  onSaved,
  onUnauthorized
}: {
  initialForm: PickForm;
  mode: "create" | "edit";
  onClose: () => void;
  onDeleted: (id: string) => void;
  onSaved: (pick: PickItem) => void;
  onUnauthorized: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<PickForm>(initialForm);
  const [errors, setErrors] = useState<PickFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLink, setUploadingLink] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingLinkType, setPendingLinkType] = useState<PickLinkType | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<string | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const validationErrors = validatePickForm(form);
  const valid = Object.keys(validationErrors).length === 0;
  const busy = saving || deleting || uploadingAvatar || uploadingLink;

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);
  useEffect(() => () => {
    if (linkPreview) URL.revokeObjectURL(linkPreview);
  }, [linkPreview]);

  function updateForm(values: Partial<PickForm>) {
    setForm((current) => ({ ...current, ...values }));
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function validateField(field: "name" | "link_value") {
    const nextErrors = validatePickForm(form);
    setErrors((current) => ({ ...current, [field]: nextErrors[field] }));
  }

  function requestLinkType(type: PickLinkType) {
    if (uploadingLink || type === form.link_type) return;
    if (form.link_value) setPendingLinkType(type);
    else updateForm({ link_type: type, link_value: "" });
  }

  async function savePick(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validatePickForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    const normalizedForm = form.link_type === "url" ? { ...form, link_value: normalizeHref(form.link_value) } : form;
    const payload: PickInput = {
      name: normalizedForm.name.trim(),
      avatar_image: normalizedForm.avatar_image || null,
      intro: normalizedForm.intro || null,
      platform: normalizedForm.platform.trim(),
      link_type: normalizedForm.link_type,
      link_value: normalizedForm.link_value || null,
      tags: splitTags(normalizedForm.tags)
    };

    try {
      const url = normalizedForm.id ? `/api/admin/picks/${normalizedForm.id}` : "/api/admin/picks";
      const response = await fetch(url, {
        method: normalizedForm.id ? "PUT" : "POST",
        headers: jsonHeaders(),
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const data = await parseResponse<PickResponse>(response);
      showToast(mode === "edit" ? "修改已保存" : "推荐项已新增", "success");
      onSaved(data.pick);
    } catch (error) {
      if (isUnauthorizedError(error)) onUnauthorized();
      showToast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, kind: "avatar" | "link") {
    const fileError = validateImageFile(file);
    if (fileError) {
      showToast(fileError, "error");
      return;
    }

    const preview = URL.createObjectURL(file);
    if (kind === "avatar") {
      setAvatarPreview(preview);
      setUploadingAvatar(true);
    } else {
      setLinkPreview(preview);
      setUploadingLink(true);
    }

    const data = new FormData();
    data.set("file", file);
    try {
      const response = await fetch(kind === "avatar" ? "/api/admin/avatar" : "/api/admin/link-image", {
        method: "POST",
        credentials: "same-origin",
        body: data
      });
      const upload = await parseResponse<UploadResponse>(response);
      updateForm(kind === "avatar" ? { avatar_image: upload.key } : { link_value: upload.key });
      showToast(kind === "avatar" ? "头像上传完成" : "链接图片上传完成", "success");
    } catch (error) {
      if (isUnauthorizedError(error)) onUnauthorized();
      showToast(errorMessage(error), "error");
      if (kind === "avatar") setAvatarPreview(null);
      else setLinkPreview(null);
    } finally {
      if (kind === "avatar") setUploadingAvatar(false);
      else setUploadingLink(false);
    }
  }

  async function deletePick() {
    if (!form.id) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/picks/${form.id}`, { method: "DELETE", credentials: "same-origin" });
      await parseResponse<{ ok: boolean }>(response);
      showToast("推荐项已删除", "success");
      onDeleted(form.id);
    } catch (error) {
      if (isUnauthorizedError(error)) onUnauthorized();
      showToast(errorMessage(error), "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const footer = (
    <div className="editor-footer">
      <div>
        {mode === "edit" ? (
          <Button icon={<Trash2 aria-hidden="true" size={16} />} onClick={() => setConfirmDelete(true)} type="button" variant="ghost">
            删除
          </Button>
        ) : null}
      </div>
      <div className="editor-footer-actions">
        <Button onClick={requestClose} type="button" variant="secondary">取消</Button>
        <Button
          disabled={!dirty || !valid || uploadingAvatar || uploadingLink}
          form="pick-editor-form"
          loading={saving}
          type="submit"
          variant="primary"
        >
          保存
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog footer={footer} onClose={requestClose} title={mode === "edit" ? "编辑推荐项" : "新增推荐项"}>
        <form className="pick-form" id="pick-editor-form" onSubmit={savePick}>
          <div className="form-grid">
            <Field label="名字" error={errors.name}>
              <input
                data-autofocus
                required
                value={form.name}
                onBlur={() => validateField("name")}
                onChange={(event) => updateForm({ name: event.target.value })}
              />
            </Field>
            <Field label="平台">
              <input value={form.platform} onChange={(event) => updateForm({ platform: event.target.value })} placeholder="B站、抖音、微信公众号、博客" />
            </Field>
          </div>

          <Field label="简介">
            <textarea value={form.intro} onChange={(event) => updateForm({ intro: event.target.value })} rows={4} />
          </Field>

          <Field label="标签">
            <input value={form.tags} onChange={(event) => updateForm({ tags: event.target.value })} placeholder="政治，体育，心理" />
          </Field>

          <UploadField
            imageSrc={avatarPreview ?? (form.avatar_image ? `/media/${form.avatar_image}` : null)}
            label="头像"
            loading={uploadingAvatar}
            onFile={(file) => void uploadImage(file, "avatar")}
            onRemove={() => {
              setAvatarPreview(null);
              updateForm({ avatar_image: "" });
            }}
          />

          <section className="link-editor" aria-labelledby="link-editor-title">
            <div className="section-heading">
              <h3 id="link-editor-title">访问方式</h3>
            </div>
            <div className="segmented-control" role="group" aria-label="链接类型">
              {([
                ["", "无链接", <Link2Off aria-hidden="true" size={15} />],
                ["url", "URL", <ExternalLink aria-hidden="true" size={15} />],
                ["image", "图片", <ImageIcon aria-hidden="true" size={15} />],
                ["text", "文本", <Type aria-hidden="true" size={15} />]
              ] as [PickLinkType, string, ReactNode][]).map(([type, label, icon]) => (
                <button
                  aria-pressed={form.link_type === type}
                  className={form.link_type === type ? "segment active" : "segment"}
                  disabled={uploadingLink}
                  key={type || "none"}
                  onClick={() => requestLinkType(type)}
                  type="button"
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {form.link_type === "url" ? (
              <Field label="URL" error={errors.link_value}>
                <input
                  value={form.link_value}
                  onBlur={() => validateField("link_value")}
                  onChange={(event) => updateForm({ link_value: event.target.value })}
                  placeholder="https://example.com"
                />
              </Field>
            ) : null}

            {form.link_type === "text" ? (
              <Field label="文本" error={errors.link_value} meta={`${form.link_value.length} 字`}>
                <textarea
                  value={form.link_value}
                  onBlur={() => validateField("link_value")}
                  onChange={(event) => updateForm({ link_value: event.target.value })}
                  rows={3}
                />
              </Field>
            ) : null}

            {form.link_type === "image" ? (
              <>
                <UploadField
                  imageSrc={linkPreview ?? (form.link_value ? `/media/${form.link_value}` : null)}
                  label="链接图片"
                  loading={uploadingLink}
                  onFile={(file) => void uploadImage(file, "link")}
                  onRemove={() => {
                    setLinkPreview(null);
                    updateForm({ link_value: "" });
                  }}
                  preserveRatio
                />
                {errors.link_value ? <p className="field-error">{errors.link_value}</p> : null}
              </>
            ) : null}
          </section>
        </form>
      </Dialog>

      {confirmDiscard ? (
        <ConfirmDialog
          confirmLabel="放弃修改"
          description="当前修改尚未保存，关闭后将无法恢复。"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onClose}
          tone="danger"
          title="放弃未保存的修改？"
        />
      ) : null}

      {pendingLinkType !== null ? (
        <ConfirmDialog
          confirmLabel="切换"
          description="切换链接类型会清空当前链接内容。"
          onCancel={() => setPendingLinkType(null)}
          onConfirm={() => {
            if (form.link_type === "image") setLinkPreview(null);
            updateForm({ link_type: pendingLinkType, link_value: "" });
            setErrors((current) => ({ ...current, link_value: undefined }));
            setPendingLinkType(null);
          }}
          title="切换链接类型？"
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          confirmLabel="删除"
          description={`删除「${form.name}」后无法恢复，关联且未被其他推荐项使用的图片也会被自动清理。`}
          loading={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void deletePick()}
          tone="danger"
          title={`删除「${form.name}」？`}
        />
      ) : null}
    </>
  );
}

function Field({
  children,
  error,
  label,
  meta
}: {
  children: ReactNode;
  error?: string;
  label: string;
  meta?: string;
}) {
  return (
    <label className={error ? "field field-invalid" : "field"}>
      <span className="field-label">
        <span>{label}</span>
        {meta ? <small>{meta}</small> : null}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

function UploadField({
  imageSrc,
  label,
  loading,
  onFile,
  onRemove,
  preserveRatio = false
}: {
  imageSrc: string | null;
  label: string;
  loading: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  preserveRatio?: boolean;
}) {
  return (
    <section className="upload-field">
      <div className={preserveRatio ? "upload-preview preserve-ratio" : "upload-preview"}>
        {imageSrc ? <img src={imageSrc} alt={`${label}预览`} /> : <ImageIcon aria-hidden="true" size={20} />}
      </div>
      <div className="upload-copy">
        <strong>{label}</strong>
        <span>PNG、JPG、WebP，最大 5MB</span>
      </div>
      <div className="upload-actions">
        <label className={loading ? "button button-secondary button-sm file-trigger disabled" : "button button-secondary button-sm file-trigger"}>
          <Upload aria-hidden="true" size={15} />
          <span>{loading ? "上传中" : imageSrc ? "替换" : "上传"}</span>
          <input
            accept="image/*"
            disabled={loading}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {imageSrc ? <Button disabled={loading} onClick={onRemove} size="sm" type="button" variant="ghost">移除</Button> : null}
      </div>
    </section>
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

function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings", { credentials: "same-origin" });
        const data = await parseResponse<SiteSettingsResponse>(response);
        if (active) setSettings(data.settings);
      } catch {
        // Defaults keep the header usable if settings cannot be loaded.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.title = settings.site_name;
  }, [settings.site_name]);

  return { settings, setSettings };
}

function useTagFilter(picks: PickItem[]) {
  const [activeTag, setActiveTag] = useState("全部");
  const tags = useMemo(() => {
    const allTags = new Set<string>();
    picks.forEach((pick) => pick.tags.forEach((tag) => allTags.add(tag)));
    return ["全部", ...Array.from(allTags).sort((a, b) => a.localeCompare(b, "zh-CN"))];
  }, [picks]);

  useEffect(() => {
    if (!tags.includes(activeTag)) setActiveTag("全部");
  }, [activeTag, tags]);

  const filteredPicks = useMemo(
    () => picks.filter((pick) => activeTag === "全部" || pick.tags.includes(activeTag)),
    [activeTag, picks]
  );
  return { activeTag, filteredPicks, setActiveTag, tags };
}

function StatusBlock({
  actionLabel,
  onAction,
  text,
  title
}: {
  actionLabel?: string;
  onAction?: () => void;
  text: string;
  title: string;
}) {
  return (
    <section className="status-block">
      <h2>{title}</h2>
      <p>{text}</p>
      {actionLabel && onAction ? <Button onClick={onAction} variant="primary">{actionLabel}</Button> : null}
    </section>
  );
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
    tags: pick.tags.join("，")
  };
}

function validatePickForm(form: PickForm): PickFormErrors {
  const errors: PickFormErrors = {};
  if (!form.name.trim()) errors.name = "请输入名字";

  if (form.link_type && !form.link_value.trim()) {
    errors.link_value = form.link_type === "image" ? "请上传链接图片" : "请输入链接内容";
  } else if (form.link_type === "url" && form.link_value.trim()) {
    try {
      const url = new URL(normalizeHref(form.link_value.trim()));
      if (url.protocol !== "http:" && url.protocol !== "https:") errors.link_value = "仅支持 HTTP 或 HTTPS URL";
    } catch {
      errors.link_value = "请输入有效的 URL";
    }
  }
  return errors;
}

function validateSiteSettings(settings: SiteSettings): SiteSettingsErrors {
  const errors: SiteSettingsErrors = {};
  const siteName = settings.site_name.trim();
  const ownerLabel = settings.owner_label.trim();
  const ownerUrl = settings.owner_url.trim();

  if (!siteName) errors.site_name = "请输入网站名称";
  else if (siteName.length > 60) errors.site_name = "网站名称不能超过 60 个字符";
  if (ownerLabel.length > 40) errors.owner_label = "署名文字不能超过 40 个字符";

  if (ownerUrl) {
    try {
      const url = new URL(ownerUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") errors.owner_url = "仅支持 HTTP 或 HTTPS URL";
    } catch {
      errors.owner_url = "请输入有效的 URL";
    }
  }

  return errors;
}

function validateImageFile(file: File): string {
  if (!file.type.startsWith("image/")) return "仅支持图片文件";
  if (file.size > MAX_IMAGE_BYTES) return "图片不能超过 5MB";
  return "";
}

function hasPickLink(pick: PickItem): pick is PickItem & { link_value: string } {
  return Boolean(pick.link_type && pick.link_value);
}

function normalizeHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await response.json()) as T & { error?: string })
    : ({} as T & { error?: string });
  if (!response.ok) throw new ApiError(data.error || `Request failed with ${response.status}`, response.status);
  return data;
}

function jsonHeaders(): HeadersInit {
  return { "content-type": "application/json" };
}

function splitTags(tags: string): string[] {
  return Array.from(new Set(tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
