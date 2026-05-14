const jwt = require("jsonwebtoken");

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

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no enviado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    decoded.rol = normalizeRole(decoded.rol || decoded.rol_id);
    decoded.rol_id = decoded.rol;
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalido", error: error.message });
  }
}

function allowRoles(...roles) {
  const normalizedRoles = roles.map((role) => normalizeRole(role));

  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.rol || req.user?.rol_id);

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({
        message: "No tienes permisos para realizar esta accion"
      });
    }

    req.user.rol = userRole;
    req.user.rol_id = userRole;
    return next();
  };
}

authMiddleware.allowRoles = allowRoles;
authMiddleware.normalizeRole = normalizeRole;

module.exports = authMiddleware;
