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
    return 10;
  }
  return parsedValue;
}

async function connectDB(): Promise<mongoose.Connection> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const maxPoolSize = getMaxPoolSize();
    const opts = {
      bufferCommands: false,
      // Production optimizations
      maxPoolSize, // Maintain up to N socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
    };

    cached.promise = mongoose
      .connect(getMongoURI(), opts)
      .then((mongoose) => {
        console.log(`✅ MongoDB connected successfully (maxPoolSize=${maxPoolSize})`);
        return mongoose.connection;
      })
      .catch((error) => {
        console.error("❌ MongoDB connection error:", error);
        cached.promise = null;
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("❌ Failed to establish MongoDB connection:", e);
    throw e;
  }

  return cached.conn;
}

export default connectDB;
