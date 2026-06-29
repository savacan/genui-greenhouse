import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artfinder — genui-greenhouse",
  description:
    "Generative UI 実験04: LLM が双方向の入力フォームを組み、操作 → サーバが上流(AIC)クエリ言語へ翻訳 → 作品ボードを live 更新する（役割反転・別題材）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
