import type { Metadata } from 'next';
import { Signika, Urbanist } from 'next/font/google';
import './globals.css';
import AuthGate from './components/AuthGate';
import Shell from './components/Shell';

const signika = Signika({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-signika' });
const urbanist = Urbanist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-urbanist' });

export const metadata: Metadata = {
  title: 'Korise Super Admin',
  description: 'Plateforme interne Korise — vue d’ensemble des entreprises clientes.',
  icons: {
    icon: '/brand/korise-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${signika.variable} ${urbanist.variable}`}>
      <body>
        <AuthGate>
          <Shell>{children}</Shell>
        </AuthGate>
      </body>
    </html>
  );
}
