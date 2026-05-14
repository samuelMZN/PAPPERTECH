const db = require("../config/db");

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
