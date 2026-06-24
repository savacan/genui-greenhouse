import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Space Cockpit — genui-greenhouse",
  description: "Generative UI 実験: 自然言語の問いで宇宙データの探索ダッシュボードが組み変わる",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
