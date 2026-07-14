import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARIA — Agentic Repository Intelligence Assistant',
  description: 'AI-native coding IDE powered by IBM watsonx Orchestrate. Read, write, and run code with autonomous agent intelligence.',
  keywords: ['AI coding', 'IBM watsonx', 'code agent', 'IDE', 'developer tools'],
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'ARIA — AI Coding Agent',
    description: 'Powered by IBM watsonx Orchestrate',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#161616',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-[#101010] text-[#f4f4f4]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
