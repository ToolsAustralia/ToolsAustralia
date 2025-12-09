/**
 * Standardized API Route Handler
 *
 * Provides a wrapper for Next.js API routes with:
 * - Authentication/Authorization
 * - Request validation
 * - Error handling
 * - Response formatting
 *
 * @module lib/api/route-handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/utils/logger';
import connectDB from '@/lib/mongodb';

// ============================================================
// HANDLER OPTIONS
// ============================================================

export interface RouteHandlerOptions {
  /**
   * Require authentication
   */
  requireAuth?: boolean;

  /**
   * Require admin role
   */
  requireAdmin?: boolean;

  /**
   * Zod schema for request body validation
   */
  validateBody?: z.ZodSchema;

  /**
   * Zod schema for query parameters validation
   */
  validateQuery?: z.ZodSchema;

  /**
   * Connect to database before handler execution
   */
  connectDatabase?: boolean;

  /**
   * Custom error handler
   */
  onError?: (error: unknown) => NextResponse;
}

// ============================================================
// ROUTE HANDLER WRAPPER
// ============================================================

export function createRouteHandler<T = unknown>(
  handler: (
    request: NextRequest,
    context: {
      session: Awaited<ReturnType<typeof getServerSession>>;
      body?: unknown;
      query?: unknown;
    }
  ) => Promise<NextResponse<T>>,
  options: RouteHandlerOptions = {}
) {
  return async (request: NextRequest): Promise<NextResponse<T>> => {
    try {
      // Connect to database if required
      if (options.connectDatabase !== false) {
        await connectDB();
      }

      // Check authentication
      let session = null;
      if (options.requireAuth || options.requireAdmin) {
        session = await getServerSession(authOptions);

        if (!session?.user?.id) {
          throw new AuthenticationError();
        }

        if (options.requireAdmin && session.user.role !== 'admin') {
          throw new AuthorizationError();
        }
      }

      // Parse and validate request body
      let body: unknown;
      if (options.validateBody) {
        try {
          const rawBody = await request.json();
          body = options.validateBody.parse(rawBody);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new ValidationError('Invalid request body', error.issues);
          }
          throw error;
        }
      }

      // Parse and validate query parameters
      let query: unknown;
      if (options.validateQuery) {
        try {
          const { searchParams } = new URL(request.url);
          const queryObject = Object.fromEntries(searchParams.entries());
          query = options.validateQuery.parse(queryObject);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new ValidationError('Invalid query parameters', error.issues);
          }
          throw error;
        }
      }

      // Execute handler
      return await handler(request, { session, body, query });
    } catch (error) {
      // Use custom error handler if provided
      if (options.onError) {
        return options.onError(error);
      }

      // Use default error handler
      return handleApiError(error);
    }
  };
}

// ============================================================
// CONVENIENCE HELPERS
// ============================================================

/**
 * Create a public route handler (no auth required)
 */
export function createPublicRouteHandler<T = unknown>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  options?: Omit<RouteHandlerOptions, 'requireAuth' | 'requireAdmin'>
) {
  return createRouteHandler<T>(
    async (request) => handler(request),
    { ...options, requireAuth: false }
  );
}

/**
 * Create an authenticated route handler
 */
export function createAuthenticatedRouteHandler<T = unknown>(
  handler: (
    request: NextRequest,
    context: {
      session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
    }
  ) => Promise<NextResponse<T>>,
  options?: Omit<RouteHandlerOptions, 'requireAuth'>
) {
  return createRouteHandler<T>(
    async (request, { session }) => {
      if (!session) {
        throw new AuthenticationError();
      }
      return handler(request, { session });
    },
    { ...options, requireAuth: true }
  );
}

/**
 * Create an admin-only route handler
 */
export function createAdminRouteHandler<T = unknown>(
  handler: (
    request: NextRequest,
    context: {
      session: NonNullable<Awaited<ReturnType<typeof getServerSession>>> & {
        user: { role: 'admin' };
      };
    }
  ) => Promise<NextResponse<T>>,
  options?: Omit<RouteHandlerOptions, 'requireAuth' | 'requireAdmin'>
) {
  return createRouteHandler<T>(
    async (request, { session }) => {
      if (!session || session.user.role !== 'admin') {
        throw new AuthorizationError();
      }
      return handler(request, {
        session: session as typeof session & { user: { role: 'admin' } },
      });
    },
    { ...options, requireAuth: true, requireAdmin: true }
  );
}

