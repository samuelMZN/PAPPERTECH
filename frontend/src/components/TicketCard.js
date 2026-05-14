import { printTicketsDocument } from "../utils/print-tickets";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function renderDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-CO");
}

function TicketCard({ title, ticket, compact = false, showPrint = true, onPrint }) {
  if (!ticket) {
    return null;
  }

  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const handlePrint = () => {
    if (onPrint) {
      onPrint(ticket);
      return;
    }

    printTicketsDocument({
      title: title || ticket.numero || "Comprobante",
      subtitle:
        ticket.tipo === "compra"
          ? "Tirilla individual de compra"
          : ticket.tipo === "devolucion"
            ? "Tirilla individual de devolucion"
          : "Tirilla individual de pedido",
      tickets: [ticket]
    });
  };

  return (
    <article className={`ticket-card ${compact ? "ticket-card--compact" : ""}`}>
      <div className="ticket-card__header">
        <div>
          <p className="catalog-section__eyebrow">
            {ticket.tipo === "compra"
              ? "Tirilla de compra"
              : ticket.tipo === "devolucion"
                ? "Tirilla de devolucion"
                : "Tirilla de venta"}
          </p>
          <h3>{title || ticket.numero || "Comprobante"}</h3>
        </div>

        {showPrint ? (
          <button type="button" className="btn btn-outline" onClick={handlePrint}>
            Imprimir
          </button>
        ) : null}
      </div>

      <div className="ticket-card__meta">
        <span className="ticket-chip">{ticket.numero || "-"}</span>
        <span className="ticket-chip">{renderDate(ticket.fecha)}</span>
        {ticket.cliente ? <span className="ticket-chip">{ticket.cliente}</span> : null}
        {ticket.proveedor ? <span className="ticket-chip">{ticket.proveedor}</span> : null}
        {ticket.factura ? <span className="ticket-chip">Factura {ticket.factura}</span> : null}
        {ticket.pedido_numero ? <span className="ticket-chip">{ticket.pedido_numero}</span> : null}
      </div>

      {ticket.observaciones ? <p className="ticket-card__note">{ticket.observaciones}</p> : null}

      {items.length > 0 ? (
        <div className="ticket-card__list">
          {items.map((item) => (
            <div key={`${ticket.numero}-${item.producto_id}-${item.nombre}`} className="ticket-card__item">
              <div>
                <strong>{item.nombre}</strong>
                <span>
                  {item.cantidad} x {formatCurrency(item.precio_unitario)}
                </span>
              </div>
              <strong>{formatCurrency(item.subtotal)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="ticket-card__detail-grid">
          <div>
            <span>Producto</span>
            <strong>{ticket.producto || "-"}</strong>
          </div>
          <div>
            <span>Cantidad</span>
            <strong>{ticket.cantidad || 0}</strong>
          </div>
          <div>
            <span>Movimiento</span>
            <strong>{ticket.movimiento || "-"}</strong>
          </div>
          <div>
            <span>Motivo</span>
            <strong>{ticket.motivo || "-"}</strong>
          </div>
          {ticket.factura ? (
            <div>
              <span>Factura</span>
              <strong>{ticket.factura}</strong>
            </div>
          ) : null}
          {ticket.costo_unitario !== null && ticket.costo_unitario !== undefined ? (
            <div>
              <span>Costo unitario</span>
              <strong>{formatCurrency(ticket.costo_unitario)}</strong>
            </div>
          ) : null}
          {ticket.costo_promedio !== null && ticket.costo_promedio !== undefined ? (
            <div>
              <span>Costo promedio</span>
              <strong>{formatCurrency(ticket.costo_promedio)}</strong>
            </div>
          ) : null}
          {ticket.stock_antes !== undefined ? (
            <div>
              <span>Stock antes</span>
              <strong>{ticket.stock_antes}</strong>
            </div>
          ) : null}
          {ticket.stock_despues !== undefined ? (
            <div>
              <span>Stock despues</span>
              <strong>{ticket.stock_despues}</strong>
            </div>
          ) : null}
        </div>
      )}

      <div className="ticket-card__footer">
        {ticket.metodo ? <span className="ticket-card__muted">Pago: {ticket.metodo}</span> : null}
        {ticket.estado ? <span className="ticket-card__muted">Estado: {ticket.estado}</span> : null}
        {ticket.motivo ? <span className="ticket-card__muted">Motivo: {ticket.motivo}</span> : null}
        <strong>
          {ticket.total !== null && ticket.total !== undefined
            ? formatCurrency(ticket.total)
            : "Sin total"}
        </strong>
      </div>
    </article>
  );
}

export default TicketCard;
