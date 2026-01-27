import mongoose from "mongoose";

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

function getMaxPoolSize(): number {
  const rawValue = process.env.MONGODB_MAX_POOL;
  const parsedValue = rawValue ? Number(rawValue) : NaN;
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    // Default to 5 for MongoDB Flex tier (500 connection limit)
    // With Vercel Pro's high concurrency, lower pool size prevents exhaustion
    // Can be overridden via MONGODB_MAX_POOL env var if needed
    return 5;
  }
  return parsedValue;
}

async function connectDB(): Promise<mongoose.Connection> {
  // Check if cached connection exists and is still connected
  if (cached.conn && cached.conn.readyState === 1) {
    return cached.conn;
  }

  // If disconnected, clear cache
  if (cached.conn && cached.conn.readyState !== 1) {
    cached.conn = null;
  }

  if (!cached.promise) {
    const maxPoolSize = getMaxPoolSize();
    const opts = {
      bufferCommands: false,
      // Production optimizations
      maxPoolSize, // Default: 5 (optimized for Flex tier 500 connection limit)
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
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    cached.promise = mongoose
      .connect(getMongoURI(), opts)
      .then((mongoose) => {
        console.log(`✅ MongoDB connected successfully (maxPoolSize=${maxPoolSize})`);
        return mongoose.connection;
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

export default connectDB;
