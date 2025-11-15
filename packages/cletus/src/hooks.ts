import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook that provides a state variable along with a ref that is always
 * synchronized to the latest state value.
 * 
 * @param initialValue 
 * @returns 
 */
export function useSyncedState<T>(initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const stateRef = useRef<T>(initialValue);
  
  const setSyncedState = useCallback((value: T | ((current: T) => T)) => { 
    const newValue = typeof value === 'function' 
        ? (value as Function)(stateRef.current) 
        : value;
    
    stateRef.current = newValue;
    setState(newValue);
    
    return newValue;
  }, []);
  
  const getState = useCallback(() => stateRef.current, []);
  
  return [state, setSyncedState, getState] as const;
}

/**
 * Simple debounce hook.
 * 
 * ```ts
 * // Basic usage
 * const debouncedValue = useDebounce(value, 300);
 * ```
 * 
 * @param value The value to debounce
 * @param delay Delay in milliseconds
 * @returns 
 */
export function useDebounce<T>(value: T, delay: number): T {
   const [debouncedValue, setDebouncedValue] = useState(value);

   useEffect(() => {
     const handler = setTimeout(() => {
       setDebouncedValue(value);
     }, delay);

     return () => {
       clearTimeout(handler);
     };
   }, [value, delay]);

   return debouncedValue;
}

/**
 * Options for the adaptive debounce hook.
 */
export interface AdaptiveDebounceOptions {
  initialDelay?: number;
  minDelay?: number;
  maxDelay?: number;
  safetyBuffer?: number; // Multiplier for average render time (e.g., 2 = 2x avg)
  sampleSize?: number; // Number of render times to track
}

/**
 * An adaptive debounce hook that adjusts the debounce delay based on render performance.
 * 
 * ```ts
 * // Basic usage with defaults (2x safety buffer)
 * const [setStatusDebounced, delay, cancel] = useAdaptiveDebounce(
 *   (newStatus: string) => {
 *     setStatus(newStatus);
 *   }
 * );
 * 
 * setStatusDebounced(status);
 * ```
 * 
 * @param callback 
 * @param options 
 * @returns 
 */
export function useAdaptiveDebounce<T extends (...args: any[]) => any>(
  callback: T,
  options: AdaptiveDebounceOptions = {}
): [(...args: Parameters<T>) => void, number, () => void] {
  const {
    initialDelay = 0,
    minDelay = 50,
    maxDelay = 1000,
    safetyBuffer = 2,
    sampleSize = 10
  } = options;

  const [delay, setDelay] = useState(initialDelay);
  const renderTimes = useRef<number[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Track render performance and adjust delay
  const trackRenderTime = useCallback((duration: number) => {
    renderTimes.current.push(duration);

    // Keep only last N measurements
    if (renderTimes.current.length > sampleSize) {
      renderTimes.current.shift();
    }

    // Calculate average render time
    const avg = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;

    // Apply safety buffer and constrain to min/max
    const newDelay = Math.ceil(Math.max(
      minDelay,
      Math.min(maxDelay, Math.round(avg * safetyBuffer))
    ));

    if (newDelay !== delay) {
      setDelay(newDelay);
    }
  }, [delay, minDelay, maxDelay, safetyBuffer, sampleSize]);

  // Debounced callback
  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const start = performance.now();
      callbackRef.current(...args);
      const duration = performance.now() - start;
      trackRenderTime(duration);
    }, delay);
  }, [delay, trackRenderTime]);

  // Cancel function
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [debouncedCallback, delay, cancel];
}