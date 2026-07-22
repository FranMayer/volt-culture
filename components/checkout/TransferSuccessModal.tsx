"use client";

import { useEffect } from "react";
import { useCheckout } from "./CheckoutContext";

// Port of legacy/js/pagos.js#showTransferSuccessModal (lines 1009-1038): a
// real <a> for the WhatsApp link (not window.open) so it's never blocked by
// popup blockers even after an await chain (Safari especially) — see the
// comment in the legacy source. Own modal (not a step inside CheckoutModal)
// because legacy keeps it as a separate bootstrap.Modal shown right after
// the checkout one hides, same separation kept here via CheckoutContext.
export default function TransferSuccessModal() {
    const { transferSuccess, closeTransferSuccess } = useCheckout();
    const isOpen = transferSuccess !== null;

    useEffect(() => {
        if (!isOpen) return;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const prevOverflow = document.body.style.overflow;
        const prevPadding = document.body.style.paddingRight;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeTransferSuccess();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPadding;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isOpen, closeTransferSuccess]);

    return (
        <>
            {isOpen && <div className="modal-backdrop show" onClick={closeTransferSuccess} aria-hidden="true" />}

            <div
                className={`modal fade${isOpen ? " show" : ""}`}
                id="transferSuccessModal"
                tabIndex={-1}
                aria-labelledby="transferSuccessTitle"
                aria-hidden={!isOpen}
            >
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title" id="transferSuccessTitle">ORDEN CREADA</h5>
                            <button
                                type="button"
                                className="btn-close btn-close-white"
                                aria-label="Cerrar"
                                onClick={closeTransferSuccess}
                            />
                        </div>
                        <div className="modal-body">
                            <p className="volt-transfer-success__text">
                                Tu orden <strong className="volt-transfer-success__id">#{transferSuccess?.orderId}</strong> quedó registrada.
                            </p>
                            <p className="volt-transfer-success__hint">
                                Para confirmarla, envianos el comprobante de transferencia por WhatsApp. Ya te dejamos el mensaje armado.
                            </p>
                            <a
                                href={transferSuccess?.waUrl || "#"}
                                target="_blank"
                                rel="noopener"
                                className="btn btn-success w-100 volt-transfer-success__wa-btn"
                            >
                                Abrir WhatsApp y enviar comprobante
                            </a>
                            <p className="volt-transfer-success__note">
                                Si no se abre, escribinos al WhatsApp de VOLT con tu número de orden.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
