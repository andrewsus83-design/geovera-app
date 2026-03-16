import type { Metadata } from 'next';
import { Inter, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/lib/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GeoVera Admin',
  description: 'Admin Panel — GeoVera AI Brand Intelligence Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body className="font-[family-name:var(--font-inter)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
