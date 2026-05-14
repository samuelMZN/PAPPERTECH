const db = require("../config/db");
const { logAudit } = require("../utils/audit");

const RETURNABLE_ORDER_STATES = ["en_preparacion", "enviado", "entregado"];

function buildDevolucionTicket(devolucion, items) {
  return {
    tipo: "devolucion",
    numero: `D-${devolucion.id}`,
    pedido_numero: `Pedido #${devolucion.pedido_id}`,
    fecha: devolucion.fecha,
    cliente: devolucion.cliente,
    estado: devolucion.estado_pago || "reembolsado",
    motivo: devolucion.motivo,
    observaciones: devolucion.observaciones || "",
    total: Number(devolucion.total_reintegrado || 0),
    items
  };
}

async function getReturnableOrders(executor) {
  const [orders] = await executor.query(
    `
      SELECT
        p.id,
        p.usuario_id,
        p.estado,
        p.estado_pago,
        p.fecha_pedido AS fecha,
        p.total_neto AS total,
        u.nombre AS cliente
      FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.estado IN ('en_preparacion', 'enviado', 'entregado')
      ORDER BY p.fecha_pedido DESC, p.id DESC
    `
  );

  if (orders.length === 0) {
    return [];
  }

  const pedidoIds = orders.map((order) => Number(order.id));
  const placeholders = pedidoIds.map(() => "?").join(", ");
  const [details] = await executor.query(
    `
      SELECT
        dp.id AS detalle_pedido_id,
        dp.pedido_id,
        dp.producto_id,
        dp.cantidad AS cantidad_pedida,
        dp.precio_unitario,
        p.nombre,
        p.descripcion,
        p.imagen_url,
        c.nombre AS categoria
      FROM detalles_pedido dp
      JOIN productos p ON p.id = dp.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE dp.pedido_id IN (${placeholders})
      ORDER BY dp.pedido_id DESC, dp.id ASC
    `,
    pedidoIds
  );

  const detailIds = details.map((detail) => Number(detail.detalle_pedido_id));
  const returnedMap = new Map();

  if (detailIds.length > 0) {
    const detailPlaceholders = detailIds.map(() => "?").join(", ");
    const [returnedRows] = await executor.query(
      `
        SELECT
          detalle_pedido_id,
          COALESCE(SUM(cantidad), 0) AS cantidad_devuelta
        FROM detalles_devolucion
        WHERE detalle_pedido_id IN (${detailPlaceholders})
        GROUP BY detalle_pedido_id
      `,
      detailIds
    );

    for (const row of returnedRows) {
      returnedMap.set(Number(row.detalle_pedido_id), Number(row.cantidad_devuelta || 0));
    }
  }

  const grouped = new Map();

  for (const detail of details) {
    const alreadyReturned = returnedMap.get(Number(detail.detalle_pedido_id)) || 0;
    const returnableQuantity = Math.max(0, Number(detail.cantidad_pedida || 0) - alreadyReturned);

    const item = {
      detalle_pedido_id: Number(detail.detalle_pedido_id),
      producto_id: Number(detail.producto_id),
      nombre: detail.nombre,
      descripcion: detail.descripcion,
      imagen_url: detail.imagen_url,
      categoria: detail.categoria,
      cantidad_pedida: Number(detail.cantidad_pedida || 0),
      cantidad_devuelta: alreadyReturned,
      cantidad_disponible_devolucion: returnableQuantity,
      precio_unitario: Number(detail.precio_unitario || 0),
      subtotal: Number(detail.cantidad_pedida || 0) * Number(detail.precio_unitario || 0)
    };

    if (!grouped.has(Number(detail.pedido_id))) {
      grouped.set(Number(detail.pedido_id), []);
    }

    grouped.get(Number(detail.pedido_id)).push(item);
  }

  return orders
    .map((order) => {
      const productos = (grouped.get(Number(order.id)) || []).filter(
        (item) => item.cantidad_disponible_devolucion > 0
      );

      return {
        ...order,
        productos
      };
    })
    .filter((order) => order.productos.length > 0);
}

async function attachReturnItems(executor, devoluciones) {
  if (!Array.isArray(devoluciones) || devoluciones.length === 0) {
    return devoluciones;
  }

  const devolucionIds = devoluciones.map((item) => Number(item.id));
  const placeholders = devolucionIds.map(() => "?").join(", ");
  const [details] = await executor.query(
    `
      SELECT
        dd.devolucion_id,
        dd.detalle_pedido_id,
        dd.producto_id,
        dd.cantidad,
        dd.precio_unitario,
        p.nombre,
        p.descripcion,
        p.imagen_url,
        c.nombre AS categoria
      FROM detalles_devolucion dd
      JOIN productos p ON p.id = dd.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE dd.devolucion_id IN (${placeholders})
      ORDER BY dd.devolucion_id DESC, dd.id ASC
    `,
    devolucionIds
  );

  const grouped = new Map();

  for (const detail of details) {
    const item = {
      detalle_pedido_id: Number(detail.detalle_pedido_id),
      producto_id: Number(detail.producto_id),
      nombre: detail.nombre,
      descripcion: detail.descripcion,
      imagen_url: detail.imagen_url,
      categoria: detail.categoria,
      cantidad: Number(detail.cantidad || 0),
      precio_unitario: Number(detail.precio_unitario || 0),
      subtotal: Number(detail.cantidad || 0) * Number(detail.precio_unitario || 0)
    };

    if (!grouped.has(Number(detail.devolucion_id))) {
      grouped.set(Number(detail.devolucion_id), []);
    }

    grouped.get(Number(detail.devolucion_id)).push(item);
  }

  return devoluciones.map((devolucion) => {
    const items = grouped.get(Number(devolucion.id)) || [];

    return {
      ...devolucion,
      items,
      tirilla: buildDevolucionTicket(devolucion, items)
    };
  });
}

exports.getPedidosElegibles = async (_req, res) => {
  try {
    const pedidos = await getReturnableOrders(db.promise());
    return res.json(pedidos);
  } catch (error) {
    return res.status(500).json({
      message: "Error al cargar pedidos elegibles para devolucion",
      error: error.message
    });
  }
};

exports.getDevoluciones = async (req, res) => {
  const filters = [];
  const values = [];

  if (req.query.pedido_id) {
    filters.push("d.pedido_id = ?");
    values.push(Number(req.query.pedido_id));
  }

  if ((req.user.rol || req.user.rol_id) === "cliente") {
    filters.push("d.usuario_id = ?");
    values.push(Number(req.user.id));
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const [rows] = await db.promise().execute(
      `
        SELECT
          d.id,
          d.pedido_id,
          d.usuario_id,
          d.procesado_por,
          d.motivo,
          d.observaciones,
          d.total_reintegrado,
          d.creado_en AS fecha,
          u.nombre AS cliente,
          p.estado_pago
        FROM devoluciones d
        JOIN usuarios u ON u.id = d.usuario_id
        JOIN pedidos p ON p.id = d.pedido_id
        ${whereClause}
        ORDER BY d.creado_en DESC, d.id DESC
      `,
      values
    );

    const devoluciones = await attachReturnItems(db.promise(), rows);
    return res.json(devoluciones);
  } catch (error) {
    return res.status(500).json({
      message: "Error al obtener devoluciones",
      error: error.message
    });
  }
};

exports.crearDevolucion = async (req, res) => {
  const pedidoId = Number(req.body.pedido_id);
  const motivo = String(req.body.motivo || "").trim();
  const observaciones = String(req.body.observaciones || "").trim();
  const requestItems = Array.isArray(req.body.items)
    ? req.body.items
        .map((item) => ({
          detalle_pedido_id: Number(item.detalle_pedido_id),
          cantidad: Number(item.cantidad)
        }))
        .filter((item) => item.detalle_pedido_id && item.cantidad > 0)
    : [];

  if (!pedidoId || !motivo || requestItems.length === 0) {
    return res.status(400).json({
      message: "Pedido, motivo y al menos un producto valido son obligatorios"
    });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [pedidoRows] = await connection.execute(
      `
        SELECT
          p.id,
          p.usuario_id,
          p.estado,
          p.estado_pago,
          p.total_neto AS total,
          p.fecha_pedido AS fecha,
          u.nombre AS cliente
        FROM pedidos p
        JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.id = ?
        LIMIT 1
      `,
      [pedidoId]
    );

    if (pedidoRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const pedido = pedidoRows[0];

    if (!RETURNABLE_ORDER_STATES.includes(String(pedido.estado || ""))) {
      await connection.rollback();
      return res.status(400).json({
        message: "Solo puedes registrar devoluciones para pedidos ya despachados o entregados"
      });
    }

    const [detailRows] = await connection.execute(
      `
        SELECT
          dp.id AS detalle_pedido_id,
          dp.producto_id,
          dp.cantidad AS cantidad_pedida,
          dp.precio_unitario,
          p.nombre,
          p.descripcion,
          p.imagen_url,
          c.nombre AS categoria
        FROM detalles_pedido dp
        JOIN productos p ON p.id = dp.producto_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE dp.pedido_id = ?
        ORDER BY dp.id ASC
      `,
      [pedidoId]
    );

    if (detailRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "El pedido no tiene productos para devolver" });
    }

    const detailIds = detailRows.map((row) => Number(row.detalle_pedido_id));
    const detailPlaceholders = detailIds.map(() => "?").join(", ");
    const [returnedRows] = await connection.query(
      `
        SELECT
          detalle_pedido_id,
          COALESCE(SUM(cantidad), 0) AS cantidad_devuelta
        FROM detalles_devolucion
        WHERE detalle_pedido_id IN (${detailPlaceholders})
        GROUP BY detalle_pedido_id
      `,
      detailIds
    );

    const returnedMap = new Map(
      returnedRows.map((row) => [Number(row.detalle_pedido_id), Number(row.cantidad_devuelta || 0)])
    );
    const requestMap = new Map(requestItems.map((item) => [item.detalle_pedido_id, item.cantidad]));
    const detailMap = new Map(detailRows.map((row) => [Number(row.detalle_pedido_id), row]));
    const validatedItems = [];
    let totalReintegrado = 0;

    for (const requestItem of requestItems) {
      const detail = detailMap.get(Number(requestItem.detalle_pedido_id));

      if (!detail) {
        throw new Error("Uno de los productos no pertenece al pedido seleccionado");
      }

      const alreadyReturned = returnedMap.get(Number(detail.detalle_pedido_id)) || 0;
      const returnableQuantity = Number(detail.cantidad_pedida || 0) - alreadyReturned;

      if (requestItem.cantidad > returnableQuantity) {
        throw new Error(`No puedes devolver mas unidades de ${detail.nombre}`);
      }

      const subtotal = Number(requestItem.cantidad) * Number(detail.precio_unitario || 0);
      totalReintegrado += subtotal;

      validatedItems.push({
        detalle_pedido_id: Number(detail.detalle_pedido_id),
        producto_id: Number(detail.producto_id),
        nombre: detail.nombre,
        descripcion: detail.descripcion,
        imagen_url: detail.imagen_url,
        categoria: detail.categoria,
        cantidad: Number(requestItem.cantidad),
        precio_unitario: Number(detail.precio_unitario || 0),
        subtotal
      });
    }

    const [devolucionResult] = await connection.execute(
      `
        INSERT INTO devoluciones
          (pedido_id, usuario_id, procesado_por, motivo, observaciones, total_reintegrado)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        pedidoId,
        Number(pedido.usuario_id),
        Number(req.user.id),
        motivo,
        observaciones || null,
        Number(totalReintegrado.toFixed(2))
      ]
    );

    for (const item of validatedItems) {
      await connection.execute(
        `
          INSERT INTO detalles_devolucion
            (devolucion_id, detalle_pedido_id, producto_id, cantidad, precio_unitario)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          Number(devolucionResult.insertId),
          item.detalle_pedido_id,
          item.producto_id,
          item.cantidad,
          item.precio_unitario
        ]
      );

      await connection.execute(
        `
          INSERT INTO movimientos_inventario
            (producto_id, cantidad, tipo, motivo, usuario_id, pedido_id, precio_unitario_referencia)
          VALUES (?, ?, 'entrada', 'devolucion_cliente', ?, ?, ?)
        `,
        [
          item.producto_id,
          item.cantidad,
          Number(req.user.id),
          pedidoId,
          item.precio_unitario
        ]
      );
    }

    const fullReturn = detailRows.every((detail) => {
      const alreadyReturned = returnedMap.get(Number(detail.detalle_pedido_id)) || 0;
      const requestedReturn = requestMap.get(Number(detail.detalle_pedido_id)) || 0;

      return alreadyReturned + requestedReturn >= Number(detail.cantidad_pedida || 0);
    });

    await connection.execute(
      "UPDATE pedidos SET estado_pago = ? WHERE id = ?",
      [fullReturn ? "reembolsado" : "aprobado", pedidoId]
    );

    await logAudit(connection, {
      usuarioId: Number(req.user.id),
      accion: "crear",
      tabla: "devoluciones",
      registroId: Number(devolucionResult.insertId),
      valoresNuevos: {
        devolucion_id: Number(devolucionResult.insertId),
        pedido_id: pedidoId,
        total_reintegrado: Number(totalReintegrado.toFixed(2)),
        motivo,
        observaciones,
        items: validatedItems.map((item) => ({
          detalle_pedido_id: item.detalle_pedido_id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario
        }))
      },
      ipAddress: req.ip
    });

    await connection.commit();

    const devolucion = {
      id: Number(devolucionResult.insertId),
      pedido_id: pedidoId,
      usuario_id: Number(pedido.usuario_id),
      procesado_por: Number(req.user.id),
      motivo,
      observaciones,
      total_reintegrado: Number(totalReintegrado.toFixed(2)),
      fecha: new Date().toISOString(),
      cliente: pedido.cliente,
      estado_pago: fullReturn ? "reembolsado" : "aprobado"
    };

    return res.status(201).json({
      message: "Devolucion registrada correctamente",
      devolucion_id: Number(devolucionResult.insertId),
      total_reintegrado: Number(totalReintegrado.toFixed(2)),
      tirilla: buildDevolucionTicket(devolucion, validatedItems)
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      message: "No se pudo registrar la devolucion",
      error: error.message
    });
  } finally {
    connection.release();
  }
};
