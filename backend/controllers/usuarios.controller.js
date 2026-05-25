const bcrypt = require("bcryptjs");
const db = require("../config/db");
const authMiddleware = require("../middleware/auth");
const { logAudit } = require("../utils/audit");
const { generateValidationToken } = require("../utils/validation-token");

function sanitizeUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: authMiddleware.normalizeRole(user.rol),
    telefono: user.telefono || "",
    direccion: user.direccion || "",
    activo: Number(user.activo ?? 1),
    token_validacion: user.token_validacion || user.email_verificacion_token || "",
    creado_en: user.creado_en,
    actualizado_en: user.actualizado_en
  };
}

function normalizeWritableRole(role) {
  const normalized = authMiddleware.normalizeRole(role);

  if (!["cliente", "trabajador", "administrador"].includes(normalized)) {
    return null;
  }

  return normalized;
}

exports.getUsuarios = async (_req, res) => {
  try {
    const [usuarios] = await db.promise().query(`
      SELECT
        id,
        nombre,
        email,
        rol,
        telefono,
        direccion,
        activo,
        email_verificacion_token,
        creado_en,
        actualizado_en
      FROM usuarios
      ORDER BY activo DESC, creado_en DESC, id DESC
    `);

    return res.json(usuarios.map(sanitizeUser));
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener usuarios", error: error.message });
  }
};

exports.crearUsuario = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const rol = normalizeWritableRole(req.body.rol);
  const telefono = String(req.body.telefono || "").trim();
  const direccion = String(req.body.direccion || "").trim();
  const activo = req.body.activo === undefined ? 1 : Number(Boolean(req.body.activo));

  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ message: "Nombre, correo, contrasena y rol son obligatorios" });
  }

  try {
    const [duplicados] = await db.promise().execute(
      "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    if (duplicados.length > 0) {
      return res.status(400).json({ message: "Ya existe un usuario con ese correo" });
    }

    const hash = bcrypt.hashSync(password, 10);
    const validationToken = generateValidationToken();
    const [result] = await db.promise().execute(
      `
        INSERT INTO usuarios
          (nombre, email, password_hash, rol, telefono, direccion, activo, email_verificacion_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [nombre, email, hash, rol, telefono, direccion, activo, validationToken]
    );

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "crear",
      tabla: "usuarios",
      registroId: result.insertId,
      valoresNuevos: {
        nombre,
        email,
        rol,
        telefono,
        direccion,
        activo
      },
      ipAddress: req.ip
    });

    return res.status(201).json({
      message: "Usuario creado correctamente",
      id: result.insertId
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al crear usuario", error: error.message });
  }
};

exports.actualizarUsuario = async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const [rows] = await connection.execute(
      `
        SELECT
          id,
          nombre,
          email,
          rol,
          telefono,
          direccion,
          activo,
          email_verificacion_token,
          creado_en,
          actualizado_en
        FROM usuarios
        WHERE id = ?
        LIMIT 1
      `,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const currentUser = rows[0];
    const nombre = String(req.body.nombre || currentUser.nombre || "").trim();
    const email = String(req.body.email || currentUser.email || "").trim().toLowerCase();
    const rol = normalizeWritableRole(req.body.rol || currentUser.rol);
    const telefono = String(req.body.telefono || "").trim();
    const direccion = String(req.body.direccion || "").trim();
    const activo = req.body.activo === undefined
      ? Number(currentUser.activo)
      : Number(Boolean(req.body.activo));
    const password = String(req.body.password || "");

    if (!nombre || !email || !rol) {
      return res.status(400).json({ message: "Nombre, correo y rol son obligatorios" });
    }

    const targetId = Number(req.params.id);

    if (targetId === req.user.id && (activo === 0 || rol !== "administrador")) {
      return res.status(400).json({
        message: "No puedes desactivarte ni quitarte el rol de administrador"
      });
    }

    const [duplicados] = await connection.execute(
      "SELECT id FROM usuarios WHERE email = ? AND id <> ? LIMIT 1",
      [email, targetId]
    );

    if (duplicados.length > 0) {
      return res.status(400).json({ message: "Ya existe otro usuario con ese correo" });
    }

    const passwordHash = password ? bcrypt.hashSync(password, 10) : null;

    await connection.execute(
      `
        UPDATE usuarios
        SET nombre = ?, email = ?, rol = ?, telefono = ?, direccion = ?, activo = ?,
            password_hash = COALESCE(?, password_hash),
            email_verificacion_token = COALESCE(NULLIF(email_verificacion_token, ''), ?)
        WHERE id = ?
      `,
      [nombre, email, rol, telefono, direccion, activo, passwordHash, generateValidationToken(), targetId]
    );

    await logAudit(connection, {
      usuarioId: req.user.id,
      accion: "actualizar",
      tabla: "usuarios",
      registroId: targetId,
      valoresAntiguos: sanitizeUser(currentUser),
      valoresNuevos: {
        nombre,
        email,
        rol,
        telefono,
        direccion,
        activo
      },
      ipAddress: req.ip
    });

    return res.json({ message: "Usuario actualizado correctamente" });
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar usuario", error: error.message });
  } finally {
    connection.release();
  }
};
