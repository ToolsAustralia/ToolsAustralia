/**
 * Loading States Utilities
 *
 * This file contains utilities for managing loading states consistently across the application.
 */

import { useState, useCallback, useMemo } from "react";

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
}

export interface LoadingStates {
  [key: string]: LoadingState;
}

/**
 * Hook for managing multiple loading states
 */
export const useLoadingStates = (initialStates: string[] = []) => {
  const [states, setStates] = useState<LoadingStates>(() => {
    const initial: LoadingStates = {};
    initialStates.forEach((state) => {
      initial[state] = {
        isLoading: false,
        error: null,
        isSuccess: false,
      };
    });
    return initial;
  });

  const setLoading = useCallback((stateName: string, isLoading: boolean) => {
    setStates((prev) => ({
      ...prev,
      [stateName]: {
        ...prev[stateName],
        isLoading,
        error: isLoading ? null : prev[stateName]?.error,
      },
    }));
  }, []);

  const setError = useCallback((stateName: string, error: string | null) => {
    setStates((prev) => ({
      ...prev,
      [stateName]: {
        ...prev[stateName],
        isLoading: false,
        error,
        isSuccess: false,
      },
    }));
  }, []);

  const setSuccess = useCallback((stateName: string, isSuccess: boolean = true) => {
    setStates((prev) => ({
      ...prev,
      [stateName]: {
        ...prev[stateName],
        isLoading: false,
        error: null,
        isSuccess,
      },
    }));
  }, []);

  const resetState = useCallback((stateName: string) => {
    setStates((prev) => ({
      ...prev,
      [stateName]: {
        isLoading: false,
        error: null,
        isSuccess: false,
      },
    }));
  }, []);

  const resetAllStates = useCallback(() => {
    setStates((prev) => {
      const reset: LoadingStates = {};
      Object.keys(prev).forEach((key) => {
        reset[key] = {
          isLoading: false,
          error: null,
          isSuccess: false,
        };
      });
      return reset;
    });
  }, []);

  const getState = useCallback(
    (stateName: string): LoadingState => {
      return (
        states[stateName] || {
          isLoading: false,
          error: null,
          isSuccess: false,
        }
      );
    },
    [states]
  );

  const isAnyLoading = useMemo(() => {
    return Object.values(states).some((state) => state.isLoading);
  }, [states]);

  const hasAnyError = useMemo(() => {
    return Object.values(states).some((state) => state.error);
  }, [states]);

  const isAllSuccess = useMemo(() => {
    return Object.values(states).every((state) => state.isSuccess);
  }, [states]);

  return {
    states,
    setLoading,
    setError,
    setSuccess,
    resetState,
    resetAllStates,
    getState,
    isAnyLoading,
    hasAnyError,
    isAllSuccess,
  };
};

/**
 * Hook for managing a single loading state
 */
export const useLoadingState = (
  initialState: LoadingState = {
    isLoading: false,
    error: null,
    isSuccess: false,
  }
) => {
  const [state, setState] = useState<LoadingState>(initialState);

  const setLoading = useCallback((isLoading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading,
      error: isLoading ? null : prev.error,
    }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      isLoading: false,
      error,
      isSuccess: false,
    }));
  }, []);

  const setSuccess = useCallback((isSuccess: boolean = true) => {
    setState((prev) => ({
      ...prev,
      isLoading: false,
      error: null,
      isSuccess,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      isSuccess: false,
    });
  }, []);

  return {
    ...state,
    setLoading,
    setError,
    setSuccess,
    reset,
  };
};

/**
 * Hook for managing async operation loading states
 */
export const useAsyncLoading = () => {
  const { isLoading, error, isSuccess, setLoading, setError, setSuccess, reset } = useLoadingState();

  const execute = useCallback(
    async <T>(
      asyncFn: () => Promise<T>,
      options?: {
        onSuccess?: (result: T) => void;
        onError?: (error: Error) => void;
        onFinally?: () => void;
      }
    ): Promise<T | null> => {
      try {
        setLoading(true);
        const result = await asyncFn();
        setSuccess(true);
        options?.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("An unexpected error occurred");
        setError(error.message);
        options?.onError?.(error);
        return null;
      } finally {
        setLoading(false);
        options?.onFinally?.();
      }
    },
    [setLoading, setError, setSuccess]
  );

  return {
    isLoading,
    error,
    isSuccess,
    execute,
    reset,
  };
};

/**
 * Hook for managing form submission loading states
 */
export const useFormLoading = () => {
  const { isLoading, error, isSuccess, setLoading, setError, setSuccess, reset } = useLoadingState();

  const submit = useCallback(
    async <T>(
      submitFn: () => Promise<T>,
      options?: {
        onSuccess?: (result: T) => void;
        onError?: (error: Error) => void;
        onFinally?: () => void;
      }
    ): Promise<T | null> => {
      try {
        setLoading(true);
        const result = await submitFn();
        setSuccess(true);
        options?.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Form submission failed");
        setError(error.message);
        options?.onError?.(error);
        return null;
      } finally {
        setLoading(false);
        options?.onFinally?.();
      }
    },
    [setLoading, setError, setSuccess]
  );

  return {
    isLoading,
    error,
    isSuccess,
    submit,
    reset,
  };
};

/**
 * Hook for managing pagination loading states
 */
export const usePaginationLoading = () => {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMore = useCallback(
    async <T>(
      loadMoreFn: () => Promise<{ data: T[]; hasMore: boolean }>,
      options?: {
        onSuccess?: (data: T[]) => void;
        onError?: (error: Error) => void;
      }
    ): Promise<T[] | null> => {
      if (!hasMore || isLoadingMore) return null;

      try {
        setIsLoadingMore(true);
        const result = await loadMoreFn();
        setHasMore(result.hasMore);
        options?.onSuccess?.(result.data);
        return result.data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to load more data");
        options?.onError?.(error);
        return null;
      } finally {
        setIsLoadingMore(false);
      }
    },
    [hasMore, isLoadingMore]
  );

  const refresh = useCallback(
    async <T>(
      refreshFn: () => Promise<{ data: T[]; hasMore: boolean }>,
      options?: {
        onSuccess?: (data: T[]) => void;
        onError?: (error: Error) => void;
      }
    ): Promise<T[] | null> => {
      try {
        setIsRefreshing(true);
        setHasMore(true);
        const result = await refreshFn();
        setHasMore(result.hasMore);
        options?.onSuccess?.(result.data);
        return result.data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to refresh data");
        options?.onError?.(error);
        return null;
      } finally {
        setIsRefreshing(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setIsLoadingMore(false);
    setHasMore(true);
    setIsRefreshing(false);
  }, []);

  return {
    isLoadingMore,
    hasMore,
    isRefreshing,
    loadMore,
    refresh,
    reset,
  };
};




