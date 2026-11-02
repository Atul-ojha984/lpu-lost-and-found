import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LPU Lost & Found — Campus Property Recovery Platform',
  description:
    'Campus property recovery portal for Lovely Professional University. Report lost and found property, search listings across campus blocks, and verify custody handovers securely.',
  icons: {
    icon: '/images/lost-and-found-logo.png',
    apple: '/images/lost-and-found-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#F5F8FC] font-sans text-[#17243B] antialiased flex flex-col selection:bg-[#20B5AD]/20 selection:text-[#192B4A]">
        {children}
      </body>
    </html>
  );
}
