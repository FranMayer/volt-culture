/**
 * lib/admin/upload-client.ts — sube imágenes a Cloudinary vía el endpoint
 * firmado pages/api/admin-upload.js, y dispara la revalidación ISR de F5.
 * Port de legacy/js/admin-products.js: compressImage() (líneas 273-302) +
 * uploadImageToCloudinary() (304-332). Browser-only (canvas/
 * createImageBitmap/fetch) — por eso no vive en lib/admin/product-form.js
 * (esa sí es testeable con `node` plano; ver tests/admin-product-form.test.mjs).
 */
"use client";

/**
 * Redimensiona/recomprime la imagen en el navegador para no chocar con el
 * límite de Cloudinary y aligerar la tienda. Devuelve un File JPG; si algo
 * falla o el archivo ya es más chico comprimido, cae al original.
 */
export async function compressImage(
    file: File,
    { maxDimension = 2000, quality = 0.85 }: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob || blob.size >= file.size) return file;

        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg" });
    } catch (err) {
        console.warn("No se pudo comprimir la imagen, se sube el original:", err);
        return file;
    }
}

interface CloudinarySignResponse {
    signature: string;
    timestamp: number;
    cloudName: string;
    apiKey: string;
    params: Record<string, string | number>;
}

/** Sube un File a Cloudinary usando la firma de pages/api/admin-upload.js. Devuelve la secure_url. */
export async function uploadImageToCloudinary(file: File, idToken: string): Promise<string> {
    const signResp = await fetch("/api/admin-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!signResp.ok) {
        const err = await signResp.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${signResp.status}`);
    }
    const { cloudName, apiKey, signature, params: signedParams }: CloudinarySignResponse = await signResp.json();

    const formData = new FormData();
    const orderedKeys = Object.keys(signedParams || {}).sort();
    for (const key of orderedKeys) {
        formData.append(key, String(signedParams[key]));
    }
    formData.append("api_key", apiKey);
    formData.append("signature", signature);
    formData.append("file", file);

    const uploadResp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
    });
    const data = await uploadResp.json();
    if (data.secure_url) return data.secure_url;
    throw new Error(data.error?.message || "Upload failed");
}

/**
 * POST /api/revalidate (F5) — reemplaza legacy triggerRedeploy() (deploy hook
 * completo + debounce de 10s). revalidatePath es instantáneo y barato, así
 * que acá se llama directo tras cada mutación, sin debounce. Best-effort: un
 * fallo no debe romper el guardado del producto (ya persistido en Firestore),
 * solo demora que el catálogo/producto/home lo reflejen.
 */
export async function postRevalidate(idToken: string, slug?: string): Promise<void> {
    try {
        await fetch("/api/revalidate", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify(slug ? { slug } : {}),
        });
    } catch (err) {
        console.warn("[admin] No se pudo revalidar:", err);
    }
}
