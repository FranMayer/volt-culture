"use client";

import { useEffect } from "react";

// Ported from legacy/js/admin-access.js — typing "admin" anywhere on the
// page (outside inputs/textareas) shows the "ACCESS GRANTED" overlay and
// redirects. Kept as direct DOM manipulation (not React state) since it's a
// self-contained one-shot visual effect, same spirit as the original.
// Legacy branched the target path on `/pages/` subfolder (`../admin/panel.html`
// vs `/admin/panel.html`); Next.js has a single `/admin` route (F9), so that
// branch is gone — ponytail: dead weight once routing is flat.
const SECRET_CODE = "admin";

export default function AdminAccessEasterEgg() {
    useEffect(() => {
        let typedKeys = "";
        let timeout: ReturnType<typeof setTimeout>;

        function showAccessGranted() {
            const overlay = document.createElement("div");
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(10, 10, 10, 0.95); display: flex;
                align-items: center; justify-content: center; z-index: 99999;
                animation: fadeIn 0.3s ease;
            `;
            overlay.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-family: 'Bebas Neue', sans-serif; font-size: 3rem; color: #C1121F; letter-spacing: 0.2em; animation: glitch 0.5s ease;">⚡ ACCESO AUTORIZADO</div>
                    <div style="color: rgba(255,255,255,0.5); margin-top: 1rem; font-size: 0.9rem; letter-spacing: 0.1em;">Redirigiendo al panel...</div>
                </div>
            `;
            const style = document.createElement("style");
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes glitch {
                    0%, 100% { transform: translate(0); }
                    20% { transform: translate(-2px, 2px); }
                    40% { transform: translate(2px, -2px); }
                    60% { transform: translate(-2px, -2px); }
                    80% { transform: translate(2px, 2px); }
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);

            setTimeout(() => {
                window.location.href = "/admin";
            }, 800);
        }

        function onKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
            if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;

            typedKeys += e.key.toLowerCase();
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                typedKeys = "";
            }, 2000);

            if (typedKeys.length > SECRET_CODE.length) {
                typedKeys = typedKeys.slice(-SECRET_CODE.length);
            }
            if (typedKeys === SECRET_CODE) {
                typedKeys = "";
                showAccessGranted();
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            clearTimeout(timeout);
        };
    }, []);

    return null;
}
