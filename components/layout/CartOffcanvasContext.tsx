"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type CartOffcanvasContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

// ponytail: plain context instead of Zustand — cart *store* is F3, this only
// tracks whether the offcanvas panel is open/closed (shared by the navbar's
// cart button and CartOffcanvas itself).
const CartOffcanvasContext = createContext<CartOffcanvasContextValue | null>(
  null
);

export function CartOffcanvasProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle]
  );

  return (
    <CartOffcanvasContext.Provider value={value}>
      {children}
    </CartOffcanvasContext.Provider>
  );
}

export function useCartOffcanvas() {
  const ctx = useContext(CartOffcanvasContext);
  if (!ctx) {
    throw new Error(
      "useCartOffcanvas must be used within a CartOffcanvasProvider"
    );
  }
  return ctx;
}
