import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { PwaRegister } from '@/components/PwaRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'RaspNVR Central',
  description: 'Tableau de bord multi-magasins RaspNVR',
  manifest: '/manifest.webmanifest',
  applicationName: 'RaspNVR',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RaspNVR',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <PwaRegister />
        <Script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
