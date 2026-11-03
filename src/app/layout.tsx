import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Game-like app: pinch/double-tap zoom would fight the petting gestures,
// and viewport-fit=cover makes env(safe-area-inset-*) work on notched phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
};

export const metadata: Metadata = {
  title: "Mochi — 3D Cat Simulator & Talking Echo Mode",
  description:
    "A living virtual pet in your browser: pet her and she purrs, talk and she repeats it back in a tiny cat voice. Fully procedural 3D cat with custom coats, moods and worlds.",
  keywords: ["3D cat", "virtual pet", "three.js", "talking cat", "echo mode", "web audio"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Mochi — 3D Cat Simulator",
    description: "Pet her, play with her, and hear her repeat your words in a cat voice.",
    siteName: "Z.ai",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
