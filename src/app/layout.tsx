import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Реестр требований НПА — Экспертная оценка",
  description: "Система экспертной оценки обязательных требований НПА в сфере земельных отношений",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
