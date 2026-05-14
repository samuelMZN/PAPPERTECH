import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { getProductImageSource } from "../utils/storefront";
import TicketCard from "../components/TicketCard";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function Cart() {
  const { user, updateProfile } = useAuth();
  const {
    items,
    cartLoading,
    cartCount,
    cartSubtotal,
    updateCartItem,
    removeFromCart,
    clearCart,
    checkout
  } = useCart();
  const [metodo, setMetodo] = useState("efectivo");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [draftQuantities, setDraftQuantities] = useState({});
  const [lastTicket, setLastTicket] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({
    telefono: "",
    direccion: ""
  });

  useEffect(() => {
    setDeliveryForm({
      telefono: user?.telefono || "",
      direccion: user?.direccion || ""
    });
  }, [user?.telefono, user?.direccion]);

  useEffect(() => {
    setDraftQuantities(
      Object.fromEntries(items.map((item) => [item.id, String(item.cantidad)]))
    );
  }, [items]);

  const hasDeliveryData =
    Boolean(String(deliveryForm.telefono || "").trim()) &&
    Boolean(String(deliveryForm.direccion || "").trim());

  const needsProfileSync =
    String(deliveryForm.telefono || "").trim() !== String(user?.telefono || "").trim() ||
    String(deliveryForm.direccion || "").trim() !== String(user?.direccion || "").trim();

  const handleUpdate = async (itemId, cantidad) => {
    setError("");
    setSuccess("");
    setProcessingId(itemId);

    try {
      await updateCartItem(itemId, cantidad);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemove = async (itemId) => {
    setError("");
    setSuccess("");
    setProcessingId(itemId);

    try {
      await removeFromCart(itemId);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleClear = async () => {
    setError("");
    setSuccess("");

    try {
      await clearCart();
      setSuccess("Carrito vaciado correctamente.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleCheckout = async () => {
    setError("");
    setSuccess("");
    setCheckoutLoading(true);

    try {
      if (!hasDeliveryData) {
        throw new Error("Para comprar debes escribir tu telefono y direccion");
      }

      if (needsProfileSync) {
        setProfileSaving(true);
        await updateProfile({
          nombre: user?.nombre || "",
          email: user?.email || "",
          telefono: String(deliveryForm.telefono || "").trim(),
          direccion: String(deliveryForm.direccion || "").trim()
        });
        setProfileSaving(false);
      }

      const response = await checkout(metodo);
      setLastTicket(response.tirilla || null);
      setSuccess(
        `Compra realizada. Pedido #${response.pedido_id} por ${formatCurrency(response.total)}`
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProfileSaving(false);
      setCheckoutLoading(false);
    }
  };

  const handleDeliveryChange = (event) => {
    const { name, value } = event.target;
    setDeliveryForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleQuantityInputChange = (itemId, value) => {
    setDraftQuantities((current) => ({
      ...current,
      [itemId]: value
    }));
  };

  const commitQuantityInput = async (item) => {
    const rawValue = String(draftQuantities[item.id] ?? item.cantidad).trim();
    const parsed = Number(rawValue);
    const normalized = Math.max(1, Math.min(Number(item.stock || 1), Number.isFinite(parsed) ? parsed : Number(item.cantidad)));

    setDraftQuantities((current) => ({
      ...current,
      [item.id]: String(normalized)
    }));

    if (normalized !== Number(item.cantidad)) {
      await handleUpdate(item.id, normalized);
    }
  };

  if (cartLoading) {
    return <p className="status">Cargando carrito...</p>;
  }

  if (items.length === 0) {
    return (
      <section className="cart-page">
        <div className="cart-empty panel">
          <p className="catalog-section__eyebrow">Tu bolsa esta vacia</p>
          <h1>Agrega tus productos favoritos para completar la compra.</h1>
          <p>
            Cuando pulses <strong>A MI BOLSA</strong> en la portada, los productos
            apareceran aqui para que puedas ajustar cantidades y pagar.
          </p>
          {success ? <p className="message success">{success}</p> : null}
          {lastTicket ? (
            <div className="ticket-card-wrap">
              <TicketCard title="Ultima compra realizada" ticket={lastTicket} />
            </div>
          ) : null}
          <Link className="btn btn-primary" to="/">
            Volver al catalogo
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page">
      <div className="cart-page__header">
        <div>
          <p className="catalog-section__eyebrow">Carrito de compras</p>
          <h1>Tu bolsa</h1>
          <p>{cartCount} productos listos para comprar.</p>
        </div>

        <button type="button" className="btn btn-outline" onClick={handleClear}>
          Vaciar carrito
        </button>
      </div>

      {error ? <p className="message error">{error}</p> : null}
      {success ? <p className="message success">{success}</p> : null}

      <div className="cart-layout">
        <section className="cart-list">
          {items.map((item) => (
            <article key={item.id} className="cart-item panel">
              <div className="cart-item__main">
                <div className="cart-item__media">
                  <img
                    className="cart-item__image"
                    src={getProductImageSource(item)}
                    alt={item.nombre}
                  />

                  <div className="cart-item__copy">
                  <span>{item.categoria || "PapperTech"}</span>
                    <strong>{item.nombre}</strong>
                    <p>{item.descripcion || "Producto agregado a tu carrito."}</p>
                    {Number(item.descuentoPorcentaje || 0) > 0 ? (
                      <small className="cart-item__discount">
                        Descuento aplicado: {item.descuentoPorcentaje}% por llevar {item.cantidad} unidades
                      </small>
                    ) : null}
                  </div>
                </div>

                <div className="cart-item__pricing">
                  <span>Precio unitario</span>
                  <strong>{formatCurrency(item.precioAplicado || item.precio_venta)}</strong>
                  {Number(item.descuentoPorcentaje || 0) > 0 ? (
                    <small>Antes {formatCurrency(item.precioBase)}</small>
                  ) : null}
                  <small>Stock: {item.stock}</small>
                </div>
              </div>

              <div className="cart-item__footer">
                <div className="qty-control">
                  <button
                    type="button"
                    onClick={() => handleUpdate(item.id, Number(item.cantidad) - 1)}
                    disabled={processingId === item.id || Number(item.cantidad) <= 1}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={item.stock}
                    value={draftQuantities[item.id] ?? item.cantidad}
                    onChange={(event) => handleQuantityInputChange(item.id, event.target.value)}
                    onBlur={() => commitQuantityInput(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitQuantityInput(item);
                      }
                    }}
                    aria-label={`Cantidad de ${item.nombre}`}
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(item.id, Number(item.cantidad) + 1)}
                    disabled={processingId === item.id || Number(item.cantidad) >= Number(item.stock)}
                  >
                    +
                  </button>
                </div>

                <strong className="cart-item__subtotal">
                  {formatCurrency(item.subtotal)}
                </strong>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleRemove(item.id)}
                  disabled={processingId === item.id}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </section>

        <aside className="cart-summary panel">
          <p className="catalog-section__eyebrow">Resumen</p>
          <h2>Finaliza tu compra</h2>

          <div className="cart-summary__row">
            <span>Items</span>
            <strong>{cartCount}</strong>
          </div>
          <div className="cart-summary__row">
            <span>Subtotal</span>
            <strong>{formatCurrency(cartSubtotal)}</strong>
          </div>
          <div className="cart-summary__row">
            <span>Envio</span>
            <strong>Gratis</strong>
          </div>
          <div className="cart-summary__row cart-summary__row--total">
            <span>Total</span>
            <strong>{formatCurrency(cartSubtotal)}</strong>
          </div>

          <label className="cart-summary__label" htmlFor="metodo">
            Metodo de pago
          </label>
          <select
            id="metodo"
            value={metodo}
            onChange={(event) => setMetodo(event.target.value)}
          >
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="pse">PSE</option>
            <option value="tarjeta_debito">Tarjeta debito</option>
            <option value="tarjeta_credito">Tarjeta credito</option>
          </select>

          <div className="cart-summary__contact">
            <p className="cart-summary__label cart-summary__label--strong">
              Datos obligatorios para el pedido
            </p>
            <input
              name="telefono"
              value={deliveryForm.telefono}
              onChange={handleDeliveryChange}
              placeholder="Telefono"
              required
            />
            <input
              name="direccion"
              value={deliveryForm.direccion}
              onChange={handleDeliveryChange}
              placeholder="Direccion de entrega"
              required
            />
            <small>
              Antes de comprar debemos guardar tu telefono y direccion en tu perfil.
            </small>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleCheckout}
            disabled={checkoutLoading || profileSaving || !hasDeliveryData}
          >
            {checkoutLoading
              ? "Procesando compra..."
              : profileSaving
                ? "Guardando datos..."
                : "Comprar ahora"}
          </button>
        </aside>
      </div>
    </section>
  );
}

export default Cart;
