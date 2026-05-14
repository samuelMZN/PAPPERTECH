import { createContext, useContext, useMemo, useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { token, isAuthenticated, isClient } = useAuth();
  const [items, setItems] = useState([]);
  const [cartLoading, setCartLoading] = useState(false);

  const refreshCart = async () => {
    if (!token || !isClient) {
      setItems([]);
      return [];
    }

    setCartLoading(true);

    try {
      const data = await apiRequest("/carrito", { token });
      setItems(data);
      return data;
    } finally {
      setCartLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    if (!token) {
      setItems([]);
      setCartLoading(false);
      return;
    }

    async function loadCart() {
      setCartLoading(true);

      try {
        const data = await apiRequest("/carrito", { token });

        if (active) {
          setItems(data);
        }
      } catch (_error) {
        if (active) {
          setItems([]);
        }
      } finally {
        if (active) {
          setCartLoading(false);
        }
      }
    }

    loadCart();

    return () => {
      active = false;
    };
  }, [token, isClient]);

  const addToCart = async (productoId, cantidad = 1) => {
    if (!isClient) {
      throw new Error("Solo los clientes pueden usar el carrito");
    }

    const response = await apiRequest("/carrito", {
      method: "POST",
      token,
      body: {
        producto_id: productoId,
        cantidad
      }
    });

    setItems(response.items || []);
    return response;
  };

  const updateCartItem = async (itemId, cantidad) => {
    if (!isClient) {
      throw new Error("Solo los clientes pueden usar el carrito");
    }

    const response = await apiRequest(`/carrito/${itemId}`, {
      method: "PUT",
      token,
      body: { cantidad }
    });

    setItems(response.items || []);
    return response;
  };

  const removeFromCart = async (itemId) => {
    if (!isClient) {
      throw new Error("Solo los clientes pueden usar el carrito");
    }

    const response = await apiRequest(`/carrito/${itemId}`, {
      method: "DELETE",
      token
    });

    setItems(response.items || []);
    return response;
  };

  const clearCart = async () => {
    if (!isClient) {
      throw new Error("Solo los clientes pueden usar el carrito");
    }

    await apiRequest("/carrito", {
      method: "DELETE",
      token
    });

    setItems([]);
  };

  const checkout = async (metodo) => {
    if (!isClient) {
      throw new Error("Solo los clientes pueden comprar");
    }

    const response = await apiRequest("/carrito/checkout", {
      method: "POST",
      token,
      body: { metodo }
    });

    setItems([]);
    return response;
  };

  const cartCount = useMemo(
    () => items.reduce((total, item) => total + Number(item.cantidad || 0), 0),
    [items]
  );

  const cartSubtotal = useMemo(
    () => items.reduce((total, item) => total + Number(item.subtotal || 0), 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        cartLoading,
        cartCount,
        cartSubtotal,
        isCartReady: isAuthenticated && isClient,
        refreshCart,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        checkout
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
