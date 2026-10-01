import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parent folder holds an unrelated project with its own lockfile; pin the root here.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
