import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "aftershock — genui-greenhouse",
  description:
    "Generative UI 実験02: agentic ループ（multi-step tool loop）とデータファイアウォールの緊張点を地震モニタで掴む",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
