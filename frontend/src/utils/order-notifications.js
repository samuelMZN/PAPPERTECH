export function detectNewPendingOrders(orders, knownIdsRef) {
  const pendingOrders = orders.filter((order) => order.estado === "pendiente");
  const nextIds = new Set(pendingOrders.map((order) => Number(order.id)));
  const previousIds = knownIdsRef.current;

  let notice = "";

  if (previousIds.size > 0) {
    const freshOrders = pendingOrders.filter((order) => !previousIds.has(Number(order.id)));

    if (freshOrders.length === 1) {
      const order = freshOrders[0];
      notice = `Nuevo pedido #${order.id} de ${order.cliente || "un cliente"}.`;
    } else if (freshOrders.length > 1) {
      notice = `Hay ${freshOrders.length} pedidos nuevos pendientes por revisar.`;
    }
  }

  knownIdsRef.current = nextIds;

  return {
    notice,
    pendingOrders
  };
}

export async function pushBrowserOrderNotification(message) {
  if (typeof window === "undefined" || !("Notification" in window) || !message) {
    return;
  }

  if (window.Notification.permission === "granted") {
    new window.Notification("PapperTech", {
      body: message
    });
    return;
  }

  if (window.Notification.permission === "default") {
    const permission = await window.Notification.requestPermission();

    if (permission === "granted") {
      new window.Notification("PapperTech", {
        body: message
      });
    }
  }
}
