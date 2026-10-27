"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const workspaceId = params.workspaceId as string | undefined;
  const projectId = params.projectId as string | undefined;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      api.getWorkspaces().then(async (wsList) => {
        setWorkspaces(wsList);

        // Resolve workspace
        const activeWs = wsList.find((w) => w.id === workspaceId) || wsList[0] || null;
        setCurrentWorkspace(activeWs);

        if (activeWs) {
          const pList = await api.getProjects(activeWs.id);
          setProjects(pList);

          // Resolve project
          const activeProj = pList.find((p) => p.id === projectId) || pList[0] || null;
          setCurrentProject(activeProj);
        }
      }).catch(() => {
        // Handle error
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [user, authLoading, workspaceId, projectId, router]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar
        currentWorkspace={currentWorkspace}
        currentProject={currentProject}
        workspaces={workspaces}
        projects={projects}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
