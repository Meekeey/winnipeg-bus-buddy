import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Buddy",
  description: "Live Winnipeg Transit arrivals, bus tracking and trip planning.",
  appleWebApp: { capable: true, title: "Bus Buddy", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c98f55" },
    { media: "(prefers-color-scheme: dark)", color: "#3a241a" },
  ],
};

// Runs before the page paints, so a saved light/dark choice shows at once.
const themeScript = `
try {
  var saved = JSON.parse(localStorage.getItem("busbuddy.theme"));
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800&family=Pixelify+Sans:wght@500;700&family=Jersey+15&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
