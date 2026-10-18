import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LPU Lost & Found — Campus Property Recovery Platform',
  description:
    'Campus property recovery portal for Lovely Professional University. Report lost and found property, search listings across campus blocks, and verify custody handovers securely.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-white font-sans text-slate-900 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
