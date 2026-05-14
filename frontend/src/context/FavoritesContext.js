import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

const LEGACY_FAVORITES_KEY = "pappertech-favorites";
const GUEST_FAVORITES_KEY = "pappertech-favorites:guest";
const FavoritesContext = createContext(null);

function normalizeFavoriteIds(rawValue) {
  return Array.isArray(rawValue)
    ? rawValue.map((value) => Number(value)).filter(Boolean)
    : [];
}

function readFavoritesFromStorage(key) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
    return normalizeFavoriteIds(saved);
  } catch (_error) {
    return [];
  }
}

function hasStoredFavorites(key) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) !== null;
}

function getFavoritesStorageKey(user) {
  const userId = String(user?.id || "").trim();
  return userId ? `pappertech-favorites:user:${userId}` : GUEST_FAVORITES_KEY;
}

export function FavoritesProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const storageKey = getFavoritesStorageKey(user);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [hydratedKey, setHydratedKey] = useState(null);

  useEffect(() => {
    const scopedFavorites = readFavoritesFromStorage(storageKey);

    if (hasStoredFavorites(storageKey)) {
      setFavoriteIds(scopedFavorites);
      setHydratedKey(storageKey);
      return;
    }

    if (!isAuthenticated && hasStoredFavorites(LEGACY_FAVORITES_KEY)) {
      const legacyFavorites = readFavoritesFromStorage(LEGACY_FAVORITES_KEY);

      setFavoriteIds(legacyFavorites);
      setHydratedKey(storageKey);
      window.localStorage.setItem(storageKey, JSON.stringify(legacyFavorites));
      window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
      return;
    }

    setFavoriteIds([]);
    setHydratedKey(storageKey);
  }, [isAuthenticated, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || hydratedKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(favoriteIds));
  }, [favoriteIds, hydratedKey, storageKey]);

  const toggleFavorite = (productId) => {
    const normalizedId = Number(productId);

    setFavoriteIds((current) =>
      current.includes(normalizedId)
        ? current.filter((item) => item !== normalizedId)
        : [...current, normalizedId]
    );
  };

  const value = useMemo(
    () => ({
      favoriteIds,
      favoritesCount: favoriteIds.length,
      isFavorite: (productId) => favoriteIds.includes(Number(productId)),
      toggleFavorite
    }),
    [favoriteIds]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
