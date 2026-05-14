import { useFavorites } from "../context/FavoritesContext";
import { getProductCategoryLabel, getProductImageSource } from "../utils/storefront";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function ProductoCard({
  producto,
  badgeText,
  accent = "sky",
  onAddToCart,
  onPromo,
  disabled = false
}) {
  const imageSource = getProductImageSource(producto);
  const categoryLabel = getProductCategoryLabel(producto);
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(producto.id);
  const isOutOfStock = Number(producto.stock || 0) <= 0;
  const actionDisabled = disabled || isOutOfStock;
  const hasDiscount =
    Number(producto.descuento_cantidad_minima || 0) > 0 &&
    Number(producto.descuento_porcentaje || 0) > 0;

  return (
    <article className="shop-card">
      <div className="shop-card__media">
        {badgeText ? (
          <span className={`shop-card__badge shop-card__badge--${accent}`}>{badgeText}</span>
        ) : null}

        <button
          type="button"
          className={`shop-card__wish ${favorite ? "shop-card__wish--active" : ""}`}
          aria-label={`Guardar ${producto.nombre} en favoritos`}
          onClick={() => toggleFavorite(producto.id)}
        >
          {favorite ? "\u2665" : "\u2661"}
        </button>

        <img className="shop-card__image" src={imageSource} alt={producto.nombre} />
      </div>

      <button
        type="button"
        className="shop-card__promo"
        onClick={() => (onPromo || onAddToCart)?.(producto)}
        disabled={actionDisabled}
      >
        <span className="shop-card__promo-icon">+</span>
        <span>Llevatelo ahora</span>
      </button>

      <div className="shop-card__content">
        <span className="shop-card__department">{categoryLabel}</span>
        <h3 className="shop-card__title" title={producto.nombre}>
          {producto.nombre}
        </h3>
        <p>{producto.marca || categoryLabel || "Papeleria creativa"}</p>
        <strong>{formatCurrency(producto.precio_venta)}</strong>
        {hasDiscount ? (
          <span className="shop-card__discount">
            {producto.descuento_porcentaje}% desde {producto.descuento_cantidad_minima} unidades
          </span>
        ) : null}
        <span className="shop-card__stock">
          {isOutOfStock ? "Agotado por ahora" : `Stock disponible: ${producto.stock}`}
        </span>
      </div>

      <button
        type="button"
        className="shop-card__button"
        onClick={() => onAddToCart?.(producto)}
        disabled={actionDisabled}
      >
        {isOutOfStock ? "SIN STOCK" : "A MI BOLSA"}
      </button>
    </article>
  );
}

export default ProductoCard;
