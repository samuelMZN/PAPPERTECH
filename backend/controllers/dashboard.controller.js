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
    const selectedProductId = productoId ? Number(productoId) : null;
    const selectedProviderId = proveedorId ? Number(proveedorId) : null;
    const salesExpr = "dp.cantidad * dp.precio_unitario";
    const costExpr = "dp.cantidad * COALESCE(pr.precio_mayor, 0)";
    const profitExpr = `(${salesExpr} - ${costExpr})`;
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthlyChartStart = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
    const monthlyChartEnd = endOfDay(now);

    const buildSalesScope = (from, to) => {
      const filters = [
        "p.estado != 'cancelado'",
        "p.fecha_pedido >= ?",
        "p.fecha_pedido <= ?"
      ];
      const values = [formatDateTimeForSql(from), formatDateTimeForSql(to)];

      if (selectedProductId) {
        filters.push("dp.producto_id = ?");
        values.push(selectedProductId);
      }

      if (selectedProviderId) {
        filters.push("pr.proveedor_id = ?");
        values.push(selectedProviderId);
      }

      return {
        whereClause: filters.join(" AND "),
        values
      };
    };

    const buildMovementScope = (from, to, extraFilters = []) => {
      const filters = ["m.creado_en >= ?", "m.creado_en <= ?"];
      const values = [formatDateTimeForSql(from), formatDateTimeForSql(to)];

      if (selectedProductId) {
        filters.push("m.producto_id = ?");
        values.push(selectedProductId);
      }

      if (selectedProviderId) {
        filters.push("m.proveedor_id = ?");
        values.push(selectedProviderId);
      }

      for (const item of extraFilters) {
        filters.push(item.clause);
        if (Array.isArray(item.values)) {
          values.push(...item.values);
        } else if (item.values !== undefined) {
          values.push(item.values);
        }
      }

      return {
        whereClause: filters.join(" AND "),
        values
      };
    };

    const mapMargin = (income, profit) =>
      Number(income || 0) > 0 ? toNumber((Number(profit || 0) / Number(income || 0)) * 100, 2) : 0;

    const normalizeSummary = (row = {}) => {
      const ingresosTotales = toNumber(row.ingresos_totales);
      const costoTotalEstimado = toNumber(row.costo_total_estimado);
      const utilidadBruta = toNumber(row.utilidad_bruta);
      const ventasValidas = toNumber(row.ventas_validas);
      return {
        ventas_validas: ventasValidas,
        productos_vendidos: toNumber(row.productos_vendidos),
        unidades_vendidas: toNumber(row.unidades_vendidas),
        ingresos_totales: ingresosTotales,
        costo_total_estimado: costoTotalEstimado,
        utilidad_bruta: utilidadBruta,
        margen_bruto: mapMargin(ingresosTotales, utilidadBruta),
        ticket_promedio: ventasValidas > 0 ? toNumber(ingresosTotales / ventasValidas, 2) : 0
      };
    };

    const selectedSalesScope = buildSalesScope(fechaDesde, fechaHasta);
    const todaySalesScope = buildSalesScope(todayStart, todayEnd);
    const monthSalesScope = buildSalesScope(monthStart, todayEnd);
    const purchaseMovementScope = buildMovementScope(fechaDesde, fechaHasta, [
      { clause: "m.tipo = 'entrada'" },
      { clause: "m.motivo = 'compra_proveedor'" }
    ]);
    const workerMovementScope = buildMovementScope(fechaDesde, fechaHasta);
    const monthlyChartScope = buildSalesScope(monthlyChartStart, monthlyChartEnd);
    const periodBucket = resolvePeriodBucket(periodoAplicado, fechaDesde, fechaHasta);

    const [
      resumenRows,
      productosRows,
      proveedoresRows,
      categoriasRows,
      periodosRows,
      resumenHoyRows,
      resumenMesRows,
      stockBajoRows,
      ultimasVentasRows,
      graficaMensualRows,
      clientesRegistradosRows,
      clientesNuevosRows,
      clientesTopRows,
      clientesHistorialRows,
      productosProveedorRows,
      comprasProveedorRows,
      ventasTrabajadorRows,
      movimientosTrabajadorRows,
      actividadesTrabajadorRows
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
          WHERE ${selectedSalesScope.whereClause}
        `,
        selectedSalesScope.values
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
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY pr.id, pr.nombre, categoria, proveedor
          ORDER BY unidades_vendidas DESC, ingresos_totales DESC, producto ASC
        `,
        selectedSalesScope.values
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
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY proveedor_id, proveedor
          ORDER BY unidades_vendidas DESC, ingresos_totales DESC, proveedor ASC
        `,
        selectedSalesScope.values
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
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY categoria_id, categoria
          ORDER BY unidades_vendidas DESC, ingresos_totales DESC, categoria ASC
        `,
        selectedSalesScope.values
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
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY periodo
          ORDER BY periodo ASC
        `,
        selectedSalesScope.values
      ),
      db.promise().query(
        `
          SELECT
            COUNT(DISTINCT p.id) AS ventas_validas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          WHERE ${todaySalesScope.whereClause}
        `,
        todaySalesScope.values
      ),
      db.promise().query(
        `
          SELECT
            COUNT(DISTINCT p.id) AS ventas_validas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${costExpr}), 0) AS costo_total_estimado,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM detalles_pedido dp
          JOIN pedidos p ON p.id = dp.pedido_id
          JOIN productos pr ON pr.id = dp.producto_id
          WHERE ${monthSalesScope.whereClause}
        `,
        monthSalesScope.values
      ),
      db.promise().query(
        `
          SELECT
            pr.id AS producto_id,
            pr.nombre AS producto,
            COALESCE(cat.nombre, 'Sin categoria') AS categoria,
            COALESCE(prov.nombre, 'Sin proveedor') AS proveedor,
            pr.stock_actual,
            pr.stock_minimo
          FROM productos pr
          LEFT JOIN categorias cat ON cat.id = pr.categoria_id
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          WHERE pr.activo = 1
            AND pr.stock_actual <= pr.stock_minimo
            ${selectedProductId ? "AND pr.id = ?" : ""}
            ${selectedProviderId ? "AND pr.proveedor_id = ?" : ""}
          ORDER BY (pr.stock_minimo - pr.stock_actual) DESC, pr.stock_actual ASC, pr.nombre ASC
          LIMIT 12
        `,
        [
          ...(selectedProductId ? [selectedProductId] : []),
          ...(selectedProviderId ? [selectedProviderId] : [])
        ]
      ),
      db.promise().query(
        `
          SELECT
            p.id AS pedido_id,
            p.fecha_pedido,
            u.nombre AS cliente,
            p.estado,
            COUNT(DISTINCT dp.id) AS lineas,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS total_venta
          FROM pedidos p
          JOIN usuarios u ON u.id = p.usuario_id
          JOIN detalles_pedido dp ON dp.pedido_id = p.id
          JOIN productos pr ON pr.id = dp.producto_id
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY p.id, p.fecha_pedido, u.nombre, p.estado
          ORDER BY p.fecha_pedido DESC, p.id DESC
          LIMIT 10
        `,
        selectedSalesScope.values
      ),
      db.promise().query(
        `
          SELECT
            DATE_FORMAT(p.fecha_pedido, '%Y-%m') AS periodo,
            COUNT(DISTINCT p.id) AS pedidos,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS ingresos_totales,
            COALESCE(SUM(${profitExpr}), 0) AS utilidad_bruta
          FROM pedidos p
          JOIN detalles_pedido dp ON dp.pedido_id = p.id
          JOIN productos pr ON pr.id = dp.producto_id
          WHERE ${monthlyChartScope.whereClause}
          GROUP BY periodo
          ORDER BY periodo ASC
        `,
        monthlyChartScope.values
      ),
      db.promise().query(`
        SELECT COUNT(*) AS total
        FROM usuarios
        WHERE rol = 'cliente' AND activo = 1
      `),
      db.promise().query(
        `
          SELECT
            DATE_FORMAT(creado_en, '%Y-%m') AS periodo,
            COUNT(*) AS clientes_nuevos
          FROM usuarios
          WHERE rol = 'cliente'
            AND creado_en >= ?
            AND creado_en <= ?
          GROUP BY periodo
          ORDER BY periodo ASC
        `,
        [formatDateTimeForSql(monthlyChartStart), formatDateTimeForSql(monthlyChartEnd)]
      ),
      db.promise().query(
        `
          SELECT
            u.id AS cliente_id,
            u.nombre AS cliente,
            u.email,
            COUNT(DISTINCT p.id) AS compras,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS total_gastado,
            MAX(p.fecha_pedido) AS ultima_compra
          FROM pedidos p
          JOIN usuarios u ON u.id = p.usuario_id
          JOIN detalles_pedido dp ON dp.pedido_id = p.id
          JOIN productos pr ON pr.id = dp.producto_id
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY u.id, u.nombre, u.email
          ORDER BY total_gastado DESC, compras DESC, cliente ASC
          LIMIT 12
        `,
        selectedSalesScope.values
      ),
      db.promise().query(
        `
          SELECT
            p.id AS pedido_id,
            p.fecha_pedido,
            u.id AS cliente_id,
            u.nombre AS cliente,
            COALESCE(SUM(dp.cantidad), 0) AS unidades_vendidas,
            COALESCE(SUM(${salesExpr}), 0) AS total_venta
          FROM pedidos p
          JOIN usuarios u ON u.id = p.usuario_id
          JOIN detalles_pedido dp ON dp.pedido_id = p.id
          JOIN productos pr ON pr.id = dp.producto_id
          WHERE ${selectedSalesScope.whereClause}
          GROUP BY p.id, p.fecha_pedido, u.id, u.nombre
          ORDER BY p.fecha_pedido DESC, p.id DESC
          LIMIT 20
        `,
        selectedSalesScope.values
      ),
      db.promise().query(
        `
          SELECT
            COALESCE(prov.id, 0) AS proveedor_id,
            COALESCE(prov.nombre, 'Sin proveedor') AS proveedor,
            COUNT(pr.id) AS productos,
            COALESCE(SUM(CASE WHEN pr.activo = 1 THEN 1 ELSE 0 END), 0) AS productos_activos,
            COALESCE(SUM(pr.stock_actual), 0) AS stock_total
          FROM productos pr
          LEFT JOIN proveedores prov ON prov.id = pr.proveedor_id
          WHERE 1 = 1
            ${selectedProductId ? "AND pr.id = ?" : ""}
            ${selectedProviderId ? "AND pr.proveedor_id = ?" : ""}
          GROUP BY proveedor_id, proveedor
          ORDER BY productos DESC, stock_total DESC, proveedor ASC
        `,
        [
          ...(selectedProductId ? [selectedProductId] : []),
          ...(selectedProviderId ? [selectedProviderId] : [])
        ]
      ),
      db.promise().query(
        `
          SELECT
            COALESCE(prov.id, 0) AS proveedor_id,
            COALESCE(prov.nombre, 'Sin proveedor') AS proveedor,
            COUNT(*) AS compras,
            COUNT(DISTINCT m.producto_id) AS productos,
            COALESCE(SUM(ABS(m.cantidad)), 0) AS unidades,
            COALESCE(SUM(ABS(m.cantidad) * COALESCE(m.precio_unitario_referencia, 0)), 0) AS total_invertido,
            MAX(m.creado_en) AS ultima_compra
          FROM movimientos_inventario m
          LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
          WHERE ${purchaseMovementScope.whereClause}
          GROUP BY proveedor_id, proveedor
          ORDER BY total_invertido DESC, compras DESC, proveedor ASC
        `,
        purchaseMovementScope.values
      ),
      db.promise().query(
        `
          SELECT
            u.id AS trabajador_id,
            u.nombre AS trabajador,
            COUNT(DISTINCT m.pedido_id) AS ventas,
            COALESCE(SUM(ABS(m.cantidad)), 0) AS unidades_vendidas,
            COALESCE(SUM(ABS(m.cantidad) * COALESCE(dp.precio_unitario, 0)), 0) AS total_venta,
            MAX(m.creado_en) AS ultima_venta
          FROM movimientos_inventario m
          JOIN usuarios u ON u.id = m.usuario_id AND u.rol = 'trabajador'
          LEFT JOIN detalles_pedido dp
            ON dp.pedido_id = m.pedido_id
            AND dp.producto_id = m.producto_id
          WHERE ${buildMovementScope(fechaDesde, fechaHasta, [
            { clause: "m.tipo = 'salida'" },
            { clause: "m.motivo = 'venta_pedido'" }
          ]).whereClause}
          GROUP BY u.id, u.nombre
          ORDER BY total_venta DESC, ventas DESC, trabajador ASC
        `,
        buildMovementScope(fechaDesde, fechaHasta, [
          { clause: "m.tipo = 'salida'" },
          { clause: "m.motivo = 'venta_pedido'" }
        ]).values
      ),
      db.promise().query(
        `
          SELECT
            u.id AS trabajador_id,
            u.nombre AS trabajador,
            COUNT(*) AS movimientos,
            COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN ABS(m.cantidad) ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN m.tipo = 'salida' THEN ABS(m.cantidad) ELSE 0 END), 0) AS salidas,
            MAX(m.creado_en) AS ultimo_movimiento
          FROM movimientos_inventario m
          JOIN usuarios u ON u.id = m.usuario_id AND u.rol = 'trabajador'
          WHERE ${workerMovementScope.whereClause}
          GROUP BY u.id, u.nombre
          ORDER BY movimientos DESC, trabajador ASC
        `,
        workerMovementScope.values
      ),
      db.promise().query(
        `
          SELECT
            u.id AS trabajador_id,
            u.nombre AS trabajador,
            COUNT(*) AS actividades,
            GROUP_CONCAT(DISTINCT a.accion ORDER BY a.accion ASC SEPARATOR ', ') AS acciones,
            MAX(a.creado_en) AS ultima_actividad
          FROM registros_auditoria a
          JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'trabajador'
          WHERE a.creado_en >= ?
            AND a.creado_en <= ?
          GROUP BY u.id, u.nombre
          ORDER BY actividades DESC, trabajador ASC
          LIMIT 12
        `,
        [formatDateTimeForSql(fechaDesde), formatDateTimeForSql(fechaHasta)]
      )
    ]);

    const resumen = normalizeSummary(resumenRows[0][0] || {});
    const resumenHoy = normalizeSummary(resumenHoyRows[0][0] || {});
    const resumenMes = normalizeSummary(resumenMesRows[0][0] || {});

    const porProducto = productosRows[0].map((item) => {
      const ingresos = toNumber(item.ingresos_totales);
      const utilidad = toNumber(item.utilidad_bruta);
      return {
        ...item,
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: ingresos,
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: utilidad,
        margen_bruto: mapMargin(ingresos, utilidad)
      };
    });

    const porProveedor = proveedoresRows[0].map((item) => {
      const ingresos = toNumber(item.ingresos_totales);
      const utilidad = toNumber(item.utilidad_bruta);
      return {
        ...item,
        productos_vendidos: toNumber(item.productos_vendidos),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: ingresos,
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: utilidad,
        margen_bruto: mapMargin(ingresos, utilidad)
      };
    });

    const porCategoria = categoriasRows[0].map((item) => {
      const ingresos = toNumber(item.ingresos_totales);
      const utilidad = toNumber(item.utilidad_bruta);
      return {
        ...item,
        productos_vendidos: toNumber(item.productos_vendidos),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: ingresos,
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: utilidad,
        margen_bruto: mapMargin(ingresos, utilidad)
      };
    });

    const porPeriodo = periodosRows[0].map((item) => {
      const ingresos = toNumber(item.ingresos_totales);
      const utilidad = toNumber(item.utilidad_bruta);
      return {
        ...item,
        pedidos: toNumber(item.pedidos),
        productos_vendidos: toNumber(item.productos_vendidos),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        ingresos_totales: ingresos,
        costo_total_estimado: toNumber(item.costo_total_estimado),
        utilidad_bruta: utilidad,
        margen_bruto: mapMargin(ingresos, utilidad)
      };
    });

    const chartLookup = new Map(
      graficaMensualRows[0].map((item) => [
        item.periodo,
        {
          periodo: item.periodo,
          pedidos: toNumber(item.pedidos),
          unidades_vendidas: toNumber(item.unidades_vendidas),
          ingresos_totales: toNumber(item.ingresos_totales),
          utilidad_bruta: toNumber(item.utilidad_bruta)
        }
      ])
    );

    const graficaMensual = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      graficaMensual.push(
        chartLookup.get(key) || {
          periodo: key,
          pedidos: 0,
          unidades_vendidas: 0,
          ingresos_totales: 0,
          utilidad_bruta: 0
        }
      );
    }

    const comprasProveedor = comprasProveedorRows[0].map((item) => ({
      ...item,
      compras: toNumber(item.compras),
      productos: toNumber(item.productos),
      unidades: toNumber(item.unidades),
      total_invertido: toNumber(item.total_invertido)
    }));

    return res.json({
      filtros: {
        periodo: periodoAplicado,
        fecha_desde: formatDateOnly(fechaDesde),
        fecha_hasta: formatDateOnly(fechaHasta),
        producto_id: selectedProductId ? String(selectedProductId) : "",
        proveedor_id: selectedProviderId ? String(selectedProviderId) : ""
      },
      resumen,
      resumen_rapido: {
        ventas_hoy: resumenHoy.ingresos_totales,
        ganancias_hoy: resumenHoy.utilidad_bruta,
        ventas_mes: resumenMes.ingresos_totales,
        ganancias_mes: resumenMes.utilidad_bruta,
        clientes_registrados: toNumber(clientesRegistradosRows[0][0]?.total),
        productos_stock_bajo: stockBajoRows[0].length
      },
      stock_bajo: stockBajoRows[0].map((item) => ({
        ...item,
        stock_actual: toNumber(item.stock_actual),
        stock_minimo: toNumber(item.stock_minimo)
      })),
      top_productos: porProducto.slice(0, 10),
      productos_menos_vendidos: [...porProducto]
        .sort((a, b) => a.unidades_vendidas - b.unidades_vendidas || a.ingresos_totales - b.ingresos_totales)
        .slice(0, 10),
      ultimas_ventas: ultimasVentasRows[0].map((item) => ({
        ...item,
        lineas: toNumber(item.lineas),
        unidades_vendidas: toNumber(item.unidades_vendidas),
        total_venta: toNumber(item.total_venta)
      })),
      grafica_mensual: graficaMensual,
      clientes: {
        registrados: toNumber(clientesRegistradosRows[0][0]?.total),
        nuevos_por_mes: clientesNuevosRows[0].map((item) => ({
          ...item,
          clientes_nuevos: toNumber(item.clientes_nuevos)
        })),
        con_mas_compras: clientesTopRows[0].map((item) => ({
          ...item,
          compras: toNumber(item.compras),
          unidades_vendidas: toNumber(item.unidades_vendidas),
          total_gastado: toNumber(item.total_gastado)
        })),
        historial_compras: clientesHistorialRows[0].map((item) => ({
          ...item,
          unidades_vendidas: toNumber(item.unidades_vendidas),
          total_venta: toNumber(item.total_venta)
        }))
      },
      proveedores_reportes: {
        productos_suministrados: productosProveedorRows[0].map((item) => ({
          ...item,
          productos: toNumber(item.productos),
          productos_activos: toNumber(item.productos_activos),
          stock_total: toNumber(item.stock_total)
        })),
        compras_realizadas: comprasProveedor,
        proveedor_mas_utilizado: comprasProveedor[0] || null
      },
      trabajadores_reportes: {
        ventas_realizadas: ventasTrabajadorRows[0].map((item) => ({
          ...item,
          ventas: toNumber(item.ventas),
          unidades_vendidas: toNumber(item.unidades_vendidas),
          total_venta: toNumber(item.total_venta)
        })),
        movimientos_realizados: movimientosTrabajadorRows[0].map((item) => ({
          ...item,
          movimientos: toNumber(item.movimientos),
          entradas: toNumber(item.entradas),
          salidas: toNumber(item.salidas)
        })),
        actividades_registradas: actividadesTrabajadorRows[0].map((item) => ({
          ...item,
          actividades: toNumber(item.actividades)
        }))
      },
      por_producto: porProducto,
      por_proveedor: porProveedor,
      por_categoria: porCategoria,
      por_periodo: porPeriodo,
      notas: [
        "La utilidad se estima con el costo promedio actual del producto (precio_mayor).",
        `La evolucion del periodo se agrupa por ${periodBucket.label}.`,
        "Los clientes y trabajadores se calculan sobre la actividad registrada en el rango actual."
      ]
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al cargar reportes del dashboard", error: error.message });
  }
};
