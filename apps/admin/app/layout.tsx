import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tastes Admin',
  description: 'Moderation and venue operations for Tastes',
  icons: {
    icon: '/tastes-favicon.ico?v=4',
    shortcut: '/tastes-favicon.ico?v=4',
    apple: '/tastes-favicon.png?v=4',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
