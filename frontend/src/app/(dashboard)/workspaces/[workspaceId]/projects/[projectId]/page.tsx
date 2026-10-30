"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ProjectRootRedirect() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  useEffect(() => {
    if (workspaceId && projectId) {
      router.replace(`/workspaces/${workspaceId}/projects/${projectId}/overview`);
    }
  }, [workspaceId, projectId, router]);

  return (
    <div className="flex h-full min-h-[400px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
