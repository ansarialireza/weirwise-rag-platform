import type { Metadata } from "next";
import { LandingExperience } from "@/components/home/landing-experience";

export const metadata: Metadata = {
  title: { absolute: "Weirwise — Knowledge, in motion." },
  description:
    "Connect your business knowledge and publish an assistant that answers your team and your customers, with the source behind every reply.",
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
    logo: `${baseUrl}/icon-512.png`,
    description: "Answers from your business knowledge, with the source beside every claim.",
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
      "Create an assistant from your own knowledge and publish answers with the exact source attached.",
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
