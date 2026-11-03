"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRootRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/overview");
  }, [router]);

  return (
    <div className="flex h-full min-h-[400px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
