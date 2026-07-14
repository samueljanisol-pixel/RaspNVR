import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'RaspNVR Central',
  description: 'Tableau de bord multi-magasins RaspNVR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
