import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import TicketCard from "./TicketCard";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-CO");
}

function buildInitialQuantities(order) {
  if (!order) {
    return {};
  }

  return Object.fromEntries(
    (order.productos || []).map((item) => [item.detalle_pedido_id, ""])
  );
}

function ReturnsManager({ token, title, subtitle, onAfterSubmit }) {
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [motivo, setMotivo] = useState("cliente_cambio");
  const [observaciones, setObservaciones] = useState("");
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastTicket, setLastTicket] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ordersData, returnsData] = await Promise.all([
        apiRequest("/devoluciones/pedidos-elegibles", { token }),
        apiRequest("/devoluciones", { token })
      ]);

      setEligibleOrders(ordersData);
      setReturns(returnsData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedOrder = useMemo(
    () => eligibleOrders.find((order) => String(order.id) === String(selectedOrderId)) || null,
    [eligibleOrders, selectedOrderId]
  );

  useEffect(() => {
    if (!selectedOrder) {
      setQuantities({});
      return;
    }

    setQuantities((current) => {
      const next = buildInitialQuantities(selectedOrder);

      for (const [detailId, value] of Object.entries(current)) {
        if (detailId in next) {
          next[detailId] = value;
        }
      }

      return next;
    });
  }, [selectedOrder]);

  const handleQuantityChange = (detallePedidoId, value) => {
    setQuantities((current) => ({
      ...current,
      [detallePedidoId]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      if (!selectedOrderId) {
        throw new Error("Debes seleccionar un pedido para registrar la devolucion");
      }

      const items = (selectedOrder?.productos || [])
        .map((item) => ({
          detalle_pedido_id: Number(item.detalle_pedido_id),
          cantidad: Number(quantities[item.detalle_pedido_id] || 0)
        }))
        .filter((item) => item.cantidad > 0);

      if (items.length === 0) {
        throw new Error("Debes indicar al menos una cantidad para devolver");
      }

      const response = await apiRequest("/devoluciones", {
        method: "POST",
        token,
        body: {
          pedido_id: Number(selectedOrderId),
          motivo,
          observaciones,
          items
        }
      });

      setLastTicket(response.tirilla || null);
      setSuccess("Devolucion registrada correctamente.");
      setSelectedOrderId("");
      setObservaciones("");
      setMotivo("cliente_cambio");
      setQuantities({});
      await loadData();

      if (onAfterSubmit) {
        await onAfterSubmit();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="dashboard-grid bottom-grid">
      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>

        {loading ? <p className="status">Cargando devoluciones...</p> : null}
        {error ? <p className="message error">{error}</p> : null}
        {success ? <p className="message success">{success}</p> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <select
            value={selectedOrderId}
            onChange={(event) => setSelectedOrderId(event.target.value)}
            required
          >
            <option value="">Selecciona un pedido</option>
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                #{order.id} - {order.cliente} - {order.estado} - {formatDate(order.fecha)}
              </option>
            ))}
          </select>

          <input
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Motivo de la devolucion"
            required
          />

          <textarea
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            placeholder="Observaciones opcionales"
            rows="3"
          />

          {selectedOrder ? (
            <div className="returns-product-grid">
              {selectedOrder.productos.map((item) => (
                <article key={item.detalle_pedido_id} className="returns-product-card">
                  <div className="returns-product-card__copy">
                    <strong>{item.nombre}</strong>
                    <span>{item.categoria || "Sin categoria"}</span>
                  </div>

                  <div className="returns-product-card__meta">
                    <small>Vendidas: {item.cantidad_pedida}</small>
                    <small>Devueltas: {item.cantidad_devuelta}</small>
                    <small>Disponibles: {item.cantidad_disponible_devolucion}</small>
                    <small>{formatCurrency(item.precio_unitario)} c/u</small>
                  </div>

                  <input
                    type="number"
                    min="0"
                    max={item.cantidad_disponible_devolucion}
                    value={quantities[item.detalle_pedido_id] ?? ""}
                    onChange={(event) =>
                      handleQuantityChange(item.detalle_pedido_id, event.target.value)
                    }
                    placeholder="Cantidad a devolver"
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="returns-empty">
              <p>Selecciona un pedido para ver las cantidades disponibles para devolver.</p>
            </div>
          )}

          <button className="btn btn-secondary" type="submit" disabled={submitting || loading}>
            {submitting ? "Registrando devolucion..." : "Registrar devolucion"}
          </button>
        </form>

        {lastTicket ? (
          <div className="ticket-card-wrap">
            <TicketCard title="Ultima devolucion registrada" ticket={lastTicket} />
          </div>
        ) : null}
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Devoluciones recientes</h2>
            <p>Historial de devoluciones con su tirilla y total reintegrado.</p>
          </div>
        </div>

        {returns.length > 0 ? (
          <div className="ticket-list">
            {returns.map((item) => (
              <TicketCard
                key={item.id}
                title={`Devolucion #${item.id}`}
                ticket={item.tirilla}
                compact
              />
            ))}
          </div>
        ) : (
          <div className="returns-empty">
            <p>Todavia no se han registrado devoluciones.</p>
          </div>
        )}
      </article>
    </section>
  );
}

export default ReturnsManager;
