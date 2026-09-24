import type { Metadata } from 'next';
import { Signika, Urbanist } from 'next/font/google';
import './globals.css';
import AppShell from './components/AppShell';
import AuthGate from './components/AuthGate';

const signika = Signika({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-signika' });
const urbanist = Urbanist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-urbanist' });

export const metadata: Metadata = {
  title: 'Korise',
  description: 'Votre activité, sous contrôle — ventes, caisse, stock au quotidien.',
  // Favicon canonique : korise-icon.png depuis packages/shared/brand (copié
  // dans public/brand par scripts/sync-brand.mjs — jamais dupliqué à la main).
  icons: {
    icon: '/brand/korise-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${signika.variable} ${urbanist.variable}`}>
      <body>
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
