"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncButton from "./AsyncButton";

export type ToastVariant = "success" | "error" | "info" | "warning";

type DialogOptions = {
  title: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  inputLabel?: string;
  initialValue?: string;
  required?: boolean;
  maxLength?: number;
  confirmationText?: string;
};

type DialogState = DialogOptions & {
  mode: "confirm" | "input";
  resolve: (value: boolean | string | null) => void;
  action?: () => Promise<boolean | void>;
};

type Toast = { id: number; message: string; variant: ToastVariant };

type FeedbackContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
  confirm: (options: DialogOptions) => Promise<boolean>;
  confirmAction: (options: DialogOptions, action: () => Promise<boolean | void>) => Promise<boolean>;
  prompt: (options: DialogOptions) => Promise<string | null>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useAppFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useAppFeedback must be used inside AppFeedbackProvider");
  return value;
}

export default function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);
  const nextToastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    if (!message.trim()) return;
    const id = ++nextToastId.current;
    setToasts((current) => [...current.slice(-3), { id, message, variant }]);
    const duration = variant === "error" ? 8_000 : variant === "warning" ? 6_000 : 4_500;
    window.setTimeout(() => dismissToast(id), duration);
  }, [dismissToast]);

  const openDialog = useCallback((state: DialogState) => {
    setInputValue(state.initialValue ?? "");
    setDialogError("");
    setDialogLoading(false);
    setDialog(state);
  }, []);

  const confirm = useCallback((options: DialogOptions) => new Promise<boolean>((resolve) => {
    openDialog({ ...options, mode: "confirm", resolve: (value) => resolve(Boolean(value)) });
  }), [openDialog]);

  const confirmAction = useCallback((options: DialogOptions, action: () => Promise<boolean | void>) => new Promise<boolean>((resolve) => {
    openDialog({ ...options, mode: "confirm", action, resolve: (value) => resolve(Boolean(value)) });
  }), [openDialog]);

  const prompt = useCallback((options: DialogOptions) => new Promise<string | null>((resolve) => {
    openDialog({ ...options, mode: "input", resolve: (value) => resolve(typeof value === "string" ? value : null) });
  }), [openDialog]);

  const cancelDialog = useCallback(() => {
    if (!dialog || dialogLoading) return;
    dialog.resolve(dialog.mode === "confirm" ? false : null);
    setDialog(null);
  }, [dialog, dialogLoading]);

  async function submitDialog() {
    if (!dialog || dialogLoading) return;
    const value = inputValue.trim();
    if ((dialog.required || dialog.confirmationText) && !value) {
      setDialogError(dialog.confirmationText ? `Ketik ${dialog.confirmationText} untuk melanjutkan.` : "Isian ini wajib diisi.");
      return;
    }
    if (dialog.confirmationText && value !== dialog.confirmationText) {
      setDialogError(`Ketik ${dialog.confirmationText} persis seperti yang ditampilkan.`);
      return;
    }
    if (dialog.action) {
      setDialogLoading(true);
      try {
        const succeeded = await dialog.action();
        if (succeeded === false) return;
      } catch {
        setDialogError("Aksi gagal diproses. Periksa koneksi lalu coba lagi.");
        return;
      } finally {
        setDialogLoading(false);
      }
    }
    dialog.resolve(dialog.mode === "input" ? value : true);
    setDialog(null);
  }

  useEffect(() => {
    if (!dialog) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelDialog();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDialog, dialog]);

  const contextValue = useMemo(() => ({ toast, confirm, confirmAction, prompt }), [confirm, confirmAction, prompt, toast]);

  return <FeedbackContext.Provider value={contextValue}>
    {children}
    <div className="toast-viewport" aria-live="polite" aria-label="Notifikasi aplikasi">
      {toasts.map((item) => <div className={`app-toast toast-${item.variant}`} key={item.id} role={item.variant === "error" ? "alert" : "status"}>
        <span>{item.message}</span>
        <button type="button" aria-label="Tutup notifikasi" onClick={() => dismissToast(item.id)}>&times;</button>
      </div>)}
    </div>
    {dialog && <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelDialog(); }}>
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">{dialog.title}</h2>
        {dialog.description && <p>{dialog.description}</p>}
        {(dialog.mode === "input" || dialog.confirmationText) && <label>{dialog.inputLabel ?? "Isian"}
          <input
            autoFocus
            autoComplete="off"
            maxLength={dialog.maxLength}
            value={inputValue}
            onChange={(event) => { setInputValue(event.target.value); setDialogError(""); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitDialog(); } }}
          />
        </label>}
        {dialogError && <p className="app-dialog-error" role="alert">{dialogError}</p>}
        <div className="app-dialog-actions">
          <button className="secondary-button" type="button" disabled={dialogLoading} onClick={cancelDialog}>{dialog.cancelLabel ?? "Batal"}</button>
          <AsyncButton
            className={dialog.danger ? "danger-button" : "primary-button"}
            type="button"
            disabled={Boolean(dialog.confirmationText && inputValue.trim() !== dialog.confirmationText)}
            loading={dialogLoading}
            loadingText="Memproses..."
            onClick={() => void submitDialog()}
          >
            {dialog.confirmLabel ?? "Lanjutkan"}
          </AsyncButton>
        </div>
      </section>
    </div>}
  </FeedbackContext.Provider>;
}
