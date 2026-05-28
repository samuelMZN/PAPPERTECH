import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import TicketCard from "../components/TicketCard";
import ReturnsManager from "../components/ReturnsManager";
import { detectNewPendingOrders, pushBrowserOrderNotification } from "../utils/order-notifications";
import { printTicketsDocument } from "../utils/print-tickets";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatPaymentStatus(value) {
  const normalized = String(value || "").toLowerCase().trim();

  if (normalized === "aprobado") {
    return "pagado";
  }

  if (normalized === "rechazado") {
    return "rechazado";
  }

  if (normalized === "reembolsado") {
    return "reembolsado";
  }

  return normalized || "-";
}

function getOrderActions(estado) {
  if (estado === "pendiente") {
    return [
      { label: "Pasar a preparacion", value: "en_preparacion", tone: "primary" },
      { label: "Cancelar", value: "cancelado", tone: "outline" }
    ];
  }

  if (estado === "en_preparacion") {
    return [
      { label: "Marcar enviado", value: "enviado", tone: "secondary" },
      { label: "Cancelar", value: "cancelado", tone: "outline" }
    ];
  }

  if (estado === "enviado") {
    return [{ label: "Marcar entregado", value: "entregado", tone: "primary" }];
  }

  return [];
}

const workerTabs = [
  { id: "pedidos", label: "Pedidos" },
  { id: "devoluciones", label: "Devoluciones" },
  { id: "inventario", label: "Compras" },
  { id: "perfil", label: "Perfil" }
];

function ClientPortal() {
  const { token, user, updateProfile } = useAuth();
  const [profile, setProfile] = useState(user);
  const [profileForm, setProfileForm] = useState({
    nombre: "",
    email: "",
    telefono: "",
    direccion: "",
    password: ""
  });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [profileData, ordersData] = await Promise.all([
          apiRequest("/auth/perfil", { token }),
          apiRequest("/pedidos", { token })
        ]);

        if (!active) {
          return;
        }

        setProfile(profileData);
        setOrders(ordersData);
        setProfileForm({
          nombre: profileData.nombre || "",
          email: profileData.email || "",
          telefono: profileData.telefono || "",
          direccion: profileData.direccion || "",
          password: ""
        });
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [token]);

  const totalComprado = useMemo(
    () => orders.reduce((total, order) => total + Number(order.total || 0), 0),
    [orders]
  );
  const printableClientTickets = useMemo(
    () =>
      orders
        .map((order) => order.tirilla)
        .filter(Boolean),
    [orders]
  );

  const printAllClientOrders = () => {
    printTicketsDocument({
      title: "Historial de compras del cliente",
      subtitle: "Pedidos visibles en el historial del cliente.",
      tickets: printableClientTickets
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        nombre: profileForm.nombre,
        email: profileForm.email,
        telefono: profileForm.telefono,
        direccion: profileForm.direccion
      };

      if (profileForm.password) {
        payload.password = profileForm.password;
      }

      const response = await updateProfile(payload);
      setProfile(response.user);
      setProfileForm((current) => ({ ...current, password: "" }));
      setSuccess("Tu perfil fue actualizado correctamente.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-section">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Portal del cliente</span>
          <h1>Hola, {profile?.nombre || "cliente"}.</h1>
          <p>
            Aqui puedes editar tu informacion, revisar tu historial de compras y
            seguir el estado de cada pedido.
          </p>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <strong>{orders.length}</strong>
            <span>Pedidos realizados</span>
          </article>
          <article className="stat-card">
            <strong>{formatCurrency(totalComprado)}</strong>
            <span>Total comprado</span>
          </article>
        </div>
      </section>

      {loading ? <p className="status">Cargando tu portal...</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {success ? <p className="message success">{success}</p> : null}

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Tu perfil</h2>
              <p>Datos personales editables para tu cuenta de cliente.</p>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <input
              name="nombre"
              value={profileForm.nombre}
              onChange={handleChange}
              placeholder="Nombre"
              required
            />
            <input
              name="email"
              type="email"
              value={profileForm.email}
              onChange={handleChange}
              placeholder="Correo"
              required
            />
            <input
              name="telefono"
              value={profileForm.telefono}
              onChange={handleChange}
              placeholder="Telefono"
            />
            <input
              name="direccion"
              value={profileForm.direccion}
              onChange={handleChange}
              placeholder="Direccion"
            />
            <input
              name="password"
              type="password"
              value={profileForm.password}
              onChange={handleChange}
              placeholder="Nueva contrasena opcional"
            />
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar perfil"}
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Resumen rapido</h2>
              <p>Vista rapida de tu cuenta y pedidos.</p>
            </div>
          </div>

          <div className="detail-list">
            <div>
              <span>Rol</span>
              <strong>{profile?.rol || "cliente"}</strong>
            </div>
            <div>
              <span>Pedidos entregados</span>
              <strong>{orders.filter((order) => order.estado === "entregado").length}</strong>
            </div>
            <div>
              <span>Pedidos activos</span>
              <strong>
                {
                  orders.filter((order) =>
                    ["pendiente", "en_preparacion", "enviado"].includes(order.estado)
                  ).length
                }
              </strong>
            </div>
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Historial de compras</h2>
            <p>Consulta el estado, los productos y la tirilla de cada compra.</p>
          </div>
          {printableClientTickets.length > 0 ? (
            <button type="button" className="btn btn-outline" onClick={printAllClientOrders}>
              Imprimir todos los pedidos
            </button>
          ) : null}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Pago</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((order) => (
                  <Fragment key={order.id}>
                    <tr>
                      <td>#{order.id}</td>
                      <td>{new Date(order.fecha).toLocaleString("es-CO")}</td>
                      <td>{order.estado}</td>
                      <td>{formatPaymentStatus(order.estado_pago)}</td>
                      <td>{order.items}</td>
                      <td>{formatCurrency(order.total)}</td>
                    </tr>
                    <tr className="data-table__details-row">
                      <td colSpan="6">
                        <TicketCard title={`Pedido #${order.id}`} ticket={order.tirilla} compact />
                      </td>
                    </tr>
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="6">Todavia no has realizado pedidos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function WorkerPortal() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("pedidos");
  const [profile, setProfile] = useState(user);
  const [orders, setOrders] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [catalogos, setCatalogos] = useState({ proveedores: [] });
  const [movementForm, setMovementForm] = useState({
    producto_id: "",
    tipo: "entrada",
    cantidad: "1",
    motivo: "compra_proveedor",
    proveedor_id: "",
    precio_compra_unitario: "",
    factura: ""
  });
  const [movementItems, setMovementItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [orderNotice, setOrderNotice] = useState("");
  const [processingOrderId, setProcessingOrderId] = useState(null);
  const [lastMovementTicket, setLastMovementTicket] = useState(null);
  const knownPendingOrdersRef = useRef(new Set());

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const [profileData, ordersData, stockData, movementsData, catalogosData] =
        await Promise.all([
          apiRequest("/auth/perfil", { token }),
          apiRequest("/pedidos", { token }),
          apiRequest("/inventario/stock", { token }),
          apiRequest("/inventario", { token }),
          apiRequest("/catalogos", { token })
        ]);

      setProfile(profileData);
      const { notice } = detectNewPendingOrders(ordersData, knownPendingOrdersRef);
      setOrders(ordersData);
      setStockRows(stockData);
      setMovements(movementsData);
      setCatalogos(catalogosData);

      if (notice) {
        setOrderNotice(notice);
        pushBrowserOrderNotification(notice);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadData({ silent: true });
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadData]);

  useEffect(() => {
    if (!orderNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setOrderNotice("");
    }, 9000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [orderNotice]);

  const handleMovementChange = (event) => {
    const { name, value } = event.target;
    setMovementForm((current) => ({ ...current, [name]: value }));
  };

  const buildMovementDraftItem = useCallback((product, formValues) => {
    if (!product) {
      throw new Error("Selecciona un producto para agregarlo a la compra.");
    }

    const cantidad = Number(formValues.cantidad);
    const costoUnitario = Number(formValues.precio_compra_unitario);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error("Ingresa una cantidad valida para la compra.");
    }

    if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
      throw new Error("Ingresa el costo unitario de compra.");
    }

    return {
      producto_id: Number(product.id),
      nombre: product.nombre,
      detalle: `stock ${Number(product.stock_actual || 0)}`,
      cantidad,
      precio_compra_unitario: costoUnitario,
      subtotal: Number((cantidad * costoUnitario).toFixed(2))
    };
  }, []);

  const addMovementItem = () => {
    setError("");
    setSuccess("");

    try {
      const product = stockRows.find((row) => String(row.id) === String(movementForm.producto_id));
      const draftItem = buildMovementDraftItem(product, movementForm);

      setMovementItems((current) => {
        const existingIndex = current.findIndex(
          (item) =>
            String(item.producto_id) === String(draftItem.producto_id) &&
            Number(item.precio_compra_unitario) === Number(draftItem.precio_compra_unitario)
        );

        if (existingIndex === -1) {
          return [...current, draftItem];
        }

        const nextItems = [...current];
        const existingItem = nextItems[existingIndex];
        nextItems[existingIndex] = {
          ...existingItem,
          cantidad: Number(existingItem.cantidad || 0) + draftItem.cantidad,
          subtotal: Number(
            (
              (Number(existingItem.cantidad || 0) + draftItem.cantidad) *
              Number(existingItem.precio_compra_unitario || 0)
            ).toFixed(2)
          )
        };
        return nextItems;
      });

      setMovementForm((current) => ({
        ...current,
        producto_id: "",
        cantidad: "1",
        precio_compra_unitario: ""
      }));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const removeMovementItem = (productoId, precioUnitario) => {
    setMovementItems((current) =>
      current.filter(
        (item) =>
          !(
            String(item.producto_id) === String(productoId) &&
            Number(item.precio_compra_unitario) === Number(precioUnitario)
          )
      )
    );
  };

  const clearMovementDraft = () => {
    setMovementItems([]);
    setMovementForm((current) => ({
      ...current,
      producto_id: "",
      cantidad: "1",
      precio_compra_unitario: ""
    }));
  };

  const submitMovement = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (!movementForm.proveedor_id) {
        throw new Error("Selecciona un proveedor para registrar la compra.");
      }

      const product = stockRows.find((row) => String(row.id) === String(movementForm.producto_id));
      const draftItems = [...movementItems];

      if (movementForm.producto_id) {
        draftItems.push(buildMovementDraftItem(product, movementForm));
      }

      if (draftItems.length === 0) {
        throw new Error("Agrega al menos un producto a la compra.");
      }

      const response = await apiRequest("/inventario", {
        method: "POST",
        token,
        body: {
          tipo: "entrada",
          motivo: "compra_proveedor",
          proveedor_id: movementForm.proveedor_id ? Number(movementForm.proveedor_id) : null,
          factura: movementForm.factura || "",
          items: draftItems.map((item) => ({
            producto_id: Number(item.producto_id),
            cantidad: Number(item.cantidad),
            precio_compra_unitario: Number(item.precio_compra_unitario)
          }))
        }
      });

      setMovementForm({
        producto_id: "",
        tipo: "entrada",
        cantidad: "1",
        motivo: "compra_proveedor",
        proveedor_id: "",
        precio_compra_unitario: "",
        factura: ""
      });
      setMovementItems([]);
      setLastMovementTicket(response.tirilla || null);
      setSuccess(
        draftItems.length > 1
          ? "Compra por lote registrada correctamente."
          : "Compra registrada correctamente."
      );
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const changeOrderStatus = async (orderId, estado) => {
    setProcessingOrderId(orderId);
    setError("");
    setSuccess("");

    try {
      await apiRequest(`/pedidos/${orderId}/estado`, {
        method: "PATCH",
        token,
        body: { estado }
      });

      setSuccess(`Pedido #${orderId} actualizado a ${estado}.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const activeOrders = orders.filter((order) =>
    ["pendiente", "en_preparacion", "enviado"].includes(order.estado)
  );
  const purchaseMovements = movements.filter(
    (movement) =>
      String(movement.tipo || "").toLowerCase() === "entrada" &&
      String(movement.motivo || "").toLowerCase() === "compra_proveedor"
  );
  const movementDraftSummary = {
    lineas: movementItems.length,
    unidades: movementItems.reduce((total, item) => total + Number(item.cantidad || 0), 0),
    total: movementItems.reduce((total, item) => total + Number(item.subtotal || 0), 0)
  };
  const pendingOrdersCount = orders.filter((order) => order.estado === "pendiente").length;
  const printableWorkerTickets = useMemo(
    () =>
      activeOrders
        .map((order) => order.tirilla)
        .filter(Boolean),
    [activeOrders]
  );

  const printAllWorkerOrders = () => {
    printTicketsDocument({
      title: "Pedidos operativos del trabajador",
      subtitle: "Pedidos visibles pendientes de gestion.",
      tickets: printableWorkerTickets
    });
  };

  return (
    <section className="page-section">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Panel del trabajador</span>
          <h1>Control operativo de pedidos, compras y devoluciones.</h1>
          <p>
            Desde aqui gestionas pedidos pendientes, registras compras o ajustes
            de stock y atiendes devoluciones sin editar el inventario de forma directa.
          </p>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <strong>{activeOrders.length}</strong>
            <span>Pedidos activos</span>
          </article>
          <article className="stat-card">
            <strong>{stockRows.filter((row) => row.estado_stock !== "estable").length}</strong>
            <span>Alertas de inventario</span>
          </article>
        </div>
      </section>

      {loading ? <p className="status">Cargando operaciones del trabajador...</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {success ? <p className="message success">{success}</p> : null}
      {orderNotice ? <p className="message info">{orderNotice}</p> : null}
      {pendingOrdersCount > 0 ? (
        <article className="dashboard-notice panel">
          <div>
            <p className="catalog-section__eyebrow">Notificacion de pedidos</p>
            <strong>
              {pendingOrdersCount === 1
                ? "Hay 1 pedido nuevo o pendiente por gestionar."
                : `Hay ${pendingOrdersCount} pedidos nuevos o pendientes por gestionar.`}
            </strong>
            <span>Abre el modulo Pedidos para revisarlos apenas entren.</span>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActiveTab("pedidos")}
          >
            Ver pedidos
          </button>
        </article>
      ) : null}

      <div className="dashboard-shell">
        <aside className="panel dashboard-sidebar">
          <div className="dashboard-sidebar__header">
            <p className="catalog-section__eyebrow">Modulos</p>
            <h2>Panel trabajador</h2>
          </div>

          <div className="section-tabs section-tabs--sidebar">
            {workerTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`section-tab ${activeTab === tab.id ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.id === "pedidos" && pendingOrdersCount > 0 ? (
                  <span className="section-tab__badge">{pendingOrdersCount}</span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <div className="dashboard-main">

      {activeTab === "pedidos" ? (
        <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Pedidos para gestionar</h2>
                <p>Actualiza el estado operativo y revisa los productos de cada pedido.</p>
              </div>
              {printableWorkerTickets.length > 0 ? (
                <button type="button" className="btn btn-outline" onClick={printAllWorkerOrders}>
                  Imprimir todos los pedidos
                </button>
              ) : null}
            </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.length > 0 ? (
                  activeOrders.map((order) => (
                    <Fragment key={order.id}>
                      <tr>
                        <td>#{order.id}</td>
                        <td>{order.cliente}</td>
                        <td>{order.estado}</td>
                        <td>{order.items}</td>
                        <td>{formatCurrency(order.total)}</td>
                        <td>
                          <div className="table-actions">
                            {getOrderActions(order.estado).map((action) => (
                              <button
                                key={action.value}
                                type="button"
                                className={`btn ${action.tone === "outline" ? "btn-outline" : action.tone === "secondary" ? "btn-secondary" : "btn-primary"}`}
                                onClick={() => changeOrderStatus(order.id, action.value)}
                                disabled={processingOrderId === order.id}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                      <tr className="data-table__details-row">
                        <td colSpan="6">
                          <TicketCard title={`Pedido #${order.id}`} ticket={order.tirilla} compact />
                        </td>
                      </tr>
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6">No hay pedidos pendientes por gestionar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {activeTab === "inventario" ? (
        <>
          <section className="dashboard-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Registrar compra</h2>
                  <p>Usa producto, proveedor y documento de compra para dejar el kardex y el informe bien trazados.</p>
                </div>
              </div>

              <div className="inventory-callout">
                <div>
                  <strong>Sin stock manual</strong>
                  <span>La compra crea el movimiento, aumenta el stock y deja trazabilidad en el kardex.</span>
                </div>
                <div>
                  <strong>Costo promedio</strong>
                  <span>Si registras una entrada con otro costo, el sistema recalcula el costo promedio del producto.</span>
                </div>
              </div>

              <form className="form-grid" onSubmit={submitMovement}>
                <select
                  name="proveedor_id"
                  value={movementForm.proveedor_id}
                  onChange={handleMovementChange}
                >
                  <option value="">Proveedor</option>
                  {catalogos.proveedores?.map((proveedor) => (
                    <option key={proveedor.id} value={proveedor.id}>
                      {proveedor.nombre}
                    </option>
                  ))}
                </select>

                <input
                  name="cantidad"
                  type="number"
                  min="1"
                  value={movementForm.cantidad}
                  onChange={handleMovementChange}
                  placeholder="Cantidad"
                  required
                />

                <input
                  name="precio_compra_unitario"
                  type="number"
                  min="0"
                  step="0.01"
                  value={movementForm.precio_compra_unitario}
                  onChange={handleMovementChange}
                  placeholder="Costo unitario"
                />
                <input
                  name="factura"
                  value={movementForm.factura}
                  onChange={handleMovementChange}
                  placeholder="Documento o referencia del proveedor"
                />

                <select
                  name="producto_id"
                  value={movementForm.producto_id}
                  onChange={handleMovementChange}
                >
                  <option value="">Producto a comprar</option>
                  {stockRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.nombre} - Stock {row.stock_actual}
                    </option>
                  ))}
                </select>

                <div className="purchase-batch-panel">
                  <div className="purchase-batch-panel__header">
                    <div>
                      <strong>Compra en curso</strong>
                      <span>
                        {movementDraftSummary.lineas === 0
                          ? "Agrega varias lineas y registra una sola compra."
                          : `${movementDraftSummary.lineas} linea(s) - ${movementDraftSummary.unidades} unidad(es)`}
                      </span>
                    </div>
                    <div className="purchase-batch-panel__actions">
                      <button type="button" className="btn btn-outline" onClick={addMovementItem}>
                        Agregar producto
                      </button>
                      {movementItems.length > 0 ? (
                        <button type="button" className="btn btn-outline" onClick={clearMovementDraft}>
                          Vaciar compra
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {movementItems.length > 0 ? (
                    <div className="table-wrap table-wrap--purchase-draft">
                      <table className="data-table data-table--purchase-draft">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cantidad</th>
                            <th>Costo unitario</th>
                            <th>Subtotal</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movementItems.map((item) => (
                            <tr key={`${item.producto_id}-${item.precio_compra_unitario}`}>
                              <td>
                                <strong>{item.nombre}</strong>
                                <small>{item.detalle}</small>
                              </td>
                              <td>{item.cantidad}</td>
                              <td>{formatCurrency(item.precio_compra_unitario)}</td>
                              <td>{formatCurrency(item.subtotal)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => removeMovementItem(item.producto_id, item.precio_compra_unitario)}
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="status empty-state purchase-batch-panel__empty">
                      Todavia no has agregado productos a esta compra.
                    </p>
                  )}

                  <div className="purchase-batch-panel__totals">
                    <span>{movementDraftSummary.unidades} unidades en total</span>
                    <strong>{formatCurrency(movementDraftSummary.total)}</strong>
                  </div>
                </div>

                <button className="btn btn-secondary" type="submit">
                  Registrar compra
                </button>
              </form>

              <p className="form-helper">
                Puedes agrupar varios productos bajo el mismo proveedor y documento para dejar el kardex bien trazado.
              </p>

              {lastMovementTicket ? (
                <div className="ticket-card-wrap">
                  <TicketCard title="Ultima compra registrada" ticket={lastMovementTicket} />
                </div>
              ) : null}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Compras recientes</h2>
                  <p>Ultimas entradas registradas por compra a proveedor.</p>
                </div>
              </div>

              <ul className="activity-list">
                {purchaseMovements.slice(0, 8).map((movement) => (
                  <li key={movement.id}>
                    <strong>{movement.producto}</strong>
                    <span>
                      entrada {movement.cantidad_absoluta} - {movement.proveedor || "sin proveedor"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Stock actual</h2>
                <p>Consulta el inventario disponible sin editar el stock directo.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Marca</th>
                    <th>Stock</th>
                    <th>Minimo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.nombre}</td>
                      <td>{row.marca || "-"}</td>
                      <td>{row.stock_actual}</td>
                      <td>{row.stock_minimo}</td>
                      <td>{row.estado_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {activeTab === "devoluciones" ? (
        <ReturnsManager
          token={token}
          title="Devoluciones de clientes"
          subtitle="Selecciona un pedido elegible, registra las cantidades devueltas y devuelve el stock al inventario."
          onAfterSubmit={loadData}
        />
      ) : null}

      {activeTab === "perfil" ? (
        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Tu perfil</h2>
                <p>Este perfil es administrado por el administrador.</p>
              </div>
            </div>

            <div className="detail-list">
              <div>
                <span>Nombre</span>
                <strong>{profile?.nombre || "-"}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{profile?.email || "-"}</strong>
              </div>
              <div>
                <span>Rol</span>
                <strong>{profile?.rol || "trabajador"}</strong>
              </div>
            </div>
          </article>
        </section>
      ) : null}

        </div>
      </div>
    </section>
  );
}

function Portal() {
  const { role } = useAuth();

  if (role === "trabajador") {
    return <WorkerPortal />;
  }

  return <ClientPortal />;
}

export default Portal;
