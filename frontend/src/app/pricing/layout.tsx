import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Predictable Usage-Based Pricing",
  description: "Simple, transparent pricing for business AI assistants. Start free with 2 assistants and 10 documents.",
  openGraph: {
    title: "Weirwise Pricing — Transparent Plans for Every Business",
    description: "Launch grounded AI assistants starting at $0/month. Scale to team and enterprise tiers as your business grows.",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
