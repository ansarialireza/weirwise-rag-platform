import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ShieldCheck, Lock, Eye, Server, RefreshCw, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Weirwise Privacy Policy: Learn how we process, store, and protect your account and business knowledge data, including Google and third-party integrations.",
  openGraph: {
    title: "Privacy Policy | Weirwise",
    description:
      "Weirwise Privacy Policy: Learn how we process, store, and protect your account and business knowledge data.",
  },
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground transition-colors">
      <SiteHeader />

      <main id="main-content" className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        {/* Header */}
        <div className="border-b border-border/60 pb-8 sm:pb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary/80 px-3.5 py-1 text-xs font-semibold text-foreground mb-4">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            <span>Transparency &amp; Data Security</span>
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
            Effective Date: November 13, 2026 · Last Updated: November 13, 2026
          </p>
        </div>

        {/* Content Body */}
        <div className="mt-10 space-y-12 text-sm sm:text-[15px] leading-relaxed text-foreground/90">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">01.</span> What WEIRWISE Does
            </h2>
            <p>
              WEIRWISE (&quot;Weirwise&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides an intelligent knowledge grounding platform and retrieval-augmented generation (RAG) assistant infrastructure. Our service enables organizations and individuals to index business documents, connect knowledge sources (such as documentation, help desks, online stores, and cloud storage), and publish AI assistants that generate accurate answers citing verifiable source excerpts.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">02.</span> Personal &amp; Account Information Collected
            </h2>
            <p>We collect only the information necessary to provide, secure, and bill for our platform services:</p>
            <ul className="list-disc ps-6 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Account Credentials:</strong> Work email address, cryptographically hashed passwords (using industry-standard Argon2id / bcrypt hashing; plaintext passwords are never stored), and session tokens.
              </li>
              <li>
                <strong className="text-foreground">Profile &amp; Organization Data:</strong> Display name and organization identity associated with your Weirwise tenant.
              </li>
              <li>
                <strong className="text-foreground">Customer Knowledge Content:</strong> Text documents, markdown files, PDFs, URLs, and structured knowledge uploaded or connected to your assistants.
              </li>
              <li>
                <strong className="text-foreground">Payment &amp; Billing Records:</strong> Subscription plan selection and transaction settlement IDs. Credit card and cryptocurrency transactions are processed directly by our secure payment partners (e.g., Rampex); Weirwise does not collect, process, or store raw card numbers or private crypto keys.
              </li>
              <li>
                <strong className="text-foreground">Technical &amp; Telemetry Data:</strong> IP addresses, browser user-agent strings, access timestamps, and API query performance logs required for rate limiting, system diagnostics, and abuse prevention.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">03.</span> Google User Data &amp; OAuth 2.0 Integrations
            </h2>
            <p>
              When you connect Google services (including Google Workspace, Google Drive, or Google OAuth authentication) to Weirwise, the following practices strictly apply:
            </p>
            <ul className="list-disc ps-6 space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Google OAuth Authentication:</strong> When logging in via Google OAuth, we request access only to your verified email address and basic profile info to authenticate your user account.
              </li>
              <li>
                <strong className="text-foreground">Google Drive Integration:</strong> If you connect Google Drive to ingest knowledge sources, Weirwise requests scoped read access solely to index the specific folders or documents you designate for your knowledge assistants.
              </li>
              <li>
                <strong className="text-foreground">YouTube API &amp; Content Access:</strong> Where applicable for content indexing or video metadata transcription, Weirwise accesses public or authorized YouTube channel data strictly to extract transcripts and captions for knowledge grounding.
              </li>
              <li>
                <strong className="text-foreground">NotebookLM &amp; Research Sources:</strong> Any notebook sources or reference materials connected for retrieval grounding are accessed exclusively within the scope of your authorized sessions.
              </li>
            </ul>

            {/* Limited Use Disclosure Callout */}
            <div className="my-6 rounded-xl border border-accent/30 bg-accent/5 p-5 text-sm sm:text-[14px]">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-accent" />
                Google API Services User Data Policy — Limited Use Disclosure
              </h3>
              <p className="mt-2 text-foreground/90 leading-relaxed">
                WEIRWISE&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline underline-offset-4 hover:brightness-110"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <ul className="mt-3 list-disc ps-5 space-y-1 text-muted-foreground text-xs sm:text-sm">
                <li>We do NOT use Google user data to train, retrain, or improve generalized AI/ML models.</li>
                <li>We do NOT sell Google user data or transfer it to third parties for advertising or commercial surveillance.</li>
                <li>Human eyes never inspect your private Google data unless you explicitly request customer support assistance and grant permission, or where legally mandated.</li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">04.</span> AI Providers &amp; Content Processing
            </h2>
            <p>
              Weirwise integrates with enterprise-grade language and embedding model providers (including Google Gemini, OpenAI, and Jina AI) to perform text embeddings, vector similarity search, and answer synthesis:
            </p>
            <ul className="list-disc ps-6 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Zero Model Training on Your Data:</strong> Your ingested documents, knowledge chunks, and query contexts are processed exclusively to generate query embeddings and grounded answers. They are never retained or repurposed to train public foundation models.
              </li>
              <li>
                <strong className="text-foreground">Ephemeral Context Processing:</strong> When an assistant synthesizes a reply, only the specific retrieved knowledge passages and the user prompt are sent to the LLM API via secure TLS connections.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">05.</span> Data Storage, Retention, Deletion &amp; Security
            </h2>
            <p>
              We maintain rigorous technical and organizational safeguards to ensure confidentiality, integrity, and availability:
            </p>
            <ul className="list-disc ps-6 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Encryption:</strong> All data in transit is protected using TLS 1.3 / TLS 1.2 with strict HTTP Strict Transport Security (HSTS). All stored integration tokens, API keys, and third-party credentials are encrypted at rest using AES-128-CBC / Fernet encryption with salt separation.
              </li>
              <li>
                <strong className="text-foreground">Data Isolation:</strong> User and assistant records are partitioned with account-level isolation and strict ownership verification gates on every API endpoint.
              </li>
              <li>
                <strong className="text-foreground">Backups &amp; Cold Vaults:</strong> System databases and document vaults are backed up using automated checksum-verified archives with a 30-day rolling retention lifecycle.
              </li>
              <li>
                <strong className="text-foreground">Deletion:</strong> When you delete a knowledge source, document, or assistant, associated database records and vector chunks are purged immediately from active databases.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">06.</span> Third-Party Service Providers
            </h2>
            <p>We partner with trusted third-party providers who process data strictly under our contractual instructions:</p>
            <ul className="list-disc ps-6 space-y-1.5 text-muted-foreground">
              <li><strong className="text-foreground">Cloudflare:</strong> Edge security, DDoS mitigation, and global CDN delivery.</li>
              <li><strong className="text-foreground">Transactional Email:</strong> Resend / SMTP for account registration, email verification codes, and security alerts.</li>
              <li><strong className="text-foreground">Voice Services:</strong> Deepgram for optional server-side real-time speech-to-text and text-to-speech relaying.</li>
              <li><strong className="text-foreground">Payment Gateways:</strong> Rampex for card and cryptocurrency subscription checkout.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">07.</span> Cookies, Sessions &amp; Storage
            </h2>
            <p>
              We use strictly necessary first-party cookies and browser local storage to maintain your authentication session, preserve your light/dark theme preference, and remember your selected language (<code className="text-xs bg-muted px-1.5 py-0.5 rounded">wwp_locale</code>). We do NOT use third-party tracking cookies or cross-site behavioral advertising trackers.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">08.</span> Your Rights &amp; Data Deletion Requests
            </h2>
            <p>
              Depending on your location, you may have rights under the GDPR, CCPA, and applicable data protection legislation, including:
            </p>
            <ul className="list-disc ps-6 space-y-1 text-muted-foreground">
              <li>The right to access and export your personal data in a structured, portable format.</li>
              <li>The right to rectify inaccurate account information.</li>
              <li>The right to request complete deletion of your account, assistants, and uploaded documents (&quot;right to be forgotten&quot;).</li>
              <li>The right to revoke connected integrations (Google Drive, Shopify, Zendesk) at any time through your dashboard or directly through your Google Account Security settings.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact our privacy team at{" "}
              <a href="mailto:support@weirwise.com" className="text-accent hover:underline font-medium">
                support@weirwise.com
              </a>
              . We fulfill verified requests within thirty (30) days without cost.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3 border-t border-border/60 pt-8">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">09.</span> Contact Us
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data protection practices, please contact our designated support and privacy desk:
            </p>
            <div className="rounded-xl border border-border bg-card p-5 space-y-1.5 text-sm">
              <p className="font-semibold text-foreground">WEIRWISE Support &amp; Privacy</p>
              <p className="text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" />
                <a href="mailto:support@weirwise.com" className="hover:text-foreground hover:underline">
                  support@weirwise.com
                </a>
              </p>
              <p className="text-muted-foreground text-xs mt-2">
                Website: <a href="https://weirwise.com" className="hover:underline">https://weirwise.com</a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
