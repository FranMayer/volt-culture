import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  eslint: {
    // ponytail: no ESLint config yet, revisit if/when the project adds one
    ignoreDuringBuilds: true,
  },
  // Silences the "multiple lockfiles" warning caused by a stray
  // package-lock.json in the user's home dir outside this repo.
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      {
        source: "/pages/catalogo.html",
        destination: "/catalogo",
        permanent: true,
      },
      {
        source: "/producto/:slug.html",
        destination: "/producto/:slug",
        permanent: true,
      },
      {
        source: "/index.html",
        destination: "/",
        permanent: true,
      },
      // F7 — back_urls exactas que manda pages/api/create-preference.js
      // (sin tocar ese endpoint): /pages/{success,pending,failure}.html.
      // Cubre preferencias de MP creadas antes Y después de este redirect,
      // ya que create-preference.js sigue emitiendo el path .html tal cual.
      {
        source: "/pages/success.html",
        destination: "/success",
        permanent: true,
      },
      {
        source: "/pages/pending.html",
        destination: "/pending",
        permanent: true,
      },
      {
        source: "/pages/failure.html",
        destination: "/failure",
        permanent: true,
      },
      // F8 — páginas estáticas
      {
        source: "/pages/about.html",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/pages/envios.html",
        destination: "/envios",
        permanent: true,
      },
      {
        source: "/pages/novedades.html",
        destination: "/novedades",
        permanent: true,
      },
      {
        source: "/pages/mis-pedidos.html",
        destination: "/mis-pedidos",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
