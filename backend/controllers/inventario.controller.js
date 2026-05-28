const db = require("../config/db");
const { logAudit } = require("../utils/audit");

function normalizeMovementItems(body = {}) {
  if (Array.isArray(body.items) && body.items.length > 0) {
    return body.items;
  }

  return [
    {
      producto_id: body.producto_id,
      cantidad: body.cantidad,
      precio_compra_unitario: body.precio_compra_unitario
    }
  ];
}

function buildMovementTicketNumber(movementIds = []) {
  if (movementIds.length === 0) {
    return "M-0";
  }

  if (movementIds.length === 1) {
    return `M-${movementIds[0]}`;
  }

  return `M-${movementIds[0]}-${movementIds[movementIds.length - 1]}`;
}

exports.movimiento = async (req, res) => {
  const {
    tipo,
    motivo = "ajuste_manual",
    proveedor_id = null,
    precio_compra_unitario = null,
    factura = ""
  } = req.body;

  const items = normalizeMovementItems(req.body);
  const facturaNormalizada = String(factura || "").trim() || null;
  const proveedorIdNormalizado = proveedor_id ? Number(proveedor_id) : null;

  if (!tipo) {
    return res.status(400).json({ message: "El tipo de movimiento es obligatorio" });
  }

  if (!["entrada", "salida"].includes(tipo)) {
    return res.status(400).json({ message: "Tipo de movimiento invalido" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Debes agregar al menos un producto" });
  }

  const invalidItem = items.find(
    (item) => !item?.producto_id || !item?.cantidad || Number(item.cantidad) <= 0
  );

  if (invalidItem) {
    return res.status(400).json({
      message: "Cada linea debe tener producto y cantidad mayor que cero"
    });
  }

  if (tipo === "entrada" && motivo === "compra_proveedor" && !proveedorIdNormalizado) {
    return res.status(400).json({
      message: "Debes seleccionar un proveedor para registrar una compra"
    });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    let proveedorNombre = null;

    if (proveedorIdNormalizado) {
      const [proveedores] = await connection.execute(
        "SELECT nombre FROM proveedores WHERE id = ? LIMIT 1",
        [proveedorIdNormalizado]
      );
      proveedorNombre = proveedores[0]?.nombre || null;
    }

    const ticketItems = [];
    const movementIds = [];
    let totalUnidades = 0;
    let totalInvertido = 0;
    let ultimoCostoPromedio = null;
    let ultimoPrecioVenta = null;
    let ultimoMargenAplicado = null;
    let ultimoStockAntes;
    let ultimoStockDespues;

    for (const rawItem of items) {
      const productoId = Number(rawItem.producto_id);
      const cantidadNormalizada = Math.abs(Number(rawItem.cantidad));
      const precioCompraUnitario = Number(
        rawItem.precio_compra_unitario ?? precio_compra_unitario ?? 0
      );

      const [productos] = await connection.execute(
        `
          SELECT id, nombre, stock_actual, precio_mayor, precio_detal, margen_porcentaje
          FROM productos
          WHERE id = ?
        `,
        [productoId]
      );

      if (productos.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      const producto = productos[0];

      if (tipo === "salida" && Number(producto.stock_actual || 0) < cantidadNormalizada) {
        await connection.rollback();
        return res.status(400).json({
          message: `Stock insuficiente para registrar la salida de ${producto.nombre}`
        });
      }

      const cantidadFirmada = tipo === "salida" ? -cantidadNormalizada : cantidadNormalizada;
      const stockAntes = Number(producto.stock_actual || 0);
      const stockDespues =
        tipo === "entrada" ? stockAntes + cantidadNormalizada : stockAntes - cantidadNormalizada;

      const [insertResult] = await connection.execute(
        `
          INSERT INTO movimientos_inventario
            (
              producto_id,
              cantidad,
              tipo,
              motivo,
              proveedor_id,
              factura_referencia,
              usuario_id,
              precio_unitario_referencia
            )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          productoId,
          cantidadFirmada,
          tipo,
          motivo,
          proveedorIdNormalizado,
          facturaNormalizada,
          req.user.id,
          tipo === "entrada" && precioCompraUnitario > 0 ? precioCompraUnitario : null
        ]
      );

      let nuevoCostoPromedio = null;
      let precioVentaAsignado = null;
      const margenPorcentajeAplicado = Number(producto.margen_porcentaje || 0);

      if (tipo === "entrada" && precioCompraUnitario > 0) {
        const costoAnterior = Number(producto.precio_mayor || 0);

        nuevoCostoPromedio =
          stockAntes > 0
            ? ((stockAntes * costoAnterior) + (cantidadNormalizada * precioCompraUnitario)) /
              (stockAntes + cantidadNormalizada)
            : precioCompraUnitario;

        const averageCostRounded = Number(nuevoCostoPromedio.toFixed(2));
        precioVentaAsignado = Number(
          (averageCostRounded * (1 + margenPorcentajeAplicado / 100)).toFixed(2)
        );

        await connection.execute(
          "UPDATE productos SET precio_mayor = ?, precio_detal = ? WHERE id = ?",
          [averageCostRounded, precioVentaAsignado, productoId]
        );
      }

      await logAudit(connection, {
        usuarioId: req.user.id,
        accion: "crear",
        tabla: "movimientos_inventario",
        registroId: Number(insertResult.insertId),
        valoresNuevos: {
          movimiento_id: Number(insertResult.insertId),
          producto_id: productoId,
          producto: producto.nombre,
          cantidad: cantidadFirmada,
          tipo,
          motivo,
          proveedor_id: proveedorIdNormalizado,
          factura_referencia: facturaNormalizada,
          precio_compra_unitario: precioCompraUnitario || null,
          precio_compra_promedio: nuevoCostoPromedio
            ? Number(nuevoCostoPromedio.toFixed(2))
            : null,
          margen_porcentaje_aplicado: margenPorcentajeAplicado,
          precio_venta_asignado: precioVentaAsignado
        },
        ipAddress: req.ip
      });

      movementIds.push(Number(insertResult.insertId));
      totalUnidades += cantidadNormalizada;
      totalInvertido +=
        tipo === "entrada" && precioCompraUnitario > 0
          ? Number((precioCompraUnitario * cantidadNormalizada).toFixed(2))
          : 0;
      ultimoCostoPromedio = nuevoCostoPromedio
        ? Number(nuevoCostoPromedio.toFixed(2))
        : ultimoCostoPromedio;
      ultimoPrecioVenta = precioVentaAsignado ?? ultimoPrecioVenta;
      ultimoMargenAplicado = margenPorcentajeAplicado;
      ultimoStockAntes = stockAntes;
      ultimoStockDespues = stockDespues;

      ticketItems.push({
        producto_id: productoId,
        nombre: producto.nombre,
        cantidad: cantidadNormalizada,
        precio_unitario: tipo === "entrada" ? precioCompraUnitario : 0,
        subtotal:
          tipo === "entrada" && precioCompraUnitario > 0
            ? Number((precioCompraUnitario * cantidadNormalizada).toFixed(2))
            : 0
      });
    }

    await connection.commit();

    return res.status(201).json({
      message:
        items.length > 1 ? "Compra registrada correctamente" : "Movimiento registrado",
      movimiento_id: movementIds[movementIds.length - 1],
      precio_compra_promedio: ultimoCostoPromedio || undefined,
      tirilla: {
        tipo: tipo === "entrada" ? "compra" : "salida",
        numero: buildMovementTicketNumber(movementIds),
        fecha: new Date().toISOString(),
        producto: ticketItems[0]?.nombre || "-",
        cantidad: totalUnidades,
        movimiento: tipo,
        motivo,
        proveedor: proveedorNombre,
        factura: facturaNormalizada,
        costo_unitario:
          ticketItems.length === 1 ? ticketItems[0].precio_unitario || null : null,
        costo_promedio: ticketItems.length === 1 ? ultimoCostoPromedio : null,
        margen_porcentaje: ticketItems.length === 1 ? ultimoMargenAplicado : null,
        precio_venta_calculado: ticketItems.length === 1 ? ultimoPrecioVenta : null,
        total: totalInvertido > 0 ? Number(totalInvertido.toFixed(2)) : null,
        stock_antes: ticketItems.length === 1 ? ultimoStockAntes : undefined,
        stock_despues: ticketItems.length === 1 ? ultimoStockDespues : undefined,
        items: ticketItems
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

    if (req.query.proveedor_id) {
      filters.push("i.proveedor_id = ?");
      values.push(Number(req.query.proveedor_id));
    }

    if (req.query.factura) {
      filters.push("i.factura_referencia LIKE ?");
      values.push(`%${String(req.query.factura).trim()}%`);
    }

    if (req.query.fecha_desde) {
      filters.push("DATE(i.creado_en) >= ?");
      values.push(req.query.fecha_desde);
    }

    if (req.query.fecha_hasta) {
      filters.push("DATE(i.creado_en) <= ?");
      values.push(req.query.fecha_hasta);
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
        i.factura_referencia,
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

exports.getReporteCompras = async (req, res) => {
  try {
    const filters = [
      "i.tipo = 'entrada'",
      "i.motivo = 'compra_proveedor'"
    ];
    const values = [];

    if (req.query.producto_id) {
      filters.push("i.producto_id = ?");
      values.push(Number(req.query.producto_id));
    }

    if (req.query.proveedor_id) {
      filters.push("i.proveedor_id = ?");
      values.push(Number(req.query.proveedor_id));
    }

    if (req.query.factura) {
      filters.push("COALESCE(i.factura_referencia, '') LIKE ?");
      values.push(`%${String(req.query.factura).trim()}%`);
    }

    if (req.query.fecha_desde) {
      filters.push("DATE(i.creado_en) >= ?");
      values.push(req.query.fecha_desde);
    }

    if (req.query.fecha_hasta) {
      filters.push("DATE(i.creado_en) <= ?");
      values.push(req.query.fecha_hasta);
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const [comprasRows, resumenRows, porProductoRows, porFacturaRows] = await Promise.all([
      db.promise().execute(
        `
          SELECT
            i.id,
            i.creado_en AS fecha,
            i.factura_referencia,
            i.producto_id,
            p.nombre AS producto,
            i.proveedor_id,
            pr.nombre AS proveedor,
            ABS(i.cantidad) AS cantidad,
            COALESCE(i.precio_unitario_referencia, p.precio_mayor, 0) AS costo_unitario,
            ABS(i.cantidad) * COALESCE(i.precio_unitario_referencia, p.precio_mayor, 0) AS total_compra,
            u.nombre AS registrado_por
          FROM movimientos_inventario i
          JOIN productos p ON p.id = i.producto_id
          LEFT JOIN proveedores pr ON pr.id = i.proveedor_id
          JOIN usuarios u ON u.id = i.usuario_id
          ${whereClause}
          ORDER BY i.creado_en DESC, i.id DESC
        `,
        values
      ),
      db.promise().execute(
        `
          SELECT
            COUNT(*) AS total_registros,
            COALESCE(SUM(ABS(i.cantidad)), 0) AS total_unidades,
            COALESCE(
              SUM(ABS(i.cantidad) * COALESCE(i.precio_unitario_referencia, p.precio_mayor, 0)),
              0
            ) AS total_invertido,
            COUNT(DISTINCT NULLIF(COALESCE(i.factura_referencia, ''), '')) AS total_facturas
          FROM movimientos_inventario i
          JOIN productos p ON p.id = i.producto_id
          ${whereClause}
        `,
        values
      ),
      db.promise().execute(
        `
          SELECT
            i.producto_id,
            p.nombre AS producto,
            COUNT(*) AS compras_registradas,
            COALESCE(SUM(ABS(i.cantidad)), 0) AS unidades,
            COALESCE(
              SUM(ABS(i.cantidad) * COALESCE(i.precio_unitario_referencia, p.precio_mayor, 0)),
              0
            ) AS total_invertido
          FROM movimientos_inventario i
          JOIN productos p ON p.id = i.producto_id
          ${whereClause}
          GROUP BY i.producto_id, p.nombre
          ORDER BY total_invertido DESC, unidades DESC, producto ASC
        `,
        values
      ),
      db.promise().execute(
        `
          SELECT
            COALESCE(NULLIF(i.factura_referencia, ''), 'Sin factura') AS factura,
            COUNT(*) AS movimientos,
            COALESCE(SUM(ABS(i.cantidad)), 0) AS unidades,
            COALESCE(
              SUM(ABS(i.cantidad) * COALESCE(i.precio_unitario_referencia, p.precio_mayor, 0)),
              0
            ) AS total_invertido
          FROM movimientos_inventario i
          JOIN productos p ON p.id = i.producto_id
          ${whereClause}
          GROUP BY COALESCE(NULLIF(i.factura_referencia, ''), 'Sin factura')
          ORDER BY MAX(i.creado_en) DESC, factura ASC
        `,
        values
      )
    ]);

    return res.json({
      filtros: {
        fecha_desde: req.query.fecha_desde || "",
        fecha_hasta: req.query.fecha_hasta || "",
        producto_id: req.query.producto_id ? Number(req.query.producto_id) : null,
        proveedor_id: req.query.proveedor_id ? Number(req.query.proveedor_id) : null,
        factura: req.query.factura || ""
      },
      resumen: resumenRows[0][0] || {
        total_registros: 0,
        total_unidades: 0,
        total_invertido: 0,
        total_facturas: 0
      },
      compras: comprasRows[0],
      por_producto: porProductoRows[0],
      por_factura: porFacturaRows[0]
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error al generar el reporte de compras",
      error: error.message
    });
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
