const db = require("../config/db");
const { logAudit } = require("../utils/audit");

async function getCatalogData() {
  const [categorias, marcas, proveedores] = await Promise.all([
    db.promise().query(`
      SELECT id, nombre, descripcion, activo, creado_en, actualizado_en
      FROM categorias
      ORDER BY activo DESC, nombre ASC
    `),
    db.promise().query(`
      SELECT id, nombre, descripcion, activo, creado_en, actualizado_en
      FROM marcas
      ORDER BY activo DESC, nombre ASC
    `),
    db.promise().query(`
      SELECT id, nombre, nit, telefono, email, direccion, creado_en, actualizado_en
      FROM proveedores
      ORDER BY nombre ASC
    `)
  ]);

  return {
    categorias: categorias[0],
    marcas: marcas[0],
    proveedores: proveedores[0]
  };
}

async function ensureGeneralCategory(connection, excludedId = null) {
  const values = [];
  let where = "WHERE LOWER(nombre) = 'general'";

  if (excludedId) {
    where += " AND id != ?";
    values.push(Number(excludedId));
  }

  const [rows] = await connection.execute(
    `SELECT id FROM categorias ${where} ORDER BY id ASC LIMIT 1`,
    values
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  const [result] = await connection.execute(
    "INSERT INTO categorias (nombre, descripcion, activo) VALUES ('General', 'Categoria de respaldo', 1)"
  );

  return result.insertId;
}

exports.getCatalogoPublico = async (_req, res) => {
  try {
    const [categorias] = await db.promise().query(`
      SELECT
        c.id,
        c.nombre,
        c.descripcion,
        c.activo,
        COUNT(p.id) AS total_productos
      FROM categorias c
      LEFT JOIN productos p
        ON p.categoria_id = c.id
       AND p.activo = 1
      WHERE c.activo = 1
      GROUP BY c.id, c.nombre, c.descripcion, c.activo
      ORDER BY c.nombre ASC
    `);

    return res.json({ categorias });
  } catch (error) {
    return res.status(500).json({
      message: "Error al obtener el catalogo publico",
      error: error.message
    });
  }
};

exports.getCatalogos = async (_req, res) => {
  try {
    return res.json(await getCatalogData());
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener catalogos", error: error.message });
  }
};

exports.crearCategoria = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const descripcion = String(req.body.descripcion || "").trim();
  const activo = req.body.activo === undefined ? 1 : Number(Boolean(req.body.activo));

  if (!nombre) {
    return res.status(400).json({ message: "El nombre de la categoria es obligatorio" });
  }

  try {
    const [result] = await db.promise().execute(
      "INSERT INTO categorias (nombre, descripcion, activo) VALUES (?, ?, ?)",
      [nombre, descripcion, activo]
    );

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "crear",
      tabla: "categorias",
      registroId: result.insertId,
      valoresNuevos: { nombre, descripcion, activo },
      ipAddress: req.ip
    });

    return res.status(201).json({ message: "Categoria creada correctamente", id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Error al crear categoria", error: error.message });
  }
};

exports.actualizarCategoria = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const descripcion = String(req.body.descripcion || "").trim();
  const activo = req.body.activo === undefined ? 1 : Number(Boolean(req.body.activo));

  if (!nombre) {
    return res.status(400).json({ message: "El nombre de la categoria es obligatorio" });
  }

  try {
    const [result] = await db.promise().execute(
      `
        UPDATE categorias
        SET nombre = ?, descripcion = ?, activo = ?
        WHERE id = ?
      `,
      [nombre, descripcion, activo, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoria no encontrada" });
    }

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "actualizar",
      tabla: "categorias",
      registroId: Number(req.params.id),
      valoresNuevos: { nombre, descripcion, activo },
      ipAddress: req.ip
    });

    return res.json({ message: "Categoria actualizada correctamente" });
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar categoria", error: error.message });
  }
};

exports.eliminarCategoria = async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      "SELECT id, nombre, descripcion, activo FROM categorias WHERE id = ? LIMIT 1",
      [req.params.id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Categoria no encontrada" });
    }

    const categoria = rows[0];
    const generalId = await ensureGeneralCategory(connection, categoria.id);

    await connection.execute(
      "UPDATE productos SET categoria_id = ? WHERE categoria_id = ?",
      [generalId, categoria.id]
    );

    const [result] = await connection.execute(
      "DELETE FROM categorias WHERE id = ?",
      [categoria.id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Categoria no encontrada" });
    }

    await logAudit(connection, {
      usuarioId: req.user.id,
      accion: "eliminar_definitivo",
      tabla: "categorias",
      registroId: Number(req.params.id),
      valoresAntiguos: categoria,
      valoresNuevos: { productos_reasignados_a: generalId },
      ipAddress: req.ip
    });

    await connection.commit();

    return res.json({
      message: "Categoria eliminada y productos reasignados correctamente"
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: "Error al eliminar categoria", error: error.message });
  } finally {
    connection.release();
  }
};

exports.crearMarca = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const descripcion = String(req.body.descripcion || "").trim();
  const activo = req.body.activo === undefined ? 1 : Number(Boolean(req.body.activo));

  if (!nombre) {
    return res.status(400).json({ message: "El nombre de la marca es obligatorio" });
  }

  try {
    const [result] = await db.promise().execute(
      "INSERT INTO marcas (nombre, descripcion, activo) VALUES (?, ?, ?)",
      [nombre, descripcion, activo]
    );

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "crear",
      tabla: "marcas",
      registroId: result.insertId,
      valoresNuevos: { nombre, descripcion, activo },
      ipAddress: req.ip
    });

    return res.status(201).json({ message: "Marca creada correctamente", id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Error al crear marca", error: error.message });
  }
};

exports.actualizarMarca = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const descripcion = String(req.body.descripcion || "").trim();
  const activo = req.body.activo === undefined ? 1 : Number(Boolean(req.body.activo));

  if (!nombre) {
    return res.status(400).json({ message: "El nombre de la marca es obligatorio" });
  }

  try {
    const [result] = await db.promise().execute(
      `
        UPDATE marcas
        SET nombre = ?, descripcion = ?, activo = ?
        WHERE id = ?
      `,
      [nombre, descripcion, activo, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Marca no encontrada" });
    }

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "actualizar",
      tabla: "marcas",
      registroId: Number(req.params.id),
      valoresNuevos: { nombre, descripcion, activo },
      ipAddress: req.ip
    });

    return res.json({ message: "Marca actualizada correctamente" });
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar marca", error: error.message });
  }
};

exports.crearProveedor = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const nit = String(req.body.nit || "").trim();
  const telefono = String(req.body.telefono || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const direccion = String(req.body.direccion || "").trim();

  if (!nombre) {
    return res.status(400).json({ message: "El nombre del proveedor es obligatorio" });
  }

  try {
    const [result] = await db.promise().execute(
      `
        INSERT INTO proveedores (nombre, nit, telefono, email, direccion)
        VALUES (?, ?, ?, ?, ?)
      `,
      [nombre, nit || null, telefono, email || null, direccion]
    );

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "crear",
      tabla: "proveedores",
      registroId: result.insertId,
      valoresNuevos: { nombre, nit, telefono, email, direccion },
      ipAddress: req.ip
    });

    return res.status(201).json({ message: "Proveedor creado correctamente", id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Error al crear proveedor", error: error.message });
  }
};

exports.actualizarProveedor = async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const nit = String(req.body.nit || "").trim();
  const telefono = String(req.body.telefono || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const direccion = String(req.body.direccion || "").trim();

  if (!nombre) {
    return res.status(400).json({ message: "El nombre del proveedor es obligatorio" });
  }

  try {
    const [result] = await db.promise().execute(
      `
        UPDATE proveedores
        SET nombre = ?, nit = ?, telefono = ?, email = ?, direccion = ?
        WHERE id = ?
      `,
      [nombre, nit || null, telefono, email || null, direccion, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    await logAudit(db.promise(), {
      usuarioId: req.user.id,
      accion: "actualizar",
      tabla: "proveedores",
      registroId: Number(req.params.id),
      valoresNuevos: { nombre, nit, telefono, email, direccion },
      ipAddress: req.ip
    });

    return res.json({ message: "Proveedor actualizado correctamente" });
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar proveedor", error: error.message });
  }
};
