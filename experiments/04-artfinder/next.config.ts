import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AIC の作品画像（IIIF: www.artic.edu/iiif/2 上の JPG）は next/image でなく素の <img> で出すので
  // images 設定は不要。画像ホストは Cloudflare の managed challenge 裏にあり、サーバ fetch は 403 になるが
  // ユーザーのブラウザは <img> サブリソースとして普通に描画する（docs/artfinder.md §2 参照）。CSP も張らない（実験用）。
};

export default nextConfig;
