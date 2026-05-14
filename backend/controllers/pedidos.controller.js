const db = require("../config/db");
const { logAudit } = require("../utils/audit");
const { getDiscountForQuantity } = require("../utils/pricing");
const { buildPedidoTicket } = require("./pedido-details");

const PEDIDO_ESTADOS = [
  "pendiente",
  "en_preparacion",
  "enviado",
  "entregado",
  "cancelado"
];

function canTransition(currentState, nextState) {
  const transitions = {
    pendiente: ["en_preparacion", "cancelado"],
    en_preparacion: ["enviado", "cancelado"],
    enviado: ["entregado"],
    entregado: [],
    cancelado: []
  };

  return (transitions[currentState] || []).includes(nextState);
}

async function attachPedidoProductos(executor, pedidos) {
  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    return pedidos;
  }

  const ids = pedidos.map((pedido) => Number(pedido.id));
  const placeholders = ids.map(() => "?").join(", ");
  const [detalles] = await executor.query(
    `
      SELECT
        dp.pedido_id,
        dp.producto_id,
        dp.cantidad,
        dp.precio_unitario,
        p.nombre,
        p.descripcion,
        p.imagen_url,
        c.nombre AS categoria,
        m.nombre AS marca
      FROM detalles_pedido dp
      JOIN productos p ON p.id = dp.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN marcas m ON m.id = p.marca_id
      WHERE dp.pedido_id IN (${placeholders})
      ORDER BY dp.pedido_id DESC, dp.id ASC
    `,
    ids
  );

  const grouped = new Map();

  for (const detalle of detalles) {
    const item = {
      producto_id: Number(detalle.producto_id),
      nombre: detalle.nombre,
      descripcion: detalle.descripcion,
      imagen_url: detalle.imagen_url,
      categoria: detalle.categoria,
      marca: detalle.marca,
      cantidad: Number(detalle.cantidad || 0),
      precio_unitario: Number(detalle.precio_unitario || 0),
      subtotal: Number(detalle.cantidad || 0) * Number(detalle.precio_unitario || 0)
    };

    if (!grouped.has(detalle.pedido_id)) {
      grouped.set(detalle.pedido_id, []);
    }

    grouped.get(detalle.pedido_id).push(item);
  }

  return pedidos.map((pedido) => {
    const productos = grouped.get(pedido.id) || [];

    return {
      ...pedido,
      productos,
      tirilla: buildPedidoTicket(pedido, productos)
    };
  });
}

exports.getPedidos = async (req, res) => {
  const userRole = req.user.rol || req.user.rol_id;
  const filters = [];
  const values = [];

  if (userRole === "cliente") {
    filters.push("p.usuario_id = ?");
    values.push(req.user.id);
  }

  if (req.query.estado) {
    filters.push("p.estado = ?");
    values.push(req.query.estado);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const [pedidos] = await db.promise().execute(
      `
        SELECT
          p.id,
          p.usuario_id,
          p.total_neto AS total,
          p.monto_total AS subtotal_original,
          p.total_neto,
          p.estado,
          CASE
            WHEN p.estado_pago = 'reembolsado' THEN 'reembolsado'
            WHEN p.estado = 'cancelado' THEN COALESCE(MAX(pg.estado), p.estado_pago)
            WHEN COUNT(pg.id) > 0 THEN 'aprobado'
            ELSE p.estado_pago
          END AS estado_pago,
          MAX(pg.metodo) AS metodo_pago,
          p.fecha_pedido AS fecha,
          u.nombre AS cliente,
          COUNT(dp.id) AS items
        FROM pedidos p
        JOIN usuarios u ON u.id = p.usuario_id
        LEFT JOIN detalles_pedido dp ON dp.pedido_id = p.id
        LEFT JOIN pagos pg ON pg.pedido_id = p.id
        ${whereClause}
        GROUP BY
          p.id, p.usuario_id, p.monto_total, p.total_neto,
          p.estado, p.estado_pago, p.fecha_pedido, u.nombre
        ORDER BY p.fecha_pedido DESC, p.id DESC
      `,
      values
    );

    const pedidosConDetalle = await attachPedidoProductos(db.promise(), pedidos);
    return res.json(pedidosConDetalle);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener pedidos", error: error.message });
  }
};

exports.crearPedido = async (req, res) => {
  const { items, metodo = "efectivo" } = req.body;
  const estadoPagoInicial = "aprobado";

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Debes enviar al menos un producto en el pedido" });
  }

  const resumen = new Map();

  for (const item of items) {
    const productoId = Number(item.producto_id);
    const cantidad = Number(item.cantidad);

    if (!productoId || cantidad <= 0) {
      return res.status(400).json({ message: "Cada item debe tener producto y cantidad validos" });
    }

    resumen.set(productoId, (resumen.get(productoId) || 0) + cantidad);
  }

  const ids = [...resumen.keys()];
  const placeholders = ids.map(() => "?").join(", ");
  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [productos] = await connection.query(
      `
        SELECT
          id,
          nombre,
          precio_detal,
          stock_actual,
          descuento_cantidad_minima,
          descuento_porcentaje
        FROM productos
        WHERE id IN (${placeholders}) AND activo = 1
      `,
      ids
    );

    if (productos.length !== ids.length) {
      throw new Error("Uno o mas productos no existen");
    }

    let total = 0;
    let subtotalBase = 0;
    const pricingRows = new Map();

    for (const producto of productos) {
      const cantidad = resumen.get(producto.id);

      if (producto.stock_actual < cantidad) {
        throw new Error(`Stock insuficiente para ${producto.nombre}`);
      }

      const pricing = getDiscountForQuantity(producto, cantidad);
      pricingRows.set(producto.id, pricing);
      total += Number(pricing.subtotalFinal || 0);
      subtotalBase += Number(pricing.subtotalBase || 0);
    }

    const [pedidoResult] = await connection.execute(
      `
        INSERT INTO pedidos
          (usuario_id, estado, monto_total, retencion_fuente, total_neto, estado_pago)
        VALUES (?, 'pendiente', ?, 0, ?, ?)
      `,
      [req.user.id, subtotalBase, total, estadoPagoInicial]
    );

    const ticketItems = [];

    for (const producto of productos) {
      const cantidad = resumen.get(producto.id);
      const pricing = pricingRows.get(producto.id);

      await connection.execute(
        `
          INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario)
          VALUES (?, ?, ?, ?)
        `,
        [pedidoResult.insertId, producto.id, cantidad, pricing.precioAplicado]
      );

      ticketItems.push({
        producto_id: Number(producto.id),
        nombre: producto.nombre,
        cantidad,
        precio_unitario: Number(pricing.precioAplicado || 0),
        subtotal: Number(pricing.subtotalFinal || 0),
        descuento_porcentaje: Number(pricing.descuentoPorcentaje || 0)
      });
    }

    await connection.execute(
      `
        INSERT INTO pagos (pedido_id, monto, metodo, estado, retencion_aplicada)
        VALUES (?, ?, ?, ?, 0)
      `,
      [pedidoResult.insertId, total, metodo, estadoPagoInicial]
    );

    await logAudit(connection, {
      usuarioId: req.user.id,
      accion: "crear",
      tabla: "pedidos",
      registroId: pedidoResult.insertId,
      valoresNuevos: {
        pedido_id: pedidoResult.insertId,
        estado: "pendiente",
        monto_total: total,
        subtotal_original: subtotalBase,
        metodo_pago: metodo
      },
      ipAddress: req.ip
    });

    await connection.commit();

    return res.status(201).json({
      message: "Pedido creado correctamente",
      pedido_id: pedidoResult.insertId,
      total,
      tirilla: {
        tipo: "venta",
        numero: `V-${pedidoResult.insertId}`,
        fecha: new Date().toISOString(),
        cliente: req.user.nombre || req.user.email || "Cliente",
        estado: "pendiente",
        estado_pago: estadoPagoInicial,
        subtotal: subtotalBase,
        total,
        metodo,
        items: ticketItems
      }
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({ message: error.message || "No se pudo crear el pedido" });
  } finally {
    connection.release();
  }
};

exports.actualizarEstado = async (req, res) => {
  const estado = String(req.body.estado || "").trim();

  if (!PEDIDO_ESTADOS.includes(estado)) {
    return res.status(400).json({ message: "Estado de pedido invalido" });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
        SELECT id, usuario_id, estado, monto_total, total_neto, estado_pago
        FROM pedidos
        WHERE id = ?
        LIMIT 1
      `,
      [req.params.id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const pedido = rows[0];

    if (pedido.estado === estado) {
      await connection.rollback();
      return res.status(400).json({ message: "El pedido ya tiene ese estado" });
    }

    if (!canTransition(pedido.estado, estado)) {
      await connection.rollback();
      return res.status(400).json({
        message: `No puedes cambiar un pedido de ${pedido.estado} a ${estado}`
      });
    }

    await connection.execute("SET @app_actor_id = ?", [req.user.id]);
    await connection.execute(
      "UPDATE pedidos SET estado = ? WHERE id = ?",
      [estado, req.params.id]
    );

    if (estado === "cancelado") {
      await connection.execute(
        "UPDATE pagos SET estado = 'rechazado' WHERE pedido_id = ?",
        [req.params.id]
      );
      await connection.execute(
        "UPDATE pedidos SET estado_pago = 'rechazado' WHERE id = ?",
        [req.params.id]
      );
    } else if (["en_preparacion", "enviado", "entregado"].includes(estado)) {
      await connection.execute(
        "UPDATE pagos SET estado = 'aprobado' WHERE pedido_id = ?",
        [req.params.id]
      );
      await connection.execute(
        "UPDATE pedidos SET estado_pago = 'aprobado' WHERE id = ?",
        [req.params.id]
      );
    }

    await logAudit(connection, {
      usuarioId: req.user.id,
      accion: "cambiar_estado",
      tabla: "pedidos",
      registroId: Number(req.params.id),
      valoresAntiguos: { estado: pedido.estado },
      valoresNuevos: { estado },
      ipAddress: req.ip
    });

    await connection.commit();

    return res.json({
      message: "Estado del pedido actualizado correctamente",
      pedido_id: Number(req.params.id),
      estado
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      message: "No se pudo actualizar el estado del pedido",
      error: error.message
    });
  } finally {
    connection.release();
  }
};
