import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Poppins, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0d1b3d' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export const metadata: Metadata = {
  title: 'Examination Management System',
  description: 'Super Admin portal for examination management',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/logo.png', sizes: '512x512', type: 'image/png' },
      {
        url: '/icon-monochrome.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon-32.png',
    other: [
      {
        rel: 'mask-icon',
        url: '/icon-monochrome.png',
        color: '#0d1b3d',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'EMS',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ToastProvider>{children}</ToastProvider>
        <Script
          id="pydah-portal-switcher-cdn"
          src="https://crm.pydah.edu.in/portal-switcher.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
