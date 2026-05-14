const db = require("../config/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");
const { logAudit } = require("../utils/audit");
const { buildVerificationUrl, sendVerificationEmail } = require("../utils/mailer");

function sanitizeUser(user) {
  const normalizedRole = authMiddleware.normalizeRole(user.rol || user.rol_id);

  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: normalizedRole,
    rol_id: normalizedRole,
    telefono: user.telefono || "",
    direccion: user.direccion || "",
    activo: Number(user.activo ?? 1),
    email_verificado: Number(user.email_verificado ?? 1)
  };
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

exports.register = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!nombre || !email || !password) {
    return res.status(400).json({ message: "Todos los campos son obligatorios" });
  }

  try {
    const [usuarios] = await db.promise().execute(
      "SELECT id FROM usuarios WHERE email = ?",
      [email]
    );

    if (usuarios.length > 0) {
      return res.status(400).json({ message: "El usuario ya existe" });
    }

    const hash = bcrypt.hashSync(password, 10);
    const verificationToken = createVerificationToken();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.promise().execute(
      `
        INSERT INTO usuarios
          (
            nombre,
            email,
            password_hash,
            rol,
            activo,
            email_verificado,
            email_verificacion_token,
            email_verificacion_expira
          )
        VALUES (?, ?, ?, 'cliente', 1, 0, ?, ?)
      `,
      [nombre, email, hash, verificationToken, verificationExpiresAt]
    );

    let delivery;

    try {
      delivery = await sendVerificationEmail({
        email,
        nombre,
        token: verificationToken
      });
    } catch (mailError) {
      console.error("No se pudo enviar el correo de verificacion:", mailError.message);
      delivery = {
        delivered: false,
        preview_url: buildVerificationUrl(verificationToken)
      };
    }

    return res.status(201).json({
      message: delivery.delivered
        ? "Cuenta creada. Revisa tu correo para verificarla antes de iniciar sesion."
        : "Cuenta creada. Como el correo automatico no esta configurado, usa el enlace de verificacion temporal.",
      verification_required: true,
      verification_email_sent: delivery.delivered,
      verification_preview_url: delivery.preview_url || null
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al registrar usuario", error: error.message });
  }
};

exports.login = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email y contrasena requeridos" });
  }

  try {
    const [result] = await db.promise().execute(
      `
        SELECT
          id,
          nombre,
          email,
          password_hash,
          rol,
          telefono,
          direccion,
          activo,
          email_verificado
        FROM usuarios
        WHERE email = ?
      `,
      [email]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = result[0];
    const valid = bcrypt.compareSync(password, user.password_hash);
    const normalizedRole = authMiddleware.normalizeRole(user.rol);

    if (!Number(user.activo)) {
      return res.status(403).json({ message: "Tu cuenta esta desactivada" });
    }

    if (!Number(user.email_verificado ?? 1)) {
      return res.status(403).json({
        message: "Debes verificar tu correo antes de iniciar sesion"
      });
    }

    if (!valid) {
      return res.status(401).json({ message: "Contrasena incorrecta" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        rol: normalizedRole,
        rol_id: normalizedRole
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      message: "Login exitoso",
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al iniciar sesion", error: error.message });
  }
};

exports.perfil = async (req, res) => {
  try {
    const [result] = await db.promise().execute(
      `
        SELECT
          id,
          nombre,
          email,
          rol,
          rol AS rol_id,
          telefono,
          direccion,
          activo,
          email_verificado
        FROM usuarios
        WHERE id = ?
      `,
      [req.user.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    return res.json(sanitizeUser(result[0]));
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener perfil", error: error.message });
  }
};

exports.actualizarPerfil = async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const [rows] = await connection.execute(
      `
        SELECT id, nombre, email, rol, telefono, direccion, activo, email_verificado
        FROM usuarios
        WHERE id = ?
        LIMIT 1
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const usuarioActual = rows[0];
    const nombre = String(req.body.nombre || usuarioActual.nombre || "").trim();
    const email = String(req.body.email || usuarioActual.email || "").trim().toLowerCase();
    const telefono = String(req.body.telefono || "").trim();
    const direccion = String(req.body.direccion || "").trim();
    const password = String(req.body.password || "");

    if (!nombre || !email) {
      return res.status(400).json({ message: "Nombre y email son obligatorios" });
    }

    const [duplicados] = await connection.execute(
      "SELECT id FROM usuarios WHERE email = ? AND id <> ? LIMIT 1",
      [email, req.user.id]
    );

    if (duplicados.length > 0) {
      return res.status(400).json({ message: "Ya existe otro usuario con ese correo" });
    }

    const passwordHash = password
      ? bcrypt.hashSync(password, 10)
      : null;

    await connection.execute(
      `
        UPDATE usuarios
        SET nombre = ?, email = ?, telefono = ?, direccion = ?,
            password_hash = COALESCE(?, password_hash)
        WHERE id = ?
      `,
      [nombre, email, telefono, direccion, passwordHash, req.user.id]
    );

    await logAudit(connection, {
      usuarioId: req.user.id,
      accion: "actualizar_perfil",
      tabla: "usuarios",
      registroId: req.user.id,
      valoresAntiguos: sanitizeUser(usuarioActual),
      valoresNuevos: {
        nombre,
        email,
        telefono,
        direccion
      },
      ipAddress: req.ip
    });

    const [updatedRows] = await connection.execute(
      `
        SELECT
          id,
          nombre,
          email,
          rol,
          rol AS rol_id,
          telefono,
          direccion,
          activo,
          email_verificado
        FROM usuarios
        WHERE id = ?
      `,
      [req.user.id]
    );

    return res.json({
      message: "Perfil actualizado correctamente",
      user: sanitizeUser(updatedRows[0])
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar perfil", error: error.message });
  } finally {
    connection.release();
  }
};

exports.verifyEmail = async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.status(400).json({ message: "El enlace de verificacion es invalido" });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
        SELECT
          id,
          nombre,
          email,
          email_verificado,
          email_verificacion_expira
        FROM usuarios
        WHERE email_verificacion_token = ?
        LIMIT 1
      `,
      [token]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "El enlace de verificacion ya no es valido" });
    }

    const user = rows[0];

    if (Number(user.email_verificado)) {
      await connection.rollback();
      return res.json({ message: "Tu correo ya estaba verificado" });
    }

    if (
      user.email_verificacion_expira &&
      new Date(user.email_verificacion_expira).getTime() < Date.now()
    ) {
      await connection.rollback();
      return res.status(400).json({ message: "El enlace de verificacion ya expiro" });
    }

    await connection.execute(
      `
        UPDATE usuarios
        SET email_verificado = 1,
            email_verificacion_token = NULL,
            email_verificacion_expira = NULL
        WHERE id = ?
      `,
      [user.id]
    );

    await logAudit(connection, {
      usuarioId: user.id,
      accion: "verificar_correo",
      tabla: "usuarios",
      registroId: user.id,
      valoresNuevos: {
        email: user.email,
        email_verificado: 1
      },
      ipAddress: req.ip
    });

    await connection.commit();

    return res.json({
      message: "Correo verificado correctamente. Ya puedes iniciar sesion."
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      message: "Error al verificar el correo",
      error: error.message
    });
  } finally {
    connection.release();
  }
};
