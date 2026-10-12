interface NoticeProps {
  message: string;
  tone?: "info" | "error";
  onClose?: () => void;
}

export function Notice({ message, tone = "info", onClose }: NoticeProps) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <span>{message}</span>
      {onClose && (
        <button type="button" className="notice-close" onClick={onClose}>
          Cerrar
        </button>
      )}
    </div>
  );
}
