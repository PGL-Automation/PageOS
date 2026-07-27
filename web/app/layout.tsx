import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PageOS",
  description: "Page Group operating system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
