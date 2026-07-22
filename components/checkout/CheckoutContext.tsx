"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type CheckoutMode = "mp" | "transfer";

interface TransferSuccess {
    orderId: string;
    waUrl: string;
}

interface CheckoutContextValue {
    isOpen: boolean;
    mode: CheckoutMode;
    open: (mode: CheckoutMode) => void;
    close: () => void;
    transferSuccess: TransferSuccess | null;
    showTransferSuccess: (payload: TransferSuccess) => void;
    closeTransferSuccess: () => void;
}

// ponytail: plain context, same pattern as CartOffcanvasContext — this only
// tracks which modal is open/its mode, the actual checkout state (form
// fields, step, totals) lives inside CheckoutModal itself.
const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<CheckoutMode>("mp");
    const [transferSuccess, setTransferSuccess] = useState<TransferSuccess | null>(null);

    const open = useCallback((nextMode: CheckoutMode) => {
        setMode(nextMode);
        setIsOpen(true);
    }, []);
    const close = useCallback(() => setIsOpen(false), []);
    const showTransferSuccess = useCallback((payload: TransferSuccess) => {
        setIsOpen(false);
        setTransferSuccess(payload);
    }, []);
    const closeTransferSuccess = useCallback(() => setTransferSuccess(null), []);

    const value = useMemo(
        () => ({ isOpen, mode, open, close, transferSuccess, showTransferSuccess, closeTransferSuccess }),
        [isOpen, mode, open, close, transferSuccess, showTransferSuccess, closeTransferSuccess]
    );

    return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout() {
    const ctx = useContext(CheckoutContext);
    if (!ctx) throw new Error("useCheckout must be used within a CheckoutProvider");
    return ctx;
}
