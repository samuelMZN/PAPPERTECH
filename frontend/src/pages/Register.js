import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ nombre: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setVerificationPreviewUrl("");
    setLoading(true);

    try {
      const response = await register(form.nombre, form.email, form.password);
      setSuccess(
        response.message ||
          "Cuenta creada correctamente. Revisa tu correo para verificarla antes de iniciar sesion."
      );
      setVerificationPreviewUrl(response.verification_preview_url || "");
      setForm({ nombre: "", email: "", password: "" });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Crear cuenta</h1>
        <p>Registra usuarios clientes directamente contra MySQL.</p>

        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          value={form.nombre}
          onChange={handleChange}
          placeholder="Samuel Palacio"
          required
        />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="correo@pappertech.com"
          required
        />

        <label htmlFor="password">Contrasena</label>
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Minimo una contrasena segura"
          required
        />

        {error ? <p className="message error">{error}</p> : null}
        {success ? <p className="message success">{success}</p> : null}
        {verificationPreviewUrl ? (
          <p className="message info">
            Enlace temporal de verificacion:{" "}
            <a href={verificationPreviewUrl}>{verificationPreviewUrl}</a>
          </p>
        ) : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Registrando..." : "Crear cuenta"}
        </button>

        <p className="auth-footer">
          Ya tienes cuenta? <Link to="/login">Inicia sesion</Link>
        </p>
      </form>
    </section>
  );
}

export default Register;
