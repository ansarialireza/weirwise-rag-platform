/**
 * Weirwise Behavioral Intelligence (WBI) – In-Memory Event Buffer
 * 
 * Bounded queue with priority eviction policy:
 * - High: workflow.funnel.completed, workflow.funnel.failed, workflow.step.failed, error.*
 * - Normal: navigation.route.viewed, feature.*, action.*
 * - Low: navigation.dwell.heartbeat, minor interactions
 * 
 * Eviction policy on overflow (capacity 200):
 * 1. Evicts oldest Low-priority events first.
 * 2. If no Low-priority events, evicts oldest Normal-priority events.
 * 3. Never allows unbounded memory growth.
 */

import { BehavioralEventItem, EventPriority, QueuedEvent } from "./types";

export const DEFAULT_MAX_BUFFER_SIZE = 200;

export class EventBuffer {
  private queue: QueuedEvent[] = [];
  private maxCapacity: number;

  constructor(maxCapacity: number = DEFAULT_MAX_BUFFER_SIZE) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  public get length(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  public clear(): void {
    this.queue = [];
  }

  /**
   * Enqueues an event, applying priority eviction if capacity is reached.
   */
  public enqueue(event: BehavioralEventItem, priority: EventPriority = "normal"): boolean {
    if (this.queue.length >= this.maxCapacity) {
      this.evictOne();
    }

    // If still at capacity (e.g. queue full of high priority and new is low), drop new if low
    if (this.queue.length >= this.maxCapacity) {
      if (priority === "low") {
        return false; // Drop low priority event
      }
      // If new is normal or high, drop the oldest event regardless
      this.queue.shift();
    }

    this.queue.push({
      event,
      priority,
      enqueued_at: Date.now(),
      retry_count: 0,
    });

    return true;
  }

  /**
   * Dequeues a batch of up to `count` events.
   */
  public dequeueBatch(count: number): QueuedEvent[] {
    const batchSize = Math.min(count, this.queue.length);
    if (batchSize <= 0) return [];
    return this.queue.splice(0, batchSize);
  }

  /**
   * Re-queues events that failed delivery back to the front of the queue
   * (preserving original event IDs and incrementing retry count).
   */
  public reinsertBatch(failedBatch: QueuedEvent[]): void {
    const retryable = failedBatch.filter((item) => item.retry_count < 3);
    for (const item of retryable) {
      item.retry_count += 1;
    }

    // Put retryable items back at the head of the queue
    this.queue = [...retryable, ...this.queue];

    // Enforce capacity after reinsertion
    while (this.queue.length > this.maxCapacity) {
      this.evictOne();
    }
  }

  /**
   * Returns a snapshot of queued items without mutating the queue.
   */
  public peek(count?: number): QueuedEvent[] {
    if (count === undefined) {
      return [...this.queue];
    }
    return this.queue.slice(0, count);
  }

  /**
   * Evicts a single item according to priority policy:
   * 1. Oldest 'low' priority
   * 2. Oldest 'normal' priority
   * 3. Oldest overall
   */
  private evictOne(): void {
    // 1. Look for oldest low priority event
    const lowIndex = this.queue.findIndex((item) => item.priority === "low");
    if (lowIndex !== -1) {
      this.queue.splice(lowIndex, 1);
      return;
    }

    // 2. Look for oldest normal priority event
    const normalIndex = this.queue.findIndex((item) => item.priority === "normal");
    if (normalIndex !== -1) {
      this.queue.splice(normalIndex, 1);
      return;
    }

    // 3. Fallback: oldest overall
    this.queue.shift();
  }
}
