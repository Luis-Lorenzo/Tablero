import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Moon,
  RefreshCw,
  Sun,
  WifiOff,
  XCircle
} from "lucide-react";
import { authApi } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { alternarModoClaro, obtenerModoClaro } from "../../preview/datos";
import { DadoPixelD6, DadoPixelPoliedro } from "../components/Dado";
import { LogoPocketRol } from "../components/LogoPocketRol";
import { describeError } from "../errorMessages";

export type VerifyStatus =
  | "checking"
  | "success"
  | "expired"
  | "invalid"
  | "network_error"
  | "already_verified";

interface VerifyEmailPageProps {
  token: string;
  onGoToLogin: () => void;
}

export function VerifyEmailPage({ token, onGoToLogin }: VerifyEmailPageProps) {
  const [status, setStatus] = useState<VerifyStatus>(() =>
    token.trim() ? "checking" : "invalid"
  );
  const [resendEmail, setResendEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [modoClaro, setModoClaro] = useState<boolean>(obtenerModoClaro);
  const verifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const alCambiarTema = () => setModoClaro(obtenerModoClaro());
    window.addEventListener("pocketrol:tema", alCambiarTema);
    return () => window.removeEventListener("pocketrol:tema", alCambiarTema);
  }, []);

  const ejecutarVerificacion = useCallback(async (rawToken: string) => {
    const clean = rawToken.trim();
    if (!clean) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    try {
      await authApi.verifyEmail(clean);
      setStatus("success");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "EXPIRED_VERIFICATION_TOKEN") {
          setStatus("expired");
          return;
        }
        if (err.code === "EMAIL_ALREADY_VERIFIED") {
          setStatus("already_verified");
          return;
        }
        if (err.code === "NETWORK_ERROR" || err.status === 0) {
          setStatus("network_error");
          return;
        }
      }
      setStatus("invalid");
    }
  }, []);

  useEffect(() => {
    if (verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;
    void ejecutarVerificacion(token);
  }, [token, ejecutarVerificacion]);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resendEmail.trim() || resendBusy) return;
    setResendBusy(true);
    setResendError(null);
    setResendSuccess(null);
    try {
      await authApi.resendVerification(resendEmail.trim());
      setResendSuccess(
        "Si la cuenta existe y está pendiente de verificar, te hemos enviado un nuevo enlace (válido durante 30 minutos)."
      );
    } catch (err) {
      setResendError(describeError(err));
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <main className="page auth-page-rel">
      <button
        type="button"
        className={`auth-tema-btn${modoClaro ? " claro" : ""}`}
        onClick={() => setModoClaro(alternarModoClaro())}
        title={
          modoClaro
            ? "Modo claro activo (pulsa para modo oscuro)"
            : "Modo oscuro activo (pulsa para modo claro)"
        }
        aria-label={modoClaro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
        aria-pressed={modoClaro}
      >
        {modoClaro ? (
          <Sun size={16} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <Moon size={16} strokeWidth={2.2} aria-hidden="true" />
        )}
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

        <section className="card auth-card verify-card">
          {status === "checking" && (
            <div className="verify-estado">
              <div className="verify-icono-caja checking" aria-hidden="true">
                <Loader2 size={28} className="icono-girando" />
              </div>
              <h1>Comprobando correo electrónico</h1>
              <p className="muted">
                Estamos validando tu enlace de verificación con el servidor…
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="verify-estado">
              <div className="verify-icono-caja ok" aria-hidden="true">
                <CheckCircle2 size={28} />
              </div>
              <h1>Correo verificado correctamente</h1>
              <p className="feedback ok">
                ¡Tu cuenta de Pocket Rol ya está activa! Ya puedes iniciar sesión y entrar a las mesas.
              </p>
              <button
                type="button"
                className="primary auth-submit"
                onClick={onGoToLogin}
              >
                <span>Ir a iniciar sesión</span>
              </button>
            </div>
          )}

          {status === "already_verified" && (
            <div className="verify-estado">
              <div className="verify-icono-caja ok" aria-hidden="true">
                <CheckCircle2 size={28} />
              </div>
              <h1>Correo ya verificado</h1>
              <p className="feedback ok">
                Esta dirección de correo electrónico ya había sido verificada anteriormente.
              </p>
              <button
                type="button"
                className="primary auth-submit"
                onClick={onGoToLogin}
              >
                <span>Ir a iniciar sesión</span>
              </button>
            </div>
          )}

          {status === "expired" && (
            <div className="verify-estado">
              <div className="verify-icono-caja aviso" aria-hidden="true">
                <Clock size={28} />
              </div>
              <h1>Enlace caducado</h1>
              <p className="feedback aviso feedback-con-icono">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  El enlace de verificación ha superado los 30 minutos de validez. Solicita un correo nuevo a continuación.
                </span>
              </p>

              <form onSubmit={handleResend} className="form verify-reenvio-form">
                <label>
                  <span>Tu correo electrónico</span>
                  <div className="input-con-icono">
                    <Mail size={16} className="input-icono" aria-hidden="true" />
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={e => setResendEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </label>

                {resendSuccess && <p className="feedback ok">{resendSuccess}</p>}
                {resendError && <p className="feedback ko">{resendError}</p>}

                <button
                  type="submit"
                  className="primary auth-submit"
                  disabled={resendBusy}
                >
                  {resendBusy ? (
                    <>
                      <Loader2 size={16} className="icono-girando" aria-hidden="true" />
                      <span>Enviando…</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={15} aria-hidden="true" />
                      <span>Reenviar correo de verificación</span>
                    </>
                  )}
                </button>
              </form>

              <button type="button" className="ghost" onClick={onGoToLogin}>
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Volver al inicio de sesión</span>
              </button>
            </div>
          )}

          {status === "invalid" && (
            <div className="verify-estado">
              <div className="verify-icono-caja ko" aria-hidden="true">
                <XCircle size={28} />
              </div>
              <h1>Enlace inválido</h1>
              <p className="feedback ko">
                El enlace de verificación no es válido o ya fue utilizado. Si aún no has activado tu cuenta, puedes solicitar un nuevo correo.
              </p>

              <form onSubmit={handleResend} className="form verify-reenvio-form">
                <label>
                  <span>Solicitar nuevo enlace (opcional)</span>
                  <div className="input-con-icono">
                    <Mail size={16} className="input-icono" aria-hidden="true" />
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={e => setResendEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </label>

                {resendSuccess && <p className="feedback ok">{resendSuccess}</p>}
                {resendError && <p className="feedback ko">{resendError}</p>}

                <button
                  type="submit"
                  className="ghost"
                  disabled={resendBusy}
                >
                  {resendBusy ? (
                    <>
                      <Loader2 size={15} className="icono-girando" aria-hidden="true" />
                      <span>Enviando…</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={15} aria-hidden="true" />
                      <span>Reenviar correo de verificación</span>
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                className="primary auth-submit"
                onClick={onGoToLogin}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Volver al inicio de sesión</span>
              </button>
            </div>
          )}

          {status === "network_error" && (
            <div className="verify-estado">
              <div className="verify-icono-caja ko" aria-hidden="true">
                <WifiOff size={28} />
              </div>
              <h1>Error de conexión</h1>
              <p className="feedback ko">
                No se pudo conectar con el servidor para comprobar tu correo. Revisa tu conexión e inténtalo de nuevo.
              </p>
              <div className="verify-acciones-fila">
                <button
                  type="button"
                  className="primary auth-submit"
                  onClick={() => void ejecutarVerificacion(token)}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Reintentar</span>
                </button>
                <button type="button" className="ghost" onClick={onGoToLogin}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  <span>Volver al inicio de sesión</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
