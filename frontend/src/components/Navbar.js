import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { apiRequest } from "../services/api";
import { useTheme } from "../context/ThemeContext";

function Navbar() {
  const { isAuthenticated, user, token, logout, isAdministrator, isWorker, isClient } = useAuth();
  const { cartCount } = useCart();
  const { theme, isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const brandLogo = `${process.env.PUBLIC_URL || ""}/logo-pappertech.png`;
  const headerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

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

    const handleResize = () => {
      updateHeaderHeight();

      if (window.innerWidth > 640) {
        setMenuOpen(false);
      }
    };

    updateHeaderHeight();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    let intervalId;

    async function loadPendingOrders() {
      if (!token || !isClient) {
        if (active) {
          setPendingOrdersCount(0);
        }
        return;
      }

      try {
        const orders = await apiRequest("/pedidos", { token });

        if (!active) {
          return;
        }

        setPendingOrdersCount(
          orders.filter((order) => String(order.estado || "").toLowerCase() === "pendiente").length
        );
      } catch (_error) {
        if (active) {
          setPendingOrdersCount(0);
        }
      }
    }

    loadPendingOrders();

    if (token && isClient) {
      intervalId = window.setInterval(loadPendingOrders, 20000);
    }

    return () => {
      active = false;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [isClient, token, location.pathname]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate("/");
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <header className={`topbar ${menuOpen ? "is-menu-open" : ""}`} ref={headerRef}>
      <div className="topbar__main">
        <div className="brand-group">
          <Link className="brand" to="/" onClick={closeMenu}>
            <img className="brand-logo" src={brandLogo} alt="PapperTech" />
          </Link>
          <p className="brand-copy">Papeleria, inventario y pedidos en un solo lugar.</p>
        </div>

        <button
          className="topbar-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span className="topbar-menu-toggle__line" />
          <span className="topbar-menu-toggle__line" />
          <span className="topbar-menu-toggle__line" />
        </button>
      </div>

      <nav className={`topbar-links ${menuOpen ? "is-open" : ""}`}>
        <Link to="/" onClick={closeMenu}>
          Inicio
        </Link>
        <button className="theme-toggle" type="button" onClick={toggleTheme}>
          <span className="theme-toggle__icon">{isDark ? "L" : "D"}</span>
          <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
        </button>

        {isAuthenticated ? (
          <>
            {isAdministrator ? (
              <Link to="/dashboard" onClick={closeMenu}>
                Dashboard
              </Link>
            ) : null}
            {isWorker ? (
              <Link to="/panel" onClick={closeMenu}>
                Operaciones
              </Link>
            ) : null}
            {isClient ? (
              <Link className="topbar-link-with-badge" to="/panel" onClick={closeMenu}>
                <span>Mi cuenta</span>
                {pendingOrdersCount > 0 ? (
                  <span className="topbar-link__badge">{pendingOrdersCount}</span>
                ) : null}
              </Link>
            ) : null}
            {isClient ? (
              <Link className="cart-link" to="/carrito" onClick={closeMenu}>
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
            <Link to="/login" onClick={closeMenu}>
              Login
            </Link>
            <Link className="btn btn-primary" to="/registro" onClick={closeMenu}>
              Crear cuenta
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default Navbar;
