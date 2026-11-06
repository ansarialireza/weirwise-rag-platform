import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { I18nProvider } from "@/lib/i18n/context";
import { TelemetryProvider } from "@/lib/telemetry";
import { ServiceWorkerRegister } from "@/components/pwa-register";

/**
 * Providers for first-party pages (marketing, auth, dashboard, admin).
 *
 * The root layout stays empty on purpose: the embeddable widget and the
 * offline page are served to third-party sites and must not ship session
 * restoration, telemetry, or the dashboard shell.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <TelemetryProvider>
            <div className="relative z-10 min-h-screen">{children}</div>
            <ServiceWorkerRegister />
          </TelemetryProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
