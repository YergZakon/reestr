import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Реестр обязательных требований",
  description: "Реестр обязательных требований к предпринимательской деятельности. Министерство национальной экономики Республики Казахстан",
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
