import { useEffect, useRef, useState } from "react";

interface AccountMenuProps {
  /** Nombre con el que se identifica al usuario (nickname o parte del correo). */
  label: string;
  /** Lleva a la página de la cuenta. */
  onOpenAccount: () => void;
  /** Cierra la sesión. */
  onLogout: () => void;
}

/**
 * Círculo de cuenta de la barra superior. Al pulsarlo se despliega un menú
 * pequeño con "Cuenta", "Ajustes" (todavía no funcional) y "Cerrar sesión".
 * Se cierra al pulsar fuera o con la tecla Escape.
 */
export function AccountMenu({ label, onOpenAccount, onLogout }: AccountMenuProps) {
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

  return (
    <div className="cuenta-menu" ref={ref}>
      <span className="cuenta-etiqueta" title={label}>
        {label}
      </span>

      <button
        type="button"
        className={abierto ? "cuenta-circulo abierto" : "cuenta-circulo"}
        onClick={() => setAbierto(actual => !actual)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Cuenta de ${label}`}
        title={label}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8.4" r="3.6" />
          <path d="M4.6 20c0-3.7 3.3-6.1 7.4-6.1s7.4 2.4 7.4 6.1" />
        </svg>
      </button>

      {abierto && (
        <div className="cuenta-desplegable" role="menu">
          <span className="cuenta-nombre" title={label}>
            {label}
          </span>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              onOpenAccount();
            }}
          >
            Cuenta
          </button>
          <button type="button" role="menuitem" disabled>
            Ajustes
          </button>
          <button
            type="button"
            role="menuitem"
            className="salir"
            onClick={() => {
              setAbierto(false);
              onLogout();
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
