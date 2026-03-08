import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google/genai", "google-auth-library"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
