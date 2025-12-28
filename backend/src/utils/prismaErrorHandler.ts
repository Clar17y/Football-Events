/**
 * Prisma Error Handling Utilities
 * 
 * Centralized error handling for Prisma database operations.
 * Converts Prisma errors into appropriate HTTP responses.
 */

export interface PrismaError extends Error {
  code: string;
  meta?: {
    target?: string[];
    field_name?: string;
    constraint?: string;
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  field?: string;
  constraint?: string;
  details?: any;
}

/**
 * Convert Prisma error to API error response
 */
export const handlePrismaError = (error: PrismaError, entityName: string = 'entity'): ApiError => {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const target = error.meta?.target || ['unknown'];
      const field = Array.isArray(target) ? target[0] : target;
      return {
        statusCode: 409,
        error: 'Unique Constraint Violation',
        message: `A ${entityName} with this ${field} already exists`,
        field: field || "unknown",
        constraint: 'unique'
      };

    case 'P2003':
      // Foreign key constraint violation
      const fieldName = error.meta?.field_name || 'reference';
      // Extract meaningful field name from constraint name
      let cleanFieldName = fieldName;
      if (fieldName.includes('_')) {
        // Convert "players_current_team_fkey" to "current team"
        const parts = fieldName.split('_');
        if (parts.length > 1 && parts[parts.length - 1] === 'fkey') {
          parts.pop(); // Remove 'fkey'
          parts.shift(); // Remove table name
          cleanFieldName = parts.join(' ');
        }
      }
      
      return {
        statusCode: 400,
        error: 'Foreign Key Constraint Violation',
        message: `Invalid ${cleanFieldName} reference - the referenced ${cleanFieldName} does not exist`,
        field: fieldName,
        constraint: 'foreign_key'
      };

    case 'P2025':
      // Record not found
      return {
        statusCode: 404,
        error: 'Not Found',
        message: `${entityName} not found`,
        constraint: 'not_found'
      };

    case 'P2000':
      // Value too long for column
      return {
        statusCode: 400,
        error: 'Validation Error',
        message: `Value too long for field in ${entityName}`,
        constraint: 'length'
      };

    case 'P2001':
      // Record does not exist (for updates/deletes)
      return {
        statusCode: 404,
        error: 'Not Found',
        message: `${entityName} not found for update or delete`,
        constraint: 'not_found'
      };

    case 'P2004':
      // Constraint failed
      return {
        statusCode: 400,
        error: 'Constraint Violation',
        message: `Database constraint failed for ${entityName}`,
        constraint: 'database'
      };

    default:
      // Unknown Prisma error
      return {
        statusCode: 500,
        error: 'Database Error',
        message: `An unexpected database error occurred while processing ${entityName}`,
        constraint: 'unknown'
      };
  }
};

/**
 * Check if error is a Prisma error
 */
export const isPrismaError = (error: any): error is PrismaError => {
  return error && typeof error.code === 'string' && error.code.startsWith('P');
};

/**
 * Wrapper for service methods that handles Prisma errors
 */
export const withPrismaErrorHandling = async <T>(
  operation: () => Promise<T>,
  entityName: string = 'entity'
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (isPrismaError(error)) {
      const apiError = handlePrismaError(error, entityName);
      const customError = new Error(apiError.message) as any;
      customError.statusCode = apiError.statusCode;
      customError.apiError = apiError;
      throw customError;
    }
    
    // Handle custom errors with statusCode
    if (error.statusCode && error.code) {
      const apiError: ApiError = {
        statusCode: error.statusCode,
        error: error.code.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        message: error.message,
        code: error.code,
        details: error.details,
        constraint: error.code.toLowerCase()
      };
      const customError = new Error(apiError.message) as any;
      customError.statusCode = apiError.statusCode;
      customError.code = apiError.code;
      customError.details = apiError.details;
      customError.apiError = apiError;
      throw customError;
    }
    
    throw error;
  }
};

/**
 * Extract API error from thrown error
 */
export const extractApiError = (error: any): ApiError | null => {
  if (error.apiError) {
    return error.apiError;
  }
  if (isPrismaError(error)) {
    return handlePrismaError(error);
  }
  return null;
};
