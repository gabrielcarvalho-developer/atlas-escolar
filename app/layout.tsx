import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { AtlasProvider } from '@/components/atlas-provider';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const themeScript = `
  try {
    const saved = localStorage.getItem('atlas-theme');
    const theme = saved === 'dark' || saved === 'light'
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
`;

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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${manrope.variable} antialiased`}>
        <AtlasProvider>{children}</AtlasProvider>
      </body>
    </html>
  );
}
