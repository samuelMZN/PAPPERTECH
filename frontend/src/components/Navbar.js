import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useTheme } from "../context/ThemeContext";

function Navbar() {
  const { isAuthenticated, user, logout, isAdministrator, isWorker, isClient } = useAuth();
  const { cartCount } = useCart();
  const { theme, isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const brandLogo = `${process.env.PUBLIC_URL || ""}/logo-pappertech.png`;
  const headerRef = useRef(null);

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (!headerRef.current) {
        return;
      }

      document.documentElement.style.setProperty(
        "--topbar-height",
        `${headerRef.current.offsetHeight}px`
      );
    };

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="topbar" ref={headerRef}>
      <div className="brand-group">
        <Link className="brand" to="/">
          <img className="brand-logo" src={brandLogo} alt="PapperTech" />
        </Link>
        <p className="brand-copy">Papeleria, inventario y pedidos en un solo lugar.</p>
      </div>

      <nav className="topbar-links">
        <Link to="/">Inicio</Link>
        <button className="theme-toggle" type="button" onClick={toggleTheme}>
          <span className="theme-toggle__icon">{isDark ? "L" : "D"}</span>
          <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
        </button>

        {isAuthenticated ? (
          <>
            {isAdministrator ? <Link to="/dashboard">Dashboard</Link> : null}
            {isWorker ? <Link to="/panel">Operaciones</Link> : null}
            {isClient ? <Link to="/panel">Mi cuenta</Link> : null}
            {isClient ? (
              <Link className="cart-link" to="/carrito">
                <span>Carrito</span>
                <span className="cart-count">{cartCount}</span>
              </Link>
            ) : null}
            <span className="user-chip">
              {user?.nombre || "Usuario"} - {user?.rol || ""}
            </span>
            <button className="btn btn-outline" type="button" onClick={handleLogout}>
              Cerrar sesion
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link className="btn btn-primary" to="/registro">
              Crear cuenta
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default Navbar;
