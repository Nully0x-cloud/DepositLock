import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://depositlock.example"),
  title: {
    default: "DepositLock — Rental deposit protection",
    template: "%s · DepositLock",
  },
  description:
    "DepositLock protects rental deposits in a neutral account where neither tenant nor landlord controls the money alone.",
  openGraph: {
    title: "DepositLock — Rental deposit protection",
    description:
      "A neutral record for rental deposits, move-in evidence and agreed settlement.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f2ea",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
