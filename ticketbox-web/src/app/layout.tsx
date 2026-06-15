import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TicketBox",
  description: "Concert ticketing platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
