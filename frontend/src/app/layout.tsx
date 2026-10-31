import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Weirwise — Grounded AI Assistants for Business",
    template: "%s | Weirwise Platform",
  },
  description: "Connect your business knowledge, configure behavior, test truthful responses with verified citations, and deploy conversational AI assistants across your customer touchpoints.",
  keywords: [
    "AI assistant",
    "business knowledge assistant",
    "grounded RAG",
    "customer support AI",
    "truthful AI",
    "verified citations",
  ],
  authors: [{ name: "Weirwise Inc." }],
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
    url: siteUrl,
    title: "Weirwise — Grounded AI Assistants for Business",
    description: "Turn your business documentation and FAQs into accurate, cited AI assistants that customers and support teams can trust.",
    siteName: "Weirwise Platform",
  },
  twitter: {
    card: "summary_large_image",
    title: "Weirwise — Grounded AI Assistants for Business",
    description: "Connect business knowledge and deploy truthful AI assistants with verified citations.",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" }
    ],
    apple: "/favicon.svg"
  }
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
            __html: `(function(){try{var stored=localStorage.getItem("wwp_theme");var root=document.documentElement;root.classList.remove("dark","light","colorful");if(stored==="colorful"){root.classList.add("colorful");}else if(stored==="light"){root.classList.add("light");}else if(stored==="dark"){root.classList.add("dark");}else{var isDark=window.matchMedia("(prefers-color-scheme: dark)").matches;root.classList.add(isDark?"dark":"light");}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased min-h-screen selection:bg-primary selection:text-primary-foreground">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              {children}
              <CommandPalette />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
