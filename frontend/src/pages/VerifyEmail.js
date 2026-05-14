import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../services/api";

function VerifyEmail() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Validando tu enlace de verificacion...");

  useEffect(() => {
    let active = true;
    const token = String(params.get("token") || "").trim();

    async function verify() {
      if (!token) {
        if (active) {
          setStatus("error");
          setMessage("El enlace de verificacion es invalido o esta incompleto.");
        }
        return;
      }

      try {
        const response = await apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`);

        if (active) {
          setStatus("success");
          setMessage(response.message || "Correo verificado correctamente.");
        }
      } catch (requestError) {
        if (active) {
          setStatus("error");
          setMessage(requestError.message);
        }
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [params]);

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1>Verificacion de correo</h1>
        <p>{message}</p>

        {status === "loading" ? <p className="status">Procesando...</p> : null}
        {status === "success" ? <p className="message success">{message}</p> : null}
        {status === "error" ? <p className="message error">{message}</p> : null}

        <p className="auth-footer">
          <Link to="/login">Ir a iniciar sesion</Link>
        </p>
      </div>
    </section>
  );
}

export default VerifyEmail;
