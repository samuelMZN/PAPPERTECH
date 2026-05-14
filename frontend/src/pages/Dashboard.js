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

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${prefix}${formatCurrency(Math.abs(amount))}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getOrderActions(estado) {
  if (estado === "pendiente") {
    return [
      { label: "Preparacion", value: "en_preparacion", tone: "primary" },
      { label: "Cancelar", value: "cancelado", tone: "outline" }
    ];
  }

  if (estado === "en_preparacion") {
    return [
      { label: "Enviar", value: "enviado", tone: "secondary" },
      { label: "Cancelar", value: "cancelado", tone: "outline" }
    ];
  }

  if (estado === "enviado") {
    return [{ label: "Entregar", value: "entregado", tone: "primary" }];
  }

  return [];
}

const adminTabs = [
  { id: "resumen", label: "Resumen" },
  { id: "pedidos", label: "Pedidos" },
  { id: "productos", label: "Productos" },
  { id: "compras", label: "Compras" },
  { id: "devoluciones", label: "Devoluciones" },
  { id: "usuarios", label: "Usuarios" },
  { id: "catalogos", label: "Catalogos" }
];

const initialUserForm = {
  id: null,
  nombre: "",
  email: "",
  password: "",
  rol: "trabajador",
  telefono: "",
  direccion: "",
  activo: true
};

const initialProductForm = {
  id: null,
  nombre: "",
  descripcion: "",
  categoria_id: "",
  marca_id: "",
  proveedor_id: "",
  precio_venta: "",
  stock_minimo: "5",
  descuento_cantidad_minima: "",
  descuento_porcentaje: "",
  imagen_url: ""
};

const initialPurchaseForm = {
  producto_id: "",
  proveedor_id: "",
  cantidad: "1",
  precio_compra_unitario: "",
  motivo: "compra_proveedor"
};

const initialCategoryForm = {
  id: null,
  nombre: "",
  descripcion: "",
  activo: true
};

const initialBrandForm = {
  id: null,
  nombre: "",
  descripcion: "",
  activo: true
};

const initialProviderForm = {
  id: null,
  nombre: "",
  nit: "",
  telefono: "",
  email: "",
  direccion: ""
};

async function fetchDashboardData(token) {
  return Promise.all([
    apiRequest("/auth/perfil", { token }),
    apiRequest("/dashboard/admin", { token }),
    apiRequest("/productos"),
    apiRequest("/usuarios", { token }),
    apiRequest("/catalogos", { token }),
    apiRequest("/pedidos", { token }),
    apiRequest("/inventario", { token })
  ]);
}

function Dashboard() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("resumen");
  const [profile, setProfile] = useState(user);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [catalogos, setCatalogos] = useState({
    categorias: [],
    marcas: [],
    proveedores: []
  });
  const [orders, setOrders] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [processingOrderId, setProcessingOrderId] = useState(null);
  const [productQuery, setProductQuery] = useState("");
  const [userForm, setUserForm] = useState(initialUserForm);
  const [productForm, setProductForm] = useState(initialProductForm);
  const [purchaseForm, setPurchaseForm] = useState(initialPurchaseForm);
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [brandForm, setBrandForm] = useState(initialBrandForm);
  const [providerForm, setProviderForm] = useState(initialProviderForm);
  const [lastPurchaseTicket, setLastPurchaseTicket] = useState(null);
  const [orderNotice, setOrderNotice] = useState("");
  const knownPendingOrdersRef = useRef(new Set());

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const [profileData, summaryData, productsData, usersData, catalogosData, ordersData, movementsData] =
        await fetchDashboardData(token);

      setProfile(profileData);
      setSummary(summaryData);
      setProducts(productsData);
      setUsers(usersData);
      setCatalogos(catalogosData);
      const { notice } = detectNewPendingOrders(ordersData, knownPendingOrdersRef);
      setOrders(ordersData);
      setMovements(movementsData);

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

  const userStats = useMemo(() => {
    const stats = {
      cliente: 0,
      trabajador: 0,
      administrador: 0
    };

    for (const item of summary?.usuarios_por_rol || []) {
      stats[item.rol] = Number(item.total || 0);
    }

    return stats;
  }, [summary]);

  const financialReport = useMemo(() => {
    return summary?.reporte_financiero || null;
  }, [summary]);

  const reportCards = useMemo(() => {
    if (!financialReport) {
      return [];
    }

    return [
      {
        id: "ventas",
        value: financialReport.ventas_validas || 0,
        label: "Ventas validas",
        note: `${financialReport.unidades_vendidas || 0} unidades vendidas`,
        tone: "neutral"
      },
      {
        id: "ingresos",
        value: formatCurrency(financialReport.ingresos_totales || 0),
        label: "Ingresos",
        note: `Ticket prom. ${formatCurrency(financialReport.ticket_promedio || 0)}`,
        tone: "neutral"
      },
      {
        id: "costos",
        value: formatCurrency(financialReport.costo_total_vendido || 0),
        label: "Costo vendido",
        note: "Costo estimado de mercancia vendida",
        tone: "warning"
      },
      {
        id: "compras",
        value: formatCurrency(financialReport.compras_inventario || 0),
        label: "Compras inventario",
        note: `${financialReport.unidades_compradas || 0} unidades compradas`,
        tone: "warning"
      },
      {
        id: "utilidad",
        value: formatSignedCurrency(financialReport.utilidad_bruta || 0),
        label: "Utilidad bruta",
        note: `Margen ${formatPercent(financialReport.margen_bruto || 0)}`,
        tone: Number(financialReport.utilidad_bruta || 0) >= 0 ? "positive" : "negative"
      },
      {
        id: "perdidas",
        value: formatCurrency(financialReport.perdidas_inventario || 0),
        label: "Perdidas",
        note: `${financialReport.unidades_perdidas || 0} unidades en mermas o ajustes`,
        tone: "negative"
      },
      {
        id: "neta",
        value: formatSignedCurrency(financialReport.saldo_neto_caja_aproximado || 0),
        label: "Saldo neto aprox.",
        note: "Ingresos menos compras y perdidas",
        tone:
          Number(financialReport.saldo_neto_caja_aproximado || 0) >= 0
            ? "positive"
            : "negative"
      }
    ];
  }, [financialReport]);

  const reportGeneratedAt = useMemo(() => {
    return new Date().toLocaleString("es-CO");
  }, []);

  const visibleProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase();

    if (!term) {
      return products;
    }

    return products.filter((item) => {
      return (
        String(item.nombre || "").toLowerCase().includes(term) ||
        String(item.categoria || "").toLowerCase().includes(term) ||
        String(item.marca || "").toLowerCase().includes(term)
      );
    });
  }, [productQuery, products]);

  const pendingOrdersCount = useMemo(
    () => orders.filter((order) => order.estado === "pendiente").length,
    [orders]
  );
  const printableOrderTickets = useMemo(
    () =>
      orders
        .map((order) => order.tirilla)
        .filter(Boolean),
    [orders]
  );

  const printAllOrders = () => {
    printTicketsDocument({
      title: "Pedidos del administrador",
      subtitle: "Listado completo de pedidos visibles en el dashboard.",
      tickets: printableOrderTickets
    });
  };

  const handleBooleanValue = (value) => value === true || value === "true" || value === 1;

  const handleUserChange = (event) => {
    const { name, value } = event.target;
    setUserForm((current) => ({
      ...current,
      [name]: name === "activo" ? handleBooleanValue(value) : value
    }));
  };

  const handleProductChange = (event) => {
    const { name, value } = event.target;
    setProductForm((current) => ({ ...current, [name]: value }));
  };

  const handleCategoryChange = (event) => {
    const { name, value } = event.target;
    setCategoryForm((current) => ({
      ...current,
      [name]: name === "activo" ? handleBooleanValue(value) : value
    }));
  };

  const handleBrandChange = (event) => {
    const { name, value } = event.target;
    setBrandForm((current) => ({
      ...current,
      [name]: name === "activo" ? handleBooleanValue(value) : value
    }));
  };

  const handleProviderChange = (event) => {
    const { name, value } = event.target;
    setProviderForm((current) => ({ ...current, [name]: value }));
  };

  const handlePurchaseChange = (event) => {
    const { name, value } = event.target;
    setPurchaseForm((current) => ({ ...current, [name]: value }));
  };

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const submitUser = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      await apiRequest(userForm.id ? `/usuarios/${userForm.id}` : "/usuarios", {
        method: userForm.id ? "PUT" : "POST",
        token,
        body: {
          ...userForm,
          activo: Boolean(userForm.activo)
        }
      });

      setUserForm(initialUserForm);
      setSuccess(userForm.id ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const startEditUser = (item) => {
    setActiveTab("usuarios");
    setUserForm({
      id: item.id,
      nombre: item.nombre,
      email: item.email,
      password: "",
      rol: item.rol,
      telefono: item.telefono || "",
      direccion: item.direccion || "",
      activo: Boolean(item.activo)
    });
  };

  const toggleUserState = async (item) => {
    resetMessages();

    try {
      await apiRequest(`/usuarios/${item.id}`, {
        method: "PUT",
        token,
        body: {
          nombre: item.nombre,
          email: item.email,
          rol: item.rol,
          telefono: item.telefono || "",
          direccion: item.direccion || "",
          activo: !Boolean(item.activo)
        }
      });

      setSuccess(`Usuario ${item.activo ? "desactivado" : "activado"} correctamente.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      await apiRequest(productForm.id ? `/productos/${productForm.id}` : "/productos", {
        method: productForm.id ? "PUT" : "POST",
        token,
        body: {
          nombre: productForm.nombre,
          descripcion: productForm.descripcion,
          categoria_id: productForm.categoria_id ? Number(productForm.categoria_id) : null,
          marca_id: productForm.marca_id ? Number(productForm.marca_id) : null,
          proveedor_id: productForm.proveedor_id ? Number(productForm.proveedor_id) : null,
          precio_venta: Number(productForm.precio_venta || 0),
          stock_minimo: Number(productForm.stock_minimo || 5),
          descuento_cantidad_minima: productForm.descuento_cantidad_minima
            ? Number(productForm.descuento_cantidad_minima)
            : null,
          descuento_porcentaje: productForm.descuento_porcentaje
            ? Number(productForm.descuento_porcentaje)
            : null,
          imagen_url: productForm.imagen_url || null
        }
      });

      setProductForm(initialProductForm);
      setSuccess(productForm.id ? "Producto actualizado correctamente." : "Producto creado correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const startEditProduct = (item) => {
    setActiveTab("productos");
    setProductForm({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      categoria_id: item.categoria_id || "",
      marca_id: item.marca_id || "",
      proveedor_id: item.proveedor_id || "",
      precio_venta: item.precio_venta || "",
      stock_minimo: item.stock_minimo || "5",
      descuento_cantidad_minima: item.descuento_cantidad_minima || "",
      descuento_porcentaje: item.descuento_porcentaje || "",
      imagen_url: item.imagen_url || ""
    });
  };

  const submitPurchase = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      const response = await apiRequest("/inventario", {
        method: "POST",
        token,
        body: {
          producto_id: Number(purchaseForm.producto_id),
          tipo: "entrada",
          cantidad: Number(purchaseForm.cantidad),
          motivo: purchaseForm.motivo || "compra_proveedor",
          proveedor_id: purchaseForm.proveedor_id ? Number(purchaseForm.proveedor_id) : null,
          precio_compra_unitario: purchaseForm.precio_compra_unitario
            ? Number(purchaseForm.precio_compra_unitario)
            : null
        }
      });

      setPurchaseForm(initialPurchaseForm);
      setLastPurchaseTicket(response.tirilla || null);
      setSuccess("Compra al proveedor registrada correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteProduct = async (item, mode = "deactivate") => {
    resetMessages();

    try {
      await apiRequest(`/productos/${item.id}?mode=${mode}`, {
        method: "DELETE",
        token
      });

      setSuccess(
        mode === "hard"
          ? "Producto eliminado definitivamente."
          : "Producto desactivado correctamente."
      );
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteCategory = async (item) => {
    resetMessages();

    try {
      await apiRequest(`/catalogos/categorias/${item.id}`, {
        method: "DELETE",
        token
      });

      setSuccess("Categoria eliminada correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const submitCategory = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      await apiRequest(
        categoryForm.id ? `/catalogos/categorias/${categoryForm.id}` : "/catalogos/categorias",
        {
          method: categoryForm.id ? "PUT" : "POST",
          token,
          body: categoryForm
        }
      );

      setCategoryForm(initialCategoryForm);
      setSuccess("Categoria guardada correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const submitBrand = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      await apiRequest(
        brandForm.id ? `/catalogos/marcas/${brandForm.id}` : "/catalogos/marcas",
        {
          method: brandForm.id ? "PUT" : "POST",
          token,
          body: brandForm
        }
      );

      setBrandForm(initialBrandForm);
      setSuccess("Marca guardada correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const submitProvider = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      await apiRequest(
        providerForm.id ? `/catalogos/proveedores/${providerForm.id}` : "/catalogos/proveedores",
        {
          method: providerForm.id ? "PUT" : "POST",
          token,
          body: providerForm
        }
      );

      setProviderForm(initialProviderForm);
      setSuccess("Proveedor guardado correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const changeOrderStatus = async (orderId, estado) => {
    resetMessages();
    setProcessingOrderId(orderId);

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

  return (
    <section className="page-section">
      <section className="dashboard-hero dashboard-hero--report">
        <div>
          <span className="eyebrow">Dashboard exclusivo del administrador</span>
          <h1>Control total del sistema PapperTech.</h1>
          <p>
            Ahora el panel esta separado por secciones y este recuadro resume el
            informe del negocio con ventas, costos, utilidad, perdidas y margen.
          </p>
        </div>

        <div className="stats-grid stats-grid--report">
          {reportCards.map((card) => (
            <article key={card.id} className={`stat-card stat-card--${card.tone}`}>
              <small className="stat-card__label">{card.label}</small>
              <strong>{card.value}</strong>
              <span>{card.note}</span>
            </article>
          ))}
        </div>
      </section>

      {loading ? <p className="status">Cargando dashboard...</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {success ? <p className="message success">{success}</p> : null}
      {orderNotice ? <p className="message info">{orderNotice}</p> : null}

      <div className="dashboard-shell">
        <aside className="panel dashboard-sidebar">
          <div className="dashboard-sidebar__header">
            <p className="catalog-section__eyebrow">Modulos</p>
            <h2>Panel admin</h2>
          </div>

          <div className="section-tabs section-tabs--sidebar">
            {adminTabs.map((tab) => (
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

      {activeTab === "resumen" ? (
        <>
          <article className="admin-report panel">
            <div className="admin-report__header">
              <div>
                <p className="catalog-section__eyebrow">Reporte ejecutivo</p>
                <h2>Informe general de PapperTech</h2>
                <p>
                  Resumen administrativo con ventas, costos, utilidad, perdidas,
                  estado del inventario y productos mas vendidos.
                </p>
                <div className="admin-report__headline-meta">
                  <span>Periodo acumulado del sistema</span>
                  <span>{pendingOrdersCount} pedidos pendientes por revisar</span>
                </div>
              </div>

              <div className="admin-report__header-side">
                <span>Generado: {reportGeneratedAt}</span>
                <span>Administrador: {profile?.nombre || "-"}</span>
                <button
                  type="button"
                  className="btn btn-outline no-print"
                  onClick={() => window.print()}
                >
                  Imprimir informe
                </button>
              </div>
            </div>

            <div className="admin-report__metrics">
              {reportCards.map((card) => (
                <article key={`report-${card.id}`} className={`admin-report__metric admin-report__metric--${card.tone}`}>
                  <small>{card.label}</small>
                  <strong>{card.value}</strong>
                  <span>{card.note}</span>
                </article>
              ))}
            </div>

            <div className="admin-report__details">
              <section className="admin-report__block">
                <h3>Resumen financiero</h3>
                <div className="admin-report__list">
                  <div>
                    <span>Ingresos totales</span>
                    <strong>{formatCurrency(financialReport?.ingresos_totales || 0)}</strong>
                  </div>
                  <div>
                    <span>Compras inventario</span>
                    <strong>{formatCurrency(financialReport?.compras_inventario || 0)}</strong>
                  </div>
                  <div>
                    <span>Costo vendido</span>
                    <strong>{formatCurrency(financialReport?.costo_total_vendido || 0)}</strong>
                  </div>
                  <div>
                    <span>Utilidad bruta</span>
                    <strong>{formatSignedCurrency(financialReport?.utilidad_bruta || 0)}</strong>
                  </div>
                  <div>
                    <span>Margen bruto</span>
                    <strong>{formatPercent(financialReport?.margen_bruto || 0)}</strong>
                  </div>
                  <div>
                    <span>Perdidas</span>
                    <strong>{formatCurrency(financialReport?.perdidas_inventario || 0)}</strong>
                  </div>
                  <div>
                    <span>Ganancia neta aprox.</span>
                    <strong>{formatSignedCurrency(financialReport?.ganancia_neta_aproximada || 0)}</strong>
                  </div>
                  <div>
                    <span>Saldo neto aprox.</span>
                    <strong>{formatSignedCurrency(financialReport?.saldo_neto_caja_aproximado || 0)}</strong>
                  </div>
                </div>
              </section>

              <section className="admin-report__block">
                <h3>Operacion y usuarios</h3>
                <div className="admin-report__list">
                  <div>
                    <span>Pedidos registrados</span>
                    <strong>{summary?.ventas?.total_pedidos || 0}</strong>
                  </div>
                  <div>
                    <span>Ventas validas</span>
                    <strong>{financialReport?.ventas_validas || 0}</strong>
                  </div>
                  <div>
                    <span>Unidades compradas</span>
                    <strong>{financialReport?.unidades_compradas || 0}</strong>
                  </div>
                  <div>
                    <span>Productos activos</span>
                    <strong>{summary?.inventario?.productos_activos || 0}</strong>
                  </div>
                  <div>
                    <span>Unidades disponibles</span>
                    <strong>{summary?.inventario?.unidades_disponibles || 0}</strong>
                  </div>
                  <div>
                    <span>Alertas de stock</span>
                    <strong>{summary?.bajo_stock?.length || 0}</strong>
                  </div>
                  <div>
                    <span>Clientes activos</span>
                    <strong>{userStats.cliente}</strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="admin-report__tables">
              <section className="admin-report__table-block">
                <h3>Top productos vendidos</h3>
                <table className="admin-report__table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Unidades</th>
                      <th>Total vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.top_productos || []).map((item) => (
                      <tr key={`top-${item.id}`}>
                        <td>{item.nombre}</td>
                        <td>{item.unidades_vendidas}</td>
                        <td>{formatCurrency(item.total_vendido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="admin-report__table-block">
                <h3>Alertas de bajo stock</h3>
                <table className="admin-report__table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Stock</th>
                      <th>Minimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.bajo_stock || []).map((item) => (
                      <tr key={`stock-${item.id}`}>
                        <td>{item.nombre}</td>
                        <td>{item.stock_actual}</td>
                        <td>{item.stock_minimo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </article>

          <section className="dashboard-grid summary-support">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Tu perfil</h2>
                  <p>Credenciales del administrador autenticado.</p>
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
                  <strong>{profile?.rol || "administrador"}</strong>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Resumen del negocio</h2>
                  <p>Ventas, inventario y distribucion de usuarios activos.</p>
                </div>
              </div>

              <div className="detail-list">
                <div>
                  <span>Ventas entregadas</span>
                  <strong>{formatCurrency(summary?.ventas?.ventas_entregadas || 0)}</strong>
                </div>
                <div>
                  <span>Unidades vendidas</span>
                  <strong>{financialReport?.unidades_vendidas || 0}</strong>
                </div>
                <div>
                  <span>Compras inventario</span>
                  <strong>{formatCurrency(financialReport?.compras_inventario || 0)}</strong>
                </div>
                <div>
                  <span>Unidades compradas</span>
                  <strong>{financialReport?.unidades_compradas || 0}</strong>
                </div>
                <div>
                  <span>Costo vendido</span>
                  <strong>{formatCurrency(financialReport?.costo_total_vendido || 0)}</strong>
                </div>
                <div>
                  <span>Utilidad bruta</span>
                  <strong>{formatSignedCurrency(financialReport?.utilidad_bruta || 0)}</strong>
                </div>
                <div>
                  <span>Perdidas inventario</span>
                  <strong>{formatCurrency(financialReport?.perdidas_inventario || 0)}</strong>
                </div>
                <div>
                  <span>Unidades perdidas</span>
                  <strong>{financialReport?.unidades_perdidas || 0}</strong>
                </div>
                <div>
                  <span>Ganancia neta aprox.</span>
                  <strong>{formatSignedCurrency(financialReport?.ganancia_neta_aproximada || 0)}</strong>
                </div>
                <div>
                  <span>Saldo neto aprox.</span>
                  <strong>{formatSignedCurrency(financialReport?.saldo_neto_caja_aproximado || 0)}</strong>
                </div>
                <div>
                  <span>Productos activos</span>
                  <strong>{summary?.inventario?.productos_activos || 0}</strong>
                </div>
                <div>
                  <span>Margen bruto</span>
                  <strong>{formatPercent(financialReport?.margen_bruto || 0)}</strong>
                </div>
                <div>
                  <span>Unidades disponibles</span>
                  <strong>{summary?.inventario?.unidades_disponibles || 0}</strong>
                </div>
                <div>
                  <span>Clientes activos</span>
                  <strong>{userStats.cliente}</strong>
                </div>
                <div>
                  <span>Trabajadores activos</span>
                  <strong>{userStats.trabajador}</strong>
                </div>
                <div>
                  <span>Administradores activos</span>
                  <strong>{userStats.administrador}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="dashboard-grid bottom-grid summary-support">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Top productos vendidos</h2>
                  <p>Ranking calculado con los detalles de pedido.</p>
                </div>
              </div>

              <ul className="activity-list">
                {(summary?.top_productos || []).map((item) => (
                  <li key={item.id}>
                    <strong>{item.nombre}</strong>
                    <span>
                      {item.unidades_vendidas} unidades - {formatCurrency(item.total_vendido)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Actividad de inventario</h2>
                  <p>Kardex reciente del sistema.</p>
                </div>
              </div>

              <ul className="activity-list">
                {(summary?.movimientos_recientes || []).map((item) => (
                  <li key={item.id}>
                    <strong>{item.producto}</strong>
                    <span>
                      {item.tipo} {Math.abs(Number(item.cantidad || 0))} - {item.motivo === "venta_pedido" ? "venta" : item.motivo} - {item.usuario}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Alertas de bajo stock</h2>
                  <p>Productos que necesitan reposicion.</p>
                </div>
              </div>

              <ul className="activity-list">
                {(summary?.bajo_stock || []).map((item) => (
                  <li key={item.id}>
                    <strong>{item.nombre}</strong>
                    <span>
                      Stock {item.stock_actual} / minimo {item.stock_minimo}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : null}

      {activeTab === "pedidos" ? (
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Pedidos recientes</h2>
                <p>El administrador puede revisar el pedido completo, sus productos y su tirilla.</p>
              </div>
              {printableOrderTickets.length > 0 ? (
                <button type="button" className="btn btn-outline" onClick={printAllOrders}>
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
                {orders.map((order) => (
                  <Fragment key={order.id}>
                    <tr>
                      <td>#{order.id}</td>
                      <td>{order.cliente}</td>
                      <td>{order.estado}</td>
                      <td>{order.items}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>
                        <div className="table-actions">
                          {getOrderActions(order.estado).length > 0 ? (
                            getOrderActions(order.estado).map((action) => (
                              <button
                                key={action.value}
                                type="button"
                                className={`btn ${action.tone === "outline" ? "btn-outline" : action.tone === "secondary" ? "btn-secondary" : "btn-primary"}`}
                                onClick={() => changeOrderStatus(order.id, action.value)}
                                disabled={processingOrderId === order.id}
                              >
                                {action.label}
                              </button>
                            ))
                          ) : (
                            <span>Sin acciones</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className="data-table__details-row">
                      <td colSpan="6">
                        <TicketCard title={`Pedido #${order.id}`} ticket={order.tirilla} compact />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {activeTab === "productos" ? (
        <section className="dashboard-grid bottom-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Gestion de productos</h2>
                <p>
                  Aqui defines la ficha comercial del producto. El inventario y el
                  costo de compra se controlan desde Compras.
                </p>
              </div>
            </div>

            <div className="inventory-callout">
              <div>
                <strong>{productForm.id ? "Editando producto" : "Creando producto"}</strong>
                <span>
                  {productForm.id
                    ? "Puedes cambiar nombre, categoria, proveedor, precio detal, descuentos e imagen sin tocar el stock directo."
                    : "El producto se crea sin stock manual. La existencia real aparece cuando registras compras al proveedor."}
                </span>
              </div>
              <div>
                <strong>Costo separado</strong>
                <span>
                  El sistema sigue guardando costo promedio internamente, pero ya no mostramos ni editamos precio al por mayor en esta seccion.
                </span>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitProduct}>
              <input
                name="nombre"
                value={productForm.nombre}
                onChange={handleProductChange}
                placeholder="Nombre del producto"
                required
              />
              <input
                name="descripcion"
                value={productForm.descripcion}
                onChange={handleProductChange}
                placeholder="Descripcion"
              />
              <select name="categoria_id" value={productForm.categoria_id} onChange={handleProductChange}>
                <option value="">Categoria</option>
                {catalogos.categorias.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
              <select name="marca_id" value={productForm.marca_id} onChange={handleProductChange}>
                <option value="">Marca</option>
                {catalogos.marcas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
              <select name="proveedor_id" value={productForm.proveedor_id} onChange={handleProductChange}>
                <option value="">Proveedor</option>
                {catalogos.proveedores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
              <input
                name="precio_venta"
                type="number"
                min="1"
                value={productForm.precio_venta}
                onChange={handleProductChange}
                placeholder="Precio detal"
                required
              />

              <input
                name="stock_minimo"
                type="number"
                min="0"
                value={productForm.stock_minimo}
                onChange={handleProductChange}
                placeholder="Stock minimo"
              />
              <input
                name="descuento_cantidad_minima"
                type="number"
                min="0"
                value={productForm.descuento_cantidad_minima}
                onChange={handleProductChange}
                placeholder="Cantidad minima para descuento"
              />
              <input
                name="descuento_porcentaje"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={productForm.descuento_porcentaje}
                onChange={handleProductChange}
                placeholder="Porcentaje de descuento"
              />
              <input
                name="imagen_url"
                value={productForm.imagen_url}
                onChange={handleProductChange}
                placeholder="URL imagen opcional; si no la pones se genera una ilustracion automatica"
              />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {productForm.id ? "Actualizar producto" : "Crear producto"}
                </button>
                {productForm.id ? (
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setProductForm(initialProductForm)}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Listado de productos</h2>
                <p>Selecciona un producto para editar su ficha comercial. El stock se mueve en Compras.</p>
              </div>
            </div>

            <input
              className="search-input"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Busca por nombre, categoria o marca"
            />

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoria</th>
                    <th>Detal</th>
                    <th>Proveedor</th>
                    <th>Descuento</th>
                    <th>Stock</th>
                    <th>Minimo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((item) => (
                    <tr key={item.id}>
                      <td>{item.nombre}</td>
                      <td>{item.categoria || "-"}</td>
                      <td>{formatCurrency(item.precio_venta)}</td>
                      <td>{item.proveedor || "-"}</td>
                      <td>
                        {item.descuento_cantidad_minima && item.descuento_porcentaje
                          ? `${item.descuento_porcentaje}% x ${item.descuento_cantidad_minima}+`
                          : "-"}
                      </td>
                      <td>{item.stock}</td>
                      <td>{item.stock_minimo}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-outline" type="button" onClick={() => startEditProduct(item)}>
                            Editar
                          </button>
                          <button className="btn btn-outline" type="button" onClick={() => deleteProduct(item)}>
                            Desactivar
                          </button>
                          <button className="btn btn-outline btn-danger-lite" type="button" onClick={() => deleteProduct(item, "hard")}>
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "compras" ? (
        <section className="dashboard-grid bottom-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Compra a proveedores</h2>
                <p>
                  Registra entradas de inventario y deja que el stock y el costo
                  promedio se calculen automaticamente.
                </p>
              </div>
            </div>

            <div className="inventory-callout">
              <div>
                <strong>Sin stock manual</strong>
                <span>La compra crea el movimiento, aumenta el stock y deja trazabilidad en el kardex.</span>
              </div>
              <div>
                <strong>Costo promedio</strong>
                <span>Si vuelves a comprar el mismo producto a otro valor, el sistema recalcula el costo promedio.</span>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitPurchase}>
              <select
                name="producto_id"
                value={purchaseForm.producto_id}
                onChange={handlePurchaseChange}
                required
              >
                <option value="">Producto a comprar</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} - stock {item.stock}
                  </option>
                ))}
              </select>

              <select
                name="proveedor_id"
                value={purchaseForm.proveedor_id}
                onChange={handlePurchaseChange}
                required
              >
                <option value="">Proveedor</option>
                {catalogos.proveedores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>

              <input
                name="cantidad"
                type="number"
                min="1"
                value={purchaseForm.cantidad}
                onChange={handlePurchaseChange}
                placeholder="Cantidad"
                required
              />

              <input
                name="precio_compra_unitario"
                type="number"
                min="0"
                step="0.01"
                value={purchaseForm.precio_compra_unitario}
                onChange={handlePurchaseChange}
                placeholder="Costo unitario"
              />

              <button className="btn btn-secondary" type="submit">
                Registrar compra
              </button>
            </form>

            {lastPurchaseTicket ? (
              <div className="ticket-card-wrap">
                <TicketCard title="Ultima compra registrada" ticket={lastPurchaseTicket} />
              </div>
            ) : null}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Compras recientes</h2>
                <p>Tirilla visible de cada entrada comprada a proveedor.</p>
              </div>
            </div>

            <div className="ticket-list">
              {movements
                .filter((item) => item.tipo === "entrada")
                .slice(0, 6)
                .map((movement) => (
                  <TicketCard
                    key={movement.id}
                    title={`Movimiento #${movement.id}`}
                    compact
                    ticket={{
                      tipo: "compra",
                      numero: `M-${movement.id}`,
                      fecha: movement.fecha,
                      producto: movement.producto,
                      cantidad: movement.cantidad_absoluta,
                      movimiento: movement.tipo,
                      motivo: movement.motivo,
                      proveedor: movement.proveedor,
                      costo_unitario: movement.precio_unitario_referencia,
                      total: Number(movement.precio_unitario_referencia || 0) * Number(movement.cantidad_absoluta || 0),
                      stock_antes: movement.stock_antes,
                      stock_despues: movement.stock_despues
                    }}
                  />
                ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "devoluciones" ? (
        <ReturnsManager
          token={token}
          title="Gestion de devoluciones"
          subtitle="Procesa devoluciones por pedido, reintegra stock al kardex y genera la tirilla de devolucion."
          onAfterSubmit={loadData}
        />
      ) : null}

      {activeTab === "usuarios" ? (
        <section className="dashboard-grid bottom-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Gestion de usuarios</h2>
                <p>Crea, edita y desactiva clientes o trabajadores.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitUser}>
              <input name="nombre" value={userForm.nombre} onChange={handleUserChange} placeholder="Nombre" required />
              <input name="email" type="email" value={userForm.email} onChange={handleUserChange} placeholder="Correo" required />
              <input
                name="password"
                type="password"
                value={userForm.password}
                onChange={handleUserChange}
                placeholder={userForm.id ? "Nueva contrasena opcional" : "Contrasena temporal"}
                required={!userForm.id}
              />
              <select name="rol" value={userForm.rol} onChange={handleUserChange}>
                <option value="cliente">Cliente</option>
                <option value="trabajador">Trabajador</option>
                <option value="administrador">Administrador</option>
              </select>
              <input name="telefono" value={userForm.telefono} onChange={handleUserChange} placeholder="Telefono" />
              <input name="direccion" value={userForm.direccion} onChange={handleUserChange} placeholder="Direccion" />
              <select name="activo" value={String(userForm.activo)} onChange={handleUserChange}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {userForm.id ? "Actualizar usuario" : "Crear usuario"}
                </button>
                {userForm.id ? (
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setUserForm(initialUserForm)}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Listado de usuarios</h2>
                <p>Accede rapido a editar o activar y desactivar cuentas.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td>{item.nombre}</td>
                      <td>{item.rol}</td>
                      <td>{item.activo ? "Activo" : "Inactivo"}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-outline" type="button" onClick={() => startEditUser(item)}>
                            Editar
                          </button>
                          <button className="btn btn-outline" type="button" onClick={() => toggleUserState(item)}>
                            {item.activo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "catalogos" ? (
        <section className="dashboard-grid bottom-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Categorias</h2>
                <p>Organiza el catalogo por familias de producto.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitCategory}>
              <input name="nombre" value={categoryForm.nombre} onChange={handleCategoryChange} placeholder="Nombre" required />
              <input name="descripcion" value={categoryForm.descripcion} onChange={handleCategoryChange} placeholder="Descripcion" />
              <select name="activo" value={String(categoryForm.activo)} onChange={handleCategoryChange}>
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </select>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {categoryForm.id ? "Actualizar categoria" : "Crear categoria"}
                </button>
                {categoryForm.id ? (
                  <button className="btn btn-outline" type="button" onClick={() => setCategoryForm(initialCategoryForm)}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>

            <ul className="activity-list">
              {catalogos.categorias.map((item) => (
                <li key={item.id}>
                  <strong>{item.nombre}</strong>
                  <span>{item.activo ? "Activa" : "Inactiva"}</span>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() =>
                      setCategoryForm({
                        id: item.id,
                        nombre: item.nombre,
                        descripcion: item.descripcion || "",
                        activo: Boolean(item.activo)
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-outline btn-danger-lite"
                    type="button"
                    onClick={() => deleteCategory(item)}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Marcas</h2>
                <p>Administra las marcas disponibles para el catalogo.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitBrand}>
              <input name="nombre" value={brandForm.nombre} onChange={handleBrandChange} placeholder="Nombre" required />
              <input name="descripcion" value={brandForm.descripcion} onChange={handleBrandChange} placeholder="Descripcion" />
              <select name="activo" value={String(brandForm.activo)} onChange={handleBrandChange}>
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </select>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {brandForm.id ? "Actualizar marca" : "Crear marca"}
                </button>
                {brandForm.id ? (
                  <button className="btn btn-outline" type="button" onClick={() => setBrandForm(initialBrandForm)}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>

            <ul className="activity-list">
              {catalogos.marcas.map((item) => (
                <li key={item.id}>
                  <strong>{item.nombre}</strong>
                  <span>{item.activo ? "Activa" : "Inactiva"}</span>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() =>
                      setBrandForm({
                        id: item.id,
                        nombre: item.nombre,
                        descripcion: item.descripcion || "",
                        activo: Boolean(item.activo)
                      })
                    }
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Proveedores</h2>
                <p>Controla tus aliados para reposicion de inventario.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitProvider}>
              <input name="nombre" value={providerForm.nombre} onChange={handleProviderChange} placeholder="Nombre" required />
              <input name="nit" value={providerForm.nit} onChange={handleProviderChange} placeholder="NIT" />
              <input name="telefono" value={providerForm.telefono} onChange={handleProviderChange} placeholder="Telefono" />
              <input name="email" type="email" value={providerForm.email} onChange={handleProviderChange} placeholder="Correo" />
              <input name="direccion" value={providerForm.direccion} onChange={handleProviderChange} placeholder="Direccion" />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {providerForm.id ? "Actualizar proveedor" : "Crear proveedor"}
                </button>
                {providerForm.id ? (
                  <button className="btn btn-outline" type="button" onClick={() => setProviderForm(initialProviderForm)}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>

            <ul className="activity-list">
              {catalogos.proveedores.map((item) => (
                <li key={item.id}>
                  <strong>{item.nombre}</strong>
                  <span>
                    {item.nit ? `NIT ${item.nit}` : "Sin NIT"} - {item.email || "Sin correo"} - {item.telefono || "Sin telefono"}
                  </span>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() =>
                      setProviderForm({
                        id: item.id,
                        nombre: item.nombre,
                        nit: item.nit || "",
                        telefono: item.telefono || "",
                        email: item.email || "",
                        direccion: item.direccion || ""
                      })
                    }
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

        </div>
      </div>
    </section>
  );
}

export default Dashboard;
