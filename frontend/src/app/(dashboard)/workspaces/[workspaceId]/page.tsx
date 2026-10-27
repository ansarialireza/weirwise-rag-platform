"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function WorkspaceIndexPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  useEffect(() => {
    if (workspaceId) {
      api.getProjects(workspaceId).then((projects) => {
        if (projects.length > 0) {
          router.push(`/workspaces/${workspaceId}/projects/${projects[0].id}`);
        } else {
          // Create default project if none exist
          api.createProject(workspaceId, { name: "Default Project" }).then((newProj) => {
            router.push(`/workspaces/${workspaceId}/projects/${newProj.id}`);
          });
        }
      });
    }
  }, [workspaceId, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
