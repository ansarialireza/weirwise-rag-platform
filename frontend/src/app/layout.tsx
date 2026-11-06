import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, Vazirmatn } from "next/font/google";
import { defaultLocale, getDirection, getSpec, localeSpecs } from "@/lib/i18n/locales";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-tight",
  weight: ["500", "600", "700"],
});

// Persian needs a Persian face: Inter has no Arabic-script coverage, so `fa`
// would silently fall back to whatever the OS offers. Only the latin + arabic
// ranges are fetched — Google splits by unicode-range either way.
const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-vazirmatn",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F3" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0E0D" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Weirwise — Knowledge, in motion.",
    template: "%s | Weirwise",
  },
  description:
    "Connect your business knowledge. Weirwise turns it into an assistant that answers your team and your customers — with the source behind every reply.",
  keywords: [
    "AI assistant",
    "business AI",
    "customer support assistant",
    "knowledge base AI",
    "conversational AI",
    "Weirwise",
  ],
  authors: [{ name: "Weirwise Engineering" }],
  creator: "Weirwise",
  publisher: "Weirwise",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "Weirwise",
    title: "Weirwise — Knowledge, in motion.",
    description:
      "Connect your business knowledge and publish an assistant that answers your team and your customers, with the source behind every reply.",
    images: [
      {
        url: "/weirwise-og.png",
        width: 1200,
        height: 630,
        alt: "Weirwise — knowledge, in motion.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Weirwise — Knowledge, in motion.",
    description:
      "Connect your business knowledge and publish an assistant that answers your team and your customers, with the source behind every reply.",
    images: ["/weirwise-og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Weirwise",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

/**
 * Runs before first paint so a RTL reader never sees a flash of LTR layout.
 * Built from the registry rather than hand-written: a new language becomes
 * available to the pre-paint path the moment it becomes available to React.
 */
const localeBootScript = (() => {
  const dirs = Object.entries(localeSpecs).map(([code, s]) => `${code}:"${s.direction}"`);
  const fonts = Object.entries(localeSpecs).map(([code, s]) => `${code}:"${s.fontStack}"`);
  return `(function(){try{var root=document.documentElement;var storedTheme=localStorage.getItem("wwp_theme");root.classList.remove("dark","light");if(storedTheme==="light"){root.classList.add("light");}else if(storedTheme==="dark"){root.classList.add("dark");}else{root.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}var dirs={${dirs.join(",")}};var fonts={${fonts.join(",")}};var stored=localStorage.getItem("wwp_locale");if(!stored){var m=document.cookie.match(/(^|;\\s*)wwp_locale=([^;]*)/);if(m)stored=decodeURIComponent(m[2]);}if(!dirs[stored]){stored=null;var tags=navigator.languages||[navigator.language];for(var i=0;i<tags.length&&!stored;i++){var p=String(tags[i]||"").toLowerCase().split("-")[0];if(dirs[p])stored=p;}}if(!stored)stored=${JSON.stringify(defaultLocale)};root.lang=stored;root.dir=dirs[stored];root.setAttribute("data-font",fonts[stored]);}catch(e){}})();`;
})();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={defaultLocale}
      dir={getDirection(defaultLocale)}
      data-font={getSpec(defaultLocale).fontStack}
      className={`${inter.variable} ${interTight.variable} ${vazirmatn.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBootScript }} />
      </head>
      <body className="font-sans bg-background text-foreground antialiased min-h-screen selection:bg-primary selection:text-primary-foreground">
        {children}
      </body>
    </html>
  );
}
