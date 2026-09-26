import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';
import { AtlasProvider } from '@/components/atlas-provider';

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const siteUrl =
  configuredSiteUrl ||
  (vercelProductionHost ? `https://${vercelProductionHost}` : undefined) ||
  'https://atlas-inteligencia-educacional.maxcrowleyadz.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Atlas',
  description:
    'Diagnóstico escolar orientado por evidências para decisões mais justas.',
  openGraph: {
    title: 'Atlas — Inteligência educacional',
    description:
      'Diagnóstico escolar orientado por evidências para decisões mais justas.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Atlas — Inteligência educacional para decisões mais justas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atlas — Inteligência educacional',
    description:
      'Diagnóstico escolar orientado por evidências para decisões mais justas.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${nunito.variable} antialiased`}>
        <AtlasProvider>{children}</AtlasProvider>
      </body>
    </html>
  );
}
