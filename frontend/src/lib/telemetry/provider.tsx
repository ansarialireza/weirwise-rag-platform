/**
 * Weirwise Behavioral Intelligence (WBI) – React Context Provider & Hooks
 * 
 * Safe for Next.js App Router (Client Component):
 * - SSR safe (no window/document calls during server render)
 * - Strict Mode resilient (no duplicate listeners or double-timer bugs)
 * - Auto pageview tracking on route changes
 * - Auto session synchronization with AuthContext (login/logout lifecycle)
 * - Excludes /admin/* routes completely
 */

"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TelemetryClient, telemetry as defaultClient } from "./client";
import { WorkflowTracker } from "./workflows";
import { EventCategory, TrackOptions } from "./types";

interface TelemetryContextValue {
  client: TelemetryClient;
  workflows: WorkflowTracker;
  track: (category: EventCategory, eventName: string, options?: TrackOptions) => string | null;
  trackFeature: (featureName: string, action: string, componentId?: string | null, properties?: Record<string, any>) => string | null;
  trackAction: (actionName: string, componentId?: string | null, properties?: Record<string, any>) => string | null;
  trackFriction: (frictionType: string, componentId?: string | null, properties?: Record<string, any>) => string | null;
  trackError: (domain: string, code: string, componentId?: string | null, properties?: Record<string, any>) => string | null;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export function TelemetryProvider({
  children,
  client = defaultClient,
}: {
  children: React.ReactNode;
  client?: TelemetryClient;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const prevUserRef = useRef<string | null>(null);
  const workflows = useMemo(() => new WorkflowTracker(client), [client]);

  // 1. Initialize browser listeners on mount
  useEffect(() => {
    client.init();
    return () => {
      client.destroy();
    };
  }, [client]);

  // 2. Track route transitions (excluding /admin)
  useEffect(() => {
    if (!pathname) return;

    if (pathname.startsWith("/admin")) {
      // Exclude admin routes from WBI telemetry completely
      return;
    }

    client.trackPageView(pathname);
  }, [pathname, client]);

  // 3. Handle auth transitions (login & logout)
  useEffect(() => {
    const currentUserId = user ? user.id : null;
    const prevUserId = prevUserRef.current;

    if (prevUserId === null && currentUserId !== null) {
      // Transition: Anonymous -> Authenticated (Login)
      client.getSessionManager().onLogin();
    } else if (prevUserId !== null && currentUserId === null) {
      // Transition: Authenticated -> Anonymous (Logout)
      // Immediately rotate the telemetry session ID so any subsequent interaction cannot be linked to User A
      client.getSessionManager().onLogout();
      // Bounded non-blocking flush; transport falls back to the auth cookie.
      client.flush({ timeoutMs: 2000 }).catch(() => {});
    }

    prevUserRef.current = currentUserId;
  }, [user, client]);

  const contextValue: TelemetryContextValue = useMemo(() => {
    return {
      client,
      workflows,
      track: (cat, name, opt) => client.track(cat, name, opt),
      trackFeature: (feat, act, comp, props) => client.trackFeature(feat, act, comp, props),
      trackAction: (act, comp, props) => client.trackAction(act, comp, props),
      trackFriction: (type, comp, props) => client.trackFriction(type, comp, props),
      trackError: (dom, code, comp, props) => client.trackError(dom, code, comp, props),
    };
  }, [client, workflows]);

  return (
    <TelemetryContext.Provider value={contextValue}>
      {children}
    </TelemetryContext.Provider>
  );
}

/**
 * Main telemetry hook for components.
 */
export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    // Graceful fallback for components rendered outside provider (e.g. isolated story or test)
    return {
      client: defaultClient,
      workflows: new WorkflowTracker(defaultClient),
      track: (cat, name, opt) => defaultClient.track(cat, name, opt),
      trackFeature: (feat, act, comp, props) => defaultClient.trackFeature(feat, act, comp, props),
      trackAction: (act, comp, props) => defaultClient.trackAction(act, comp, props),
      trackFriction: (type, comp, props) => defaultClient.trackFriction(type, comp, props),
      trackError: (dom, code, comp, props) => defaultClient.trackError(dom, code, comp, props),
    };
  }
  return ctx;
}

/**
 * Ergonomic hook for tracking a specific workflow funnel.
 */
export function useWorkflow(workflowId: string) {
  const { workflows } = useTelemetry();

  return {
    start: (initialStep: string = "start", properties?: Record<string, any>) =>
      workflows.start(workflowId, initialStep, properties),
    stepCompleted: (nextStep: string, properties?: Record<string, any>) =>
      workflows.stepCompleted(workflowId, nextStep, properties),
    stepFailed: (errorCode: string, properties?: Record<string, any>) =>
      workflows.stepFailed(workflowId, errorCode, properties),
    complete: (properties?: Record<string, any>) =>
      workflows.complete(workflowId, properties),
    abandon: (reason: string = "user_cancelled", properties?: Record<string, any>) =>
      workflows.abandon(workflowId, reason, properties),
    getActiveInstance: () => workflows.getActiveInstance(workflowId),
  };
}
