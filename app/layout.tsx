import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#D4A017",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "BWIAA 2026 — National Alumni Portal",
  description:
    "The official home of the Booker Washington Institute Alumni Association. Vote, stay connected, and make an impact.",
  applicationName: "BWIAA 2026",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BWIAA 2026",
  },

  formatDetection: {
    telephone: false,
  },

  openGraph: {
    type: "website",
    siteName: "BWIAA 2026",
    title: "BWIAA 2026 — National Alumni Portal",
    description:
      "One Legacy. One Family. One Future. — Official BWIAA Election & Member Portal",
  },

  icons: {
    icon: [
      { url: "/icons/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icons/web-app-manifest-192x192.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/web-app-manifest-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BWIAA 2026" />
      </head>
      <body>{children}</body>
    </html>
  );
}
