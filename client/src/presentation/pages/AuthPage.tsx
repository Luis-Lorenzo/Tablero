import { useEffect, useState, type FormEvent } from "react";
import { Clock, Eye, EyeOff, Loader2, Lock, LogIn, Mail, Moon, Sun, UserPlus } from "lucide-react";
import { alternarModoClaro, obtenerModoClaro } from "../../preview/datos";
import { authApi } from "../../api/auth.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { LogoPocketRol } from "../components/LogoPocketRol";
import { DadoPixelD6, DadoPixelPoliedro } from "../components/Dado";

interface AuthPageProps {
  onAuthenticated: (user: PublicUser) => void;
}

type Mode = "login" | "register";

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPendingNotice, setIsPendingNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modoClaro, setModoClaro] = useState<boolean>(obtenerModoClaro);

  useEffect(() => {
    const alCambiarTema = () => setModoClaro(obtenerModoClaro());
    window.addEventListener("pocketrol:tema", alCambiarTema);
    return () => window.removeEventListener("pocketrol:tema", alCambiarTema);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setIsPendingNotice(false);

    try {
      if (mode === "register") {
        await authApi.register(email, password);
        setMode("login");
        setPassword("");
        setMessage(
          "Cuenta creada. Un administrador debe aprobarla antes de que puedas iniciar sesión."
        );
        return;
      }

      const user = await authApi.login(email, password);
      onAuthenticated(user);
    } catch (submitError) {
      const code =
        submitError && typeof submitError === "object" && "code" in submitError
          ? String((submitError as { code: unknown }).code)
          : "";
      setIsPendingNotice(code === "ACCOUNT_PENDING");
      setError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setIsPendingNotice(false);
  }

  return (
    <main className="page auth-page-rel">
      <button
        type="button"
        className={`auth-tema-btn${modoClaro ? " claro" : ""}`}
        onClick={() => setModoClaro(alternarModoClaro())}
        title={modoClaro ? "Modo claro activo (pulsa para modo oscuro)" : "Modo oscuro activo (pulsa para modo claro)"}
        aria-label={modoClaro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
        aria-pressed={modoClaro}
      >
        {modoClaro ? <Sun size={16} strokeWidth={2.2} aria-hidden="true" /> : <Moon size={16} strokeWidth={2.2} aria-hidden="true" />}
      </button>
      <div className="auth-contenedor">
        <div className="auth-logo-con-dados">
          <div className="auth-dados-lado" aria-hidden="true">
            <DadoPixelD6 cara={5} clase="rot-izq" />
          </div>
          <div className="auth-logo">
            <LogoPocketRol variante="banner" clickable={false} />
          </div>
          <div className="auth-dados-lado" aria-hidden="true">
            <DadoPixelPoliedro tipo="d20" clase="rot-der" />
          </div>
        </div>

        <section className="card auth-card">
          <h1>{mode === "login" ? "Inicia sesión" : "Crea tu cuenta"}</h1>

          <div className="tabs tabs-center">
            <button
              type="button"
              className={mode === "login" ? "tab active" : "tab"}
              onClick={() => switchMode("login")}
            >
              <LogIn size={14} aria-hidden="true" />
              <span>Iniciar sesión</span>
            </button>
            <button
              type="button"
              className={mode === "register" ? "tab active" : "tab"}
              onClick={() => switchMode("register")}
            >
              <UserPlus size={14} aria-hidden="true" />
              <span>Registrarme</span>
            </button>
          </div>

          {message && <p className="feedback ok">{message}</p>}
          {error && (
            <p className={isPendingNotice ? "feedback aviso feedback-con-icono" : "feedback ko"}>
              {isPendingNotice && <Clock size={16} aria-hidden="true" />}
              <span>{error}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="form">
            <label>
              <span>Correo electrónico</span>
              <div className="input-con-icono">
                <Mail size={16} className="input-icono" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="tu@correo.com"
                  required
                  autoComplete="email"
                />
              </div>
            </label>

            <label>
              <span>Contraseña</span>
              <div className="input-con-icono">
                <Lock size={16} className="input-icono" aria-hidden="true" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                />
                <button
                  type="button"
                  className="input-ojo"
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === "register" && (
                <span className="ayuda-campo">Mínimo 8 caracteres.</span>
              )}
            </label>

            <button type="submit" className="primary auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="icono-girando" aria-hidden="true" />
                  <span>Procesando…</span>
                </>
              ) : mode === "login" ? (
                "Entrar"
              ) : (
                "Crear cuenta"
              )}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
