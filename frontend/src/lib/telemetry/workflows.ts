/**
 * Weirwise Behavioral Intelligence (WBI) – Workflow & Funnel State Tracker
 * 
 * Supports multi-step user funnels:
 * - Assistant Creation & Configuration (wf_configure_assistant)
 * - Document & Knowledge Ingestion (wf_upload_documents)
 * - Model & Provider Settings (wf_configure_provider)
 * 
 * Features:
 * - Generates unique workflow_instance_id (UUIDv4) per funnel run
 * - Enforces step order and records step elapsed duration
 * - Supports start, step completion, failure, completion, and explicit abandonment
 */

import { generateUUID } from "./session";
import { TelemetryClient } from "./client";

export interface WorkflowInstance {
  workflowId: string;
  instanceId: string;
  startTime: number;
  currentStepIndex: number;
  currentStepName: string | null;
  stepStartTime: number;
}

export class WorkflowTracker {
  private client: TelemetryClient;
  private activeWorkflows: Map<string, WorkflowInstance> = new Map();

  constructor(client: TelemetryClient) {
    this.client = client;
  }

  /**
   * Starts a new workflow funnel run.
   */
  public start(
    workflowId: string,
    initialStepName: string = "start",
    properties?: Record<string, any>
  ): string {
    const instanceId = generateUUID();
    const now = Date.now();

    const instance: WorkflowInstance = {
      workflowId,
      instanceId,
      startTime: now,
      currentStepIndex: 0,
      currentStepName: initialStepName,
      stepStartTime: now,
    };

    this.activeWorkflows.set(workflowId, instance);

    this.client.track("workflow", "workflow.funnel.started", {
      priority: "high",
      durationMs: 0,
      properties: {
        ...(properties || {}),
        workflow_id: workflowId,
        workflow_instance_id: instanceId,
        step_name: initialStepName,
        step_index: 0,
      },
    });

    return instanceId;
  }

  /**
   * Completes a step within an active workflow and moves to next step.
   */
  public stepCompleted(
    workflowId: string,
    nextStepName: string,
    properties?: Record<string, any>
  ): void {
    const instance = this.activeWorkflows.get(workflowId);
    if (!instance) return;

    const now = Date.now();
    const stepDuration = now - instance.stepStartTime;
    const completedStepName = instance.currentStepName;
    const completedStepIndex = instance.currentStepIndex;

    // Advance step state
    instance.currentStepIndex += 1;
    instance.currentStepName = nextStepName;
    instance.stepStartTime = now;

    this.client.track("workflow", "workflow.step.completed", {
      priority: "normal",
      durationMs: stepDuration,
      properties: {
        ...(properties || {}),
        workflow_id: workflowId,
        workflow_instance_id: instance.instanceId,
        step_name: completedStepName,
        step_index: completedStepIndex,
        next_step_name: nextStepName,
      },
    });
  }

  /**
   * Records a failure at a workflow step.
   */
  public stepFailed(
    workflowId: string,
    errorCode: string,
    properties?: Record<string, any>
  ): void {
    const instance = this.activeWorkflows.get(workflowId);
    if (!instance) return;

    const now = Date.now();
    const stepDuration = now - instance.stepStartTime;

    this.client.track("workflow", "workflow.step.failed", {
      priority: "high",
      durationMs: stepDuration,
      properties: {
        ...(properties || {}),
        workflow_id: workflowId,
        workflow_instance_id: instance.instanceId,
        step_name: instance.currentStepName,
        step_index: instance.currentStepIndex,
        error_code: errorCode,
      },
    });
  }

  /**
   * Concludes workflow successfully.
   */
  public complete(
    workflowId: string,
    properties?: Record<string, any>
  ): void {
    const instance = this.activeWorkflows.get(workflowId);
    if (!instance) return;

    const totalDuration = Date.now() - instance.startTime;
    this.activeWorkflows.delete(workflowId);

    this.client.track("workflow", "workflow.funnel.completed", {
      priority: "high",
      durationMs: totalDuration,
      properties: {
        ...(properties || {}),
        workflow_id: workflowId,
        workflow_instance_id: instance.instanceId,
        total_steps: instance.currentStepIndex + 1,
      },
    });
  }

  /**
   * Explicitly marks workflow as abandoned (e.g. user cancelled modal or aborted).
   */
  public abandon(
    workflowId: string,
    reason: string = "user_cancelled",
    properties?: Record<string, any>
  ): void {
    const instance = this.activeWorkflows.get(workflowId);
    if (!instance) return;

    const totalDuration = Date.now() - instance.startTime;
    this.activeWorkflows.delete(workflowId);

    this.client.track("workflow", "workflow.funnel.abandoned", {
      priority: "high",
      durationMs: totalDuration,
      properties: {
        ...(properties || {}),
        workflow_id: workflowId,
        workflow_instance_id: instance.instanceId,
        abandoned_at_step: instance.currentStepName,
        abandoned_at_step_index: instance.currentStepIndex,
        reason,
      },
    });
  }

  public getActiveInstance(workflowId: string): WorkflowInstance | undefined {
    return this.activeWorkflows.get(workflowId);
  }
}
