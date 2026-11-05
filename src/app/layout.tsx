import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventário Lootea",
  description: "Painel interno de perfis e Business Managers.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
