import type { Metadata } from 'next';
import './globals.css';
import { NavBar } from '@/components/shared/NavBar';
import { WagmiProvider } from './providers';

export const metadata: Metadata = {
  title: 'Conflux Automation Site',
  description: 'Non-custodial limit orders & DCA on Conflux eSpace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100">
        <WagmiProvider>
          <NavBar />
          <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        </WagmiProvider>
      </body>
    </html>
  );
}
