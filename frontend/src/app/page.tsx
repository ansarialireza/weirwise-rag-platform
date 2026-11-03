import type { Metadata } from "next";
import { LandingExperience } from "@/components/home/landing-experience";

export const metadata: Metadata = {
  title: "Weirwise",
  description:
    "Autonomous AI assistants grounded in verified company knowledge with deterministic citations.",
  alternates: {
    canonical: "https://dev.weirwise.com/",
  },
};

export default function RootPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Weirwise Inc.",
    url: baseUrl,
    logo: `${baseUrl}/weirwise-horizontal.svg`,
    description: "Enterprise Autonomous RAG Platform and AI Assistant Studio.",
    sameAs: ["https://github.com/ansarialireza/weirwise-rag-platform"],
  };

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Weirwise Platform",
    operatingSystem: "Cloud / Web",
    applicationCategory: "BusinessApplication",
    offers: {
      "@type": "Offer",
      price: "0.00",
      priceCurrency: "USD",
    },
    description:
      "Autonomous AI assistant studio for business with zero-hallucination citation grounding and isolated vector stores.",
    url: baseUrl,
  };

  return (
    <>
      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
      />

      <LandingExperience />
    </>
  );
}
