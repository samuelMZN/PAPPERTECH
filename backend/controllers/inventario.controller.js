const db = require("../config/db");
const { logAudit } = require("../utils/audit");

exports.movimiento = async (req, res) => {
  const {
    producto_id,
    tipo,
    cantidad,
    motivo = "ajuste_manual",
    proveedor_id = null,
    precio_compra_unitario = null
  } = req.body;

  if (!producto_id || !tipo || !cantidad) {
    return res.status(400).json({ message: "Producto, tipo y cantidad son obligatorios" });
  }

  if (!["entrada", "salida"].includes(tipo)) {
    return res.status(400).json({ message: "Tipo de movimiento invalido" });
  }

  if (Number(cantidad) <= 0) {
    return res.status(400).json({ message: "La cantidad debe ser mayor que cero" });
  }

  if (tipo === "entrada" && motivo === "compra_proveedor" && !proveedor_id) {
    return res.status(400).json({
      message: "Debes seleccionar un proveedor para registrar una compra"
    });
  }

  const precioCompraUnitario = Number(precio_compra_unitario || 0);
  const cantidadNormalizada = Math.abs(Number(cantidad));
  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [productos] = await connection.execute(
      `
        SELECT id, nombre, stock_actual, precio_mayor
        FROM productos
        WHERE id = ?
      `,
      [producto_id]
    );

    if (productos.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (tipo === "salida" && productos[0].stock_actual < Number(cantidad)) {
      await connection.rollback();
      return res.status(400).json({ message: "Stock insuficiente para registrar la salida" });
    }

    const cantidadFirmada = tipo === "salida" ? -cantidadNormalizada : cantidadNormalizada;

    const [insertResult] = await connection.execute(
      `
        INSERT INTO movimientos_inventario
          (producto_id, cantidad, tipo, motivo, proveedor_id, usuario_id, precio_unitario_referencia)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        producto_id,
        cantidadFirmada,
        tipo,
        motivo,
        proveedor_id || null,
        req.user.id,
        tipo === "entrada" && precioCompraUnitario > 0 ? precioCompraUnitario : null
      ]
    );

    let nuevoCostoPromedio = null;
    let proveedorNombre = null;

    if (tipo === "entrada" && precioCompraUnitario > 0) {
      const stockAnterior = Number(productos[0].stock_actual || 0);
      const costoAnterior = Number(productos[0].precio_mayor || 0);

      nuevoCostoPromedio =
        stockAnterior > 0
          ? ((stockAnterior * costoAnterior) + (cantidadNormalizada * precioCompraUnitario)) /
            (stockAnterior + cantidadNormalizada)
          : precioCompraUnitario;

      await connection.execute(
        "UPDATE productos SET precio_mayor = ? WHERE id = ?",
        [Number(nuevoCostoPromedio.toFixed(2)), producto_id]
      );
    }

    if (proveedor_id) {
      const [proveedores] = await connection.execute(
        "SELECT nombre FROM proveedores WHERE id = ? LIMIT 1",
        [proveedor_id]
      );
      proveedorNombre = proveedores[0]?.nombre || null;
    }

    await logAudit(connection, {
      usuarioId: req.user.id,
      accion: "crear",
      tabla: "movimientos_inventario",
      registroId: Number(insertResult.insertId),
      valoresNuevos: {
        movimiento_id: Number(insertResult.insertId),
        producto_id: Number(producto_id),
        producto: productos[0].nombre,
        cantidad: cantidadFirmada,
        tipo,
        motivo,
        proveedor_id: proveedor_id || null,
        precio_compra_unitario: precioCompraUnitario || null,
        precio_compra_promedio: nuevoCostoPromedio
          ? Number(nuevoCostoPromedio.toFixed(2))
          : null
      },
      ipAddress: req.ip
    });

    await connection.commit();

    return res.status(201).json({
      message: "Movimiento registrado",
      movimiento_id: Number(insertResult.insertId),
      precio_compra_promedio: nuevoCostoPromedio
        ? Number(nuevoCostoPromedio.toFixed(2))
        : undefined,
      tirilla: {
        tipo: tipo === "entrada" ? "compra" : "salida",
        numero: `M-${insertResult.insertId}`,
        fecha: new Date().toISOString(),
        producto: productos[0].nombre,
        cantidad: cantidadNormalizada,
        movimiento: tipo,
        motivo,
        proveedor: proveedorNombre,
        costo_unitario: tipo === "entrada" && precioCompraUnitario > 0 ? precioCompraUnitario : null,
        costo_promedio: nuevoCostoPromedio ? Number(nuevoCostoPromedio.toFixed(2)) : null,
        total:
          tipo === "entrada" && precioCompraUnitario > 0
            ? Number((precioCompraUnitario * cantidadNormalizada).toFixed(2))
            : null,
        stock_antes: Number(productos[0].stock_actual || 0),
        stock_despues:
          tipo === "entrada"
            ? Number(productos[0].stock_actual || 0) + cantidadNormalizada
            : Number(productos[0].stock_actual || 0) - cantidadNormalizada
      }
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: "Error al registrar movimiento", error: error.message });
  } finally {
    connection.release();
  }
};

exports.getMovimientos = async (req, res) => {
  try {
    const filters = [];
    const values = [];

    if (req.query.tipo) {
      filters.push("i.tipo = ?");
      values.push(req.query.tipo);
    }

    if (req.query.producto_id) {
      filters.push("i.producto_id = ?");
      values.push(Number(req.query.producto_id));
    }

    if (req.query.pedido_id) {
      filters.push("i.pedido_id = ?");
      values.push(Number(req.query.pedido_id));
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const [result] = await db.promise().execute(`
      SELECT
        i.id,
        i.tipo,
        i.cantidad,
        ABS(i.cantidad) AS cantidad_absoluta,
        i.motivo,
        i.proveedor_id,
        i.pedido_id,
        i.stock_antes,
        i.stock_despues,
        i.precio_unitario_referencia,
        i.creado_en AS fecha,
        p.nombre AS producto,
        u.nombre AS usuario,
        pr.nombre AS proveedor
      FROM movimientos_inventario i
      JOIN productos p ON i.producto_id = p.id
      JOIN usuarios u ON i.usuario_id = u.id
      LEFT JOIN proveedores pr ON pr.id = i.proveedor_id
      ${whereClause}
      ORDER BY i.creado_en DESC
    `, values);

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener movimientos", error: error.message });
  }
};

exports.getStock = async (_req, res) => {
  try {
    const [result] = await db.promise().query(`
      SELECT
        p.id,
        p.nombre,
        p.stock_actual,
        p.stock_minimo,
        p.precio_detal,
        p.precio_mayor,
        c.nombre AS categoria,
        m.nombre AS marca,
        pr.nombre AS proveedor,
        CASE
          WHEN p.stock_actual = 0 THEN 'agotado'
          WHEN p.stock_actual <= p.stock_minimo THEN 'bajo'
          ELSE 'estable'
        END AS estado_stock
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN marcas m ON m.id = p.marca_id
      LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
      WHERE p.activo = 1
      ORDER BY
        CASE
          WHEN p.stock_actual = 0 THEN 0
          WHEN p.stock_actual <= p.stock_minimo THEN 1
          ELSE 2
        END,
        p.nombre ASC
    `);

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener stock", error: error.message });
  }
};

exports.getLowStock = async (_req, res) => {
  try {
    const [result] = await db.promise().query(`
      SELECT
        p.id,
        p.nombre,
        p.stock_actual,
        p.stock_minimo,
        c.nombre AS categoria,
        m.nombre AS marca
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN marcas m ON m.id = p.marca_id
      WHERE p.activo = 1 AND p.stock_actual <= p.stock_minimo
      ORDER BY p.stock_actual ASC, p.nombre ASC
    `);

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener bajo stock", error: error.message });
  }
};
