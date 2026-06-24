/**
 * VOLT Store — Pago con Mercado Pago (Preference API)
 *
 * Flujo: stepper en modal (datos → envío → resumen) → backend crea preferencia → init_point.
 *
 * Variables de entorno (Vercel / hosting):
 *   MP_ACCESS_TOKEN, SITE_URL
 *
 * Desarrollo local: `vercel dev` o `npm run dev:api` para /api/create-preference.
 */

import { SHIPPING_CONFIG } from './shipping-config.js';

function formatShippingMoney(n) {
    return `$${Number(n || 0).toLocaleString('es-AR')}`;
}

const SHIPPING_LABELS = {
    cordoba: `Envío ${SHIPPING_CONFIG.cordoba.label} (dentro de circunvalación) — ${formatShippingMoney(SHIPPING_CONFIG.cordoba.cost)}`,
    andreani: `${SHIPPING_CONFIG.andreani.label} del país — ${SHIPPING_CONFIG.andreani.note}`,
};

const SHIPPING_OPTIONS = Object.keys(SHIPPING_CONFIG);

const TRANSFER_DISCOUNT = 0.10;
const WHATSAPP_NUMBER = '5493518588127';
const TRANSFER_BANK = {
    banco:   'Banco Santander',
    cuenta:  'Caja de Ahorro en Pesos 064-371679/1',
    cbu:     '0720064988000037167918',
    alias:   'franmayer96',
    titular: 'FRANCO EZEQUIEL MAYER',
    cuit:    'CUIT 20-39693593-8',
};

document.addEventListener("DOMContentLoaded", () => {
    const checkoutBtn = document.getElementById("checkout-btn");
    const CUSTOMER_STORAGE_KEY = "volt_checkout_customer";

    /** Envío validado al tocar "Continuar" en paso 2; se usa en "IR A PAGAR" y se limpia al cerrar/resetear el modal. */
    let _shippingConfirmado = null;
    /** Cupón aplicado en el paso 3 ({ code, percent }) o null. Se resetea al abrir el modal. */
    let _couponAplicado = null;

    if (!checkoutBtn) return;

    let checkoutFlowActive = false;

    const API_URL = "/api/create-preference";

    const TRANSFER_API_URL = "/api/create-transfer-order";

    const ARGENTINE_PROVINCES = [
        "Buenos Aires",
        "Ciudad Autónoma de Buenos Aires",
        "Catamarca",
        "Chaco",
        "Chubut",
        "Córdoba",
        "Corrientes",
        "Entre Ríos",
        "Formosa",
        "Jujuy",
        "La Pampa",
        "La Rioja",
        "Mendoza",
        "Misiones",
        "Neuquén",
        "Río Negro",
        "Salta",
        "San Juan",
        "San Luis",
        "Santa Cruz",
        "Santa Fe",
        "Santiago del Estero",
        "Tierra del Fuego",
        "Tucumán",
    ];

    const CHECKOUT_INPUT_STYLE =
        'background:#111;border-color:#44464c;color:#f2f2f2;';

    function validateDni(dni) {
        return /^\d{7,8}$/.test(dni);
    }

    function injectCheckoutStyles() {
        if (document.getElementById("voltCheckoutModalStyles")) return;
        const s = document.createElement("style");
        s.id = "voltCheckoutModalStyles";
        s.textContent = `
            #customerDataModal .volt-stepper { display:flex; gap:0; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid #44464c; }
            #customerDataModal .volt-stepper__item { flex:1; text-align:center; font-family:Barlow,sans-serif; font-size:0.7rem; letter-spacing:0.06em; text-transform:uppercase; color:#888; position:relative; }
            #customerDataModal .volt-stepper__item strong { display:block; font-family:Teko,sans-serif; font-size:1.15rem; letter-spacing:0.06em; margin-bottom:2px; }
            #customerDataModal .volt-stepper__item.is-active { color:#f2f2f2; }
            #customerDataModal .volt-stepper__item.is-active strong { color:#c1121f; }
            #customerDataModal .volt-stepper__item.is-done strong { color:#f2f2f2; }
            #customerDataModal .volt-stepper__bar { height:3px; background:#333; border-radius:2px; margin-bottom:0.85rem; overflow:hidden; }
            #customerDataModal .volt-stepper__fill { height:100%; background:#c1121f; width:0%; transition:width 0.25s ease; }
            #customerDataModal .volt-step-panel { display:none; }
            #customerDataModal .volt-step-panel.is-visible { display:block; background:#1a1a1a; border:1px solid #2c2c2c; padding:0.875rem; }
            #customerDataModal .volt-ship-grid { display:grid; grid-template-columns:1fr; gap:0.6rem; }
            @media (min-width:576px) {
                #customerDataModal .volt-ship-grid { grid-template-columns:1fr 1fr; }
            }
            #customerDataModal .volt-ship-card {
                border:1px solid #44464c; border-radius:4px; padding:0.65rem 0.75rem; cursor:pointer;
                background:#222; text-align:left; transition:border-color 0.15s, background 0.15s;
                font-family:Barlow,sans-serif; font-size:0.875rem; color:#e8e8e8;
            }
            #customerDataModal .volt-ship-card:hover { border-color:#666; }
            #customerDataModal .volt-ship-card.is-selected { border-color:#c1121f; background:rgba(193,18,31,0.12); }
            #customerDataModal .volt-ship-card__title { font-family:Teko,sans-serif; font-size:1.25rem; letter-spacing:0.05em; margin:0 0 0.35rem 0; color:#fff; }
            #customerDataModal .volt-ship-card__meta { font-size:0.78rem; color:#aaa; line-height:1.35; margin:0; }
            #customerDataModal .volt-summary-list { list-style:none; padding:0; margin:0 0 1rem 0; font-size:0.9rem; }
            #customerDataModal .volt-summary-list li { padding:0.45rem 0; border-bottom:1px solid #333; display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; }
            #customerDataModal .volt-summary-ship { font-size:0.85rem; color:#ccc; line-height:1.5; white-space:pre-wrap; }
            #customerDataModal #andreaniAddressForm { border-top:1px solid #333; padding-top:0.85rem; margin-top:0.25rem; }
            #customerDataModal .form-label { font-size:0.82rem; color:#ccc; margin-bottom:0.25rem; }
            #customerDataModal .volt-field-hint { font-size:0.72rem; color:#888; margin-top:0.2rem; }
            #customerDataModal .volt-bank-panel { background:#111; border:1px solid #2c4a2c; padding:0.75rem; margin-top:0.75rem; }
            #customerDataModal .volt-bank-panel__title { font-family:Teko,sans-serif; font-size:1.05rem; letter-spacing:0.08em; color:#6daa6d; margin-bottom:0.5rem; }
            #customerDataModal .volt-bank-panel__row { display:flex; justify-content:space-between; align-items:baseline; gap:0.5rem; padding:0.2rem 0; border-bottom:1px solid #222; font-size:0.8rem; flex-wrap:wrap; }
            #customerDataModal .volt-bank-panel__row:last-of-type { border-bottom:none; }
            #customerDataModal .volt-bank-panel__key { color:#888; flex-shrink:0; }
            #customerDataModal .volt-bank-panel__val { color:#f2f2f2; font-family:var(--font-ds-mono,monospace); word-break:break-all; text-align:right; }
            #customerDataModal .volt-bank-panel__alias { color:#6daa6d; font-size:1.1rem; font-family:Teko,sans-serif; letter-spacing:0.06em; }
            #customerDataModal .volt-bank-panel__note { font-size:0.75rem; color:#888; line-height:1.4; margin-top:0.6rem; margin-bottom:0; }
            #customerDataModal .volt-mp-trust { font-size:0.72rem; color:#888; line-height:1.45; margin:0.75rem 0 0; text-align:center; }
            #customerDataModal .volt-summary-discount { color:#6daa6d; }
            #customerDataModal .volt-summary-total-transfer { color:#6daa6d; font-weight:700; }
            #customerDataModal .volt-coupon { margin:0.25rem 0 1rem; }
            #customerDataModal .volt-coupon__row { display:flex; gap:0.4rem; flex-wrap:wrap; }
            #customerDataModal .volt-coupon__row .form-control { flex:1 1 auto; min-width:0; text-transform:uppercase; }
            #customerDataModal .volt-coupon__feedback { font-size:0.78rem; margin-top:0.35rem; min-height:1em; }
            #customerDataModal .volt-coupon__feedback.is-ok { color:#6daa6d; }
            #customerDataModal .volt-coupon__feedback.is-error { color:#e06b6b; }
            @media (max-width:575px) {
                #customerDataModal .modal-body { padding:0.75rem; }
                #customerDataModal .modal-footer { padding:0.5rem 0.75rem; flex-wrap:wrap; gap:0.4rem; }
                #customerDataModal .modal-footer .ms-auto { width:100%; justify-content:flex-end; gap:0.4rem !important; }
                #customerDataModal .volt-stepper { margin-bottom:0.75rem; }
                #customerDataModal .volt-stepper__item { font-size:0.58rem; }
                #customerDataModal .volt-stepper__item strong { font-size:1rem; }
                #customerDataModal .volt-step-panel.is-visible { padding:0.625rem; }
                #customerDataModal #customerDataConfirm { font-size:0.75rem; letter-spacing:0.03em; padding:0.375rem 0.7rem; }
                #customerDataModal .volt-ship-card { padding:0.5rem 0.65rem; }
                #customerDataModal .volt-ship-card__title { font-size:1.1rem; }
            }
        `;
        document.head.appendChild(s);
    }

    function provinceSelectOptionsHtml() {
        const opts = ['<option value="">Provincia</option>']
            .concat(ARGENTINE_PROVINCES.map((p) => `<option value="${p}">${p}</option>`));
        return opts.join("");
    }

    function createCustomerModal() {
        if (document.getElementById("customerDataModal")) return;
        injectCheckoutStyles();
        const cordobaCostFmt = formatShippingMoney(SHIPPING_CONFIG.cordoba.cost);
        const modal = document.createElement("div");
        modal.className = "modal fade";
        modal.id = "customerDataModal";
        modal.tabIndex = -1;
        modal.setAttribute("aria-labelledby", "customerDataModalTitle");
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                <div class="modal-content" style="background:#111;color:#f2f2f2;border:1px solid #44464c;">
                    <div class="modal-header" style="border-bottom:1px solid #44464c;flex-wrap:wrap;gap:0.5rem;">
                        <h5 class="modal-title" id="customerDataModalTitle" style="font-family:Teko,sans-serif;letter-spacing:0.08em;font-size:1.5rem;">CHECKOUT</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body pt-2">
                        <div class="volt-stepper__bar" aria-hidden="true"><div class="volt-stepper__fill" id="checkoutStepperFill"></div></div>
                        <div class="volt-stepper" role="navigation" aria-label="Pasos del checkout">
                            <div class="volt-stepper__item is-active" data-step-indicator="1"><strong>1</strong>Datos</div>
                            <div class="volt-stepper__item" data-step-indicator="2"><strong>2</strong>Envío</div>
                            <div class="volt-stepper__item" data-step-indicator="3"><strong>3</strong>Resumen</div>
                        </div>

                        <div id="checkoutStep1" class="volt-step-panel is-visible">
                            <form id="customerDataForm" novalidate>
                                <div class="mb-2">
                                    <label class="form-label" for="customerName">Nombre y apellido</label>
                                    <input type="text" class="form-control" id="customerName" required autocomplete="name" style="background:#111;border-color:#44464c;color:#f2f2f2;">
                                </div>
                                <div class="mb-2">
                                    <label class="form-label" for="customerDni">DNI</label>
                                    <input type="text" class="form-control" id="customerDni" required autocomplete="off" inputmode="numeric" maxlength="8" style="background:#111;border-color:#44464c;color:#f2f2f2;" placeholder="Sin puntos ni espacios">
                                </div>
                                <div class="mb-2">
                                    <label class="form-label" for="customerPhone">Teléfono</label>
                                    <input type="tel" class="form-control" id="customerPhone" required autocomplete="tel" style="background:#111;border-color:#44464c;color:#f2f2f2;" placeholder="Ej: 3512345678">
                                </div>
                                <div class="mb-2">
                                    <label class="form-label" for="customerEmail">Email</label>
                                    <input type="email" class="form-control" id="customerEmail" required autocomplete="email" style="background:#111;border-color:#44464c;color:#f2f2f2;">
                                </div>
                            </form>
                        </div>

                        <div id="checkoutStep2" class="volt-step-panel">
                            <p class="small text-secondary mb-2" style="font-family:Barlow,sans-serif;">Elegí cómo querés recibir tu pedido</p>
                            <div class="volt-ship-grid mb-3" role="radiogroup" aria-label="Opción de envío">
                                <button type="button" class="volt-ship-card" data-shipping="cordoba" aria-pressed="false">
                                    <div class="volt-ship-card__title">Envío ${SHIPPING_CONFIG.cordoba.label} — ${cordobaCostFmt}</div>
                                    <p class="volt-ship-card__meta">Dentro de circunvalación. Costo fijo ${cordobaCostFmt}, se suma al total en Mercado Pago.</p>
                                </button>
                                <button type="button" class="volt-ship-card" data-shipping="andreani" aria-pressed="false">
                                    <div class="volt-ship-card__title">${SHIPPING_CONFIG.andreani.label} del país</div>
                                    <p class="volt-ship-card__meta">Andreani u OCA. El costo se calcula según destino y se coordina por WhatsApp antes del despacho.</p>
                                </button>
                            </div>
                            <p id="shippingAndreaniNote" class="small mb-2 d-none" style="font-family:Barlow,sans-serif;color:#ccc;line-height:1.45;">
                                Completá la dirección de entrega. El costo de envío se coordina por WhatsApp antes del despacho.
                            </p>
                            <div id="andreaniAddressForm" class="d-none">
                                <div class="mb-2">
                                    <label class="form-label" for="shippingStreet">Calle y número</label>
                                    <input type="text" class="form-control" id="shippingStreet" required autocomplete="street-address" style="${CHECKOUT_INPUT_STYLE}">
                                </div>
                                <div class="mb-2">
                                    <label class="form-label" for="shippingCity">Ciudad</label>
                                    <input type="text" class="form-control" id="shippingCity" required autocomplete="address-level2" style="${CHECKOUT_INPUT_STYLE}">
                                </div>
                                <div class="mb-2">
                                    <label class="form-label" for="shippingProvince">Provincia</label>
                                    <select class="form-select" id="shippingProvince" required autocomplete="address-level1" style="${CHECKOUT_INPUT_STYLE}">
                                        ${provinceSelectOptionsHtml()}
                                    </select>
                                </div>
                                <div class="mb-0">
                                    <label class="form-label" for="shippingPostalCode">Código postal</label>
                                    <input type="text" class="form-control" id="shippingPostalCode" required autocomplete="postal-code" inputmode="numeric" style="${CHECKOUT_INPUT_STYLE}">
                                </div>
                            </div>
                        </div>

                        <div id="checkoutStep3" class="volt-step-panel">
                            <h6 class="text-uppercase small mb-2" style="font-family:Teko,sans-serif;letter-spacing:0.1em;color:#c1121f;">Tu pedido</h6>
                            <ul class="volt-summary-list" id="checkoutSummaryItems"></ul>
                            <div class="volt-coupon" id="checkoutCouponBlock">
                                <label class="form-label" for="checkoutCouponInput">¿Tenés un cupón?</label>
                                <div class="volt-coupon__row">
                                    <input type="text" class="form-control" id="checkoutCouponInput" placeholder="Ej: VOLT20" autocomplete="off" style="${CHECKOUT_INPUT_STYLE}">
                                    <button type="button" class="btn btn-danger btn-sm" id="checkoutCouponApply">Aplicar</button>
                                    <button type="button" class="btn btn-outline-light btn-sm d-none" id="checkoutCouponRemove">Quitar</button>
                                </div>
                                <div class="volt-coupon__feedback" id="checkoutCouponFeedback" role="status"></div>
                            </div>
                            <h6 class="text-uppercase small mb-2" style="font-family:Teko,sans-serif;letter-spacing:0.1em;color:#c1121f;">Envío</h6>
                            <div class="volt-summary-ship" id="checkoutSummaryShipping"></div>
                            <div id="checkoutBankPanel" class="volt-bank-panel d-none">
                                <div class="volt-bank-panel__title">Datos para la transferencia</div>
                                <div class="volt-bank-panel__row"><span class="volt-bank-panel__key">Banco</span><span class="volt-bank-panel__val">${TRANSFER_BANK.banco}</span></div>
                                <div class="volt-bank-panel__row"><span class="volt-bank-panel__key">Cuenta</span><span class="volt-bank-panel__val">${TRANSFER_BANK.cuenta}</span></div>
                                <div class="volt-bank-panel__row"><span class="volt-bank-panel__key">CBU</span><span class="volt-bank-panel__val">${TRANSFER_BANK.cbu}</span></div>
                                <div class="volt-bank-panel__row"><span class="volt-bank-panel__key">Alias</span><span class="volt-bank-panel__val volt-bank-panel__alias">${TRANSFER_BANK.alias}</span></div>
                                <div class="volt-bank-panel__row"><span class="volt-bank-panel__key">Titular</span><span class="volt-bank-panel__val">${TRANSFER_BANK.titular}</span></div>
                                <div class="volt-bank-panel__row"><span class="volt-bank-panel__key">Documento</span><span class="volt-bank-panel__val">${TRANSFER_BANK.cuit}</span></div>
                                <p class="volt-bank-panel__note">Realizá la transferencia y envianos el comprobante por WhatsApp. Te confirmamos el pedido por email a la brevedad.</p>
                            </div>
                            <p class="volt-mp-trust" id="checkoutMpTrust">Pagos seguros. Mercado Pago procesa el cobro y la seguridad de tu transacción.</p>
                        </div>
                    </div>
                    <div class="modal-footer flex-wrap gap-2" style="border-top:1px solid #44464c;">
                        <button type="button" class="btn btn-outline-light btn-sm" data-bs-dismiss="modal">Cancelar</button>
                        <div class="ms-auto d-flex flex-wrap gap-2">
                            <button type="button" class="btn btn-outline-secondary btn-sm d-none" id="checkoutStepBack">Atrás</button>
                            <button type="button" class="btn btn-danger btn-sm" id="checkoutStepNext">Continuar</button>
                            <button type="button" class="btn btn-danger btn-sm d-none" id="customerDataConfirm">IR A PAGAR CON MERCADO PAGO</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        bindShippingCards(modal);
    }

    function getSavedCustomerData() {
        try {
            return JSON.parse(localStorage.getItem(CUSTOMER_STORAGE_KEY)) || {};
        } catch {
            return {};
        }
    }

    function setSavedCustomerData(data) {
        localStorage.setItem(
            CUSTOMER_STORAGE_KEY,
            JSON.stringify({
                name: data.name || "",
                dni: data.dni || "",
                phone: data.phone || "",
                email: data.email || "",
            })
        );
    }

    function getSelectedShippingOption(modalEl) {
        const card = modalEl.querySelector(".volt-ship-card.is-selected");
        if (!card) return null;
        const option = card.getAttribute("data-shipping");
        if (!option || !SHIPPING_OPTIONS.includes(option)) return null;
        return option;
    }

    function readAndreaniAddress(modalEl) {
        return {
            street: modalEl.querySelector("#shippingStreet")?.value.trim() || "",
            city: modalEl.querySelector("#shippingCity")?.value.trim() || "",
            province: modalEl.querySelector("#shippingProvince")?.value.trim() || "",
            postalCode: modalEl.querySelector("#shippingPostalCode")?.value.trim() || "",
        };
    }

    function validateAndreaniAddress(address) {
        if (!address.street) return "Completá calle y número.";
        if (!address.city) return "Completá ciudad.";
        if (!address.province) return "Elegí provincia.";
        if (!address.postalCode) return "Completá código postal.";
        return null;
    }

    function clearAndreaniAddressFields(modalEl) {
        const street = modalEl.querySelector("#shippingStreet");
        const city = modalEl.querySelector("#shippingCity");
        const province = modalEl.querySelector("#shippingProvince");
        const postal = modalEl.querySelector("#shippingPostalCode");
        if (street) street.value = "";
        if (city) city.value = "";
        if (province) province.value = "";
        if (postal) postal.value = "";
    }

    function updateShippingFieldVisibility(modalEl) {
        const isAndreani = getSelectedShippingOption(modalEl) === "andreani";
        const note = modalEl.querySelector("#shippingAndreaniNote");
        const form = modalEl.querySelector("#andreaniAddressForm");
        if (note) note.classList.toggle("d-none", !isAndreani);
        if (form) form.classList.toggle("d-none", !isAndreani);
    }

    function bindShippingCards(modalEl) {
        modalEl.querySelectorAll(".volt-ship-card[data-shipping]").forEach((btn) => {
            btn.addEventListener("click", () => {
                modalEl.querySelectorAll(".volt-ship-card").forEach((b) => {
                    b.classList.remove("is-selected");
                    b.setAttribute("aria-pressed", "false");
                });
                btn.classList.add("is-selected");
                btn.setAttribute("aria-pressed", "true");
                updateShippingFieldVisibility(modalEl);
            });
        });
    }

    function formatMoney(n) {
        return `$${Number(n || 0).toLocaleString("es-AR")}`;
    }

    function normalizeCouponCode(code) {
        return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    }

    function couponValidity(data, now = new Date()) {
        if (!data) return { valid: false, reason: "No encontramos ese cupón." };
        if (data.active !== true) return { valid: false, reason: "Ese cupón no está activo." };
        const percent = Number(data.percent);
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
            return { valid: false, reason: "Cupón inválido." };
        }
        if (data.expiresAt) {
            const exp = typeof data.expiresAt.toDate === "function"
                ? data.expiresAt.toDate()
                : new Date(data.expiresAt);
            if (exp && !Number.isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) {
                return { valid: false, reason: "Ese cupón está vencido." };
            }
        }
        return { valid: true, percent };
    }

    function renderSummary(modalEl, cart, customer, shippingState, mode = 'mp') {
        const itemsEl = modalEl.querySelector("#checkoutSummaryItems");
        const shipEl = modalEl.querySelector("#checkoutSummaryShipping");
        const bankEl = modalEl.querySelector("#checkoutBankPanel");
        if (!itemsEl || !shipEl) return;

        const option = shippingState.shippingOption;
        const productsTotal = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
        const shippingCost = option === "cordoba" ? SHIPPING_CONFIG.cordoba.cost : SHIPPING_CONFIG.andreani.cost;
        const subtotal = productsTotal + shippingCost;

        const productLines = cart
            .map((item) => {
                const title = item.title || "Producto";
                const qty = item.quantity || 1;
                const line = formatMoney(item.price * qty);
                const bits = [];
                if (item.variantSize) bits.push(`Talle: ${item.variantSize}`);
                if (item.variantColor) bits.push(`Color: ${item.variantColor}`);
                const sub = bits.length ? ` · ${bits.join(" · ")}` : "";
                return `<li><span>${title}${sub} ×${qty}</span><span>${line}</span></li>`;
            })
            .join("");

        const shippingLine =
            option === "cordoba"
                ? `<li><span>Envío ${SHIPPING_CONFIG.cordoba.label}</span><span>${formatMoney(SHIPPING_CONFIG.cordoba.cost)}</span></li>`
                : "";

        let extraLines = "";
        if (option === "andreani") {
            extraLines += `<li style="font-size:0.78rem;color:#888;font-weight:normal;padding-top:0.35rem;border-bottom:none;"><span>Envío interior — A coordinar</span></li>`;
        }

        let totalLine;
        if (_couponAplicado) {
            const percent = _couponAplicado.percent;
            const discountAmount = mode === 'transfer'
                ? Math.round(productsTotal * percent / 100)
                : productsTotal - cart.reduce((sum, item) =>
                    sum + Math.round((item.price || 0) * (100 - percent) / 100) * (item.quantity || 1), 0);
            const finalTotal = subtotal - discountAmount;
            const totalLabel = mode === 'transfer' ? 'Total a transferir' : 'Total';
            totalLine =
                `<li><span>Subtotal</span><span>${formatMoney(subtotal)}</span></li>` +
                `<li class="volt-summary-discount"><span>Cupón ${_couponAplicado.code} (−${_couponAplicado.percent}%)</span><span>−${formatMoney(discountAmount)}</span></li>` +
                `<li class="volt-summary-total-transfer"><span><strong>${totalLabel}</strong></span><span><strong>${formatMoney(finalTotal)}</strong></span></li>`;
        } else if (mode === 'transfer') {
            const discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT);
            const finalTotal = subtotal - discountAmount;
            totalLine =
                `<li><span>Subtotal</span><span>${formatMoney(subtotal)}</span></li>` +
                `<li class="volt-summary-discount"><span>Descuento transferencia (−10%)</span><span>−${formatMoney(discountAmount)}</span></li>` +
                `<li class="volt-summary-total-transfer"><span><strong>Total a transferir</strong></span><span><strong>${formatMoney(finalTotal)}</strong></span></li>`;
        } else {
            totalLine = `<li><span><strong>Total</strong></span><span><strong>${formatMoney(subtotal)}</strong></span></li>`;
        }

        itemsEl.innerHTML = productLines + shippingLine + totalLine + extraLines;

        if (bankEl) bankEl.classList.toggle('d-none', mode !== 'transfer');

        const trustEl = modalEl.querySelector("#checkoutMpTrust");
        if (trustEl) trustEl.classList.toggle('d-none', mode !== 'mp');

        const methodLabel = SHIPPING_LABELS[option] || option;
        let shipText = `${methodLabel}\n`;
        if (option === "cordoba") {
            shipText += `Costo fijo de envío: ${formatMoney(SHIPPING_CONFIG.cordoba.cost)}${mode === 'mp' ? ' (incluido en el total de Mercado Pago)' : ''}.\n`;
        } else if (option === "andreani") {
            shipText += "El costo de envío se coordina por WhatsApp según tu destino.\n";
            const addr = shippingState.address;
            if (addr) {
                shipText += `\nDirección:\n${addr.street}\n${addr.city}, ${addr.province}\nCP ${addr.postalCode}\n`;
            }
        }
        shipText += `\n\nContacto: ${customer.name} · DNI ${customer.dni} · ${customer.phone} · ${customer.email}`;
        shipEl.textContent = shipText;
    }

    /**
     * @param {Array} cart
     * @param {object} customer
     * @param {object} shippingState
     * @param {{orderId?: string, total?: number, subtotal?: number, discountAmount?: number}} [serverTotals]
     *   Si vienen totales del backend, se usan en el mensaje (preferido). Si no, se recalculan localmente.
     */
    function buildTransferWaUrl(cart, customer, shippingState, serverTotals = {}) {
        const option = shippingState.shippingOption;
        const productsTotal = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
        const shippingCost = option === "cordoba" ? SHIPPING_CONFIG.cordoba.cost : 0;
        const localSubtotal = productsTotal + shippingCost;
        const localDiscount = Math.round(localSubtotal * TRANSFER_DISCOUNT);
        const localFinal = localSubtotal - localDiscount;

        const subtotal = Number.isFinite(serverTotals.subtotal) ? serverTotals.subtotal : localSubtotal;
        const discountAmount = Number.isFinite(serverTotals.discountAmount) ? serverTotals.discountAmount : localDiscount;
        const finalTotal = Number.isFinite(serverTotals.total) ? serverTotals.total : localFinal;
        const orderId = serverTotals.orderId ? String(serverTotals.orderId).trim() : '';

        const itemLines = cart.map((item) => {
            const bits = [];
            if (item.variantSize) bits.push(`Talle ${item.variantSize}`);
            if (item.variantColor) bits.push(item.variantColor);
            const sub = bits.length ? ` (${bits.join(', ')})` : '';
            return `• ${item.title || 'Producto'}${sub} ×${item.quantity || 1} — ${formatMoney((item.price || 0) * (item.quantity || 1))}`;
        }).join('\n');

        let shipInfo;
        if (option === "cordoba") {
            shipInfo = `${SHIPPING_CONFIG.cordoba.label} — ${formatMoney(SHIPPING_CONFIG.cordoba.cost)}`;
        } else {
            const addr = shippingState.address || {};
            shipInfo = `Andreani/OCA — ${addr.street || ''}, ${addr.city || ''}, ${addr.province || ''} CP ${addr.postalCode || ''}`;
        }

        const header = orderId
            ? `¡Hola VOLT! Confirmo mi pedido por transferencia. *Orden #${orderId}*.`
            : '¡Hola VOLT! Quiero confirmar mi pedido por transferencia.';

        const msg = [
            header,
            '',
            '*PRODUCTOS:*',
            itemLines,
            '',
            `*Envío:* ${shipInfo}`,
            '',
            `*Subtotal:* ${formatMoney(subtotal)}`,
            serverTotals.discountSource === 'coupon'
                ? `*Descuento cupón ${serverTotals.coupon} (${serverTotals.discountPercent}%):* −${formatMoney(discountAmount)}`
                : `*Descuento 10% transferencia:* −${formatMoney(discountAmount)}`,
            `*TOTAL A TRANSFERIR: ${formatMoney(finalTotal)}*`,
            '',
            '*MIS DATOS:*',
            `${customer.name} · DNI ${customer.dni} · ${customer.phone} · ${customer.email}`,
            '',
            'Adjunto el comprobante de transferencia.',
        ].join('\n');

        return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    }

    /**
     * Paso 2 → 3: lee `.volt-ship-card.is-selected`, arma objeto y guarda en _shippingConfirmado.
     * @returns {object|null}
     */
    function confirmShippingStep2(modalEl) {
        const option = getSelectedShippingOption(modalEl);
        if (!option) {
            alert("Elegí una opción de envío.");
            return null;
        }
        const result = { shippingOption: option };
        if (option === "andreani") {
            const address = readAndreaniAddress(modalEl);
            const addressError = validateAndreaniAddress(address);
            if (addressError) {
                alert(addressError);
                return null;
            }
            result.address = address;
        }
        return result;
    }

    /**
     * @param {Array} cart — ítems del carrito local
     * @param {{ mode: 'mp' | 'transfer' }} [options]
     * @returns {Promise<{customer: object, shippingOption: string} | null>}
     */
    function askCheckoutData(cart, options = {}) {
        const mode = options.mode || 'mp';
        createCustomerModal();
        const modalEl = document.getElementById("customerDataModal");

        _shippingConfirmado = null;
        _couponAplicado = null;
        const couponInputReset = modalEl.querySelector("#checkoutCouponInput");
        const couponFeedbackReset = modalEl.querySelector("#checkoutCouponFeedback");
        const couponRemoveReset = modalEl.querySelector("#checkoutCouponRemove");
        if (couponInputReset) couponInputReset.value = "";
        if (couponFeedbackReset) { couponFeedbackReset.textContent = ""; couponFeedbackReset.className = "volt-coupon__feedback"; }
        if (couponRemoveReset) couponRemoveReset.classList.add("d-none");

        const saved = getSavedCustomerData();
        const authUser = window.VoltStoreAuth?.getCurrentUser();
        modalEl.querySelector("#customerName").value = saved.name || authUser?.displayName || "";
        modalEl.querySelector("#customerDni").value = saved.dni || "";
        modalEl.querySelector("#customerEmail").value = saved.email || authUser?.email || "";
        modalEl.querySelector("#customerPhone").value = saved.phone || "";

        modalEl.querySelectorAll(".volt-ship-card").forEach((b) => {
            b.classList.remove("is-selected");
            b.setAttribute("aria-pressed", "false");
        });
        clearAndreaniAddressFields(modalEl);
        updateShippingFieldVisibility(modalEl);

        let currentStep = 1;
        const fillEl = modalEl.querySelector("#checkoutStepperFill");
        const indicators = modalEl.querySelectorAll("[data-step-indicator]");
        const stepPanels = [
            modalEl.querySelector("#checkoutStep1"),
            modalEl.querySelector("#checkoutStep2"),
            modalEl.querySelector("#checkoutStep3"),
        ];
        const btnBack = modalEl.querySelector("#checkoutStepBack");
        const btnNext = modalEl.querySelector("#checkoutStepNext");
        const btnPay = modalEl.querySelector("#customerDataConfirm");

        function setStepperUI() {
            const pct = currentStep === 1 ? "0%" : currentStep === 2 ? "50%" : "100%";
            if (fillEl) fillEl.style.width = pct;
            indicators.forEach((ind) => {
                const n = Number(ind.getAttribute("data-step-indicator"));
                ind.classList.remove("is-active", "is-done");
                if (n < currentStep) ind.classList.add("is-done");
                if (n === currentStep) ind.classList.add("is-active");
            });
            stepPanels.forEach((panel, i) => {
                if (!panel) return;
                panel.classList.toggle("is-visible", i + 1 === currentStep);
            });
            btnBack.classList.toggle("d-none", currentStep === 1);
            btnNext.classList.toggle("d-none", currentStep === 3);
            btnPay.classList.toggle("d-none", currentStep !== 3);
        }

        currentStep = 1;
        setStepperUI();
        btnPay.textContent = mode === 'transfer' ? 'CONFIRMAR Y ENVIAR COMPROBANTE' : 'IR A PAGAR CON MERCADO PAGO';

        return new Promise((resolve) => {
            const modal = new bootstrap.Modal(modalEl);
            let settled = false;

            const finish = (payload) => {
                if (settled) return;
                settled = true;
                cleanup();
                modal.hide();
                resolve(payload);
            };

            const cleanup = () => {
                btnNext.removeEventListener("click", onNext);
                btnBack.removeEventListener("click", onBack);
                btnPay.removeEventListener("click", onPay);
                modalEl.removeEventListener("hidden.bs.modal", onHidden);
                couponApplyBtn.removeEventListener("click", onCouponApply);
                couponRemoveBtn.removeEventListener("click", onCouponRemove);
            };

            const onHidden = () => {
                if (!settled) {
                    _shippingConfirmado = null;
                    finish(null);
                }
            };

            const couponInput = modalEl.querySelector("#checkoutCouponInput");
            const couponApplyBtn = modalEl.querySelector("#checkoutCouponApply");
            const couponRemoveBtn = modalEl.querySelector("#checkoutCouponRemove");
            const couponFeedback = modalEl.querySelector("#checkoutCouponFeedback");

            const setCouponFeedback = (msg, ok) => {
                couponFeedback.textContent = msg || "";
                couponFeedback.classList.toggle("is-ok", ok === true && !!msg);
                couponFeedback.classList.toggle("is-error", ok === false && !!msg);
            };

            const rerenderSummaryNow = () => {
                if (!_shippingConfirmado) return;
                const customer = {
                    name: modalEl.querySelector("#customerName").value.trim(),
                    dni: modalEl.querySelector("#customerDni").value.trim(),
                    phone: modalEl.querySelector("#customerPhone").value.trim(),
                    email: modalEl.querySelector("#customerEmail").value.trim(),
                };
                renderSummary(modalEl, cart, customer, _shippingConfirmado, mode);
            };

            const onCouponApply = async () => {
                const code = normalizeCouponCode(couponInput.value);
                if (!code) { setCouponFeedback("Ingresá un código.", false); return; }
                couponApplyBtn.disabled = true;
                setCouponFeedback("Validando…", "pending");
                try {
                    const snap = await firebase.firestore().collection('coupons').doc(code).get();
                    const data = snap.exists ? snap.data() : null;
                    const res = couponValidity(data);
                    if (!res.valid) {
                        _couponAplicado = null;
                        couponRemoveBtn.classList.add("d-none");
                        setCouponFeedback(res.reason, false);
                    } else {
                        _couponAplicado = { code: data.code || code, percent: res.percent };
                        couponRemoveBtn.classList.remove("d-none");
                        setCouponFeedback(`Cupón ${_couponAplicado.code} aplicado: ${res.percent}% off en productos.`, true);
                    }
                } catch (e) {
                    _couponAplicado = null;
                    couponRemoveBtn.classList.add("d-none");
                    setCouponFeedback("No se pudo validar el cupón. Probá de nuevo.", false);
                } finally {
                    couponApplyBtn.disabled = false;
                    rerenderSummaryNow();
                }
            };

            const onCouponRemove = () => {
                _couponAplicado = null;
                couponInput.value = "";
                couponRemoveBtn.classList.add("d-none");
                setCouponFeedback("", false);
                rerenderSummaryNow();
            };

            const onBack = () => {
                if (currentStep > 1) {
                    if (currentStep === 3) _shippingConfirmado = null;
                    currentStep -= 1;
                    setStepperUI();
                }
            };

            const onNext = () => {
                if (currentStep === 1) {
                    const customer = {
                        name: modalEl.querySelector("#customerName").value.trim(),
                        dni: modalEl.querySelector("#customerDni").value.trim(),
                        phone: modalEl.querySelector("#customerPhone").value.trim(),
                        email: modalEl.querySelector("#customerEmail").value.trim(),
                    };
                    if (!customer.name) { alert("Completá tu nombre y apellido."); return; }
                    if (!validateDni(customer.dni)) { alert("El DNI debe tener 7 u 8 dígitos numéricos, sin puntos ni espacios."); return; }
                    if (!customer.phone) { alert("Completá tu teléfono."); return; }
                    if (!customer.email || !customer.email.includes("@")) { alert("Completá un email válido."); return; }
                    setSavedCustomerData(customer);
                    currentStep = 2;
                    setStepperUI();
                    return;
                }
                if (currentStep === 2) {
                    const shipping = confirmShippingStep2(modalEl);
                    if (!shipping) return;
                    _shippingConfirmado = shipping;
                    const customer = {
                        name: modalEl.querySelector("#customerName").value.trim(),
                        dni: modalEl.querySelector("#customerDni").value.trim(),
                        phone: modalEl.querySelector("#customerPhone").value.trim(),
                        email: modalEl.querySelector("#customerEmail").value.trim(),
                    };
                    renderSummary(modalEl, cart, customer, _shippingConfirmado, mode);
                    currentStep = 3;
                    setStepperUI();
                }
            };

            const onPay = () => {
                const shippingOption = _shippingConfirmado?.shippingOption;
                if (!shippingOption || !SHIPPING_OPTIONS.includes(shippingOption)) {
                    alert("Por favor volvé al paso 2 y elegí una opción de envío.");
                    currentStep = 2;
                    setStepperUI();
                    return;
                }

                if (shippingOption === "andreani") {
                    const address = _shippingConfirmado?.address;
                    const addressError = validateAndreaniAddress(address || {});
                    if (addressError) {
                        alert(addressError);
                        currentStep = 2;
                        setStepperUI();
                        return;
                    }
                }

                const customer = {
                    name: modalEl.querySelector("#customerName").value.trim(),
                    dni: modalEl.querySelector("#customerDni").value.trim(),
                    phone: modalEl.querySelector("#customerPhone").value.trim(),
                    email: modalEl.querySelector("#customerEmail").value.trim(),
                };
                if (!customer.name || !customer.email || !customer.phone || !validateDni(customer.dni)) {
                    alert("Completá tus datos personales.");
                    currentStep = 1;
                    setStepperUI();
                    return;
                }

                setSavedCustomerData(customer);

                const payload = { customer, shippingOption };
                if (shippingOption === "andreani" && _shippingConfirmado?.address) {
                    payload.shipping = {
                        type: "andreani",
                        address: _shippingConfirmado.address,
                    };
                }
                payload.couponCode = _couponAplicado?.code || null;
                _shippingConfirmado = null;
                finish(payload);
            };

            btnNext.addEventListener("click", onNext);
            btnBack.addEventListener("click", onBack);
            btnPay.addEventListener("click", onPay);
            couponApplyBtn.addEventListener("click", onCouponApply);
            couponRemoveBtn.addEventListener("click", onCouponRemove);
            modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });
            modal.show();
        });
    }

    checkoutBtn.addEventListener("click", async function () {
        if (checkoutFlowActive) return;

        let cart;
        try {
            cart = JSON.parse(localStorage.getItem("cart")) || [];
        } catch {
            alert("Tu carrito tiene un error, por favor recargá la página");
            return;
        }

        if (cart.length === 0) {
            alert("El carrito está vacío.");
            return;
        }

        if (window.VoltStoreAuth) {
            const user = await window.VoltStoreAuth.requireAuth();
            if (!user) return;
        }

        checkoutFlowActive = true;
        const originalText = checkoutBtn.innerHTML;
        checkoutBtn.innerHTML = "Generando link de pago...";
        checkoutBtn.disabled = true;

        try {
            const result = await askCheckoutData(cart, { mode: 'mp' });
            if (!result) {
                checkoutFlowActive = false;
                checkoutBtn.innerHTML = originalText;
                checkoutBtn.disabled = false;
                return;
            }
            const { customer, shippingOption, shipping, couponCode } = result;

            const missingId = cart.find((item) => !item.id);
            if (missingId) {
                throw new Error(
                    "Un producto del carrito no tiene id. Volvé al shop, vaciá el carrito y agregá los productos de nuevo."
                );
            }

            const items = cart.map((item) => ({
                id: item.id,
                title: item.title,
                quantity: item.quantity,
                price: item.price,
                variantColor: item.variantColor || "",
                variantSize: item.variantSize || "",
            }));

            // Córdoba: create-preference suma shippingCost y línea MP desde SHIPPING_CONFIG
            const postBody = {
                items,
                customer,
                shippingOption,
            };
            if (shipping?.address) {
                postBody.shipping = shipping;
            }
            if (couponCode) postBody.couponCode = couponCode;

            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postBody),
            });

            const data = await response.json();

            if (data.error) {
                console.log("📋 Detalles del error:", JSON.stringify(data, null, 2));
                throw new Error(data.error + (data.details ? " — " + data.details : ""));
            }

            const payUrl = data.init_point;

            if (!payUrl) {
                throw new Error(
                    "El servidor no devolvió el link de pago (init_point). Revisá MP_ACCESS_TOKEN y la respuesta de la API."
                );
            }
            if (!data.orderId) {
                throw new Error("El servidor no devolvió orderId para seguimiento de la orden.");
            }

            localStorage.setItem("volt_current_order", data.orderId);

            const uid = firebase.auth().currentUser?.uid;
            if (window.VoltCartSync) {
                await window.VoltCartSync.clearFirestore(uid);
                window.VoltCartSync.clearLocal();
            }

            window.location.href = payUrl;
        } catch (error) {
            console.error("❌ Error al iniciar el pago:", error);
            alert("Error al generar el pago: " + error.message);
            checkoutFlowActive = false;
            checkoutBtn.innerHTML = originalText;
            checkoutBtn.disabled = false;
        }
    });

    // ── Transferencia bancaria ─────────────────────────────
    const transferBtn = document.getElementById("transfer-btn");
    if (transferBtn) {
        const originalTransferText = transferBtn.innerHTML;

        transferBtn.addEventListener("click", async function () {
            if (checkoutFlowActive) return;

            let cart;
            try {
                cart = JSON.parse(localStorage.getItem("cart")) || [];
            } catch {
                alert("Tu carrito tiene un error, por favor recargá la página");
                return;
            }

            if (cart.length === 0) {
                alert("El carrito está vacío.");
                return;
            }

            if (window.VoltStoreAuth) {
                const user = await window.VoltStoreAuth.requireAuth();
                if (!user) return;
            }

            checkoutFlowActive = true;
            transferBtn.disabled = true;

            try {
                const result = await askCheckoutData(cart, { mode: 'transfer' });
                if (!result) return;

                const { customer, shippingOption, shipping, couponCode } = result;

                const missingId = cart.find((item) => !item.id);
                if (missingId) {
                    throw new Error(
                        "Un producto del carrito no tiene id. Volvé al shop, vaciá el carrito y agregá los productos de nuevo."
                    );
                }

                const items = cart.map((item) => ({
                    id: item.id,
                    title: item.title,
                    quantity: item.quantity,
                    price: item.price,
                    variantColor: item.variantColor || "",
                    variantSize: item.variantSize || "",
                }));

                transferBtn.innerHTML = "Generando orden...";

                const postBody = { items, customer, shippingOption };
                if (shipping?.address) postBody.shipping = shipping;
                if (couponCode) postBody.couponCode = couponCode;

                const response = await fetch(TRANSFER_API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(postBody),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok || data.error) {
                    throw new Error((data.error || `HTTP ${response.status}`) + (data.details ? " — " + data.details : ""));
                }

                if (!data.orderId) {
                    throw new Error("El servidor no devolvió orderId para seguimiento de la orden.");
                }

                localStorage.setItem("volt_current_order", data.orderId);

                const shippingState = {
                    shippingOption,
                    address: shipping?.address,
                };

                const waUrl = buildTransferWaUrl(cart, customer, shippingState, {
                    orderId: data.orderId,
                    subtotal: data.subtotal,
                    discountAmount: data.discountAmount,
                    total: data.total,
                    discountSource: data.discountSource,
                    coupon: data.coupon,
                    discountPercent: data.discountPercent,
                });

                const uid = firebase.auth().currentUser?.uid;
                if (window.VoltCartSync) {
                    await window.VoltCartSync.clearFirestore(uid);
                    window.VoltCartSync.clearLocal();
                }

                window.open(waUrl, '_blank');
            } catch (error) {
                console.error("❌ Error en flujo transferencia:", error);
                alert("Error al generar la orden: " + error.message);
            } finally {
                checkoutFlowActive = false;
                transferBtn.disabled = false;
                transferBtn.innerHTML = originalTransferText;
            }
        });
    }
});
