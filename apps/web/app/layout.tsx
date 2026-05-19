import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Viralytic — Where data meets virality',
  description: 'AI intelligence platform that turns any product link into a viral TikTok video optimized for conversion. Built for founders who sell.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable} ${mono.variable}`}>
      <body className="bg-graphite text-zinc-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
