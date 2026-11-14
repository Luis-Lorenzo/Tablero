import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = true,
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="modal-caja" onClick={event => event.stopPropagation()}>
        <div className="modal-cabecera">
          <div className="modal-titulo-wrap">
            <span className={`modal-icono ${danger ? "peligro" : "aviso"}`} aria-hidden="true">
              <AlertTriangle size={18} />
            </span>
            <h3 id="confirm-dialog-title">{title}</h3>
          </div>
          <button
            type="button"
            className="modal-cerrar"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <p className="modal-descripcion">{description}</p>

        <div className="modal-acciones">
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "danger-solid" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
