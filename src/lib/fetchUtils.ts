/**
 * Exponential backoff utility for background polling & request retries.
 * Starts at 30 seconds (30,000ms) up to 300 seconds (300,000ms max).
 * Resets backoff to initial 30s on success.
 */

export interface BackoffState {
  currentDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export function createBackoffState(minDelayMs = 30000, maxDelayMs = 300000): BackoffState {
  return {
    currentDelayMs: minDelayMs,
    minDelayMs,
    maxDelayMs,
  };
}

export function handleBackoffSuccess(state: BackoffState): number {
  state.currentDelayMs = state.minDelayMs;
  return state.currentDelayMs;
}

export function handleBackoffFailure(state: BackoffState): number {
  state.currentDelayMs = Math.min(state.maxDelayMs, state.currentDelayMs * 2);
  return state.currentDelayMs;
}

/**
 * Calculates next polling interval for website portal:
 * 300 seconds (5 minutes) ± 30 seconds random jitter = 270,000ms to 330,000ms
 */
export function getJitteredPollInterval(baseMs = 300000, jitterMs = 30000): number {
  const randomJitter = (Math.random() * 2 - 1) * jitterMs; // between -30s and +30s
  return Math.max(10000, Math.round(baseMs + randomJitter));
}
