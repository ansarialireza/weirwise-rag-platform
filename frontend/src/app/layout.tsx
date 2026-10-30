import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";

export const metadata: Metadata = {
  title: "Weirwise Platform — Enterprise AI Assistant Studio",
  description: "Configure, ground, and deploy production AI assistants on your business data.",
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
            __html: `(function(){try{var stored=localStorage.getItem("wwp_theme");var isDark=false;if(stored==="dark"){isDark=true;}else if(stored==="light"){isDark=false;}else{isDark=window.matchMedia("(prefers-color-scheme: dark)").matches;}document.documentElement.classList.add(isDark?"dark":"light");}catch(e){}})();`,
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
