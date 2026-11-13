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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://ems.pydah.edu.in'),
  title: 'Examination Management System',
  description: 'Super Admin portal for examination management',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/campo-logos/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/campo-logos/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/campo-logos/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/campo-logos/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/campo-logos/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/campo-logos/favicon-32x32.png',
  },
  openGraph: {
    title: 'Examination Management System',
    description: 'Super Admin portal for examination management',
    images: [
      {
        url: '/campo-logos/og-image.png',
        width: 800,
        height: 800,
        alt: 'Campo EMS',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Examination Management System',
    description: 'Super Admin portal for examination management',
    images: ['/campo-logos/og-image.png'],
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
