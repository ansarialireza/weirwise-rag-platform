"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else {
        // Fetch primary workspace
        api.getWorkspaces().then((workspaces) => {
          if (workspaces.length > 0) {
            router.push(`/workspaces/${workspaces[0].id}`);
          } else {
            router.push("/login");
          }
        }).catch(() => {
          router.push("/login");
        });
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
