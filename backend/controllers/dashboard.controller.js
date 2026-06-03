const db = require("../config/db");

function cloneDate(date) {
  return new Date(date.getTime());
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeForSql(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseDateInput(value, boundary = "start") {
  if (!value) {
    return null;
  }

  const [year, month, day] = String(value)
    .split("-")
    .map((item) => Number(item));

  if (!year || !month || !day) {
    return null;
  }

  if (boundary === "end") {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function buildReportDateRange(periodo = "mes", fechaDesde, fechaHasta) {
  const parsedFrom = parseDateInput(fechaDesde, "start");
  const parsedTo = parseDateInput(fechaHasta, "end");

  if (parsedFrom || parsedTo) {
    const safeTo = parsedTo || endOfDay(new Date());
    const safeFrom = parsedFrom || startOfDay(safeTo);
    return {
      periodo: "personalizado",
      fechaDesde: safeFrom,
      fechaHasta: safeTo
    };
  }

  const today = new Date();
  const todayStart = startOfDay(today);

  switch (periodo) {
    case "dia":
      return {
        periodo: "dia",
        fechaDesde: todayStart,
        fechaHasta: endOfDay(today)
      };
    case "semana": {
      const weekStart = cloneDate(todayStart);
      const weekday = weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1;
      weekStart.setDate(weekStart.getDate() - weekday);
      return {
        periodo: "semana",
        fechaDesde: weekStart,
        fechaHasta: endOfDay(today)
      };
    }
    case "anio":
      return {
        periodo: "anio",
        fechaDesde: new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0),
        fechaHasta: endOfDay(today)
      };
    case "mes":
    default:
      return {
        periodo: "mes",
        fechaDesde: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0),
        fechaHasta: endOfDay(today)
      };
  }
}

function resolvePeriodBucket(periodo, fechaDesde, fechaHasta) {
  const diffInDays = Math.max(
    1,
    Math.ceil((fechaHasta.getTime() - fechaDesde.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (periodo === "anio" || diffInDays > 90) {
    return {
      expression: "DATE_FORMAT(p.fecha_pedido, '%Y-%m')",
      label: "mes"
    };
  }

  return {
    expression: "DATE_FORMAT(p.fecha_pedido, '%Y-%m-%d')",
    label: "dia"
  };
}

function toNumber(value, decimals = null) {
  const amount = Number(value || 0);
  if (decimals === null) {
    return amount;
  }

  return Number(amount.toFixed(decimals));
}

exports.getAdminResumen = async (_req, res) => {
  try {
    const [
      ventasRows,
      costosRows,
      comprasRows,
      perdidasRows,
      topProductosRows,
      pedidosRecientesRows,
      movimientosRows,
      lowStockRows,
      usuariosRows,
      inventarioRows
    ] = await Promise.all([
      db.promise().query(`
        SELECT
          COUNT(*) AS total_pedidos,
          COUNT(CASE WHEN estado != 'cancelado' THEN 1 END) AS ventas_validas,
          COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) AS pedidos_cancelados,
          COALESCE(SUM(CASE WHEN estado != 'cancelado' THEN total_neto ELSE 0 END), 0) AS ingresos_totales,
          COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total_neto ELSE 0 END), 0) AS ventas_entregadas
        FROM pedidos
      `),
      db.promise().query(`
        SELECT
          COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
          COALESCE(SUM(dp.cantidad * COALESCE(pr.precio_mayor, 0)), 0) AS costo_total_vendido
        FROM detalles_pedido dp
        JOIN pedidos p ON p.id = dp.pedido_id
        JOIN productos pr ON pr.id = dp.producto_id
        WHERE p.estado != 'cancelado'
      `),
      db.promise().query(`
        SELECT
          COALESCE(SUM(ABS(m.cantidad)), 0) AS unidades_compradas,
          COALESCE(
            SUM(
              ABS(m.cantidad) * COALESCE(m.precio_unitario_referencia, pr.precio_mayor, 0)
            ),
            0
          ) AS compras_inventario
        FROM movimientos_inventario m
        JOIN productos pr ON pr.id = m.producto_id
        WHERE
          m.tipo = 'entrada'
          AND m.motivo = 'compra_proveedor'
      `),
      db.promise().query(`
        SELECT
          COALESCE(SUM(ABS(m.cantidad)), 0) AS unidades_perdidas,
          COALESCE(SUM(ABS(m.cantidad) * COALESCE(pr.precio_mayor, 0)), 0) AS perdidas_inventario
        FROM movimientos_inventario m
        JOIN productos pr ON pr.id = m.producto_id
        WHERE
          m.tipo = 'salida'
          AND (m.pedido_id IS NULL OR m.pedido_id = 0)
          AND m.motivo IN ('ajuste_manual', 'ajuste_salida', 'merma', 'perdida')
      `),
      db.promise().query(`
        SELECT
          pr.id,
          pr.nombre,
          SUM(dp.cantidad) AS unidades_vendidas,
          SUM(dp.cantidad * dp.precio_unitario) AS total_vendido
        FROM detalles_pedido dp
        JOIN pedidos p ON p.id = dp.pedido_id
        JOIN productos pr ON pr.id = dp.producto_id
        WHERE p.estado != 'cancelado'
        GROUP BY pr.id, pr.nombre
        ORDER BY unidades_vendidas DESC, total_vendido DESC
        LIMIT 5
      `),
      db.promise().query(`
        SELECT
          p.id,
          p.estado,
          p.total_neto,
          p.fecha_pedido,
          u.nombre AS cliente
        FROM pedidos p
        JOIN usuarios u ON u.id = p.usuario_id
        ORDER BY p.fecha_pedido DESC, p.id DESC
        LIMIT 6
      `),
      db.promise().query(`
        SELECT
          m.id,
          m.tipo,
          m.motivo,
          m.cantidad,
          m.creado_en,
          pr.nombre AS producto,
          u.nombre AS usuario
        FROM movimientos_inventario m
        JOIN productos pr ON pr.id = m.producto_id
        JOIN usuarios u ON u.id = m.usuario_id
        ORDER BY m.creado_en DESC, m.id DESC
        LIMIT 8
      `),
      db.promise().query(`
        SELECT
          id,
          nombre,
          stock_actual,
          stock_minimo
        FROM productos
        WHERE activo = 1 AND stock_actual <= stock_minimo
        ORDER BY stock_actual ASC, nombre ASC
        LIMIT 8
      `),
      db.promise().query(`
        SELECT rol, COUNT(*) AS total
        FROM usuarios
        WHERE activo = 1
        GROUP BY rol
      `),
      db.promise().query(`
        SELECT
          COUNT(*) AS productos_activos,
          COALESCE(SUM(stock_actual), 0) AS unidades_disponibles,
          SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END) AS agotados
        FROM productos
        WHERE activo = 1
      `)
    ]);

    const ventas = ventasRows[0][0];
    const unidadesVendidas = Number(costosRows[0][0]?.unidades_vendidas || 0);
    const costoTotalVendido = Number(costosRows[0][0]?.costo_total_vendido || 0);
    const unidadesCompradas = Number(comprasRows[0][0]?.unidades_compradas || 0);
    const comprasInventario = Number(comprasRows[0][0]?.compras_inventario || 0);
    const perdidasInventario = Number(perdidasRows[0][0]?.perdidas_inventario || 0);
    const unidadesPerdidas = Number(perdidasRows[0][0]?.unidades_perdidas || 0);
    const ingresosTotales = Number(ventas?.ingresos_totales || 0);
    const ventasValidas = Number(ventas?.ventas_validas || 0);
    const utilidadBruta = ingresosTotales - costoTotalVendido;
    const margenBruto = ingresosTotales > 0 ? (utilidadBruta / ingresosTotales) * 100 : 0;
    const ticketPromedio = ventasValidas > 0 ? ingresosTotales / ventasValidas : 0;
    const gananciaNetaAproximada = utilidadBruta - perdidasInventario;
    const saldoNetoCajaAproximado = ingresosTotales - comprasInventario - perdidasInventario;

    return res.json({
      ventas,
      reporte_financiero: {
        ventas_validas: ventasValidas,
        pedidos_cancelados: Number(ventas?.pedidos_cancelados || 0),
        unidades_vendidas: unidadesVendidas,
        unidades_compradas: unidadesCompradas,
        ingresos_totales: ingresosTotales,
        costo_total_vendido: costoTotalVendido,
        compras_inventario: comprasInventario,
        utilidad_bruta: utilidadBruta,
        margen_bruto: Number(margenBruto.toFixed(2)),
        ticket_promedio: Number(ticketPromedio.toFixed(2)),
        perdidas_inventario: perdidasInventario,
        unidades_perdidas: unidadesPerdidas,
        ganancia_neta_aproximada: gananciaNetaAproximada,
        saldo_neto_caja_aproximado: saldoNetoCajaAproximado
      },
      top_productos: topProductosRows[0],
      pedidos_recientes: pedidosRecientesRows[0],
      movimientos_recientes: movimientosRows[0],
      bajo_stock: lowStockRows[0],
      usuarios_por_rol: usuariosRows[0],
      inventario: inventarioRows[0][0]
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al cargar dashboard", error: error.message });
  }
};

exports.getAdminReportes = async (req, res) => {
  try {
    const {
      periodo = "mes",
      fecha_desde: fechaDesdeQuery,
      fecha_hasta: fechaHastaQuery,
      producto_id: productoId,
      proveedor_id: proveedorId
    } = req.query;

    const { periodo: periodoAplicado, fechaDesde, fechaHasta } = buildReportDateRange(
      periodo,
      fechaDesdeQuery,
      fechaHastaQuery
    );

    const salesExpr = "dp.cantidad * dp.precio_unitario";
    const costExpr = "dp.cantidad * COALESCE(pr.precio_mayor, 0)";
    const profitExpr = `(${salesExpr} - ${costExpr})`;
    const filters = [
      "p.estado != 'cancelado'",
      "p.fecha_pedido >= ?",
      "p.fecha_pedido <= ?"
    ];
    const values = [
      formatDateTimeForSql(fechaDesde),
      formatDateTimeForSql(fechaHasta)
    ];

    if (productoId) {
      filters.push("dp.producto_id = ?");
      values.push(Number(productoId));
    }

    if (proveedorId) {
      filters.push("pr.proveedor_id = ?");
      values.push(Number(proveedorId));
    }

    const whereClause = filters.join(" AND ");
    const periodBucket = resolvePeriodBucket(periodoAplicado, fechaDesde, fechaHasta);

    const [
      resumenRows,
      productosRows,
      proveedoresRows,
      categoriasRows,
      periodosRows
    ] = await Promise.all([
      db.promise().query(
        `
          SELECT
            COUNT(DISTINCT p.id) AS ventas_validas,
            COUNT(DISTINCT dp.producto_id) AS productos_vendidos,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          WHERE ${whereClause}
        `,
        values
      ),
      db.promise().query(
        `
          SELECT
            pr.id AS producto_id,
            pr.nombre AS producto,
            COALESCE(cat.nombre, 'Sin categoria') AS categoria,
            COALESCE(prov.nombre, 'Sin proveedor') AS proveedor,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          WHERE ${whereClause}
          GROUP BY pr.id, pr.nombre, categoria, proveedor
          ORDER BY ingresos_totales DESC, unidades_vendidas DESC, producto ASC
          LIMIT 25
        `,
        values
      ),
      db.promise().query(
        `
          SELECT
            COALESCE(prov.id, 0) AS proveedor_id,
            COALESCE(prov.nombre, 'Sin proveedor') AS proveedor,
            COUNT(DISTINCT dp.producto_id) AS productos_vendidos,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          WHERE ${whereClause}
          GROUP BY proveedor_id, proveedor
          ORDER BY ingresos_totales DESC, unidades_vendidas DESC, proveedor ASC
        `,
        values
      ),
      db.promise().query(
        `
          SELECT
            COALESCE(cat.id, 0) AS categoria_id,
            COALESCE(cat.nombre, 'Sin categoria') AS categoria,
            COUNT(DISTINCT dp.producto_id) AS productos_vendidos,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          WHERE ${whereClause}
          GROUP BY categoria_id, categoria
          ORDER BY ingresos_totales DESC, unidades_vendidas DESC, categoria ASC
        `,
        values
      ),
      db.promise().query(
        `
          SELECT
            ${periodBucket.expression} AS periodo,
            COUNT(DISTINCT p.id) AS pedidos,
            COUNT(DISTINCT dp.producto_id) AS productos_vendidos,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          WHERE ${whereClause}
          GROUP BY periodo
          ORDER BY periodo ASC
        `,
        values
      )
    ]);

    const resumen = resumenRows[0][0] || {};
    const ingresosTotales = toNumber(resumen.ingresos_totales);
    const costoTotalEstimado = toNumber(resumen.costo_total_estimado);
    const utilidadBruta = toNumber(resumen.utilidad_bruta);
    const ventasValidas = toNumber(resumen.ventas_validas);
    const margenBruto = ingresosTotales > 0 ? (utilidadBruta / ingresosTotales) * 100 : 0;
    const ticketPromedio = ventasValidas > 0 ? ingresosTotales / ventasValidas : 0;

    return res.json({
      filtros: {
        periodo: periodoAplicado,
        fecha_desde: formatDateOnly(fechaDesde),
        fecha_hasta: formatDateOnly(fechaHasta),
        producto_id: productoId ? String(productoId) : "",
        proveedor_id: proveedorId ? String(proveedorId) : ""
      },
      resumen: {
        ventas_validas: ventasValidas,
        productos_vendidos: toNumber(resumen.productos_vendidos),
        unidades_vendidas: toNumber(resumen.unidades_vendidas),
        ingresos_totales: ingresosTotales,
        costo_total_estimado: costoTotalEstimado,
        utilidad_bruta: utilidadBruta,
        margen_bruto: toNumber(margenBruto, 2),
        ticket_promedio: toNumber(ticketPromedio, 2)
      },
      por_producto: productosRows[0].map((item) => ({
        ...item,
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: toNumber(item.ingresos_totales),
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: toNumber(item.utilidad_bruta),
        margen_bruto:
          Number(item.ingresos_totales || 0) > 0
            ? toNumber((Number(item.utilidad_bruta || 0) / Number(item.ingresos_totales || 0)) * 100, 2)
            : 0
      })),
      por_proveedor: proveedoresRows[0].map((item) => ({
        ...item,
        productos_vendidos: toNumber(item.productos_vendidos),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: toNumber(item.ingresos_totales),
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: toNumber(item.utilidad_bruta),
        margen_bruto:
          Number(item.ingresos_totales || 0) > 0
            ? toNumber((Number(item.utilidad_bruta || 0) / Number(item.ingresos_totales || 0)) * 100, 2)
            : 0
      })),
      por_categoria: categoriasRows[0].map((item) => ({
        ...item,
        productos_vendidos: toNumber(item.productos_vendidos),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: toNumber(item.ingresos_totales),
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: toNumber(item.utilidad_bruta),
        margen_bruto:
          Number(item.ingresos_totales || 0) > 0
            ? toNumber((Number(item.utilidad_bruta || 0) / Number(item.ingresos_totales || 0)) * 100, 2)
            : 0
      })),
      por_periodo: periodosRows[0].map((item) => ({
        ...item,
        pedidos: toNumber(item.pedidos),
        productos_vendidos: toNumber(item.productos_vendidos),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: toNumber(item.ingresos_totales),
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: toNumber(item.utilidad_bruta),
        margen_bruto:
          Number(item.ingresos_totales || 0) > 0
            ? toNumber((Number(item.utilidad_bruta || 0) / Number(item.ingresos_totales || 0)) * 100, 2)
            : 0
      })),
      notas: [
        "La utilidad se estima con el costo promedio actual del producto (precio_mayor).",
        `La evolucion del periodo se agrupa por ${periodBucket.label}.`
      ]
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al cargar reportes del dashboard", error: error.message });
  }
};
