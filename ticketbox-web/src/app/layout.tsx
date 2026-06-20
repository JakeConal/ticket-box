import type { Metadata } from "next";
import "./globals.css";
import { MusicBackdrop } from "../components/music-backdrop";

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
      <body className="min-w-80 bg-white font-sans text-neutral-950 antialiased">
        <MusicBackdrop />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
