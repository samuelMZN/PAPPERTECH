const db = require("../config/db");
const { logAudit } = require("../utils/audit");

async function resolveCategoriaId(categoriaId) {
  if (categoriaId) {
    return Number(categoriaId);
  }

  const [categorias] = await db.promise().query(
    "SELECT id FROM categorias ORDER BY id ASC LIMIT 1"
  );

  if (categorias.length > 0) {
    return categorias[0].id;
  }

  const [resultado] = await db.promise().execute(
    "INSERT INTO categorias (nombre) VALUES ('General')"
  );

  return resultado.insertId;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function buildProductoSelect(whereClause = "WHERE p.activo = 1") {
  return `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.precio_mayor AS precio_compra,
      p.precio_detal AS precio_venta,
      p.stock_actual AS stock,
      p.stock_minimo,
      p.descuento_cantidad_minima,
      p.descuento_porcentaje,
      p.categoria_id,
      p.marca_id,
      p.proveedor_id,
      p.imagen_url,
      p.activo,
      p.creado_en,
      p.actualizado_en,
      c.nombre AS categoria,
      m.nombre AS marca,
      pr.nombre AS proveedor,
      COALESCE(v.unidades_vendidas, 0) AS unidades_vendidas
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN marcas m ON m.id = p.marca_id
    LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
    LEFT JOIN (
      SELECT
        dp.producto_id,
        SUM(dp.cantidad) AS unidades_vendidas
      FROM detalles_pedido dp
      JOIN pedidos pe ON pe.id = dp.pedido_id
      WHERE pe.estado != 'cancelado'
      GROUP BY dp.producto_id
    ) v ON v.producto_id = p.id
    ${whereClause}
    ORDER BY p.id DESC
  `;
}

async function registerInventoryMovement(executor, payload) {
  const {
    productoId,
    cantidad,
    tipo,
    motivo,
    proveedorId = null,
    usuarioId
  } = payload;

  if (!cantidad) {
    return;
  }

  await executor.execute(
    `
      INSERT INTO movimientos_inventario
        (producto_id, cantidad, tipo, motivo, proveedor_id, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [productoId, cantidad, tipo, motivo, proveedorId, usuarioId]
  );
}

exports.getProductos = async (_req, res) => {
  try {
    const [productos] = await db.promise().query(buildProductoSelect());

    return res.json(productos);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener productos", error: error.message });
  }
};

exports.getProductoById = async (req, res) => {
  try {
    const [productos] = await db.promise().execute(
      buildProductoSelect("WHERE p.id = ?"),
      [req.params.id]
    );

    if (productos.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    return res.json(productos[0]);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener producto", error: error.message });
  }
};

exports.crearProducto = async (req, res) => {
  const {
    nombre,
    descripcion = "",
    precio_compra = 0,
    precio_venta = 0,
    stock_inicial = 0,
    stock_minimo = 5,
    descuento_cantidad_minima = null,
    descuento_porcentaje = null,
    categoria_id = null,
    marca_id = null,
    proveedor_id = null,
    imagen_url = ""
  } = req.body;

  if (!nombre || Number(precio_venta) <= 0) {
    return res.status(400).json({ message: "Nombre y precio de venta validos son obligatorios" });
  }

  try {
    const connection = await db.promise().getConnection();
    const categoriaFinal = await resolveCategoriaId(categoria_id);

    try {
      await connection.beginTransaction();

      const precioVentaFinal = Number(precio_venta);
      const precioCompraFinal = hasValue(precio_compra)
        ? Number(precio_compra)
        : precioVentaFinal;

      const [resultado] = await connection.execute(
        `
          INSERT INTO productos
            (
              nombre, descripcion, categoria_id, marca_id, proveedor_id,
              precio_detal, precio_mayor, stock_actual, stock_minimo,
              descuento_cantidad_minima, descuento_porcentaje, imagen_url
            )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        `,
        [
          nombre,
          descripcion,
          categoriaFinal,
          marca_id ? Number(marca_id) : null,
          proveedor_id ? Number(proveedor_id) : null,
          precioVentaFinal,
          precioCompraFinal,
          Number(stock_minimo) || 5,
          descuento_cantidad_minima ? Number(descuento_cantidad_minima) : null,
          descuento_porcentaje ? Number(descuento_porcentaje) : null,
          imagen_url || null
        ]
      );

      if (Number(stock_inicial) > 0) {
        await registerInventoryMovement(connection, {
          productoId: resultado.insertId,
          cantidad: Math.abs(Number(stock_inicial)),
          tipo: "entrada",
          motivo: "stock_inicial",
          proveedorId: proveedor_id ? Number(proveedor_id) : null,
          usuarioId: req.user.id
        });
      }

      await logAudit(connection, {
        usuarioId: req.user.id,
        accion: "crear",
        tabla: "productos",
        registroId: resultado.insertId,
        valoresNuevos: {
          nombre,
          descripcion,
          categoria_id: categoriaFinal,
          marca_id: marca_id ? Number(marca_id) : null,
          proveedor_id: proveedor_id ? Number(proveedor_id) : null,
          precio_venta: precioVentaFinal,
          precio_compra: precioCompraFinal,
          stock_minimo: Number(stock_minimo) || 5,
          descuento_cantidad_minima: descuento_cantidad_minima
            ? Number(descuento_cantidad_minima)
            : null,
          descuento_porcentaje: descuento_porcentaje ? Number(descuento_porcentaje) : null,
          stock_inicial: Number(stock_inicial) || 0,
          imagen_url: imagen_url || null
        },
        ipAddress: req.ip
      });

      await connection.commit();

      return res.status(201).json({
        message: "Producto creado correctamente",
        id: resultado.insertId
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({ message: "Error al crear producto", error: error.message });
  }
};

exports.actualizarProducto = async (req, res) => {
  const {
    nombre,
    descripcion = "",
    precio_compra = 0,
    precio_venta = 0,
    ajuste_stock = 0,
    ajuste_motivo = "ajuste_manual",
    stock_minimo = 5,
    descuento_cantidad_minima = null,
    descuento_porcentaje = null,
    categoria_id = null,
    marca_id = null,
    proveedor_id = null,
    imagen_url = ""
  } = req.body;

  if (!nombre || Number(precio_venta) <= 0) {
    return res.status(400).json({ message: "Nombre y precio de venta validos son obligatorios" });
  }

  try {
    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.execute(
        buildProductoSelect("WHERE p.id = ?"),
        [req.params.id]
      );

      if (existingRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      const categoriaFinal = await resolveCategoriaId(categoria_id);
      const ajuste = Number(ajuste_stock || 0);
      const stockActual = Number(existingRows[0].stock || 0);
      const costoAnterior = Number(existingRows[0].precio_compra || 0);
      const precioVentaFinal = Number(precio_venta);
      const precioCompraIngresado = hasValue(precio_compra)
        ? Number(precio_compra)
        : costoAnterior || precioVentaFinal;
      let precioCompraFinal = precioCompraIngresado;

      if (ajuste > 0 && precioCompraIngresado > 0 && stockActual > 0) {
        precioCompraFinal =
          (stockActual * costoAnterior + ajuste * precioCompraIngresado) /
          (stockActual + ajuste);
      }

      const [resultado] = await connection.execute(
        `
          UPDATE productos
          SET nombre = ?, descripcion = ?, precio_detal = ?, precio_mayor = ?,
              stock_minimo = ?, descuento_cantidad_minima = ?, descuento_porcentaje = ?,
              categoria_id = ?, marca_id = ?, proveedor_id = ?, imagen_url = ?
          WHERE id = ?
        `,
        [
          nombre,
          descripcion,
          precioVentaFinal,
          Number(precioCompraFinal.toFixed(2)),
          Number(stock_minimo) || 5,
          descuento_cantidad_minima ? Number(descuento_cantidad_minima) : null,
          descuento_porcentaje ? Number(descuento_porcentaje) : null,
          categoriaFinal,
          marca_id ? Number(marca_id) : null,
          proveedor_id ? Number(proveedor_id) : null,
          imagen_url || null,
          req.params.id
        ]
      );

      if (resultado.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      if (ajuste !== 0) {
        if (ajuste < 0 && stockActual < Math.abs(ajuste)) {
          await connection.rollback();
          return res.status(400).json({
            message: "No puedes sacar mas stock del disponible"
          });
        }

        await registerInventoryMovement(connection, {
          productoId: Number(req.params.id),
          cantidad: ajuste > 0 ? ajuste : -Math.abs(ajuste),
          tipo: ajuste > 0 ? "entrada" : "salida",
          motivo: ajuste_motivo || "ajuste_manual",
          proveedorId: proveedor_id ? Number(proveedor_id) : null,
          usuarioId: req.user.id
        });
      }

      await logAudit(connection, {
        usuarioId: req.user.id,
        accion: "actualizar",
        tabla: "productos",
        registroId: Number(req.params.id),
        valoresAntiguos: existingRows[0],
        valoresNuevos: {
          nombre,
          descripcion,
          precio_venta: precioVentaFinal,
          precio_compra: Number(precioCompraFinal.toFixed(2)),
          stock_minimo: Number(stock_minimo) || 5,
          descuento_cantidad_minima: descuento_cantidad_minima
            ? Number(descuento_cantidad_minima)
            : null,
          descuento_porcentaje: descuento_porcentaje ? Number(descuento_porcentaje) : null,
          categoria_id: categoriaFinal,
          marca_id: marca_id ? Number(marca_id) : null,
          proveedor_id: proveedor_id ? Number(proveedor_id) : null,
          imagen_url: imagen_url || null,
          ajuste_stock: ajuste,
          ajuste_motivo
        },
        ipAddress: req.ip
      });

      await connection.commit();

      return res.json({ message: "Producto actualizado correctamente" });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar producto", error: error.message });
  }
};

exports.eliminarProducto = async (req, res) => {
  try {
    const mode = String(req.query.mode || "deactivate").toLowerCase();
    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.execute(
        buildProductoSelect("WHERE p.id = ?"),
        [req.params.id]
      );

      if (existingRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      if (mode === "hard") {
        const [[usage]] = await connection.query(
          `
            SELECT
              (SELECT COUNT(*) FROM detalles_pedido WHERE producto_id = ?) AS pedidos_relacionados,
              (SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id = ?) AS movimientos_relacionados
          `,
          [req.params.id, req.params.id]
        );

        if (Number(usage.pedidos_relacionados || 0) > 0 || Number(usage.movimientos_relacionados || 0) > 0) {
          await connection.rollback();
          return res.status(400).json({
            message: "No puedes borrar definitivamente este producto porque ya tiene historial de ventas o inventario"
          });
        }

        await connection.execute(
          "DELETE FROM carrito_compras WHERE producto_id = ?",
          [req.params.id]
        );
        await connection.execute("DELETE FROM productos WHERE id = ?", [req.params.id]);

        await logAudit(connection, {
          usuarioId: req.user.id,
          accion: "eliminar_definitivo",
          tabla: "productos",
          registroId: Number(req.params.id),
          valoresAntiguos: existingRows[0] || null,
          valoresNuevos: null,
          ipAddress: req.ip
        });

        await connection.commit();
        return res.json({ message: "Producto eliminado definitivamente" });
      }

      const [resultado] = await connection.execute(
        "UPDATE productos SET activo = 0 WHERE id = ?",
        [req.params.id]
      );

      if (resultado.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      await logAudit(connection, {
        usuarioId: req.user.id,
        accion: "desactivar",
        tabla: "productos",
        registroId: Number(req.params.id),
        valoresAntiguos: existingRows[0] || null,
        valoresNuevos: { activo: 0 },
        ipAddress: req.ip
      });

      await connection.commit();
      return res.json({ message: "Producto desactivado correctamente" });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({ message: "Error al eliminar producto", error: error.message });
  }
};
