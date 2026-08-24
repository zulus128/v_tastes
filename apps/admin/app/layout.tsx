import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tastes Admin',
  description: 'Moderation and venue operations for Tastes',
  icons: {
    icon: '/tastes-favicon.png',
    shortcut: '/tastes-favicon.png',
    apple: '/tastes-favicon.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
