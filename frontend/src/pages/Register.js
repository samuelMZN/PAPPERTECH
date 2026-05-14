import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(form.nombre, form.email, form.password);
      navigate("/login", {
        replace: true,
        state: {
          successMessage: "Cuenta creada correctamente. Ya puedes iniciar sesion."
        }
      });
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
