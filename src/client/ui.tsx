import {
  type ButtonHTMLAttributes,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";
type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const dialogStack: string[] = [];
let bodyOverflowBeforeDialogs = "";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const toast = { id: crypto.randomUUID(), message, tone };
    setToasts((current) => [...current.filter((item) => item.message !== message), toast].slice(-3));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div aria-live="polite" className="toast-region">
          {toasts.map((toast) => (
            <Toast key={toast.id} onDismiss={dismissToast} toast={toast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

function Toast({ onDismiss, toast }: { onDismiss: (id: string) => void; toast: ToastItem }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), toast.tone === "error" ? 5200 : 3200);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id, toast.tone]);

  const ToneIcon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertCircle : Info;

  return (
    <div className={`toast toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
      <ToneIcon aria-hidden="true" size={18} strokeWidth={2} />
      <span>{toast.message}</span>
      <button aria-label="关闭提示" className="toast-close" onClick={() => onDismiss(toast.id)} type="button">
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className = "",
  disabled,
  icon,
  loading = false,
  size = "md",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant} button-${size} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  ...props
}: Omit<ButtonProps, "children"> & { label: string }) {
  return <Button aria-label={label} className="icon-button" title={label} {...props} />;
}

export function Dialog({
  children,
  footer,
  onClose,
  size = "md",
  title
}: {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "sm" | "md";
  title: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const dialogId = useId();
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogStack.length) bodyOverflowBeforeDialogs = document.body.style.overflow;
    dialogStack.push(dialogId);
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      "[data-autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]"
    );
    focusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (dialogStack.at(-1) !== dialogId) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]"
        )
      );
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const stackIndex = dialogStack.lastIndexOf(dialogId);
      if (stackIndex !== -1) dialogStack.splice(stackIndex, 1);
      document.body.style.overflow = dialogStack.length ? "hidden" : bodyOverflowBeforeDialogs;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dialogId]);

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`dialog-panel dialog-${size}`}
        ref={panelRef}
        role="dialog"
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={<X aria-hidden="true" size={18} />} label="关闭" onClick={() => onCloseRef.current()} variant="ghost" />
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  confirmLabel = "确认",
  description,
  loading = false,
  onCancel,
  onConfirm,
  tone = "default",
  title
}: {
  confirmLabel?: string;
  description: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "default" | "danger";
  title: string;
}) {
  return (
    <Dialog
      footer={
        <div className="dialog-footer-actions">
          <Button data-autofocus disabled={loading} onClick={onCancel} type="button" variant="secondary">
            取消
          </Button>
          <Button loading={loading} onClick={onConfirm} type="button" variant={tone === "danger" ? "danger" : "primary"}>
            {confirmLabel}
          </Button>
        </div>
      }
      onClose={loading ? () => undefined : onCancel}
      size="sm"
      title={title}
    >
      <p className="confirm-description">{description}</p>
    </Dialog>
  );
}
