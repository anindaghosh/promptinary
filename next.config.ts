import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google/genai", "google-auth-library"],
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    "@google-cloud/vertexai",
    "google-auth-library",
  ],
};

export default nextConfig;
