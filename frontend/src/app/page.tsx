import type { Metadata } from "next";
import { LandingExperience } from "@/components/home/landing-experience";

export const metadata: Metadata = {
  title: "Weirwise",
  description:
    "AI assistants that answer from your own documents, with the exact source beside every answer.",
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
    description: "AI answers from your own documents, with sources you can check.",
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
      "Create an AI assistant from your own documents and share answers with the exact source attached.",
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
