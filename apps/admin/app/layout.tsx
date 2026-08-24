import type { Metadata } from 'next';
import './globals.css';

const inlineTongueFavicon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#101114"/><path d="M4 9c7 3 17 3 24 0v7c0 8-5 12-12 12S4 24 4 16V9Z" fill="#ff9eb1" stroke="#fff" stroke-width="1.5"/><path d="M16 14v8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
)}`;

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
      <head>
        <link rel="icon" href={inlineTongueFavicon} type="image/svg+xml" />
        <link rel="shortcut icon" href={inlineTongueFavicon} />
      </head>
      <body>{children}</body>
    </html>
  );
}
