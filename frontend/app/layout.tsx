import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meta Ads Agent',
  description: 'Dashboard de otimização automática de campanhas Meta Ads',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#0f0f0f] text-white font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
