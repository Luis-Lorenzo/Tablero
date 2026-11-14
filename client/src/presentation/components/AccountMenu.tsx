import { useEffect, useRef, useState } from "react";
import { ChevronDown, Home, LogOut, Settings, User } from "lucide-react";

interface AccountMenuProps {
  /** Nombre con el que se identifica al usuario (nickname o parte del correo). */
  label: string;
  /** Muestra acceso rápido a recepción cuando estamos en otra vista. */
  showHome?: boolean;
  onGoHome?: () => void;
  /** Lleva a la página de la cuenta. */
  onOpenAccount: () => void;
  /** Cierra la sesión. */
  onLogout: () => void;
}

/**
 * Menú de cuenta en la barra superior. Se cierra al pulsar fuera o con Escape.
 */
export function AccountMenu({
  label,
  showHome = false,
  onGoHome,
  onOpenAccount,
  onLogout
}: AccountMenuProps) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return undefined;

    function alPulsarFuera(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    }

    function alPulsarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alPulsarTecla);
    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alPulsarTecla);
    };
  }, [abierto]);

  const inicial = label.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="cuenta-menu" ref={ref}>
      <button
        type="button"
        className={abierto ? "cuenta-boton abierto" : "cuenta-boton"}
        onClick={() => setAbierto(actual => !actual)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Cuenta de ${label}`}
        title={label}
      >
        <span className="cuenta-avatar" aria-hidden="true">
          {inicial}
        </span>
        <span className="cuenta-etiqueta">{label}</span>
        <ChevronDown
          size={15}
          className={abierto ? "cuenta-chevron rotado" : "cuenta-chevron"}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div className="cuenta-desplegable" role="menu">
          <div className="cuenta-cabecera-menu">
            <span className="cuenta-nombre" title={label}>
              {label}
            </span>
          </div>

          {showHome && onGoHome && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                onGoHome();
              }}
            >
              <Home size={15} aria-hidden="true" />
              <span>Recepción</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              onOpenAccount();
            }}
          >
            <User size={15} aria-hidden="true" />
            <span>Mi cuenta</span>
          </button>

          <button type="button" role="menuitem" disabled className="cuenta-item-deshabilitado">
            <Settings size={15} aria-hidden="true" />
            <span>Ajustes</span>
            <span className="cuenta-tag">Pronto</span>
          </button>

          <div className="cuenta-separador" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="salir"
            onClick={() => {
              setAbierto(false);
              onLogout();
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </div>
  );
}
