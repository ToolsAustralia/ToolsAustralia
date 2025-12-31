/**
 * Job Runner
 * 
 * Wrapper for executing background jobs with error handling and logging.
 */

export interface JobResult {
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Run a job with error handling and timing
 */
export async function runJob<T>(
  jobName: string,
  jobFn: () => Promise<T>
): Promise<{ result: T } & JobResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[JOB RUNNER] Starting job: ${jobName}`);
    
    const result = await jobFn();
    
    const duration = Date.now() - startTime;
    console.log(`[JOB RUNNER] Job completed: ${jobName} (${duration}ms)`);
    
    return {
      result,
      success: true,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    console.error(`[JOB RUNNER] Job failed: ${jobName} (${duration}ms)`, errorMessage);
    
    return {
      result: null as T,
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

