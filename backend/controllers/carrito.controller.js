const db = require("../config/db");
const { logAudit } = require("../utils/audit");
const { getDiscountForQuantity } = require("../utils/pricing");

async function getCartRows(connection, userId) {
  const [rows] = await connection.execute(
    `
      SELECT
        cc.id,
        cc.usuario_id,
        cc.producto_id,
        cc.cantidad,
        cc.agregado_en,
        p.nombre,
        p.descripcion,
        p.imagen_url,
        p.precio_detal AS precio_venta,
        p.stock_actual AS stock,
        p.descuento_cantidad_minima,
        p.descuento_porcentaje,
        p.categoria_id,
        c.nombre AS categoria
      FROM carrito_compras cc
      JOIN productos p ON p.id = cc.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE cc.usuario_id = ? AND p.activo = 1
      ORDER BY cc.agregado_en DESC
    `,
    [userId]
  );

  return rows.map((item) => {
    const pricing = getDiscountForQuantity(item, item.cantidad);

    return {
      ...item,
      precio_lista: Number(item.precio_venta),
      ...pricing,
      subtotal: pricing.subtotalFinal
    };
  });
}

exports.getCarrito = async (req, res) => {
  try {
    const items = await getCartRows(db.promise(), req.user.id);
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener carrito", error: error.message });
  }
};

exports.agregarItem = async (req, res) => {
  const { producto_id, cantidad = 1 } = req.body;
  const cantidadFinal = Number(cantidad || 1);

  if (!producto_id || cantidadFinal <= 0) {
    return res.status(400).json({ message: "Producto y cantidad validos son obligatorios" });
  }

  try {
    const [productos] = await db.promise().execute(
      `
        SELECT id, nombre, stock_actual
        , descuento_cantidad_minima, descuento_porcentaje
        FROM productos
        WHERE id = ? AND activo = 1
      `,
      [producto_id]
    );

    if (productos.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const producto = productos[0];

    const [existentes] = await db.promise().execute(
      `
        SELECT id, cantidad
        FROM carrito_compras
        WHERE usuario_id = ? AND producto_id = ?
        LIMIT 1
      `,
      [req.user.id, producto_id]
    );

    const cantidadTotal = cantidadFinal + Number(existentes[0]?.cantidad || 0);

    if (cantidadTotal > Number(producto.stock_actual)) {
      return res.status(400).json({
        message: `No hay suficiente stock para ${producto.nombre}`
      });
    }

    if (existentes.length > 0) {
      await db.promise().execute(
        "UPDATE carrito_compras SET cantidad = ? WHERE id = ?",
        [cantidadTotal, existentes[0].id]
      );
    } else {
      await db.promise().execute(
        `
          INSERT INTO carrito_compras (usuario_id, producto_id, cantidad)
          VALUES (?, ?, ?)
        `,
        [req.user.id, producto_id, cantidadFinal]
      );
    }

    const items = await getCartRows(db.promise(), req.user.id);
    return res.status(201).json({ message: "Producto agregado al carrito", items });
  } catch (error) {
    return res.status(500).json({ message: "Error al agregar al carrito", error: error.message });
  }
};

exports.actualizarItem = async (req, res) => {
  const cantidad = Number(req.body.cantidad);

  if (!cantidad || cantidad < 1) {
    return res.status(400).json({ message: "La cantidad debe ser mayor que cero" });
  }

  try {
    const [items] = await db.promise().execute(
      `
        SELECT cc.id, cc.producto_id, p.nombre, p.stock_actual
        , p.descuento_cantidad_minima, p.descuento_porcentaje
        FROM carrito_compras cc
        JOIN productos p ON p.id = cc.producto_id
        WHERE cc.id = ? AND cc.usuario_id = ?
        LIMIT 1
      `,
      [req.params.id, req.user.id]
    );

    if (items.length === 0) {
      return res.status(404).json({ message: "Item del carrito no encontrado" });
    }

    if (cantidad > Number(items[0].stock_actual)) {
      return res.status(400).json({
        message: `No hay suficiente stock para ${items[0].nombre}`
      });
    }

    await db.promise().execute(
      "UPDATE carrito_compras SET cantidad = ? WHERE id = ?",
      [cantidad, req.params.id]
    );

    const cart = await getCartRows(db.promise(), req.user.id);
    return res.json({ message: "Cantidad actualizada", items: cart });
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar carrito", error: error.message });
  }
};

exports.eliminarItem = async (req, res) => {
  try {
    const [result] = await db.promise().execute(
      "DELETE FROM carrito_compras WHERE id = ? AND usuario_id = ?",
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Item del carrito no encontrado" });
    }

    const items = await getCartRows(db.promise(), req.user.id);
    return res.json({ message: "Producto eliminado del carrito", items });
  } catch (error) {
    return res.status(500).json({ message: "Error al eliminar del carrito", error: error.message });
  }
};

exports.vaciarCarrito = async (req, res) => {
  try {
    await db.promise().execute(
      "DELETE FROM carrito_compras WHERE usuario_id = ?",
      [req.user.id]
    );

    return res.json({ message: "Carrito vaciado" });
  } catch (error) {
    return res.status(500).json({ message: "Error al vaciar carrito", error: error.message });
  }
};

exports.checkout = async (req, res) => {
  const { metodo = "efectivo" } = req.body;
  const estadoPagoInicial = "aprobado";
  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [usuarios] = await connection.execute(
      `
        SELECT id, nombre, email, telefono, direccion
        FROM usuarios
        WHERE id = ?
        LIMIT 1
      `,
      [req.user.id]
    );

    if (usuarios.length === 0) {
      throw new Error("Usuario no encontrado");
    }

    const comprador = usuarios[0];
    const telefono = String(comprador.telefono || "").trim();
    const direccion = String(comprador.direccion || "").trim();

    if (!telefono || !direccion) {
      throw new Error("Para comprar debes registrar telefono y direccion en tu perfil");
    }

    const items = await getCartRows(connection, req.user.id);

    if (items.length === 0) {
      throw new Error("Tu carrito esta vacio");
    }

    let total = 0;
    let subtotalBase = 0;

    for (const item of items) {
      if (Number(item.cantidad) > Number(item.stock)) {
        throw new Error(`No hay suficiente stock para ${item.nombre}`);
      }

      total += Number(item.subtotal || 0);
      subtotalBase += Number(item.subtotalBase || 0);
    }

    const [pedidoResult] = await connection.execute(
      `
        INSERT INTO pedidos
          (usuario_id, estado, monto_total, retencion_fuente, total_neto, estado_pago)
        VALUES (?, 'pendiente', ?, 0, ?, ?)
      `,
      [req.user.id, subtotalBase, total, estadoPagoInicial]
    );

    for (const item of items) {
      await connection.execute(
        `
        INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario)
        VALUES (?, ?, ?, ?)
      `,
        [pedidoResult.insertId, item.producto_id, item.cantidad, item.precioAplicado]
      );
    }

    await connection.execute(
      `
        INSERT INTO pagos (pedido_id, monto, metodo, estado, retencion_aplicada)
        VALUES (?, ?, ?, ?, 0)
      `,
      [pedidoResult.insertId, total, metodo, estadoPagoInicial]
    );

    await connection.execute(
      "DELETE FROM carrito_compras WHERE usuario_id = ?",
      [req.user.id]
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
        metodo_pago: metodo,
        items: items.map((item) => ({
          producto_id: item.producto_id,
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precioAplicado),
          descuento_porcentaje: Number(item.descuentoPorcentaje || 0)
        }))
      },
      ipAddress: req.ip
    });

    await connection.commit();

    return res.status(201).json({
      message: "Compra realizada correctamente",
      pedido_id: pedidoResult.insertId,
      total,
      tirilla: {
        tipo: "venta",
        numero: `V-${pedidoResult.insertId}`,
        fecha: new Date().toISOString(),
        cliente: comprador.nombre || comprador.email || "Cliente",
        telefono,
        direccion,
        estado: "pendiente",
        estado_pago: estadoPagoInicial,
        subtotal: subtotalBase,
        total,
        metodo,
        items: items.map((item) => ({
          producto_id: Number(item.producto_id),
          nombre: item.nombre,
          imagen_url: item.imagen_url,
          categoria: item.categoria,
          cantidad: Number(item.cantidad || 0),
          precio_unitario: Number(item.precioAplicado || item.precio_venta || 0),
          subtotal: Number(item.subtotal || 0),
          descuento_porcentaje: Number(item.descuentoPorcentaje || 0)
        }))
      }
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      message: "No se pudo completar la compra",
      error: error.message
    });
  } finally {
    connection.release();
  }
};
