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
    ];
  },
};

export default nextConfig;
