import mongoose from "mongoose";
import { canAttemptConnection, recordConnectionSuccess, recordConnectionFailure } from "@/utils/database/circuit-breaker";

// Get MONGODB_URI from environment variables
function getMongoURI(): string {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
  }

  return MONGODB_URI;
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Connection lifecycle tracking for leak detection (development only)
let connectionStartTime: number | null = null;

if (process.env.NODE_ENV === "development") {
  // Monitor for connection leaks - warn if connection stays open > 5 minutes
  setInterval(() => {
    if (cached.conn && connectionStartTime) {
      const connectionAge = Date.now() - connectionStartTime;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (connectionAge > fiveMinutes) {
        const metrics = getConnectionMetrics();
        console.warn(
          `⚠️ Connection has been open for ${Math.round(connectionAge / 1000)}s. ` +
          `This may indicate a connection leak. Pool: ${metrics?.active || 0}/${metrics?.maxPoolSize || 0}`
        );
      }
    }
  }, 60000); // Check every minute
}

function getMaxPoolSize(): number {
  const rawValue = process.env.MONGODB_MAX_POOL;
  const parsedValue = rawValue ? Number(rawValue) : NaN;
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    // Default to 30 for MongoDB M10 tier (1500 connections per node)
    // Provides buffer for concurrent operations while staying well under limit
    // Can be overridden via MONGODB_MAX_POOL env var if needed
    return 30;
  }
  return parsedValue;
}

/**
 * Check if error is an SSL/TLS error that should be retried
 */
function isSSLRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const errorMessage = error.message.toLowerCase();
  const errorCode = (error as { code?: string }).code;
  
  return (
    errorMessage.includes('ssl') ||
    errorMessage.includes('tls') ||
    errorMessage.includes('tlsv1 alert') ||
    errorCode === 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ECONNRESET'
  );
}

/**
 * Health check for cached connection
 */
async function checkConnectionHealth(conn: mongoose.Connection): Promise<boolean> {
  try {
    if (conn.readyState !== 1) return false;
    // Ping the database to verify connection is actually healthy
    if (!conn.db) return false;
    await conn.db.admin().ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Connect to MongoDB with retry logic for SSL/TLS errors
 */
async function connectWithRetry(uri: string, opts: mongoose.ConnectOptions, maxRetries = 3): Promise<mongoose.Connection> {
  const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in milliseconds
  
  // Check circuit breaker before attempting connection
  if (!canAttemptConnection()) {
    const error = new Error('Circuit breaker is OPEN - connection attempts blocked due to repeated failures');
    (error as any).code = 'CIRCUIT_BREAKER_OPEN';
    throw error;
  }
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const mongooseInstance = await mongoose.connect(uri, opts);
      recordConnectionSuccess(); // Record success in circuit breaker
      return mongooseInstance.connection;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = isSSLRetryableError(error);
      
      if (isLastAttempt || !isRetryable) {
        recordConnectionFailure(); // Record failure in circuit breaker
        // Log connection pool metrics if available for debugging
        if (cached.conn) {
          try {
            const metrics = getConnectionMetrics();
            if (metrics) {
              console.error('Connection pool metrics at error:', metrics);
            }
          } catch {
            // Ignore metrics errors
          }
        }
        throw error;
      }
      
      const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.warn(`⚠️ MongoDB connection attempt ${attempt + 1} failed (SSL/TLS error), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  recordConnectionFailure();
  throw new Error('Failed to connect after retries');
}

async function connectDB(): Promise<mongoose.Connection> {
  // Check if cached connection exists and is healthy
  if (cached.conn && cached.conn.readyState === 1) {
    // Verify connection is actually healthy with ping
    const isHealthy = await checkConnectionHealth(cached.conn);
    if (isHealthy) {
      return cached.conn;
    } else {
      // Connection is stale, clear cache
      console.warn('⚠️ Cached MongoDB connection is unhealthy, clearing cache');
      cached.conn = null;
      cached.promise = null;
    }
  }

  // If disconnected, clear cache
  if (cached.conn && cached.conn.readyState !== 1) {
    cached.conn = null;
  }

  if (!cached.promise) {
    const maxPoolSize = getMaxPoolSize();
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      // Production optimizations for M10 tier
      maxPoolSize, // Default: 30 (optimized for M10 tier 1500 connections per node)
      minPoolSize: 3, // Maintain minimum warm connections
      maxConnecting: 10, // Limit concurrent connection attempts
      serverSelectionTimeoutMS: 10000, // 10s - fast enough for API routes, prevents webhook timeouts
      connectTimeoutMS: 10000, // 10s - connection establishment timeout
      socketTimeoutMS: 45000, // Keep existing
      maxIdleTimeMS: 30000, // 30s - close idle connections (stable, not aggressive)
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true, // Retry write operations on transient failures
      retryReads: true, // Retry read operations on transient failures
      // TLS options omitted - let mongodb+srv:// URI handle TLS automatically
      // Only add if TLS mismatch issues are confirmed:
      // tls: true,
      // tlsAllowInvalidCertificates: false,
    };

    // Set up connection event handlers
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      cached.conn = null;
      cached.promise = null;
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      // Clear cache on SSL errors to force fresh connection
      if (isSSLRetryableError(err)) {
        cached.conn = null;
        cached.promise = null;
      }
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    cached.promise = connectWithRetry(getMongoURI(), opts)
      .then((conn) => {
        console.log(`✅ MongoDB connected successfully (maxPoolSize=${maxPoolSize})`);
        // Track connection start time for leak detection
        if (process.env.NODE_ENV === "development") {
          connectionStartTime = Date.now();
        }
        return conn;
      })
      .catch((error) => {
        console.error("❌ MongoDB connection error:", error);
        cached.promise = null;
        cached.conn = null; // Clear cache on connection errors to force reconnection
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.conn = null; // Clear cache on connection errors
    console.error("❌ Failed to establish MongoDB connection:", e);
    throw e;
  }

  return cached.conn;
}

/**
 * Get connection pool metrics for monitoring
 * Returns null if connection is not established
 */
export function getConnectionMetrics(): {
  active: number;
  idle: number;
  maxPoolSize: number;
  waitQueue: number;
  readyState: number;
} | null {
  if (!cached.conn || !cached.conn.db) return null;
  
  try {
    const conn = cached.conn;
    const server = (conn.db as any).serverConfig;
    
    // Access connection pool if available
    if (server?.s?.pool) {
      const pool = server.s.pool;
      return {
        active: pool.totalConnectionCount || 0,
        idle: pool.availableConnectionCount || 0,
        maxPoolSize: pool.options?.maxPoolSize || getMaxPoolSize(),
        waitQueue: pool.waitQueue?.length || 0,
        readyState: conn.readyState,
      };
    }
    
    // Fallback: return basic connection state
    return {
      active: 0,
      idle: 0,
      maxPoolSize: getMaxPoolSize(),
      waitQueue: 0,
      readyState: conn.readyState,
    };
  } catch (error) {
    console.error('Error getting connection metrics:', error);
    return null;
  }
}

export default connectDB;
