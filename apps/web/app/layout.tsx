import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/jetbrains-mono/500.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zakariye Digital Universe',
  description: 'Waxbarasho · Midnimo · Hoggaan — an explorable presentation of a student leadership program. Preview build.',
  // Preview builds must not be indexed until launch approvals exist.
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05070D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="so">
      <body>{children}</body>
    </html>
  );
}
