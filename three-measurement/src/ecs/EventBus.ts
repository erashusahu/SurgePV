/**
 * Event data type
 */
export type EventData = Record<string, unknown>;

/**
 * Event callback type
 */
export type EventCallback = (data: EventData) => void;

/**
 * Event history entry
 */
interface EventHistoryEntry {
  event: string;
  data: EventData;
  timestamp: number;
}

/**
 * EventBus - pub/sub system for decoupled communication
 * Systems and entities emit/listen to events without direct dependencies
 */
export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();
  private eventHistory: EventHistoryEntry[] = [];
  private maxHistorySize = 100;
  private debugMode = false;

  /**
   * Enable/disable debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Emit an event to all registered listeners
   */
  emit(event: string, data: EventData = {}): void {
    if (this.debugMode) {
      console.log(`[EventBus] Emit: ${event}`, data);
    }

    const callbacks = this.listeners.get(event);

    if (callbacks) {
      // Create snapshot to handle removal during iteration
      const callbackArray = Array.from(callbacks);
      for (const callback of callbackArray) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      }
    }

    // Add to history for debugging
    this.addToHistory(event, data);
  }

  /**
   * Listen for an event
   * Returns unsubscribe function
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Listen for an event once (auto-unsubscribe after first call)
   */
  once(event: string, callback: EventCallback): () => void {
    const unsubscribe = this.on(event, (data) => {
      callback(data);
      unsubscribe();
    });

    return unsubscribe;
  }

  /**
   * Remove all listeners for a specific event or all events
   */
  off(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get number of listeners for an event
   */
  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Get all registered event names
   */
  getEvents(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Check if event has listeners
   */
  hasListeners(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  /**
   * Get event history (most recent events)
   */
  getHistory(limit?: number): EventHistoryEntry[] {
    if (limit === undefined) {
      return [...this.eventHistory];
    }
    return this.eventHistory.slice(-limit);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Set max history size
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    // Trim if necessary
    if (this.eventHistory.length > size) {
      this.eventHistory = this.eventHistory.slice(-size);
    }
  }

  /**
   * Add event to history
   */
  private addToHistory(event: string, data: EventData): void {
    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Reset the event bus (clear all listeners and history)
   */
  reset(): void {
    this.listeners.clear();
    this.eventHistory = [];
  }
}
