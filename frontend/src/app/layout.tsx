import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { ServiceWorkerRegister } from "@/components/pwa-register";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Weirwise — Autonomous AI Assistant Studio for Business",
    template: "%s | Weirwise",
  },
  description:
    "Build, manage, and deploy AI assistants powered by your own business knowledge. Simple by default. Powerful by design.",
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
    title: "Weirwise — Autonomous AI Assistant Studio for Business",
    description:
      "Build, manage, and deploy AI assistants powered by your own business knowledge. Simple by default. Powerful by design.",
    images: [
      {
        url: "/weirwise-horizontal.svg",
        width: 1200,
        height: 630,
        alt: "Weirwise Platform Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Weirwise — Autonomous AI Assistant Studio for Business",
    description:
      "Build, manage, and deploy AI assistants powered by your own business knowledge. Simple by default. Powerful by design.",
    images: ["/weirwise-horizontal.svg"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.svg" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Weirwise",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem("wwp_theme");var root=document.documentElement;root.classList.remove("dark","light","colorful");if(stored==="light"){root.classList.add("light");}else if(stored==="dark"){root.classList.add("dark");}else{var isDark=window.matchMedia("(prefers-color-scheme: dark)").matches;root.classList.add(isDark?"dark":"light");}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans bg-background text-foreground antialiased min-h-screen selection:bg-primary selection:text-primary-foreground`}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              {children}
              <CommandPalette />
              <ServiceWorkerRegister />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
