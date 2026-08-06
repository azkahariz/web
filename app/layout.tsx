import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IRM Collect",
  description: "Pendataan lokal barang terpasang per stasiun dan site.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
