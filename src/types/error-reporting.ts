/**
 * Error Reporting System Types
 * 
 * Type definitions for the error reporting system that allows users
 * to report problems from toast errors.
 */

/**
 * Status of an error report in the admin workflow
 */
export type ErrorReportStatus = "new" | "investigating" | "resolved" | "dismissed";

/**
 * Error context information captured automatically when an error occurs
 */
export interface ErrorContext {
  // Error details
  errorMessage: string;
  errorStack?: string;
  errorName?: string;
  
  // Request/Response information
  apiEndpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  requestUrl?: string;
  
  // User and session information
  userId?: string;
  userEmail?: string;
  guestEmail?: string; // NEW: Guest user email (for non-authenticated users)
  isAuthenticated: boolean;
  
  // Browser/environment information
  userAgent?: string;
  browserInfo?: {
    name?: string;
    version?: string;
    os?: string;
  };
  
  // Page/route information
  currentUrl?: string;
  route?: string;
  referrer?: string;
  
  // Network and console information
  consoleErrors?: Array<{
    message: string;
    source?: string;
    line?: number;
    column?: number;
    timestamp: number;
  }>;
  
  // Additional metadata
  timestamp: number;
  timezone?: string;
}

/**
 * Error report stored in database
 */
export interface IErrorReport {
  _id: string;
  
  // User information
  userId?: string;
  userEmail?: string;
  guestEmail?: string; // NEW: Guest user email (for non-authenticated users)
  isAuthenticated: boolean;
  
  // Error details
  errorMessage: string;
  errorStack?: string;
  errorName?: string;
  category?: "payment" | "network" | "api" | "system" | "recovery"; // NEW: Error category
  severity?: "critical" | "high" | "medium"; // NEW: Error severity
  autoLogged?: boolean; // NEW: Whether error was auto-logged
  
  // Request/Response information
  apiEndpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  requestUrl?: string;
  
  // User-provided notes (optional)
  userNotes?: string;
  
  // Browser/environment information
  userAgent?: string;
  browserInfo?: {
    name?: string;
    version?: string;
    os?: string;
  };
  
  // Page/route information
  currentUrl?: string;
  route?: string;
  referrer?: string;
  
  // Network and console information
  consoleErrors?: Array<{
    message: string;
    source?: string;
    line?: number;
    column?: number;
    timestamp: number;
  }>;
  
  // Privacy-protected information
  ipAddressHash?: string; // Hashed IP address for privacy
  
  // Status and admin management
  status: ErrorReportStatus;
  adminNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  
  // Deduplication
  deduplicationHash: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request payload for creating an error report
 */
export interface CreateErrorReportRequest {
  errorContext: ErrorContext;
  userNotes?: string;
}

/**
 * Response from creating an error report
 */
export interface CreateErrorReportResponse {
  success: boolean;
  reportId?: string;
  message: string;
  isDuplicate?: boolean;
  rateLimited?: boolean;
}

/**
 * Admin query parameters for fetching error reports
 */
export interface ErrorReportsQueryParams {
  page?: number;
  limit?: number;
  status?: ErrorReportStatus;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  category?: "payment" | "network" | "api" | "system" | "recovery"; // ✅ NEW: Filter by category
  severity?: "critical" | "high" | "medium"; // ✅ NEW: Filter by severity
  userEmail?: string; // ✅ NEW: Filter by user email (authenticated or guest)
  autoLogged?: boolean; // ✅ NEW: Filter by auto-logged flag
  apiEndpoint?: string; // ✅ NEW: Filter by API endpoint
  sortBy?: "createdAt" | "status" | "errorMessage" | "category" | "severity"; // ✅ ENHANCED: Added category and severity
  sortOrder?: "asc" | "desc";
}

/**
 * Admin response for error reports list
 */
export interface ErrorReportsListResponse {
  reports: IErrorReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statistics?: {
    total: number;
    byStatus: Record<ErrorReportStatus, number>;
    recentCount: number; // Last 24 hours
  };
}

/**
 * Request payload for updating error report status
 */
export interface UpdateErrorReportRequest {
  status?: ErrorReportStatus;
  adminNotes?: string;
}

