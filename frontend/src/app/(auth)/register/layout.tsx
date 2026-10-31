import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your Weirwise account and start building grounded AI assistants with your business data today.",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
