import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { I18nProvider } from "@/lib/i18n/context";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { ServiceWorkerRegister } from "@/components/pwa-register";
import { TelemetryProvider } from "@/lib/telemetry";
import { StoryStageProvider } from "@/lib/story-stage-context";
import { ContinuousThreadStage } from "@/components/layout/continuous-thread-stage";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5F6" },
    { media: "(prefers-color-scheme: dark)", color: "#101114" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Weirwise",
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
    title: "Weirwise",
    description:
      "Build, manage, and deploy AI assistants powered by your own business knowledge. Simple by default. Powerful by design.",
    images: [
      {
        url: "/weirwise-og.png",
        width: 1200,
        height: 630,
        alt: "Weirwise — Simple by default. Powerful by design.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Weirwise",
    description:
      "Build, manage, and deploy AI assistants powered by your own business knowledge. Simple by default. Powerful by design.",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var storedTheme=localStorage.getItem("wwp_theme");var root=document.documentElement;root.classList.remove("dark","light");if(storedTheme==="light"){root.classList.add("light");}else if(storedTheme==="dark"){root.classList.add("dark");}else{var isDark=window.matchMedia("(prefers-color-scheme: dark)").matches;root.classList.add(isDark?"dark":"light");}var storedLocale=localStorage.getItem("wwp_locale");if(!storedLocale){var match=document.cookie.match(/(^|;\\s*)wwp_locale=([^;]*)/);if(match)storedLocale=match[2];}if(!storedLocale&&navigator.language&&navigator.language.toLowerCase().startsWith("fa")){storedLocale="fa";}if(storedLocale==="fa"){root.lang="fa";root.dir="rtl";}else{root.lang="en";root.dir="ltr";}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground antialiased min-h-screen selection:bg-primary selection:text-primary-foreground">
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              <TelemetryProvider>
                <StoryStageProvider>
                  <ToastProvider>
                    <ContinuousThreadStage />
                    <div className="relative z-10 min-h-screen">
                      {children}
                    </div>
                    <CommandPalette />
                    <ServiceWorkerRegister />
                  </ToastProvider>
                </StoryStageProvider>
              </TelemetryProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
