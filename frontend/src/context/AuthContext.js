import { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "../services/api";

const AuthContext = createContext(null);
const AUTH_SESSION_VERSION = "2026-05-09-auth-v3";
const AUTH_VERSION_KEY = "pappertech-auth-version";
const SESSION_TOKEN_KEY = "token";
const SESSION_USER_KEY = "user";
const SHARED_AUTH_KEY = "pappertech-shared-auth";

function getStorage(kind) {
  if (typeof window === "undefined") {
    return null;
  }

  return window[kind];
}

function readSessionValue(key) {
  const session = getStorage("sessionStorage");

  if (!session) {
    return null;
  }

  return session.getItem(key);
}

function parseStoredUser(value) {
  if (!value) {
    return null;
  }

  try {
    const parsedUser = typeof value === "string" ? JSON.parse(value) : value;

    return {
      ...parsedUser,
      rol: normalizeRole(parsedUser?.rol || parsedUser?.rol_id),
      rol_id: normalizeRole(parsedUser?.rol || parsedUser?.rol_id)
    };
  } catch (_error) {
    return null;
  }
}

function readSharedAuth() {
  const local = getStorage("localStorage");

  if (!local) {
    return null;
  }

  try {
    const rawValue = local.getItem(SHARED_AUTH_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (parsedValue?.version !== AUTH_SESSION_VERSION || !parsedValue?.token) {
      return null;
    }

    const parsedUser = parseStoredUser(parsedValue.user);

    if (!parsedUser) {
      return null;
    }

    return {
      token: parsedValue.token,
      user: parsedUser
    };
  } catch (_error) {
    return null;
  }
}

function bootstrapAuthStorage() {
  const session = getStorage("sessionStorage");
  const local = getStorage("localStorage");

  if (!session) {
    return;
  }

  const currentVersion = session.getItem(AUTH_VERSION_KEY);

  if (currentVersion !== AUTH_SESSION_VERSION) {
    session.removeItem(SESSION_TOKEN_KEY);
    session.removeItem(SESSION_USER_KEY);
    session.setItem(AUTH_VERSION_KEY, AUTH_SESSION_VERSION);
  }

  const sharedAuth = readSharedAuth();

  if (!sharedAuth) {
    session.removeItem(SESSION_TOKEN_KEY);
    session.removeItem(SESSION_USER_KEY);
    local?.removeItem(SHARED_AUTH_KEY);
    return;
  }

  session.setItem(SESSION_TOKEN_KEY, sharedAuth.token);
  session.setItem(SESSION_USER_KEY, JSON.stringify(sharedAuth.user));
}

function normalizeRole(role) {
  const normalized = String(role || "").toLowerCase().trim();

  if (["admin", "administrador"].includes(normalized)) {
    return "administrador";
  }

  if (["trabajador", "worker", "staff"].includes(normalized)) {
    return "trabajador";
  }

  if (["cliente", "client"].includes(normalized)) {
    return "cliente";
  }

  return normalized;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    bootstrapAuthStorage();
    return readSharedAuth()?.token || readSessionValue(SESSION_TOKEN_KEY);
  });
  const [user, setUser] = useState(() => {
    const sharedAuth = readSharedAuth();

    if (sharedAuth?.user) {
      return sharedAuth.user;
    }

    return parseStoredUser(readSessionValue(SESSION_USER_KEY));
  });
  const [loading, setLoading] = useState(Boolean(token));
  const role = normalizeRole(user?.rol || user?.rol_id);
  const isAdministrator = role === "administrador";
  const isWorker = role === "trabajador";
  const isClient = role === "cliente";

  useEffect(() => {
    bootstrapAuthStorage();
  }, []);

  useEffect(() => {
    const session = getStorage("sessionStorage");

    if (token) {
      session?.setItem(SESSION_TOKEN_KEY, token);
    } else {
      session?.removeItem(SESSION_TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    const session = getStorage("sessionStorage");

    if (user) {
      session?.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      session?.removeItem(SESSION_USER_KEY);
    }
  }, [user]);

  useEffect(() => {
    const local = getStorage("localStorage");

    if (!local) {
      return;
    }

    if (token && user) {
      local.setItem(
        SHARED_AUTH_KEY,
        JSON.stringify({
          version: AUTH_SESSION_VERSION,
          token,
          user
        })
      );
    } else {
      local.removeItem(SHARED_AUTH_KEY);
    }
  }, [token, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncAuthFromStorage = (event) => {
      if (event.key !== SHARED_AUTH_KEY) {
        return;
      }

      const sharedAuth = readSharedAuth();

      if (!sharedAuth) {
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      setToken(sharedAuth.token);
      setUser(sharedAuth.user);
      setLoading(false);
    };

    window.addEventListener("storage", syncAuthFromStorage);

    return () => {
      window.removeEventListener("storage", syncAuthFromStorage);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const perfil = await apiRequest("/auth/perfil", { token });

        if (active) {
          setUser({
            ...perfil,
            rol: normalizeRole(perfil.rol || perfil.rol_id),
            rol_id: normalizeRole(perfil.rol || perfil.rol_id)
          });
        }
      } catch (_error) {
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [token]);

  const login = async (email, password) => {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password }
    });

    setToken(data.token);
    setUser({
      ...data.user,
      rol: normalizeRole(data.user?.rol || data.user?.rol_id),
      rol_id: normalizeRole(data.user?.rol || data.user?.rol_id)
    });
    setLoading(false);

    return data;
  };

  const register = async (nombre, email, password) => {
    return apiRequest("/auth/register", {
      method: "POST",
      body: { nombre, email, password }
    });
  };

  const updateProfile = async (payload) => {
    const data = await apiRequest("/auth/perfil", {
      method: "PUT",
      token,
      body: payload
    });

    if (data.user) {
      setUser({
        ...data.user,
        rol: normalizeRole(data.user?.rol || data.user?.rol_id),
        rol_id: normalizeRole(data.user?.rol || data.user?.rol_id)
      });
    }

    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        loading,
        isAuthenticated: Boolean(token),
        isAdmin: isAdministrator,
        isAdministrator,
        isWorker,
        isClient,
        login,
        register,
        updateProfile,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
