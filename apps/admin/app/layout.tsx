import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tastes Admin',
  description: 'Moderation and venue operations for Tastes',
  icons: {
    icon: '/favicon.ico?v=3',
    shortcut: '/favicon.ico?v=3',
    apple: '/icon.png?v=3',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
