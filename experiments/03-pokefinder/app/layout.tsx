import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pokéfinder — genui-greenhouse",
  description: "Generative UI 実験03: LLM が双方向の入力フォームを組み、操作 → サーバ計算 → 結果ボードを回す",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
