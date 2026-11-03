"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";

export default function DashboardRootRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/overview");
  }, [router]);

  return (
    <div className="flex h-full min-h-[400px] items-center justify-center">
      <BrutalistLoader label="ROUTING" />
    </div>
  );
}
