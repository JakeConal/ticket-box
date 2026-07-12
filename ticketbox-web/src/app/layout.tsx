import type { Metadata } from "next";
import "./globals.css";
import { MusicBackdrop } from "../components/music-backdrop";
import { NotificationListener } from "../components/notification-listener";
import { PageTransition } from "../components/page-transition";

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
        <NotificationListener />
        <div className="relative z-10">
          <PageTransition>{children}</PageTransition>
        </div>
      </body>
    </html>
  );
}
