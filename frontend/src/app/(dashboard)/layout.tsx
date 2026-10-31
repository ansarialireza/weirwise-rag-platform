"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";
import { Menu, Sliders } from "lucide-react";
import Link from "next/link";

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

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Handle ESC key to dismiss mobile drawer & restore focus to trigger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleCloseDrawer = () => {
    setMobileMenuOpen(false);
    menuTriggerRef.current?.focus();
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const baseProjUrl = currentWorkspace?.id && currentProject?.id
    ? "/workspaces/" + currentWorkspace.id + "/projects/" + currentProject.id
    : "";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Desktop Sidebar (Persistent left rail) */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          currentWorkspace={currentWorkspace}
          currentProject={currentProject}
          workspaces={workspaces}
          projects={projects}
        />
      </div>

      {/* Mobile Drawer (Accessible Full-Viewport Modal Overlay) */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          {/* 1. Backdrop covering entire viewport with dimming and blur */}
          <div
            data-testid="drawer-backdrop"
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={handleCloseDrawer}
            aria-hidden="true"
          />

          {/* 2. Isolated Drawer Container */}
          <div
            ref={drawerRef}
            tabIndex={-1}
            className="relative z-50 flex h-full w-[85vw] max-w-[320px] flex-col bg-card shadow-2xl outline-none animate-in slide-in-from-left duration-200 border-r border-border"
          >
            <Sidebar
              currentWorkspace={currentWorkspace}
              currentProject={currentProject}
              workspaces={workspaces}
              projects={projects}
              onItemClick={handleCloseDrawer}
              onClose={handleCloseDrawer}
              isMobileDrawer={true}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className="flex flex-1 flex-col overflow-hidden min-w-0"
        aria-hidden={mobileMenuOpen ? true : undefined}
      >
        {/* Mobile Header Bar: Robust 3-Region Layout with Perfect Center Alignment */}
        <header className="h-14 md:hidden grid grid-cols-[48px_1fr_48px] items-center border-b border-border bg-card/95 backdrop-blur-md px-3 shrink-0 select-none z-10">
          {/* Region 1: Left Menu Trigger */}
          <div className="flex items-center justify-start">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-secondary/50 text-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* Region 2: True Centered Workspace/Project Title */}
          <div className="flex items-center justify-center min-w-0 px-2 text-center">
            <span
              className="text-sm font-bold tracking-tight text-foreground truncate"
              title={currentProject?.name || currentWorkspace?.name || "Weirwise"}
            >
              {currentProject?.name || currentWorkspace?.name || "Weirwise"}
            </span>
          </div>

          {/* Region 3: Right Action / Profile Icon */}
          <div className="flex items-center justify-end">
            {baseProjUrl ? (
              <Link
                href={baseProjUrl + "/playground"}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-secondary/50 text-foreground hover:bg-secondary hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Open Playground"
                aria-label="Open Playground"
              >
                <Sliders className="h-4 w-4" />
              </Link>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary border border-border text-xs font-bold text-foreground">
                {user?.full_name?.charAt(0) || "U"}
              </div>
            )}
          </div>
        </header>

        {/* Scrollable Dashboard Body */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
