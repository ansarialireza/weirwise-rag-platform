import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Scale, CheckCircle2, AlertTriangle, ShieldAlert, Cpu, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Weirwise Terms of Service: Master subscription and acceptable use agreement governing access to our knowledge grounding platform, APIs, and AI assistants.",
  openGraph: {
    title: "Terms of Service | Weirwise",
    description:
      "Weirwise Terms of Service: Master subscription and acceptable use agreement governing access to our platform.",
  },
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground transition-colors">
      <SiteHeader />

      <main id="main-content" className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        {/* Header */}
        <div className="border-b border-border/60 pb-8 sm:pb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary/80 px-3.5 py-1 text-xs font-semibold text-foreground mb-4">
            <Scale className="h-3.5 w-3.5 text-accent" />
            <span>Agreement &amp; Acceptable Use</span>
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Terms of Service
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
              <span className="text-accent text-sm font-mono">01.</span> Agreement &amp; Service Description
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;User&quot;, &quot;Customer&quot;, or &quot;you&quot;) and WEIRWISE (&quot;Weirwise&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By creating an account, accessing, or using the Weirwise platform, APIs, or embeddable widgets (collectively, the &quot;Service&quot;), you acknowledge that you have read, understood, and agree to be bound by these Terms.
            </p>
            <p>
              Weirwise delivers a high-accuracy knowledge retrieval and conversational assistant platform. The Service allows users to ingest documents, synchronize business integrations (such as e-commerce catalogs, documentation systems, and cloud storage), and generate grounded conversational responses citing exact reference materials.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">02.</span> Account Registration &amp; Responsibilities
            </h2>
            <p>To access the Service, you must register for an account. You agree to:</p>
            <ul className="list-disc ps-6 space-y-1.5 text-muted-foreground">
              <li>Provide accurate, current, and complete registration information.</li>
              <li>Maintain the security and confidentiality of your credentials and API tokens.</li>
              <li>Promptly notify Weirwise at <a href="mailto:support@weirwise.com" className="text-accent hover:underline">support@weirwise.com</a> if you suspect any unauthorized access or breach of your account.</li>
              <li>Accept responsibility for all activities and transactions that occur under your account.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">03.</span> Acceptable Use Policy
            </h2>
            <p>You agree not to misuse the Service or assist any other party in doing so. Prohibited conduct includes, without limitation:</p>
            <ul className="list-disc ps-6 space-y-1.5 text-muted-foreground">
              <li>Uploading, indexing, or processing content that infringes upon third-party intellectual property, privacy, or proprietary rights.</li>
              <li>Ingesting or transmitting malicious software, viruses, worms, Trojan horses, or harmful code.</li>
              <li>Attempting to probe, scan, or test the vulnerability of our system, or breach any security or authentication measures.</li>
              <li>Reverse engineering, decompiling, or attempting to derive the source code of non-public platform components.</li>
              <li>Engaging in automated scraping, excessive rapid requests, or activities designed to circumvent published API rate limits or quota boundaries.</li>
              <li>Deploying assistants for unlawful, fraudulent, defamatory, discriminatory, or harassing purposes, or generating content that promotes hate speech or illegal violence.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">04.</span> AI-Generated Content &amp; Verification Disclaimer
            </h2>
            <p>
              Weirwise incorporates state-of-the-art machine learning models, retrieval-augmented grounding, and natural language processing to produce answers:
            </p>
            <div className="my-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                User Responsibility for Fact-Checking &amp; Output Verification
              </h3>
              <p className="mt-2 text-foreground/90 leading-relaxed">
                Artificial intelligence and large language models are probabilistic by nature and can occasionally generate inaccurate, incomplete, or outdated statements (&quot;hallucinations&quot;). While Weirwise attaches exact source citations to ground responses, you acknowledge that:
              </p>
              <ul className="mt-2.5 list-disc ps-5 space-y-1 text-muted-foreground text-xs sm:text-sm">
                <li>You retain sole responsibility for reviewing, fact-checking, and validating AI outputs before relying on them for business, legal, financial, or medical decisions.</li>
                <li>Weirwise does not warrant that AI-generated responses are entirely free of error, and the Service should not be used as a substitute for professional legal, medical, or financial counsel.</li>
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">05.</span> Intellectual Property &amp; Content Ownership
            </h2>
            <ul className="list-disc ps-6 space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Your Content:</strong> You retain full copyright and ownership of all documents, text, and proprietary knowledge you upload or connect to Weirwise. You grant Weirwise only the limited, non-exclusive license required to process, embed, store, and display your content to deliver the Service to you.
              </li>
              <li>
                <strong className="text-foreground">Weirwise Platform IP:</strong> The Weirwise platform, user interface designs, APIs, logos, documentation, and core algorithms are the exclusive property of Weirwise Inc. and its licensors.
              </li>
              <li>
                <strong className="text-foreground">AI Outputs:</strong> Between you and Weirwise, you own all rights to the synthesized text outputs generated for your queries, subject to your compliance with these Terms.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">06.</span> Third-Party Services &amp; API Limits
            </h2>
            <p>
              The Service allows you to connect third-party platforms (including Google Drive, Google OAuth, Shopify, Zendesk, and Notion). You agree that your use of third-party platforms is governed by their respective terms and privacy policies.
            </p>
            <p>
              Weirwise enforces tier-based usage quotas (such as monthly chat turns, document counts, and storage volumes). We reserve the right to throttle or temporarily suspend API access for accounts that exceed tier limits or generate abusive request volumes.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">07.</span> Service Availability, Modifications &amp; Termination
            </h2>
            <p>
              We strive to provide continuous platform availability with high reliability, but we do not guarantee uninterrupted or error-free operation. We reserve the right to update, modify, or temporarily discontinue features for maintenance or security upgrades.
            </p>
            <p>
              You may terminate your account at any time through your dashboard. Weirwise may suspend or terminate your access immediately if you breach these Terms, fail to pay applicable subscription fees, or engage in activity that threatens system integrity or other users.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">08.</span> Limitation of Liability &amp; Disclaimers
            </h2>
            <p className="uppercase text-xs tracking-wider text-muted-foreground font-semibold">
              Please read this section carefully as it limits our liability.
            </p>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              IN NO EVENT SHALL WEIRWISE, ITS DIRECTORS, EMPLOYEES, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, DATA, USE, OR GOODWILL) ARISING OUT OF OR IN CONNECTION WITH YOUR ACCESS TO OR INABILITY TO USE THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY.
            </p>
            <p>
              OUR TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE SHALL NOT EXCEED THE GREATER OF ONE HUNDRED US DOLLARS ($100 USD) OR THE TOTAL AMOUNT PAID BY YOU TO WEIRWISE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">09.</span> Changes to These Terms
            </h2>
            <p>
              We may revise these Terms from time to time. When changes are made, we will update the &quot;Last Updated&quot; date at the top of this page. For material modifications, we will notify registered users via their primary account email or through a prominent notice on the platform. Continued use of the Service following the effective date of updated Terms constitutes your binding acceptance.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-3 border-t border-border/60 pt-8">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-accent text-sm font-mono">10.</span> Contact Us
            </h2>
            <p>If you have any questions or legal inquiries regarding these Terms of Service, please reach out to our team:</p>
            <div className="rounded-xl border border-border bg-card p-5 space-y-1.5 text-sm">
              <p className="font-semibold text-foreground">WEIRWISE Legal &amp; Support</p>
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
