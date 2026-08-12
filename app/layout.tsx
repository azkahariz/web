import type { Metadata } from "next";
import AppFeedbackProvider from "./components/AppFeedback";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aloptama Collect",
  description: "Pendataan Metadata dan Inventaris Aloptama",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body><AppFeedbackProvider>{children}</AppFeedbackProvider></body>
    </html>
  );
}
