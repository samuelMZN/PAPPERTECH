import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import Cart from "../pages/Cart";
import Dashboard from "../pages/Dashboard";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Portal from "../pages/Portal";
import Register from "../pages/Register";

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <p className="status">Cargando sesion...</p>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading, role } = useAuth();

  if (loading) {
    return <p className="status">Cargando sesion...</p>;
  }

  if (!isAuthenticated) {
    return children;
  }

  if (role === "administrador") {
    return <Navigate to="/dashboard" replace />;
  }

  if (role === "trabajador") {
    return <Navigate to="/panel" replace />;
  }

  return <Navigate to="/" replace />;
}

function RoleRoute({ children, allowedRoles, fallbackPath }) {
  const { loading, role } = useAuth();

  if (loading) {
    return <p className="status">Validando permisos...</p>;
  }

  return allowedRoles.includes(role) ? children : <Navigate to={fallbackPath} replace />;
}

function AppRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app-shell">
        <Navbar />
        <main className="layout">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/registro"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <RoleRoute allowedRoles={["administrador"]} fallbackPath="/">
                    <Dashboard />
                  </RoleRoute>
                </PrivateRoute>
              }
            />
            <Route
              path="/panel"
              element={
                <PrivateRoute>
                  <RoleRoute allowedRoles={["cliente", "trabajador"]} fallbackPath="/">
                    <Portal />
                  </RoleRoute>
                </PrivateRoute>
              }
            />
            <Route
              path="/carrito"
              element={
                <PrivateRoute>
                  <RoleRoute allowedRoles={["cliente"]} fallbackPath="/">
                    <Cart />
                  </RoleRoute>
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default AppRouter;
