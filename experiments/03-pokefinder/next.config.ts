import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PokéAPI のスプライト（raw.githubusercontent.com 上の PNG）を next/image でなく素の <img> で出すので
  // images 設定は不要。CSP も張らない（実験用）。
};

export default nextConfig;
