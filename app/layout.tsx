import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3c2415',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
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
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
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
      <body>{children}</body>
    </html>
  );
}