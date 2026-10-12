import { useState, type FormEvent } from "react";
import { authApi } from "../../api/auth.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";

interface AuthPageProps {
  notice?: string | null;
  onAuthenticated: (user: PublicUser) => void;
}

type Mode = "login" | "register";

export function AuthPage({ notice, onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(notice ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "register") {
        await authApi.register(email, password);
        setMode("login");
        setPassword("");
        setMessage(
          "Cuenta creada. Revisa tu correo (y la carpeta de spam) para confirmarla antes de iniciar sesión."
        );
        return;
      }

      const user = await authApi.login(email, password);
      onAuthenticated(user);
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  return (
    <main className="page">
      <section className="card auth-card">
        <p className="eyebrow">TABLERO DE ROL</p>
        <h1>{mode === "login" ? "Inicia sesión" : "Crea tu cuenta"}</h1>

        <div className="tabs tabs-center">
          <button
            type="button"
            className={mode === "login" ? "tab active" : "tab"}
            onClick={() => switchMode("login")}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={mode === "register" ? "tab active" : "tab"}
            onClick={() => switchMode("register")}
          >
            Registrarme
          </button>
        </div>

        {message && <p className="feedback ok">{message}</p>}
        {error && <p className="feedback ko">{error}</p>}

        <form onSubmit={handleSubmit} className="form">
          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
            />
          </label>

          <button type="submit" className="primary" disabled={busy}>
            {busy
              ? "Procesando…"
              : mode === "login"
                ? "Entrar"
                : "Crear cuenta"}
          </button>
        </form>

        <div className="divider"><span>o</span></div>

        <a className="google" href={authApi.googleLoginUrl}>
          Continuar con Google
        </a>
      </section>
    </main>
  );
}
