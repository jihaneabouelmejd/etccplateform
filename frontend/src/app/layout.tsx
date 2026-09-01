import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ETCC — Gestion Construction',
  description: 'Plateforme de gestion pour ETCC SARL',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FBF6EE',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, background: '#FDF6E9' }}>
        {children}
      </body>
    </html>
  );
}