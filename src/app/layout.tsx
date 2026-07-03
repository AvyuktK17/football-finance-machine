import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Finance Machine",
  description:
    "Build a transfer plan. Test it against UEFA and Premier League cost rules.",
};

// viewportFit: "cover" makes env(safe-area-inset-*) resolve to real values on
// notched / gesture-bar phones, so sticky bottom UI can pad around the browser
// chrome instead of being overlapped by it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
