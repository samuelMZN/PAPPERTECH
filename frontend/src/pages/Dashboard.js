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

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-CO");
}

function formatCatalogPrice(value) {
  return Number(value || 0) > 0 ? formatCurrency(value) : "Se calcula con la compra";
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(query, ...values) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

function getCatalogEmptyMessage(entityLabel, query) {
  return normalizeSearchValue(query)
    ? `No hay ${entityLabel} que coincidan con el filtro actual.`
    : `No hay ${entityLabel} registradas todavia.`;
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

function getPeriodLabelUi(value) {
  const labels = {
    dia: "D\u00eda",
    semana: "Semana",
    mes: "Mes",
    anio: "A\u00f1o",
    personalizado: "Personalizado"
  };

  return labels[value] || value;
}

function formatMonthPeriodLabel(value) {
  if (!value) {
    return "-";
  }

  const [year, month] = String(value).split("-");
  if (!year || !month) {
    return value;
  }

  const monthDate = new Date(Number(year), Number(month) - 1, 1);
  return monthDate.toLocaleDateString("es-CO", {
    month: "short",
    year: "numeric"
  });
}

const adminTabs = [
  { id: "resumen", label: "Resumen" },
  { id: "pedidos", label: "Pedidos" },
  { id: "productos", label: "Productos" },
  { id: "compras", label: "Compras" },
  { id: "reportes", label: "Reportes" },
  { id: "devoluciones", label: "Devoluciones" },
  { id: "usuarios", label: "Usuarios" },
  { id: "categorias", label: "Categorías" },
  { id: "marcas", label: "Marcas" },
  { id: "proveedores", label: "Proveedores" }
];

const initialUserForm = {
  id: null,
  nombre: "",
  email: "",
  password: "",
  rol: "trabajador",
  telefono: "",
  direccion: "",
  token_validacion: "",
  activo: true
};

const initialProductForm = {
  id: null,
  nombre: "",
  descripcion: "",
  categoria_id: "",
  marca_id: "",
  proveedor_id: "",
  margen_porcentaje: "",
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
  factura: "",
  motivo: "compra_proveedor"
};

const initialPurchaseFilters = {
  fecha_desde: "",
  fecha_hasta: "",
  producto_id: "",
  factura: ""
};

const initialSalesReportFilters = {
  periodo: "mes",
  fecha_desde: "",
  fecha_hasta: "",
  producto_id: "",
  proveedor_id: ""
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
  direccion: "",
  activo: true
};

const initialCrudPanels = {
  productos: false,
  usuarios: false,
  categorias: false,
  marcas: false,
  proveedores: false
};

const DEFAULT_MARGIN_BY_CATEGORY = {
  general: 30,
  cuadernos: 28,
  escritura: 35,
  oficina: 40,
  arte: 45,
  industrial: 50
};

function normalizeCategoryName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getDefaultMarginForCategoryName(name) {
  return DEFAULT_MARGIN_BY_CATEGORY[normalizeCategoryName(name)] ?? 30;
}

function getSuggestedMarginForCategoryId(categoryId, categorias = []) {
  if (!categoryId) {
    return "";
  }

  const category = categorias.find((item) => String(item.id) === String(categoryId));
  const suggestedMargin = getDefaultMarginForCategoryName(category?.nombre);
  return String(suggestedMargin);
}

function buildProductOptionLabel(item, options = {}) {
  if (!item) {
    return "-";
  }

  const { includeStock = false, includeProvider = false } = options;
  const descriptors = [item.categoria, item.marca];

  if (includeProvider && item.proveedor) {
    descriptors.push(item.proveedor);
  }

  const parts = [item.nombre];
  const descriptorText = descriptors.filter(Boolean).join(" · ");

  if (descriptorText) {
    parts.push(descriptorText);
  }

  if (includeStock) {
    parts.push(`stock ${Number(item.stock || 0)}`);
  }

  return parts.join(" - ");
}

function buildPurchaseReportPath(filters = {}) {
  const params = new URLSearchParams();

  if (filters.fecha_desde) {
    params.set("fecha_desde", filters.fecha_desde);
  }

  if (filters.fecha_hasta) {
    params.set("fecha_hasta", filters.fecha_hasta);
  }

  if (filters.producto_id) {
    params.set("producto_id", filters.producto_id);
  }

  if (filters.factura) {
    params.set("factura", filters.factura);
  }

  const query = params.toString();
  return query ? `/inventario/reportes/compras?${query}` : "/inventario/reportes/compras";
}

function buildSalesReportPath(filters = {}) {
  const params = new URLSearchParams();

  if (filters.periodo) {
    params.set("periodo", filters.periodo);
  }

  if (filters.fecha_desde) {
    params.set("fecha_desde", filters.fecha_desde);
  }

  if (filters.fecha_hasta) {
    params.set("fecha_hasta", filters.fecha_hasta);
  }

  if (filters.producto_id) {
    params.set("producto_id", filters.producto_id);
  }

  if (filters.proveedor_id) {
    params.set("proveedor_id", filters.proveedor_id);
  }

  const query = params.toString();
  return query ? `/dashboard/admin/reportes?${query}` : "/dashboard/admin/reportes";
}

async function fetchDashboardData(token, purchaseFilters) {
  return Promise.all([
    apiRequest("/auth/perfil", { token }),
    apiRequest("/dashboard/admin", { token }),
    apiRequest("/productos"),
    apiRequest("/usuarios", { token }),
    apiRequest("/catalogos", { token }),
    apiRequest("/pedidos", { token }),
    apiRequest("/inventario", { token }),
    apiRequest(buildPurchaseReportPath(purchaseFilters), { token })
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
  const [orderQuery, setOrderQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [userForm, setUserForm] = useState(initialUserForm);
  const [productForm, setProductForm] = useState(initialProductForm);
  const [purchaseForm, setPurchaseForm] = useState(initialPurchaseForm);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [purchaseFilters, setPurchaseFilters] = useState(initialPurchaseFilters);
  const [salesReportFilters, setSalesReportFilters] = useState(initialSalesReportFilters);
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [brandForm, setBrandForm] = useState(initialBrandForm);
  const [providerForm, setProviderForm] = useState(initialProviderForm);
  const [crudPanels, setCrudPanels] = useState(initialCrudPanels);
  const [lastPurchaseTicket, setLastPurchaseTicket] = useState(null);
  const [purchaseReport, setPurchaseReport] = useState({
    resumen: {
      total_registros: 0,
      total_unidades: 0,
      total_invertido: 0,
      total_facturas: 0
    },
    compras: [],
    por_producto: [],
    por_factura: []
  });
  const [salesReport, setSalesReport] = useState({
    filtros: initialSalesReportFilters,
    resumen: {
      ventas_validas: 0,
      productos_vendidos: 0,
      unidades_vendidas: 0,
      ingresos_totales: 0,
      costo_total_estimado: 0,
      utilidad_bruta: 0,
      margen_bruto: 0,
      ticket_promedio: 0
    },
    resumen_rapido: {
      ventas_hoy: 0,
      ganancias_hoy: 0,
      ventas_mes: 0,
      ganancias_mes: 0,
      clientes_registrados: 0,
      productos_stock_bajo: 0
    },
    stock_bajo: [],
    top_productos: [],
    productos_menos_vendidos: [],
    ultimas_ventas: [],
    grafica_mensual: [],
    clientes: {
      registrados: 0,
      nuevos_por_mes: [],
      con_mas_compras: [],
      historial_compras: []
    },
    proveedores_reportes: {
      productos_suministrados: [],
      compras_realizadas: [],
      proveedor_mas_utilizado: null
    },
    trabajadores_reportes: {
      ventas_realizadas: [],
      movimientos_realizados: [],
      actividades_registradas: []
    },
    por_producto: [],
    por_proveedor: [],
    por_categoria: [],
    por_periodo: [],
    notas: []
  });
  const [salesReportLoading, setSalesReportLoading] = useState(false);
  const [orderNotice, setOrderNotice] = useState("");
  const knownPendingOrdersRef = useRef(new Set());

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const [
        profileData,
        summaryData,
        productsData,
        usersData,
        catalogosData,
        ordersData,
        movementsData,
        purchaseReportData
      ] = await fetchDashboardData(token, purchaseFilters);

      setProfile(profileData);
      setSummary(summaryData);
      setProducts(productsData);
      setUsers(usersData);
      setCatalogos(catalogosData);
      const { notice } = detectNewPendingOrders(ordersData, knownPendingOrdersRef);
      setOrders(ordersData);
      setMovements(movementsData);
      setPurchaseReport(purchaseReportData);

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
  }, [purchaseFilters, token]);

  const loadSalesReport = useCallback(async () => {
    setError("");
    setSalesReportLoading(true);

    try {
      const reportData = await apiRequest(buildSalesReportPath(salesReportFilters), { token });
      setSalesReport(reportData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSalesReportLoading(false);
    }
  }, [salesReportFilters, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab !== "reportes") {
      return;
    }

    loadSalesReport();
  }, [activeTab, loadSalesReport]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadData({ silent: true });
      if (activeTab === "reportes") {
        loadSalesReport();
      }
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, loadData, loadSalesReport]);

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

  const visibleOrders = useMemo(() => {
    return orders.filter((order) =>
      matchesSearch(orderQuery, order.id, order.cliente, order.estado, order.total)
    );
  }, [orderQuery, orders]);

  const visibleUsers = useMemo(() => {
    return users.filter((item) =>
      matchesSearch(
        userQuery,
        item.nombre,
        item.email,
        item.rol,
        item.token_validacion,
        item.activo ? "activo" : "inactivo"
      )
    );
  }, [userQuery, users]);

  const visibleCategories = useMemo(() => {
    return catalogos.categorias.filter((item) =>
      matchesSearch(categoryQuery, item.nombre, item.descripcion, item.activo ? "activa" : "inactiva")
    );
  }, [catalogos.categorias, categoryQuery]);

  const visibleBrands = useMemo(() => {
    return catalogos.marcas.filter((item) =>
      matchesSearch(brandQuery, item.nombre, item.descripcion, item.activo ? "activa" : "inactiva")
    );
  }, [brandQuery, catalogos.marcas]);

  const visibleProviders = useMemo(() => {
    return catalogos.proveedores.filter((item) =>
      matchesSearch(
        providerQuery,
        item.nombre,
        item.nit,
        item.email,
        item.telefono,
        item.direccion
      )
    );
  }, [catalogos.proveedores, providerQuery]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((left, right) => {
      const byName = String(left.nombre || "").localeCompare(String(right.nombre || ""), "es", {
        sensitivity: "base"
      });

      if (byName !== 0) {
        return byName;
      }

      const byBrand = String(left.marca || "").localeCompare(String(right.marca || ""), "es", {
        sensitivity: "base"
      });

      if (byBrand !== 0) {
        return byBrand;
      }

      return Number(left.id || 0) - Number(right.id || 0);
    });
  }, [products]);

  const productsById = useMemo(
    () => Object.fromEntries(products.map((item) => [String(item.id), item])),
    [products]
  );
  const providersById = useMemo(
    () => Object.fromEntries((catalogos.proveedores || []).map((item) => [String(item.id), item])),
    [catalogos.proveedores]
  );

  const selectedPurchaseProduct = useMemo(
    () => sortedProducts.find((item) => String(item.id) === String(purchaseForm.producto_id)) || null,
    [purchaseForm.producto_id, sortedProducts]
  );
  const purchaseDraftSummary = useMemo(() => ({
    lineas: purchaseItems.length,
    unidades: purchaseItems.reduce((total, item) => total + Number(item.cantidad || 0), 0),
    total: purchaseItems.reduce((total, item) => total + Number(item.subtotal || 0), 0)
  }), [purchaseItems]);

  const pendingOrdersCount = useMemo(
    () => orders.filter((order) => order.estado === "pendiente").length,
    [orders]
  );
  const purchaseReportCards = useMemo(() => {
    const resumen = purchaseReport?.resumen || {};

    return [
      {
        id: "registros",
        label: "Compras registradas",
        value: Number(resumen.total_registros || 0),
        note: "Movimientos de compra detectados",
        tone: "neutral"
      },
      {
        id: "unidades",
        label: "Unidades compradas",
        value: Number(resumen.total_unidades || 0),
        note: "Total de unidades ingresadas",
        tone: "neutral"
      },
      {
        id: "invertido",
        label: "Total invertido",
        value: formatCurrency(resumen.total_invertido || 0),
        note: "Costo acumulado en compras filtradas",
        tone: "warning"
      },
      {
        id: "facturas",
        label: "Documentos encontrados",
        value: Number(resumen.total_facturas || 0),
        note:
          Number(resumen.total_facturas || 0) > 0
            ? "Documentos o referencias detectadas"
            : "Sin documentos registrados en el filtro",
        tone: "neutral"
      }
    ];
  }, [purchaseReport]);
  const activePurchaseFilterCount = useMemo(
    () => Object.values(purchaseFilters).filter((value) => String(value || "").trim() !== "").length,
    [purchaseFilters]
  );
  const purchaseFilterTags = useMemo(() => {
    const tags = [];

    if (purchaseFilters.fecha_desde || purchaseFilters.fecha_hasta) {
      const desde = purchaseFilters.fecha_desde || "inicio";
      const hasta = purchaseFilters.fecha_hasta || "hoy";
      tags.push(`Periodo: ${desde} - ${hasta}`);
    }

    if (purchaseFilters.producto_id) {
      const selectedProduct = productsById[String(purchaseFilters.producto_id)];
      tags.push(selectedProduct ? `Producto: ${selectedProduct.nombre}` : "Producto seleccionado");
    }

    if (purchaseFilters.factura) {
      tags.push(`Documento: ${purchaseFilters.factura}`);
    }

    return tags;
  }, [productsById, purchaseFilters]);
  const salesReportCards = useMemo(() => {
    const resumen = salesReport?.resumen || {};

    return [
      {
        id: "ventas",
        label: "Pedidos con venta",
        value: Number(resumen.ventas_validas || 0),
        note: `${Number(resumen.productos_vendidos || 0)} productos vendidos`,
        tone: "neutral"
      },
      {
        id: "unidades",
        label: "Unidades vendidas",
        value: Number(resumen.unidades_vendidas || 0),
        note: "Total de unidades en el periodo",
        tone: "neutral"
      },
      {
        id: "ingresos",
        label: "Ingresos",
        value: formatCurrency(resumen.ingresos_totales || 0),
        note: `Ticket prom. ${formatCurrency(resumen.ticket_promedio || 0)}`,
        tone: "warning"
      },
      {
        id: "costos",
        label: "Costo estimado",
        value: formatCurrency(resumen.costo_total_estimado || 0),
        note: "Costo estimado usando costo promedio actual",
        tone: "warning"
      },
      {
        id: "utilidad",
        label: "Utilidad bruta",
        value: formatSignedCurrency(resumen.utilidad_bruta || 0),
        note: `Margen ${formatPercent(resumen.margen_bruto || 0)}`,
        tone: Number(resumen.utilidad_bruta || 0) >= 0 ? "positive" : "negative"
      }
    ];
  }, [salesReport]);
  const salesQuickCards = useMemo(() => {
    const resumenRapido = salesReport?.resumen_rapido || {};

    return [
      {
        id: "ventas_hoy",
        label: "Ventas de hoy",
        value: formatCurrency(resumenRapido.ventas_hoy || 0),
        note: "Total vendido en el dia actual",
        tone: "neutral"
      },
      {
        id: "ganancias_hoy",
        label: "Ganancias de hoy",
        value: formatSignedCurrency(resumenRapido.ganancias_hoy || 0),
        note: "Utilidad estimada del dia",
        tone: Number(resumenRapido.ganancias_hoy || 0) >= 0 ? "positive" : "negative"
      },
      {
        id: "ventas_mes",
        label: "Ventas del mes",
        value: formatCurrency(resumenRapido.ventas_mes || 0),
        note: "Total vendido en el mes actual",
        tone: "warning"
      },
      {
        id: "ganancias_mes",
        label: "Ganancias del mes",
        value: formatSignedCurrency(resumenRapido.ganancias_mes || 0),
        note: "Utilidad estimada del mes actual",
        tone: Number(resumenRapido.ganancias_mes || 0) >= 0 ? "positive" : "negative"
      },
      {
        id: "clientes",
        label: "Clientes registrados",
        value: Number(resumenRapido.clientes_registrados || 0),
        note: "Clientes activos registrados",
        tone: "neutral"
      },
      {
        id: "stock_bajo",
        label: "Productos con stock bajo",
        value: Number(resumenRapido.productos_stock_bajo || 0),
        note: "Productos que necesitan reposicion",
        tone: Number(resumenRapido.productos_stock_bajo || 0) > 0 ? "warning" : "neutral"
      }
    ];
  }, [salesReport]);
  const monthlySalesPeak = useMemo(
    () => Math.max(1, ...((salesReport?.grafica_mensual || []).map((item) => Number(item.ingresos_totales || 0)))),
    [salesReport]
  );
  const activeSalesFilterCount = useMemo(
    () => Object.values(salesReportFilters).filter((value) => String(value || "").trim() !== "").length,
    [salesReportFilters]
  );
  const salesReportFilterTags = useMemo(() => {
    const tags = [];

    if (salesReportFilters.periodo && salesReportFilters.periodo !== "personalizado") {
      tags.push(`Periodo: ${getPeriodLabelUi(salesReportFilters.periodo)}`);
    }

    if (salesReportFilters.fecha_desde || salesReportFilters.fecha_hasta) {
      const desde = salesReportFilters.fecha_desde || "inicio";
      const hasta = salesReportFilters.fecha_hasta || "hoy";
      tags.push(`Rango: ${desde} - ${hasta}`);
    }

    if (salesReportFilters.producto_id) {
      const selectedProduct = productsById[String(salesReportFilters.producto_id)];
      tags.push(selectedProduct ? `Producto: ${selectedProduct.nombre}` : "Producto seleccionado");
    }

    if (salesReportFilters.proveedor_id) {
      const selectedProvider = providersById[String(salesReportFilters.proveedor_id)];
      tags.push(selectedProvider ? `Proveedor: ${selectedProvider.nombre}` : "Proveedor seleccionado");
    }

    return tags;
  }, [productsById, providersById, salesReportFilters]);
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
    setProductForm((current) => {
      if (name === "categoria_id" && !current.id) {
        const previousSuggestedMargin = getSuggestedMarginForCategoryId(current.categoria_id, catalogos.categorias);
        const nextSuggestedMargin = getSuggestedMarginForCategoryId(value, catalogos.categorias);
        const shouldReplaceMargin =
          !current.margen_porcentaje || String(current.margen_porcentaje) === String(previousSuggestedMargin);

        return {
          ...current,
          categoria_id: value,
          margen_porcentaje: shouldReplaceMargin ? nextSuggestedMargin : current.margen_porcentaje
        };
      }

      return { ...current, [name]: value };
    });
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
    setProviderForm((current) => ({
      ...current,
      [name]: name === "activo" ? handleBooleanValue(value) : value
    }));
  };

  const handlePurchaseChange = (event) => {
    const { name, value } = event.target;
    setPurchaseForm((current) => ({ ...current, [name]: value }));
  };

  const buildPurchaseDraftItem = useCallback((product, formValues) => {
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
      detalle: [
        product.categoría || "Sin categoría",
        product.marca || "Sin marca",
        `stock ${Number(product.stock || 0)}`
      ].join(" - "),
      cantidad,
      precio_compra_unitario: costoUnitario,
      subtotal: Number((cantidad * costoUnitario).toFixed(2))
    };
  }, []);

  const addPurchaseItem = () => {
    resetMessages();

    try {
      const draftItem = buildPurchaseDraftItem(selectedPurchaseProduct, purchaseForm);

      setPurchaseItems((current) => {
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

      setPurchaseForm((current) => ({
        ...current,
        producto_id: "",
        cantidad: "1",
        precio_compra_unitario: ""
      }));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const removePurchaseItem = (productoId, precioUnitario) => {
    setPurchaseItems((current) =>
      current.filter(
        (item) =>
          !(
            String(item.producto_id) === String(productoId) &&
            Number(item.precio_compra_unitario) === Number(precioUnitario)
          )
      )
    );
  };

  const clearPurchaseDraft = () => {
    setPurchaseItems([]);
    setPurchaseForm((current) => ({
      ...current,
      producto_id: "",
      cantidad: "1",
      precio_compra_unitario: ""
    }));
  };

  const handlePurchaseFilterChange = (event) => {
    const { name, value } = event.target;
    setPurchaseFilters((current) => ({ ...current, [name]: value }));
  };

  const handleSalesReportFilterChange = (event) => {
    const { name, value } = event.target;

    setSalesReportFilters((current) => {
      if (name === "periodo") {
        return {
          ...current,
          periodo: value
        };
      }

      if (name === "fecha_desde" || name === "fecha_hasta") {
        return {
          ...current,
          [name]: value,
          periodo: "personalizado"
        };
      }

      return {
        ...current,
        [name]: value
      };
    });
  };

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const setCrudPanelOpen = (panelName, isOpen) => {
    setCrudPanels((current) => ({
      ...current,
      [panelName]: isOpen
    }));
  };

  const openCreateUser = () => {
    resetMessages();
    setUserForm(initialUserForm);
    setCrudPanelOpen("usuarios", true);
  };

  const openCreateProduct = () => {
    resetMessages();
    setProductForm(initialProductForm);
    setCrudPanelOpen("productos", true);
  };

  const openCreateCategory = () => {
    resetMessages();
    setCategoryForm(initialCategoryForm);
    setCrudPanelOpen("categorias", true);
  };

  const openCreateBrand = () => {
    resetMessages();
    setBrandForm(initialBrandForm);
    setCrudPanelOpen("marcas", true);
  };

  const openCreateProvider = () => {
    resetMessages();
    setProviderForm(initialProviderForm);
    setCrudPanelOpen("proveedores", true);
  };

  const submitUser = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      const { token_validacion: _tokenValidacion, ...payload } = userForm;

      await apiRequest(userForm.id ? `/usuarios/${userForm.id}` : "/usuarios", {
        method: userForm.id ? "PUT" : "POST",
        token,
        body: {
          ...payload,
          activo: Boolean(userForm.activo)
        }
      });

      setUserForm(initialUserForm);
      setCrudPanelOpen("usuarios", false);
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
      token_validacion: item.token_validacion || "",
      activo: Boolean(item.activo)
    });
    setCrudPanelOpen("usuarios", true);
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
          margen_porcentaje: Number(productForm.margen_porcentaje || 0),
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
      setCrudPanelOpen("productos", false);
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
      margen_porcentaje: item.margen_porcentaje ?? "",
      stock_minimo: item.stock_minimo || "5",
      descuento_cantidad_minima: item.descuento_cantidad_minima || "",
      descuento_porcentaje: item.descuento_porcentaje || "",
      imagen_url: item.imagen_url || ""
    });
    setCrudPanelOpen("productos", true);
  };

  const submitPurchase = async (event) => {
    event.preventDefault();
    resetMessages();

    try {
      if (!purchaseForm.proveedor_id) {
        throw new Error("Selecciona un proveedor para registrar la compra.");
      }

      const draftItems = [...purchaseItems];

      if (purchaseForm.producto_id) {
        draftItems.push(buildPurchaseDraftItem(selectedPurchaseProduct, purchaseForm));
      }

      if (draftItems.length === 0) {
        throw new Error("Agrega al menos un producto a la compra.");
      }

      const response = await apiRequest("/inventario", {
        method: "POST",
        token,
        body: {
          tipo: "entrada",
          motivo: purchaseForm.motivo || "compra_proveedor",
          proveedor_id: purchaseForm.proveedor_id ? Number(purchaseForm.proveedor_id) : null,
          factura: purchaseForm.factura || "",
          items: draftItems.map((item) => ({
            producto_id: Number(item.producto_id),
            cantidad: Number(item.cantidad),
            precio_compra_unitario: Number(item.precio_compra_unitario)
          }))
        }
      });

      setPurchaseForm(initialPurchaseForm);
      setPurchaseItems([]);
      setLastPurchaseTicket(response.tirilla || null);
      setSuccess(
        draftItems.length > 1
          ? "Compra por lote registrada correctamente."
          : "Compra al proveedor registrada correctamente."
      );
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const clearPurchaseFilters = () => {
    setPurchaseFilters(initialPurchaseFilters);
  };

  const clearSalesReportFilters = () => {
    setSalesReportFilters(initialSalesReportFilters);
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
    if (!window.confirm(`Vas a eliminar la categoría "${item.nombre}". Esta accion no se puede deshacer.`)) {
      return;
    }

    resetMessages();

    try {
      await apiRequest(`/catalogos/categorias/${item.id}`, {
        method: "DELETE",
        token
      });

      setSuccess("Categoría eliminada correctamente.");
      if (String(categoryForm.id) === String(item.id)) {
        setCategoryForm(initialCategoryForm);
        setCrudPanelOpen("categorias", false);
      }
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
      setCrudPanelOpen("categorias", false);
      setSuccess("Categoría guardada correctamente.");
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
      setCrudPanelOpen("marcas", false);
      setSuccess("Marca guardada correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteBrand = async (item) => {
    if (!window.confirm(`Vas a eliminar la marca "${item.nombre}". Esta accion no se puede deshacer.`)) {
      return;
    }

    resetMessages();

    try {
      await apiRequest(`/catalogos/marcas/${item.id}`, {
        method: "DELETE",
        token
      });

      setSuccess("Marca eliminada correctamente.");
      if (String(brandForm.id) === String(item.id)) {
        setBrandForm(initialBrandForm);
        setCrudPanelOpen("marcas", false);
      }
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
      setCrudPanelOpen("proveedores", false);
      setSuccess("Proveedor guardado correctamente.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const toggleProviderState = async (item) => {
    resetMessages();

    try {
      await apiRequest(`/catalogos/proveedores/${item.id}`, {
        method: "PUT",
        token,
        body: {
          nombre: item.nombre,
          nit: item.nit || "",
          telefono: item.telefono || "",
          email: item.email || "",
          direccion: item.direccion || "",
          activo: !Boolean(item.activo)
        }
      });

      setSuccess(`Proveedor ${item.activo ? "desactivado" : "activado"} correctamente.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteProvider = async (item) => {
    if (!window.confirm(`Vas a eliminar el proveedor "${item.nombre}". Esta accion no se puede deshacer.`)) {
      return;
    }

    resetMessages();

    try {
      await apiRequest(`/catalogos/proveedores/${item.id}`, {
        method: "DELETE",
        token
      });

      setSuccess("Proveedor eliminado correctamente.");
      if (String(providerForm.id) === String(item.id)) {
        setProviderForm(initialProviderForm);
        setCrudPanelOpen("proveedores", false);
      }
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

  const startEditCategory = (item) => {
    setActiveTab("categorias");
    setCategoryForm({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      activo: Boolean(item.activo)
    });
    setCrudPanelOpen("categorias", true);
  };

  const startEditBrand = (item) => {
    setActiveTab("marcas");
    setBrandForm({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      activo: Boolean(item.activo)
    });
    setCrudPanelOpen("marcas", true);
  };

  const startEditProvider = (item) => {
    setActiveTab("proveedores");
    setProviderForm({
      id: item.id,
      nombre: item.nombre,
      nit: item.nit || "",
      telefono: item.telefono || "",
      email: item.email || "",
      direccion: item.direccion || "",
      activo: Boolean(item.activo)
    });
    setCrudPanelOpen("proveedores", true);
  };

  return (
    <section className="page-section">
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
                  estado del inventario y productos más vendidos.
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

          <section className="dashboard-grid summary-support dashboard-summary-overview">
            <article className="panel dashboard-summary-card dashboard-summary-card--profile">
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

            <article className="panel dashboard-summary-card dashboard-summary-card--business">
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
            <article className="panel dashboard-summary-card dashboard-summary-card--orders">
              <div className="panel-header">
                <div>
                  <h2>Pedidos recientes</h2>
                  <p>Vista rapida de los ultimos pedidos registrados.</p>
                </div>
              </div>

              <ul className="activity-list">
                {(summary?.pedidos_recientes || []).map((item) => (
                  <li key={item.id}>
                    <strong>Pedido #{item.id}</strong>
                    <span>
                      {item.cliente} - {item.estado} - {formatCurrency(item.total_neto)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel dashboard-summary-card dashboard-summary-card--inventory">
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

            <article className="panel dashboard-summary-card dashboard-summary-card--alerts">
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

          <div className="filter-toolbar">
            <input
              className="search-input"
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
              placeholder="Busca por pedido, cliente o estado"
            />
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setOrderQuery("")}
              disabled={!orderQuery}
            >
              Limpiar
            </button>
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
                {visibleOrders.map((order) => (
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
        <section className="dashboard-grid dashboard-grid--crud-stack">
          {crudPanels.productos ? (
          <article className="panel panel--crud-editor">
            <div className="panel-header">
              <div>
                <h2>{productForm.id ? "Editar producto" : "Agregar producto"}</h2>
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
                      ? "Puedes cambiar nombre, categoría, proveedor, margen, descuentos e imagen sin tocar el stock directo."
                      : "El producto se crea sin precio manual. El valor de venta se calcula cuando compras al proveedor usando el porcentaje de margen."}
                  </span>
                </div>
                <div>
                  <strong>Precio automatico</strong>
                  <span>
                    El sistema guarda el costo promedio y recalcula el precio de venta con el porcentaje de margen cada vez que registras una compra.
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
                <option value="">Categoría</option>
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
                name="margen_porcentaje"
                type="number"
                min="0"
                step="0.01"
                value={productForm.margen_porcentaje}
                onChange={handleProductChange}
                placeholder="Margen de venta (%)"
                required
              />
              {!productForm.id && productForm.categoria_id ? (
                <div className="form-note">
                  Sugerido para esta categoría: {getSuggestedMarginForCategoryId(productForm.categoria_id, catalogos.categorias)}%
                </div>
              ) : null}

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
              <div className="form-actions form-actions--catalog">
                <button className="btn btn-primary" type="submit">
                  {productForm.id ? "Actualizar producto" : "Crear producto"}
                </button>
                {productForm.id ? (
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={openCreateProduct}
                  >
                    Nuevo
                  </button>
                ) : null}
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setProductForm(initialProductForm);
                    setCrudPanelOpen("productos", false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </article>
          ) : null}

          <article className="panel">
            <div className="panel-header panel-header--with-actions">
              <div>
                <h2>Listado de productos</h2>
                <p>Selecciona un producto para editar su ficha comercial. El stock se mueve en Compras.</p>
              </div>
              <div className="panel-actions">
                <button className="btn btn-primary" type="button" onClick={openCreateProduct}>
                  Agregar
                </button>
              </div>
            </div>

            <div className="filter-toolbar filter-toolbar--catalog">
              <input
                className="search-input"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Busca por nombre, categoría o marca"
              />
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setProductQuery("")}
                disabled={!productQuery}
              >
                Limpiar
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Detal</th>
                    <th>Margen</th>
                    <th>Proveedor</th>
                    <th>Descuento</th>
                    <th>Stock</th>
                    <th>Minimo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.length > 0 ? (
                    visibleProducts.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nombre}</td>
                        <td>{item.categoria || "-"}</td>
                        <td>{formatCatalogPrice(item.precio_venta)}</td>
                        <td>{formatPercent(item.margen_porcentaje || 0)}</td>
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9">No hay productos que coincidan con la busqueda actual.</td>
                    </tr>
                  )}
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

            <form className="form-grid form-grid--spacious" onSubmit={submitPurchase}>
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

              <input
                name="factura"
                value={purchaseForm.factura}
                onChange={handlePurchaseChange}
                placeholder="Documento o referencia del proveedor"
              />

              <select
                name="producto_id"
                value={purchaseForm.producto_id}
                onChange={handlePurchaseChange}
              >
                <option value="">Producto a comprar</option>
                {sortedProducts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {buildProductOptionLabel(item, { includeStock: true })}
                  </option>
                ))}
              </select>

              {selectedPurchaseProduct ? (
                <div className="admin-inline-summary">
                  <strong>{selectedPurchaseProduct.nombre}</strong>
                  <span>
                    {[
                      selectedPurchaseProduct.categoría || "Sin categoría",
                      selectedPurchaseProduct.marca || "Sin marca",
                      `stock ${Number(selectedPurchaseProduct.stock || 0)}`
                    ].join(" - ")}
                  </span>
                  <small>
                    Margen actual: {Number(selectedPurchaseProduct.margen_porcentaje || 0).toFixed(1)}% - Precio de
                    venta: {formatCatalogPrice(selectedPurchaseProduct.precio_detal)}
                  </small>
                </div>
              ) : null}

              <div className="purchase-batch-panel">
                <div className="purchase-batch-panel__header">
                  <div>
                    <strong>Compra en curso</strong>
                    <span>
                      {purchaseDraftSummary.lineas === 0
                        ? "Agrega varias lineas y registralas con un solo documento."
                        : `${purchaseDraftSummary.lineas} linea(s) - ${purchaseDraftSummary.unidades} unidad(es)`}
                    </span>
                  </div>
                  <div className="purchase-batch-panel__actions">
                    <button type="button" className="btn btn-outline" onClick={addPurchaseItem}>
                      Agregar producto
                    </button>
                    {purchaseItems.length > 0 ? (
                      <button type="button" className="btn btn-outline" onClick={clearPurchaseDraft}>
                        Vaciar compra
                      </button>
                    ) : null}
                  </div>
                </div>

                {purchaseItems.length > 0 ? (
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
                        {purchaseItems.map((item) => (
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
                                onClick={() => removePurchaseItem(item.producto_id, item.precio_compra_unitario)}
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
                  <span>{purchaseDraftSummary.unidades} unidades en total</span>
                  <strong>{formatCurrency(purchaseDraftSummary.total)}</strong>
                </div>
              </div>

              <div className="form-actions form-actions--stacked">
                <button className="btn btn-secondary" type="submit">
                  Registrar compra
                </button>
                <p className="form-note form-note--block">
                  Puedes cargar varios productos y registrarlos en un solo documento de compra para dejar el kardex y
                  el informe bien trazados.
                </p>
              </div>
            </form>

            {lastPurchaseTicket ? (
              <div className="ticket-card-wrap">
                <TicketCard title="Ultima compra registrada" ticket={lastPurchaseTicket} />
              </div>
            ) : null}
          </article>

          <article className="panel panel--purchase-report">
            <div className="panel-header">
              <div>
                <h2>Informe de compras</h2>
                <p>Consulta compras por fecha, producto y documento de compra con reportes específicos.</p>
              </div>
            </div>

            <form className="filter-toolbar filter-toolbar--report purchase-report-filters" onSubmit={(event) => event.preventDefault()}>
              <div className="purchase-report-filters__intro">
                <div className="purchase-report-filters__copy">
                  <span className="eyebrow purchase-report-filters__eyebrow">Filtros del informe</span>
                  <p>Afina el reporte por periodo, producto o referencia para revisar compras concretas sin perder contexto.</p>
                </div>
                <div className="purchase-report-filters__meta">
                  <span className="purchase-report-filters__badge">
                    {activePurchaseFilterCount} {activePurchaseFilterCount === 1 ? "activo" : "activos"}
                  </span>
                </div>
              </div>
              {purchaseFilterTags.length ? (
                <div className="purchase-report-filters__tags" aria-label="Resumen de filtros activos">
                  {purchaseFilterTags.map((tag) => (
                    <span key={tag} className="purchase-report-filters__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--date">
                <span>Desde</span>
                <input
                  name="fecha_desde"
                  type="date"
                  value={purchaseFilters.fecha_desde}
                  onChange={handlePurchaseFilterChange}
                  placeholder="Desde"
                />
              </label>
              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--date">
                <span>Hasta</span>
                <input
                  name="fecha_hasta"
                  type="date"
                  value={purchaseFilters.fecha_hasta}
                  onChange={handlePurchaseFilterChange}
                  placeholder="Hasta"
                />
              </label>
              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--product">
                <span>Producto</span>
                <select
                  name="producto_id"
                  value={purchaseFilters.producto_id}
                  onChange={handlePurchaseFilterChange}
                >
                  <option value="">Todos los productos</option>
                  {sortedProducts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {buildProductOptionLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--invoice">
                <span>Documento</span>
                <input
                  name="factura"
                  value={purchaseFilters.factura}
                  onChange={handlePurchaseFilterChange}
                  placeholder="Buscar por documento"
                />
              </label>
              <div className="purchase-report-filters__action">
                <button className="btn btn-outline" type="button" onClick={clearPurchaseFilters}>
                  Limpiar filtros
                </button>
              </div>
            </form>

            <div className="stats-grid stats-grid--report stats-grid--compact stats-grid--purchase">
              {purchaseReportCards.map((card) => (
                <article key={card.id} className={`stat-card stat-card--${card.tone}`}>
                  <small className="stat-card__label">{card.label}</small>
                  <strong>{card.value}</strong>
                  <span>{card.note}</span>
                </article>
              ))}
            </div>

            <div className="table-wrap table-wrap--report">
              <table className="data-table data-table--report">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Documento</th>
                    <th>Producto</th>
                    <th>Proveedor</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseReport.compras.length > 0 ? (
                    purchaseReport.compras.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.fecha)}</td>
                        <td>{item.factura_referencia || "Sin documento"}</td>
                        <td>{productsById[String(item.producto_id)] ? buildProductOptionLabel(productsById[String(item.producto_id)]) : item.producto}</td>
                        <td>{item.proveedor || "-"}</td>
                        <td>{item.cantidad}</td>
                        <td>{formatCurrency(item.costo_unitario)}</td>
                        <td>{formatCurrency(item.total_compra)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">No hay compras que coincidan con los filtros actuales.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="dashboard-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Reporte por producto</h2>
                    <p>Cuanto se ha comprado por cada producto filtrado.</p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Movimientos</th>
                        <th>Unidades</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseReport.por_producto.length > 0 ? (
                        purchaseReport.por_producto.map((item) => (
                          <tr key={item.producto_id}>
                            <td>{productsById[String(item.producto_id)] ? buildProductOptionLabel(productsById[String(item.producto_id)]) : item.producto}</td>
                            <td>{item.compras_registradas}</td>
                            <td>{item.unidades}</td>
                            <td>{formatCurrency(item.total_invertido)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No hay resumen por producto para estos filtros.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Reporte por documento</h2>
                    <p>Agrupa compras por referencia o numero de documento del proveedor.</p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Movimientos</th>
                        <th>Unidades</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseReport.por_factura.length > 0 ? (
                        purchaseReport.por_factura.map((item) => (
                          <tr key={item.factura}>
                            <td>{item.factura}</td>
                            <td>{item.movimientos}</td>
                            <td>{item.unidades}</td>
                            <td>{formatCurrency(item.total_invertido)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No hay resumen por documento para estos filtros.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
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
                      factura: movement.factura_referencia,
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

      {activeTab === "reportes" ? (
        <section className="dashboard-grid dashboard-grid--crud-stack">
          <article className="panel panel--sales-report">
            <div className="panel-header">
              <div>
                <h2>Reportes de ventas y utilidad</h2>
                <p>
                  Consulta cuánto vendiste, cuánto estimas haber ganado y cómo se mueve la venta por
                  producto, proveedor, categoría y periodo.
                </p>
              </div>
            </div>

            <form
              className="filter-toolbar filter-toolbar--report purchase-report-filters"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="purchase-report-filters__intro">
                <div className="purchase-report-filters__copy">
                  <span className="eyebrow purchase-report-filters__eyebrow">Filtros del reporte</span>
                  <p>
                    Revisa ventas del día, la semana, el mes, el año o un rango personalizado sin
                    perder de vista producto y proveedor.
                  </p>
                </div>
                <div className="purchase-report-filters__meta">
                  <span className="purchase-report-filters__badge">
                    {activeSalesFilterCount} {activeSalesFilterCount === 1 ? "activo" : "activos"}
                  </span>
                </div>
              </div>

              {salesReportFilterTags.length ? (
                <div className="purchase-report-filters__tags" aria-label="Resumen de filtros del reporte">
                  {salesReportFilterTags.map((tag) => (
                    <span key={tag} className="purchase-report-filters__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <label className="form-field-group purchase-report-filters__field">
                <span>Periodo</span>
                <select name="periodo" value={salesReportFilters.periodo} onChange={handleSalesReportFilterChange}>
                  <option value="dia">Día</option>
                  <option value="semana">Semana</option>
                  <option value="mes">Mes</option>
                  <option value="anio">Año</option>
                  <option value="personalizado">Personalizado</option>
                </select>
              </label>

              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--date">
                <span>Desde</span>
                <input
                  name="fecha_desde"
                  type="date"
                  value={salesReportFilters.fecha_desde}
                  onChange={handleSalesReportFilterChange}
                />
              </label>

              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--date">
                <span>Hasta</span>
                <input
                  name="fecha_hasta"
                  type="date"
                  value={salesReportFilters.fecha_hasta}
                  onChange={handleSalesReportFilterChange}
                />
              </label>

              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--product">
                <span>Producto</span>
                <select
                  name="producto_id"
                  value={salesReportFilters.producto_id}
                  onChange={handleSalesReportFilterChange}
                >
                  <option value="">Todos los productos</option>
                  {sortedProducts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {buildProductOptionLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field-group purchase-report-filters__field purchase-report-filters__field--product">
                <span>Proveedor</span>
                <select
                  name="proveedor_id"
                  value={salesReportFilters.proveedor_id}
                  onChange={handleSalesReportFilterChange}
                >
                  <option value="">Todos los proveedores</option>
                  {catalogos.proveedores.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div className="purchase-report-filters__action">
                <button className="btn btn-outline" type="button" onClick={clearSalesReportFilters}>
                  Limpiar filtros
                </button>
              </div>
            </form>

            {salesReportLoading ? <p className="status">Actualizando reporte...</p> : null}

            <div className="stats-grid stats-grid--report stats-grid--compact stats-grid--purchase">
              {salesQuickCards.map((card) => (
                <article key={card.id} className={`stat-card stat-card--${card.tone}`}>
                  <small className="stat-card__label">{card.label}</small>
                  <strong>{card.value}</strong>
                  <span>{card.note}</span>
                </article>
              ))}
            </div>

            <div className="stats-grid stats-grid--report stats-grid--compact stats-grid--purchase">
              {salesReportCards.map((card) => (
                <article key={card.id} className={`stat-card stat-card--${card.tone}`}>
                  <small className="stat-card__label">{card.label}</small>
                  <strong>{card.value}</strong>
                  <span>{card.note}</span>
                </article>
              ))}
            </div>

            {salesReport.notas?.length ? (
              <div className="report-note-list" aria-label="Notas del reporte">
                {salesReport.notas.map((note) => (
                  <p key={note} className="report-note">
                    {note}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="dashboard-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Productos con stock bajo</h2>
                    <p>Productos activos que necesitan reposicion.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Stock</th>
                        <th>Minimo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.stock_bajo.length > 0 ? (
                        salesReport.stock_bajo.map((item) => (
                          <tr key={`stock-bajo-${item.id}`}>
                            <td>{item.nombre}</td>
                            <td>{item.stock_actual}</td>
                            <td>{item.stock_minimo}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3">No hay productos con stock bajo para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Productos más vendidos</h2>
                    <p>Ranking de productos con mayor salida.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Unidades</th>
                        <th>Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.top_productos.length > 0 ? (
                        salesReport.top_productos.map((item) => (
                          <tr key={`top-producto-${item.producto_id}`}>
                            <td>
                              <strong>{item.producto}</strong>
                              <small>{item.categoria}</small>
                            </td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.ingresos_totales)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3">Todavía no hay ventas para construir el ranking.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Productos menos vendidos</h2>
                    <p>Productos con rotación más baja dentro del periodo.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Unidades</th>
                        <th>Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.productos_menos_vendidos.length > 0 ? (
                        salesReport.productos_menos_vendidos.map((item) => (
                          <tr key={`menos-vendido-${item.producto_id}`}>
                            <td>
                              <strong>{item.producto}</strong>
                              <small>{item.categoria}</small>
                            </td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.ingresos_totales)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3">No hay suficientes ventas para calcular esta vista.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <div className="dashboard-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Últimas ventas</h2>
                    <p>Pedidos más recientes con venta registrada.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>Fecha</th>
                        <th>Unidades</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.ultimas_ventas.length > 0 ? (
                        salesReport.ultimas_ventas.map((item) => (
                          <tr key={`ultima-venta-${item.pedido_id}`}>
                            <td>#{item.pedido_id}</td>
                            <td>{item.cliente}</td>
                            <td>{formatDateTime(item.fecha_pedido)}</td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.total_venta)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No hay ventas recientes para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Gráfica de ventas mensuales</h2>
                    <p>Comparativo visual de ingresos por mes.</p>
                  </div>
                </div>

                <div className="report-chart" role="img" aria-label="Gráfica mensual de ventas">
                  {salesReport.grafica_mensual.length > 0 ? (
                    salesReport.grafica_mensual.map((item) => (
                      <div key={`grafica-mes-${item.periodo}`} className="report-chart__row">
                        <span className="report-chart__label">{formatMonthPeriodLabel(item.periodo)}</span>
                        <div className="report-chart__track">
                          <div
                            className="report-chart__bar"
                            style={{
                              width: `${Math.max(
                                8,
                                (Number(item.ingresos_totales || 0) / monthlySalesPeak) * 100
                              )}%`
                            }}
                          />
                        </div>
                        <strong className="report-chart__value">
                          {formatCurrency(item.ingresos_totales)}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p className="report-note">No hay suficientes ventas para graficar el periodo.</p>
                  )}
                </div>
              </article>
            </div>

            <article className="panel panel--report-wide">
              <div className="panel-header">
                <div>
                  <h2>Rentabilidad por producto</h2>
                  <p>Cuánto vende y cuánto deja cada producto en el periodo seleccionado.</p>
                </div>
              </div>

              <div className="table-wrap table-wrap--report">
                <table className="data-table data-table--report data-table--report-product">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Proveedor</th>
                      <th>Unidades</th>
                      <th>Ventas</th>
                      <th>Costo est.</th>
                      <th>Utilidad</th>
                      <th>Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReport.por_producto.length > 0 ? (
                      salesReport.por_producto.map((item) => (
                        <tr key={`sales-product-${item.producto_id}`}>
                          <td>
                            <strong>{item.producto}</strong>
                            <small>{item.categoria}</small>
                          </td>
                          <td>{item.proveedor}</td>
                          <td>{item.unidades_vendidas}</td>
                          <td>{formatCurrency(item.ingresos_totales)}</td>
                          <td>{formatCurrency(item.costo_total_estimado)}</td>
                          <td>{formatSignedCurrency(item.utilidad_bruta)}</td>
                          <td>{formatPercent(item.margen_bruto)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7">No hay ventas por producto con los filtros actuales.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="dashboard-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Clientes registrados</h2>
                    <p>Total actual de clientes activos en el sistema.</p>
                  </div>
                </div>

                <div className="report-spotlight">
                  <strong>{Number(salesReport.clientes?.registrados || 0)}</strong>
                  <span>Clientes registrados</span>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Clientes nuevos por mes</h2>
                    <p>Evolución mensual de nuevos clientes.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th>Clientes nuevos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.clientes?.nuevos_por_mes?.length > 0 ? (
                        salesReport.clientes.nuevos_por_mes.map((item) => (
                          <tr key={`clientes-mes-${item.periodo}`}>
                            <td>{formatMonthPeriodLabel(item.periodo)}</td>
                            <td>{item.clientes_nuevos}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="2">No hay clientes nuevos para este rango.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Clientes con más compras</h2>
                    <p>Clientes que más compran y más gastan.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Compras</th>
                        <th>Unidades</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.clientes?.con_mas_compras?.length > 0 ? (
                        salesReport.clientes.con_mas_compras.map((item) => (
                          <tr key={`cliente-top-${item.cliente_id}`}>
                            <td>{item.cliente}</td>
                            <td>{item.compras}</td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.total_gastado)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No hay compras suficientes para rankear clientes.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <article className="panel panel--report-wide">
              <div className="panel-header">
                <div>
                  <h2>Historial de compras por cliente</h2>
                  <p>Últimas compras registradas para revisar frecuencia y ticket.</p>
                </div>
              </div>

              <div className="table-wrap table-wrap--report">
                <table className="data-table data-table--report">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Pedido</th>
                      <th>Fecha</th>
                      <th>Unidades</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReport.clientes?.historial_compras?.length > 0 ? (
                      salesReport.clientes.historial_compras.map((item) => (
                        <tr key={`cliente-historial-${item.pedido_id}`}>
                          <td>{item.cliente}</td>
                          <td>#{item.pedido_id}</td>
                          <td>{formatDateTime(item.fecha_pedido)}</td>
                          <td>{item.unidades_vendidas}</td>
                          <td>{formatCurrency(item.total_venta)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5">No hay historial de compras para los filtros actuales.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="dashboard-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Productos vendidos por proveedor</h2>
                    <p>Mide cuántos productos y unidades se movieron asociados a cada proveedor.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report data-table--report-provider">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>Productos</th>
                        <th>Unidades</th>
                        <th>Ventas</th>
                        <th>Utilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.por_proveedor.length > 0 ? (
                        salesReport.por_proveedor.map((item) => (
                          <tr key={`sales-provider-${item.proveedor_id}`}>
                            <td>{item.proveedor}</td>
                            <td>{item.productos_vendidos}</td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.ingresos_totales)}</td>
                            <td>{formatSignedCurrency(item.utilidad_bruta)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No hay ventas por proveedor con los filtros actuales.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Productos suministrados por proveedor</h2>
                    <p>Cuántos productos y stock total aporta cada proveedor.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>Productos</th>
                        <th>Activos</th>
                        <th>Stock total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.proveedores_reportes?.productos_suministrados?.length > 0 ? (
                        salesReport.proveedores_reportes.productos_suministrados.map((item) => (
                          <tr key={`prov-productos-${item.proveedor_id}`}>
                            <td>{item.proveedor}</td>
                            <td>{item.productos}</td>
                            <td>{item.productos_activos}</td>
                            <td>{item.stock_total}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No hay relacion proveedor-producto para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Compras realizadas a proveedores</h2>
                    <p>Compras, productos y unidades recibidas por proveedor.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>Compras</th>
                        <th>Productos</th>
                        <th>Unidades</th>
                        <th>Total invertido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.proveedores_reportes?.compras_realizadas?.length > 0 ? (
                        salesReport.proveedores_reportes.compras_realizadas.map((item) => (
                          <tr key={`prov-compras-${item.proveedor_id}`}>
                            <td>{item.proveedor}</td>
                            <td>{item.compras}</td>
                            <td>{item.productos}</td>
                            <td>{item.unidades}</td>
                            <td>{formatCurrency(item.total_invertido)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No hay compras a proveedores con los filtros actuales.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <div className="dashboard-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Proveedor mas utilizado</h2>
                    <p>Proveedor lider segun volumen de compras registradas.</p>
                  </div>
                </div>

                {salesReport.proveedores_reportes?.proveedor_mas_utilizado ? (
                  <div className="report-spotlight">
                    <strong>{salesReport.proveedores_reportes.proveedor_mas_utilizado.proveedor}</strong>
                    <span>
                      {salesReport.proveedores_reportes.proveedor_mas_utilizado.compras} compras y{" "}
                      {salesReport.proveedores_reportes.proveedor_mas_utilizado.unidades} unidades
                    </span>
                  </div>
                ) : (
                  <p className="report-note">Todavía no hay un proveedor destacado en el rango actual.</p>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Ventas realizadas por trabajador</h2>
                    <p>Ventas atribuidas al usuario que opero el pedido.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Trabajador</th>
                        <th>Ventas</th>
                        <th>Unidades</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.trabajadores_reportes?.ventas_realizadas?.length > 0 ? (
                        salesReport.trabajadores_reportes.ventas_realizadas.map((item) => (
                          <tr key={`trabajador-ventas-${item.usuario_id}`}>
                            <td>{item.usuario}</td>
                            <td>{item.ventas}</td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.total_venta)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No hay ventas asociadas a trabajadores en este rango.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Movimientos de inventario realizados</h2>
                    <p>Entradas y salidas registradas por trabajador.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Trabajador</th>
                        <th>Movimientos</th>
                        <th>Entradas</th>
                        <th>Salidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.trabajadores_reportes?.movimientos_realizados?.length > 0 ? (
                        salesReport.trabajadores_reportes.movimientos_realizados.map((item) => (
                          <tr key={`trabajador-mov-${item.usuario_id}`}>
                            <td>{item.usuario}</td>
                            <td>{item.movimientos}</td>
                            <td>{item.entradas}</td>
                            <td>{item.salidas}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No hay movimientos de inventario para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Actividades registradas</h2>
                    <p>Resumen de auditoría por usuario trabajador o administrador.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Actividades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.trabajadores_reportes?.actividades_registradas?.length > 0 ? (
                        salesReport.trabajadores_reportes.actividades_registradas.map((item) => (
                          <tr key={`trabajador-actividad-${item.usuario_id || item.usuario}`}>
                            <td>{item.usuario || "Sin usuario"}</td>
                            <td>{item.actividades}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="2">No hay actividades registradas en auditoría para este rango.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Rendimiento por categoría</h2>
                    <p>Compara qué familias venden más y cuáles dejan mejor utilidad.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report data-table--report-category">
                    <thead>
                      <tr>
                        <th>Categoría</th>
                        <th>Productos</th>
                        <th>Unidades</th>
                        <th>Ventas</th>
                        <th>Utilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.por_categoria.length > 0 ? (
                        salesReport.por_categoria.map((item) => (
                          <tr key={`sales-category-${item.categoria_id}`}>
                            <td>{item.categoria}</td>
                            <td>{item.productos_vendidos}</td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.ingresos_totales)}</td>
                            <td>{formatSignedCurrency(item.utilidad_bruta)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No hay ventas por categoría con los filtros actuales.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Evolución del periodo</h2>
                    <p>Te deja ver si el periodo se está moviendo por día o por mes.</p>
                  </div>
                </div>

                <div className="table-wrap table-wrap--report">
                  <table className="data-table data-table--report data-table--report-period">
                    <thead>
                      <tr>
                        <th>Periodo</th>
                        <th>Pedidos</th>
                        <th>Unidades</th>
                        <th>Ventas</th>
                        <th>Utilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.por_periodo.length > 0 ? (
                        salesReport.por_periodo.map((item) => (
                          <tr key={`sales-period-${item.periodo}`}>
                            <td>
                              {String(item.periodo).length === 7
                                ? formatMonthPeriodLabel(item.periodo)
                                : item.periodo}
                            </td>
                            <td>{item.pedidos}</td>
                            <td>{item.unidades_vendidas}</td>
                            <td>{formatCurrency(item.ingresos_totales)}</td>
                            <td>{formatSignedCurrency(item.utilidad_bruta)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No hay movimientos de ventas para el periodo seleccionado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
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
        <section className="dashboard-grid dashboard-grid--crud-stack">
          {crudPanels.usuarios ? (
          <article className="panel panel--crud-editor">
            <div className="panel-header">
              <div>
                <h2>{userForm.id ? "Editar usuario" : "Agregar usuario"}</h2>
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
              <div className="form-actions form-actions--catalog">
                <button className="btn btn-primary" type="submit">
                  {userForm.id ? "Actualizar usuario" : "Crear usuario"}
                </button>
                {userForm.id ? (
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={openCreateUser}
                  >
                    Nuevo
                  </button>
                ) : null}
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setUserForm(initialUserForm);
                    setCrudPanelOpen("usuarios", false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </article>
          ) : null}

          <article className="panel">
            <div className="panel-header panel-header--with-actions">
              <div>
                <h2>Listado de usuarios</h2>
                <p>Accede rapido a editar o activar y desactivar cuentas.</p>
              </div>
              <div className="panel-actions">
                <button className="btn btn-primary" type="button" onClick={openCreateUser}>
                  Agregar
                </button>
              </div>
            </div>

            <div className="filter-toolbar filter-toolbar--catalog">
              <input
                className="search-input"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Busca por nombre, correo, rol o estado"
              />
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setUserQuery("")}
                disabled={!userQuery}
              >
                Limpiar
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.length > 0 ? (
                    visibleUsers.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nombre}</td>
                        <td>{item.email}</td>
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No hay usuarios que coincidan con la busqueda actual.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "categorias" ? (
        <section className="dashboard-grid dashboard-grid--crud-stack">
          {crudPanels.categorias ? (
          <article className="panel panel--crud-editor">
            <div className="panel-header">
              <div>
                <h2>{categoryForm.id ? "Editar categoría" : "Agregar categoría"}</h2>
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
              <div className="form-actions form-actions--catalog">
                <button className="btn btn-primary" type="submit">
                  {categoryForm.id ? "Actualizar categoría" : "Crear categoría"}
                </button>
                {categoryForm.id ? (
                  <button className="btn btn-outline" type="button" onClick={openCreateCategory}>
                    Nueva
                  </button>
                ) : null}
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setCategoryForm(initialCategoryForm);
                    setCrudPanelOpen("categorias", false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>

          </article>
          ) : null}

          <article className="panel">
            <div className="panel-header panel-header--with-actions">
              <div>
                <h2>Listado de categorías</h2>
                <p>Filtra y actualiza rapidamente el estado de cada familia de producto.</p>
              </div>
              <div className="panel-actions">
                <button className="btn btn-primary" type="button" onClick={openCreateCategory}>
                  Agregar
                </button>
              </div>
            </div>

            <div className="filter-toolbar filter-toolbar--catalog">
              <input
                className="search-input"
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="Busca categoría por nombre, descripcion o estado"
              />
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setCategoryQuery("")}
                disabled={!categoryQuery}
              >
                Limpiar
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripcion</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCategories.length > 0 ? (
                    visibleCategories.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nombre}</td>
                        <td>{item.descripcion || "Sin descripcion registrada"}</td>
                        <td>
                          <span className={`status-chip ${item.activo ? "status-chip--active" : "status-chip--inactive"}`}>
                            {item.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn btn-outline"
                              type="button"
                              onClick={() => startEditCategory(item)}
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
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">{getCatalogEmptyMessage("categorías", categoryQuery)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "marcas" ? (
        <section className="dashboard-grid dashboard-grid--crud-stack">
          {crudPanels.marcas ? (
          <article className="panel panel--crud-editor">
            <div className="panel-header">
              <div>
                <h2>{brandForm.id ? "Editar marca" : "Agregar marca"}</h2>
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
              <div className="form-actions form-actions--catalog">
                <button className="btn btn-primary" type="submit">
                  {brandForm.id ? "Actualizar marca" : "Crear marca"}
                </button>
                {brandForm.id ? (
                  <button className="btn btn-outline" type="button" onClick={openCreateBrand}>
                    Nueva
                  </button>
                ) : null}
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setBrandForm(initialBrandForm);
                    setCrudPanelOpen("marcas", false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>

          </article>
          ) : null}

          <article className="panel">
            <div className="panel-header panel-header--with-actions">
              <div>
                <h2>Listado de marcas</h2>
                <p>Consulta marcas registradas y ajusta su estado sin perder contexto.</p>
              </div>
              <div className="panel-actions">
                <button className="btn btn-primary" type="button" onClick={openCreateBrand}>
                  Agregar
                </button>
              </div>
            </div>

            <div className="filter-toolbar filter-toolbar--catalog">
              <input
                className="search-input"
                value={brandQuery}
                onChange={(event) => setBrandQuery(event.target.value)}
                placeholder="Busca marca por nombre, descripcion o estado"
              />
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setBrandQuery("")}
                disabled={!brandQuery}
              >
                Limpiar
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripcion</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBrands.length > 0 ? (
                    visibleBrands.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nombre}</td>
                        <td>{item.descripcion || "Sin descripcion registrada"}</td>
                        <td>
                          <span className={`status-chip ${item.activo ? "status-chip--active" : "status-chip--inactive"}`}>
                            {item.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn btn-outline"
                              type="button"
                              onClick={() => startEditBrand(item)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-outline btn-danger-lite"
                              type="button"
                              onClick={() => deleteBrand(item)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">{getCatalogEmptyMessage("marcas", brandQuery)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "proveedores" ? (
        <section className="dashboard-grid dashboard-grid--crud-stack">
          {crudPanels.proveedores ? (
          <article className="panel panel--crud-editor">
            <div className="panel-header">
              <div>
                <h2>{providerForm.id ? "Editar proveedor" : "Agregar proveedor"}</h2>
                <p>Controla tus aliados para reposicion de inventario.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={submitProvider}>
              <input name="nombre" value={providerForm.nombre} onChange={handleProviderChange} placeholder="Nombre" required />
              <input name="nit" value={providerForm.nit} onChange={handleProviderChange} placeholder="NIT" />
              <input name="telefono" value={providerForm.telefono} onChange={handleProviderChange} placeholder="Telefono" />
              <input name="email" type="email" value={providerForm.email} onChange={handleProviderChange} placeholder="Correo" />
              <input name="direccion" value={providerForm.direccion} onChange={handleProviderChange} placeholder="Direccion" />
              <select name="activo" value={String(providerForm.activo)} onChange={handleProviderChange}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
              <div className="form-actions form-actions--catalog">
                <button className="btn btn-primary" type="submit">
                  {providerForm.id ? "Actualizar proveedor" : "Crear proveedor"}
                </button>
                {providerForm.id ? (
                  <button className="btn btn-outline" type="button" onClick={openCreateProvider}>
                    Nuevo
                  </button>
                ) : null}
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setProviderForm(initialProviderForm);
                    setCrudPanelOpen("proveedores", false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>

          </article>
          ) : null}

          <article className="panel">
            <div className="panel-header panel-header--with-actions">
              <div>
                <h2>Listado de proveedores</h2>
                <p>Gestiona contacto, estado y disponibilidad de cada aliado comercial.</p>
              </div>
              <div className="panel-actions">
                <button className="btn btn-primary" type="button" onClick={openCreateProvider}>
                  Agregar
                </button>
              </div>
            </div>

            <div className="filter-toolbar filter-toolbar--catalog">
              <input
                className="search-input"
                value={providerQuery}
                onChange={(event) => setProviderQuery(event.target.value)}
                placeholder="Busca proveedor por nombre, NIT, correo o telefono"
              />
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setProviderQuery("")}
                disabled={!providerQuery}
              >
                Limpiar
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>NIT</th>
                    <th>Correo</th>
                    <th>Telefono</th>
                    <th>Direccion</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProviders.length > 0 ? (
                    visibleProviders.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nombre}</td>
                        <td>{item.nit || "Sin NIT"}</td>
                        {/*
                    {item.nit ? `NIT ${item.nit}` : "Sin NIT"} • {item.email || "Sin correo"} • {item.telefono || "Sin telefono"}
                  </span>
                  <span className="catalog-admin-card__meta-clean">
                    {item.nit ? `NIT ${item.nit}` : "Sin NIT"} - {item.email || "Sin correo"} - {item.telefono || "Sin telefono"}
                  </span>
                  <span>{item.direccion || "Sin direccion registrada"}</span>
                        */}
                        <td>{item.email || "Sin correo"}</td>
                        <td>{item.telefono || "Sin telefono"}</td>
                        <td>{item.direccion || "Sin direccion registrada"}</td>
                        <td>
                          <span className={`status-chip ${item.activo ? "status-chip--active" : "status-chip--inactive"}`}>
                            {item.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => startEditProvider(item)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => toggleProviderState(item)}
                    >
                      {item.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      className="btn btn-outline btn-danger-lite"
                      type="button"
                      onClick={() => deleteProvider(item)}
                    >
                      Eliminar
                    </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">{getCatalogEmptyMessage("proveedores", providerQuery)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

        </div>
      </div>
    </section>
  );
}

export default Dashboard;




