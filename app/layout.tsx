import type {Metadata} from 'next';
import { DM_Serif_Display, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--fd',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--fu',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--fm',
});

export const metadata: Metadata = {
  title: 'ALTESA Coordinator',
  description: 'ALTESA Coordinator Platform',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
