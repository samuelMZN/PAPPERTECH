import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const successMessage = location.state?.successMessage;

    if (!successMessage) {
      return;
    }

    setSuccess(successMessage);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await login(form.email, form.password);
      const role = data.user?.rol || data.user?.rol_id;
      navigate(role === "administrador" ? "/dashboard" : role === "trabajador" ? "/panel" : "/");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Iniciar sesion</h1>
        <p>Entra con tu cuenta de cliente, trabajador o administrador.</p>

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
          placeholder="Ingresa tu contrasena"
          required
        />

        {error ? <p className="message error">{error}</p> : null}
        {success ? <p className="message success">{success}</p> : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="auth-footer">
          No tienes cuenta? <Link to="/registro">Registrate aca</Link>
        </p>
      </form>
    </section>
  );
}

export default Login;
