import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    "@google-cloud/vertexai",
    "google-auth-library",
  ],
};

export default nextConfig;
