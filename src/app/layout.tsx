import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Promptinary — The AI Prompt Challenge Game',
  description: 'Race to recreate images using AI prompts! The ultimate competitive prompt engineering game. Every token counts. Every second matters.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
