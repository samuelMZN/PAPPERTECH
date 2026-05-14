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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMetaChips(ticket) {
  const chips = [
    ticket.numero,
    ticket.pedido_numero,
    renderDate(ticket.fecha),
    ticket.cliente,
    ticket.proveedor,
    ticket.factura ? `Factura ${ticket.factura}` : null,
    ticket.telefono,
    ticket.direccion
  ].filter(Boolean);

  return chips
    .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
    .join("");
}

function renderItems(ticket) {
  const items = Array.isArray(ticket.items) ? ticket.items : [];

  if (items.length > 0) {
    return `
      <div class="items">
        ${items
          .map(
            (item) => `
              <div class="item">
                <div>
                  <strong>${escapeHtml(item.nombre || "-")}</strong>
                  <span>${escapeHtml(item.cantidad || 0)} x ${escapeHtml(
                    formatCurrency(item.precio_unitario)
                  )}</span>
                </div>
                <strong>${escapeHtml(formatCurrency(item.subtotal))}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  return `
    <div class="details">
      <div><span>Producto</span><strong>${escapeHtml(ticket.producto || "-")}</strong></div>
      <div><span>Cantidad</span><strong>${escapeHtml(ticket.cantidad || 0)}</strong></div>
      <div><span>Movimiento</span><strong>${escapeHtml(ticket.movimiento || "-")}</strong></div>
      <div><span>Motivo</span><strong>${escapeHtml(ticket.motivo || "-")}</strong></div>
      ${
        ticket.factura
          ? `<div><span>Factura</span><strong>${escapeHtml(ticket.factura)}</strong></div>`
          : ""
      }
      ${
        ticket.costo_unitario !== null && ticket.costo_unitario !== undefined
          ? `<div><span>Costo unitario</span><strong>${escapeHtml(
              formatCurrency(ticket.costo_unitario)
            )}</strong></div>`
          : ""
      }
      ${
        ticket.costo_promedio !== null && ticket.costo_promedio !== undefined
          ? `<div><span>Costo promedio</span><strong>${escapeHtml(
              formatCurrency(ticket.costo_promedio)
            )}</strong></div>`
          : ""
      }
      ${
        ticket.margen_porcentaje !== null && ticket.margen_porcentaje !== undefined
          ? `<div><span>Margen aplicado</span><strong>${escapeHtml(
              `${Number(ticket.margen_porcentaje || 0).toFixed(2)}%`
            )}</strong></div>`
          : ""
      }
      ${
        ticket.precio_venta_calculado !== null && ticket.precio_venta_calculado !== undefined
          ? `<div><span>Precio calculado</span><strong>${escapeHtml(
              formatCurrency(ticket.precio_venta_calculado)
            )}</strong></div>`
          : ""
      }
      ${
        ticket.stock_antes !== undefined
          ? `<div><span>Stock antes</span><strong>${escapeHtml(
              ticket.stock_antes
            )}</strong></div>`
          : ""
      }
      ${
        ticket.stock_despues !== undefined
          ? `<div><span>Stock despues</span><strong>${escapeHtml(
              ticket.stock_despues
            )}</strong></div>`
          : ""
      }
    </div>
  `;
}

function renderFooter(ticket) {
  const meta = [];

  if (ticket.metodo) {
    meta.push(`Pago: ${ticket.metodo}`);
  }

  if (ticket.estado) {
    meta.push(`Estado: ${ticket.estado}`);
  }

  if (ticket.estado_pago) {
    meta.push(`Pago pedido: ${formatPaymentStatus(ticket.estado_pago)}`);
  }

  if (ticket.motivo) {
    meta.push(`Motivo: ${ticket.motivo}`);
  }

  if (ticket.factura) {
    meta.push(`Factura: ${ticket.factura}`);
  }

  return `
    <div class="footer">
      <span>${escapeHtml(meta.join(" | "))}</span>
      <strong>${escapeHtml(
        ticket.total !== null && ticket.total !== undefined
          ? formatCurrency(ticket.total)
          : "Sin total"
      )}</strong>
    </div>
  `;
}

function renderTicketCard(ticket, index) {
  const eyebrow =
    ticket.tipo === "compra"
      ? "Tirilla de compra"
      : ticket.tipo === "devolucion"
        ? "Tirilla de devolucion"
        : "Tirilla de venta";
  const title = ticket.numero || `Comprobante ${index + 1}`;

  return `
    <article class="ticket ${index > 0 ? "ticket--page-break" : ""}">
      <div class="ticket__header">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>

      <div class="meta">${renderMetaChips(ticket)}</div>
      ${
        ticket.observaciones
          ? `<p class="note">${escapeHtml(ticket.observaciones)}</p>`
          : ""
      }
      ${renderItems(ticket)}
      ${renderFooter(ticket)}
    </article>
  `;
}

export function printTicketsDocument({ title, subtitle = "", tickets = [] }) {
  if (typeof window === "undefined" || tickets.length === 0) {
    return;
  }

  const popup = window.open("", "_blank", "width=980,height=760");

  if (!popup) {
    throw new Error("Tu navegador bloqueo la ventana de impresion");
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title || "PapperTech")}</title>
        <style>
          :root {
            --ink: #10233d;
            --muted: #5d6f85;
            --line: #cfe0f2;
            --surface: #ffffff;
            --surface-soft: #f4f8fc;
            --accent: #1f5a9b;
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            padding: 28px;
            color: var(--ink);
            font-family: "Segoe UI", Arial, sans-serif;
            background: #eef4fb;
          }

          .sheet {
            max-width: 920px;
            margin: 0 auto;
            padding: 28px;
            border: 1px solid var(--line);
            border-radius: 24px;
            background: var(--surface);
          }

          .sheet__header {
            display: grid;
            gap: 8px;
            margin-bottom: 18px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--line);
          }

          .sheet__header h1 {
            margin: 0;
            font-size: 28px;
          }

          .sheet__header p {
            margin: 0;
            color: var(--muted);
            line-height: 1.5;
          }

          .ticket {
            display: grid;
            gap: 14px;
            padding: 22px;
            border: 1px solid var(--line);
            border-radius: 22px;
            background: var(--surface-soft);
          }

          .ticket + .ticket {
            margin-top: 18px;
          }

          .ticket--page-break {
            page-break-before: always;
          }

          .eyebrow {
            margin: 0 0 6px;
            color: var(--accent);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .ticket__header h2 {
            margin: 0;
            font-size: 26px;
          }

          .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }

          .chip {
            padding: 8px 12px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: var(--surface);
            color: var(--ink);
            font-size: 14px;
          }

          .items,
          .details {
            display: grid;
            gap: 12px;
          }

          .note {
            margin: 0;
            color: var(--muted);
            line-height: 1.6;
          }

          .item,
          .details div {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            padding: 14px 16px;
            border: 1px solid var(--line);
            border-radius: 16px;
            background: var(--surface);
          }

          .item div,
          .details div {
            display: grid;
            gap: 4px;
          }

          .item span,
          .details span,
          .footer span {
            color: var(--muted);
          }

          .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            padding-top: 12px;
            border-top: 1px solid var(--line);
          }

          .footer strong {
            font-size: 22px;
          }

          @media print {
            @page {
              size: A4;
              margin: 10mm;
            }

            body {
              padding: 0;
              background: #ffffff;
            }

            .sheet {
              max-width: none;
              margin: 0;
              padding: 0;
              border: none;
              border-radius: 0;
            }

            .ticket,
            .item,
            .details div,
            .footer {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="sheet__header">
            <h1>${escapeHtml(title || "PapperTech")}</h1>
            <p>${escapeHtml(subtitle)}</p>
            <p>Generado: ${escapeHtml(renderDate(new Date().toISOString()))}</p>
          </header>
          ${tickets.map((ticket, index) => renderTicketCard(ticket, index)).join("")}
        </main>
        <script>
          window.onload = function () {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
