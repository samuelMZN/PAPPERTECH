// Helper intentionally tiny to keep order detail mapping shared and testable.
function buildPedidoTicket(pedido, productos) {
  return {
    tipo: "venta",
    numero: `V-${pedido.id}`,
    fecha: pedido.fecha,
    cliente: pedido.cliente,
    estado: pedido.estado,
    estado_pago: pedido.estado_pago,
    metodo: pedido.metodo_pago || null,
    subtotal: Number(pedido.subtotal_original || 0),
    total: Number(pedido.total || 0),
    items: productos
  };
}

module.exports = {
  buildPedidoTicket
};
