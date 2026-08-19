import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { BauhausBackdrop } from "../components/bauhaus-backdrop";
import { NotificationListener } from "../components/notification-listener";
import { PageTransition } from "../components/page-transition";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap"
});

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
      <body className={`${outfit.className} min-w-80 bg-canvas font-sans text-ink antialiased`}>
        <BauhausBackdrop />
        <NotificationListener />
        <div className="relative z-10">
          <PageTransition>{children}</PageTransition>
        </div>
      </body>
    </html>
  );
}
