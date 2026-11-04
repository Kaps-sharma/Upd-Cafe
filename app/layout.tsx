import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Inter, IBM_Plex_Mono } from 'next/font/google';
import PwaRegister from '@/components/PwaRegister';
import { getSiteUrl } from '@/lib/site';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f3efe6',
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  manifest: '/manifest.webmanifest',
  applicationName: 'CafeSuite',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'CafeSuite',
    statusBarStyle: 'default',
  },
  title: {
    default: 'Snake Cafe',
    template: '%s | Snake Cafe',
  },
  description:
    'Order snacks, play games to earn coins, and manage your balance at Snake Cafe. A fun, interactive cafe experience.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Snake Cafe',
    title: 'Snake Cafe',
    description:
      'Order snacks, play games to earn coins, and manage your balance at Snake Cafe.',
  },
  twitter: {
    card: 'summary',
    title: 'Snake Cafe',
    description:
      'Order snacks, play games to earn coins, and manage your balance at Snake Cafe.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${plexMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CafeOrCoffeeShop',
              name: 'Snake Cafe',
              description:
                'Order snacks, play games to earn coins, and manage your balance.',
              offers: {
                '@type': 'Offer',
                priceCurrency: 'COIN',
                availability: 'https://schema.org/InStock',
              },
            }),
          }}
        />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}