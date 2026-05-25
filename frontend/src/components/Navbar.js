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
  const shouldShowPendingOrders = isAuthenticated && (isAdministrator || isWorker || isClient);

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
      if (!token || !shouldShowPendingOrders) {
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

        const visibleStatuses = isClient
          ? new Set(["pendiente", "en_preparacion"])
          : new Set(["pendiente"]);

        setPendingOrdersCount(
          orders.filter((order) => visibleStatuses.has(String(order.estado || "").toLowerCase())).length
        );
      } catch (_error) {
        if (active) {
          setPendingOrdersCount(0);
        }
      }
    }

    loadPendingOrders();

    if (token && shouldShowPendingOrders) {
      intervalId = window.setInterval(loadPendingOrders, 20000);
    }

    return () => {
      active = false;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [isClient, location.pathname, shouldShowPendingOrders, token]);

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

      <div className="topbar-feature-slot" id="topbar-feature-slot" />

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
              <Link className="topbar-link-with-badge" to="/dashboard" onClick={closeMenu}>
                <span>Dashboard</span>
                {pendingOrdersCount > 0 ? (
                  <span className="section-tab__badge topbar-link__badge">{pendingOrdersCount}</span>
                ) : null}
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
                  <span className="section-tab__badge topbar-link__badge">{pendingOrdersCount}</span>
                ) : null}
              </Link>
            ) : null}
            {isClient ? (
              <Link className="cart-link" to="/carrito" onClick={closeMenu}>
                <span>Carrito</span>
                <span className="section-tab__badge cart-count">{cartCount}</span>
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
