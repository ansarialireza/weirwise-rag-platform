"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";
import { Menu, X } from "lucide-react";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Handle ESC key to dismiss mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          currentWorkspace={currentWorkspace}
          currentProject={currentProject}
          workspaces={workspaces}
          projects={projects}
        />
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar
              currentWorkspace={currentWorkspace}
              currentProject={currentProject}
              workspaces={workspaces}
              projects={projects}
              onItemClick={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile Header Bar */}
        <div className="flex h-14 md:hidden items-center justify-between border-b border-border bg-card px-4 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <span className="text-sm font-bold tracking-tight text-foreground truncate px-2">
            {currentProject?.name || currentWorkspace?.name || "Weirwise"}
          </span>

          <div className="w-8" />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
