import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LPU Lost & Found — Campus Property Recovery Platform',
  description:
    'Campus property recovery portal for Lovely Professional University. Report lost and found property, search listings across campus blocks, and verify custody handovers securely.',
  icons: {
    icon: '/images/lost-and-found-logo.svg',
    apple: '/images/lost-and-found-logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" data-scroll-behavior="smooth">
      <body className="min-h-full bg-[#F5F5F5] font-sans text-[#17243B] antialiased flex flex-col selection:bg-[#F58220]/20 selection:text-[#283442]">
        {children}
      </body>
    </html>
  );
}
