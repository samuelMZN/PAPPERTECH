import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductoCard from "../components/ProductoCard";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useFavorites } from "../context/FavoritesContext";
import { apiRequest } from "../services/api";
import { buildCategoryShowcase, getCategoryIconSource, titleCase } from "../utils/storefront";

const NEW_PRODUCTS_WINDOW_DAYS = 15;

function CatalogSection({
  title,
  subtitle,
  badgeText,
  accent,
  productos,
  railRef,
  onPrev,
  onNext,
  onAddToCart,
  onPromo,
  addingProductId,
  disableAddToCart
}) {
  if (productos.length === 0) {
    return null;
  }

  return (
    <section className="catalog-section">
      <div className="catalog-section__header">
        <div>
          <p className="catalog-section__eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>

        <div className="catalog-controls">
          <button
            type="button"
            className="catalog-arrow"
            onClick={onPrev}
            aria-label={`Ver anteriores en ${title}`}
          >
            &#8249;
          </button>
          <button
            type="button"
            className="catalog-arrow"
            onClick={onNext}
            aria-label={`Ver siguientes en ${title}`}
          >
            &#8250;
          </button>
        </div>
      </div>

      <div className="catalog-rail" ref={railRef}>
        {productos.map((producto) => (
          <ProductoCard
            key={`${title}-${producto.id}`}
            producto={producto}
            badgeText={badgeText}
            accent={accent}
            onAddToCart={onAddToCart}
            onPromo={onPromo}
            disabled={addingProductId === producto.id || disableAddToCart}
          />
        ))}
      </div>
    </section>
  );
}

function sortProducts(products, sortBy) {
  const items = [...products];

  if (sortBy === "precio_asc") {
    return items.sort((first, second) => Number(first.precio_venta) - Number(second.precio_venta));
  }

  if (sortBy === "precio_desc") {
    return items.sort((first, second) => Number(second.precio_venta) - Number(first.precio_venta));
  }

  if (sortBy === "vendidos") {
    return items.sort((first, second) => {
      const soldGap = Number(second.unidades_vendidas || 0) - Number(first.unidades_vendidas || 0);
      return soldGap !== 0 ? soldGap : second.id - first.id;
    });
  }

  if (sortBy === "nombre") {
    return items.sort((first, second) =>
      String(first.nombre || "").localeCompare(String(second.nombre || ""), "es", {
        sensitivity: "base"
      })
    );
  }

  return items.sort((first, second) => second.id - first.id);
}

function isFreshProduct(producto) {
  if (!producto?.creado_en) {
    return false;
  }

  const createdAt = new Date(producto.creado_en);

  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() - NEW_PRODUCTS_WINDOW_DAYS);

  return createdAt >= limitDate;
}

function getTopSoldItems(items, limit = 4) {
  const seenNames = new Set();

  return [...items]
    .sort((first, second) => {
      const soldGap = Number(second.unidades_vendidas || 0) - Number(first.unidades_vendidas || 0);

      if (soldGap !== 0) {
        return soldGap;
      }

      return second.id - first.id;
    })
    .filter((item) => {
      const key = String(item.nombre || item.id).trim().toLowerCase();

      if (seenNames.has(key)) {
        return false;
      }

      seenNames.add(key);
      return true;
    })
    .slice(0, limit);
}

function Home() {
  const { isAuthenticated, isClient, isAdministrator, isWorker } = useAuth();
  const { addToCart } = useCart();
  const { favoriteIds } = useFavorites();
  const navigate = useNavigate();
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recientes");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [addingProductId, setAddingProductId] = useState(null);
  const nuevosRef = useRef(null);
  const descuentosRef = useRef(null);
  const favoritosRef = useRef(null);
  const vendidosRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function cargarHome() {
      try {
        const [productsData, catalogData] = await Promise.all([
          apiRequest("/productos"),
          apiRequest("/catalogos/publico")
        ]);

        if (!active) {
          return;
        }

        setProductos(productsData);
        setCategorias(catalogData.categorias || []);
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

    cargarHome();

    return () => {
      active = false;
    };
  }, []);

  const categoryShowcase = useMemo(
    () => buildCategoryShowcase(categorias, productos),
    [categorias, productos]
  );

  useEffect(() => {
    if (
      selectedCategoryId !== "all" &&
      !categoryShowcase.some((category) => String(category.id) === String(selectedCategoryId))
    ) {
      setSelectedCategoryId("all");
    }
  }, [categoryShowcase, selectedCategoryId]);

  const activeCategory =
    selectedCategoryId === "all"
      ? null
      : categoryShowcase.find((category) => String(category.id) === String(selectedCategoryId)) ||
        null;

  const brandOptions = useMemo(() => {
    const unique = new Set();

    for (const producto of productos) {
      const brand = String(producto.marca || "").trim();

      if (brand) {
        unique.add(brand);
      }
    }

    return [...unique].sort((first, second) =>
      first.localeCompare(second, "es", { sensitivity: "base" })
    );
  }, [productos]);

  const baseProducts = useMemo(() => {
    if (selectedCategoryId === "all") {
      return productos;
    }

    const selectedCategory = categoryShowcase.find(
      (category) => String(category.id) === String(selectedCategoryId)
    );

    return selectedCategory ? selectedCategory.items : [];
  }, [categoryShowcase, productos, selectedCategoryId]);

  const productosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();

    return sortProducts(
      baseProducts.filter((producto) => {
        if (term) {
          const hayCoincidencia =
            String(producto.nombre || "").toLowerCase().includes(term) ||
            String(producto.descripcion || "").toLowerCase().includes(term) ||
            String(producto.categoria || "").toLowerCase().includes(term) ||
            String(producto.marca || "").toLowerCase().includes(term);

          if (!hayCoincidencia) {
            return false;
          }
        }

        if (selectedBrand !== "all" && producto.marca !== selectedBrand) {
          return false;
        }

        if (stockFilter === "disponibles" && Number(producto.stock || 0) <= 0) {
          return false;
        }

        if (stockFilter === "agotados" && Number(producto.stock || 0) > 0) {
          return false;
        }

        if (onlyFavorites && !favoriteIds.includes(Number(producto.id))) {
          return false;
        }

        return true;
      }),
      sortBy
    );
  }, [baseProducts, busqueda, favoriteIds, onlyFavorites, selectedBrand, sortBy, stockFilter]);

  const productosNuevos = useMemo(() => {
    const recientes = [...productosFiltrados]
      .filter((producto) => isFreshProduct(producto))
      .sort((first, second) => new Date(second.creado_en) - new Date(first.creado_en));

    if (recientes.length > 0) {
      return recientes.slice(0, 12);
    }

    return [...productosFiltrados].sort((first, second) => second.id - first.id).slice(0, 12);
  }, [productosFiltrados]);

  const productosVendidos = useMemo(() => {
    return [...productosFiltrados]
      .sort((first, second) => {
        const soldGap = Number(second.unidades_vendidas || 0) - Number(first.unidades_vendidas || 0);

        if (soldGap !== 0) {
          return soldGap;
        }

        return second.id - first.id;
      })
      .slice(0, 12);
  }, [productosFiltrados]);

  const productosEnDescuento = useMemo(() => {
    return [...productosFiltrados]
      .filter((producto) => {
        return (
          Number(producto.descuento_cantidad_minima || 0) > 0 &&
          Number(producto.descuento_porcentaje || 0) > 0
        );
      })
      .sort((first, second) => {
        const discountGap =
          Number(second.descuento_porcentaje || 0) - Number(first.descuento_porcentaje || 0);

        if (discountGap !== 0) {
          return discountGap;
        }

        const minQtyGap =
          Number(first.descuento_cantidad_minima || 0) -
          Number(second.descuento_cantidad_minima || 0);

        if (minQtyGap !== 0) {
          return minQtyGap;
        }

        return second.id - first.id;
      })
      .slice(0, 12);
  }, [productosFiltrados]);

  const productosFavoritos = useMemo(() => {
    return [...productosFiltrados]
      .filter((producto) => favoriteIds.includes(Number(producto.id)))
      .sort((first, second) => {
        const firstIndex = favoriteIds.indexOf(Number(first.id));
        const secondIndex = favoriteIds.indexOf(Number(second.id));
        return firstIndex - secondIndex;
      });
  }, [favoriteIds, productosFiltrados]);

  useEffect(() => {
    if (!vendidosRef.current || productosVendidos.length < 2) {
      return undefined;
    }

    const rail = vendidosRef.current;
    const intervalId = window.setInterval(() => {
      const maxScroll = rail.scrollWidth - rail.clientWidth;

      if (maxScroll <= 0) {
        return;
      }

      if (rail.scrollLeft >= maxScroll - 12) {
        rail.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }

      rail.scrollBy({ left: 320, behavior: "smooth" });
    }, 2600);

    return () => window.clearInterval(intervalId);
  }, [productosVendidos]);

  const destacados = useMemo(() => {
    if (activeCategory?.items?.length) {
      return getTopSoldItems(activeCategory.items, 4);
    }

    const source = productosFiltrados.length > 0 ? productosFiltrados : productos;
    return getTopSoldItems(source, 4);
  }, [activeCategory, productos, productosFiltrados]);
  const totalStock = useMemo(
    () => productos.reduce((total, producto) => total + Number(producto.stock || 0), 0),
    [productos]
  );

  const scrollRail = (reference, direction) => {
    if (!reference.current) {
      return;
    }

    reference.current.scrollBy({
      left: direction * 340,
      behavior: "smooth"
    });
  };

  const handleAddToCart = async (producto) => {
    setError("");
    setSuccess("");

    if (Number(producto.stock || 0) <= 0) {
      setError(`${producto.nombre} esta agotado en este momento.`);
      return;
    }

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (isAdministrator || isWorker) {
      setError("Solo los clientes pueden agregar productos al carrito.");
      return;
    }

    setAddingProductId(producto.id);

    try {
      await addToCart(producto.id, 1);
      setSuccess(`${producto.nombre} se agrego a tu carrito.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAddingProductId(null);
    }
  };

  const handlePromo = (producto) => {
    handleAddToCart(producto);
  };

  return (
    <section className="home-page">
      <section className="store-hero store-hero--navy">
        <div className="store-hero__copy">
          <h1>Explora mas categorias, muestra mas productos y filtra mejor.</h1>
        </div>

        <div className="store-hero__promo">
          <article className="promo-card promo-card--primary">
            <p>Productos activos</p>
            <strong>{productos.length}</strong>
            <span>{totalStock} unidades listas para venta</span>
          </article>
          <article className="promo-card promo-card--secondary">
            <p>Categorias activas</p>
            <strong>{categoryShowcase.length}</strong>
            <span>cada una aparece automaticamente en el inicio</span>
          </article>
        </div>
      </section>

      <section className="search-dock">
        <div className="search-dock__inner">
          <div className="search-dock__search">
            <input
              className="store-search__input store-search__input--dark-safe"
              type="search"
              placeholder="Busca productos, marcas o categorias..."
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />
            <span className="store-search__count">{productosFiltrados.length} resultados</span>
          </div>

          <div className="search-dock__filters">
            <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
              <option value="all">Todas las categorias</option>
              {categoryShowcase.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>

            <select value={selectedBrand} onChange={(event) => setSelectedBrand(event.target.value)}>
              <option value="all">Todas las marcas</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>

            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="all">Todo el stock</option>
              <option value="disponibles">Solo disponibles</option>
              <option value="agotados">Solo agotados</option>
            </select>

            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="recientes">Mas recientes</option>
              <option value="vendidos">Mas vendidos</option>
              <option value="precio_asc">Precio menor</option>
              <option value="precio_desc">Precio mayor</option>
              <option value="nombre">Nombre A-Z</option>
            </select>

            <button
              type="button"
              className={`filter-pill ${onlyFavorites ? "is-active" : ""}`}
              onClick={() => setOnlyFavorites((current) => !current)}
            >
              Favoritos
            </button>

            <button
              type="button"
              className="filter-pill"
              onClick={() => {
                setBusqueda("");
                setSelectedCategoryId("all");
                setSelectedBrand("all");
                setStockFilter("all");
                setSortBy("recientes");
                setOnlyFavorites(false);
              }}
            >
              Limpiar
            </button>
          </div>
        </div>
      </section>

      {loading ? <p className="status">Cargando vitrina...</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {success ? <p className="message success">{success}</p> : null}

      {!loading ? (
        <section className="category-grid">
          <button
            type="button"
            className={`category-card ${selectedCategoryId === "all" ? "is-active" : ""}`}
            onClick={() => {
              setSelectedCategoryId("all");
              setBusqueda("");
            }}
          >
            <span className="category-card__icon-wrap category-card__icon-wrap--all">
              <span className="category-card__all-mark">Todas</span>
            </span>
            <strong>Todas las categorias</strong>
            <small>{productos.length} productos</small>
          </button>

          {categoryShowcase.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`category-card ${String(selectedCategoryId) === String(category.id) ? "is-active" : ""}`}
              onClick={() => {
                setSelectedCategoryId(String(category.id));
                setBusqueda("");
              }}
            >
              <span className="category-card__icon-wrap">
                <img
                  className="category-card__icon"
                  src={getCategoryIconSource(category)}
                  alt={category.label}
                />
              </span>
              <strong>{category.label}</strong>
              <small>{category.total_productos} productos</small>
            </button>
          ))}
        </section>
      ) : null}

      {!loading ? (
        <section className="category-panel">
          <div className="category-panel__copy">
            <p className="catalog-section__eyebrow">
              {activeCategory ? "Categoria seleccionada" : "Vista general"}
            </p>
            <h2>{activeCategory ? activeCategory.label : "Todas las categorias"}</h2>
            <p>
              {activeCategory
                ? activeCategory.description
                : "Estas viendo todo el catalogo a la vez. Si eliges una categoria arriba, la vitrina se filtrara automaticamente."}
            </p>

            <div className="category-panel__labels">
              {(activeCategory
                ? activeCategory.previewLabels
                : categoryShowcase.map((category) => category.label)
              ).length > 0 ? (
                (activeCategory
                  ? activeCategory.previewLabels
                  : categoryShowcase.map((category) => category.label)
                ).map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="category-label"
                    onClick={() => {
                      if (!activeCategory) {
                        const matchedCategory = categoryShowcase.find(
                          (category) => category.label === label
                        );

                        setSelectedCategoryId(matchedCategory ? String(matchedCategory.id) : "all");
                        return;
                      }

                      setBusqueda(titleCase(label));
                    }}
                  >
                    {label}
                  </button>
                ))
              ) : (
                <span className="category-panel__empty">
                  Cuando agregues productos a esta categoria apareceran aqui.
                </span>
              )}
            </div>
          </div>

          <div className="category-panel__preview">
            <p className="catalog-section__eyebrow">
              {activeCategory ? "Mas vendidos de esta categoria" : "Mas vendidos del catalogo"}
            </p>
            <ul className="department-preview-list">
              {destacados.length > 0 ? (
                destacados.map((producto) => (
                  <li key={producto.id}>
                    <strong>{producto.nombre}</strong>
                    <span>{producto.marca || producto.categoria || "Sin marca"}</span>
                  </li>
                ))
              ) : (
                <li>
                  <strong>Sin productos aun</strong>
                  <span>Esta categoria ya existe en la base y aparecera aqui aunque aun este vacia.</span>
                </li>
              )}
            </ul>
          </div>
        </section>
      ) : null}

      {!loading && !error && productosFiltrados.length === 0 ? (
        <p className="empty-state">
          {onlyFavorites
            ? "No encontramos favoritos con esos filtros. Puedes limpiar o guardar mas productos en favoritos."
            : "No encontramos productos con esos filtros. Puedes limpiar la busqueda y volver a intentar."}
        </p>
      ) : null}

      {!loading && !error && productosFiltrados.length > 0 ? (
        <>
          {onlyFavorites ? (
            <>
              <CatalogSection
                title="Tus favoritos"
                subtitle="Productos que guardaste con el corazon"
                badgeText="Favorito"
                accent="rose"
                productos={productosFavoritos.slice(0, 12)}
                railRef={favoritosRef}
                onPrev={() => scrollRail(favoritosRef, -1)}
                onNext={() => scrollRail(favoritosRef, 1)}
                onAddToCart={handleAddToCart}
                onPromo={handlePromo}
                addingProductId={addingProductId}
                disableAddToCart={isAuthenticated && !isClient}
              />

              <section className="catalog-section catalog-section--grid">
                <div className="catalog-section__header">
                  <div>
                    <p className="catalog-section__eyebrow">Favoritos guardados</p>
                    <h2>Todos tus favoritos</h2>
                  </div>
                </div>

                <div className="catalog-grid catalog-grid--wide">
                  {productosFavoritos.map((producto) => (
                    <ProductoCard
                      key={`favorite-grid-${producto.id}`}
                      producto={producto}
                      badgeText="Favorito"
                      accent="rose"
                      onAddToCart={handleAddToCart}
                      onPromo={handlePromo}
                      disabled={addingProductId === producto.id || (isAuthenticated && !isClient)}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <CatalogSection
                title={`Lo mas nuevo${activeCategory ? ` en ${activeCategory.label}` : ""}`}
                subtitle={`Novedades de los ultimos ${NEW_PRODUCTS_WINDOW_DAYS} dias`}
                badgeText="Nuevo"
                accent="sky"
                productos={productosNuevos}
                railRef={nuevosRef}
                onPrev={() => scrollRail(nuevosRef, -1)}
                onNext={() => scrollRail(nuevosRef, 1)}
                onAddToCart={handleAddToCart}
                onPromo={handlePromo}
                addingProductId={addingProductId}
                disableAddToCart={isAuthenticated && !isClient}
              />

              <CatalogSection
                title="Productos en descuento"
                subtitle="Ofertas por cantidad configuradas desde el dashboard"
                badgeText="Oferta"
                accent="rose"
                productos={productosEnDescuento}
                railRef={descuentosRef}
                onPrev={() => scrollRail(descuentosRef, -1)}
                onNext={() => scrollRail(descuentosRef, 1)}
                onAddToCart={handleAddToCart}
                onPromo={handlePromo}
                addingProductId={addingProductId}
                disableAddToCart={isAuthenticated && !isClient}
              />

              <CatalogSection
                title="Lo mas vendido"
                subtitle="Se mueve automaticamente segun tus ventas"
                badgeText="Top"
                accent="amber"
                productos={productosVendidos}
                railRef={vendidosRef}
                onPrev={() => scrollRail(vendidosRef, -1)}
                onNext={() => scrollRail(vendidosRef, 1)}
                onAddToCart={handleAddToCart}
                onPromo={handlePromo}
                addingProductId={addingProductId}
                disableAddToCart={isAuthenticated && !isClient}
              />

              <section className="catalog-section catalog-section--grid">
                <div className="catalog-section__header">
                  <div>
                    <p className="catalog-section__eyebrow">Catalogo completo</p>
                    <h2>Mas productos visibles en pantalla</h2>
                  </div>
                </div>

                <div className="catalog-grid catalog-grid--wide">
                  {productosFiltrados.map((producto, index) => (
                    <ProductoCard
                      key={`grid-${producto.id}`}
                      producto={producto}
                      badgeText={index < 3 ? "Nuevo" : Number(producto.unidades_vendidas || 0) > 0 ? "Top" : producto.categoria || "PapperTech"}
                      accent={Number(producto.unidades_vendidas || 0) > 0 ? "amber" : "sky"}
                      onAddToCart={handleAddToCart}
                      onPromo={handlePromo}
                      disabled={addingProductId === producto.id || (isAuthenticated && !isClient)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export default Home;
