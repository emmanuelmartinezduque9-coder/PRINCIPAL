import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas las pantallas leen datos en vivo desde el cliente: modelo dinámico clásico.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
