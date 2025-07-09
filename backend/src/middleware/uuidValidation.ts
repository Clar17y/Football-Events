import { Request, Response, NextFunction } from 'express';

/**
 * UUID validation regex pattern
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware to validate UUID format in route parameters
 * @param paramName - The name of the parameter to validate (defaults to 'id')
 * @returns Express middleware function
 */
export const validateUUID = (paramName: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const paramValue = req.params[paramName];
    
    if (!paramValue) {
      return res.status(400).json({
        error: 'Missing Parameter',
        message: `Required parameter '${paramName}' is missing`,
        field: paramName
      });
    }
    
    if (!UUID_REGEX.test(paramValue)) {
      return res.status(400).json({
        error: 'Invalid UUID Format',
        message: `Parameter '${paramName}' must be a valid UUID`,
        field: paramName,
        value: paramValue,
        expectedFormat: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      });
    }
    
    return next();
  };
};

/**
 * Middleware to validate multiple UUID parameters
 * @param paramNames - Array of parameter names to validate
 * @returns Express middleware function
 */
export const validateMultipleUUIDs = (paramNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const paramName of paramNames) {
      const paramValue = req.params[paramName];
      
      if (!paramValue) {
        return res.status(400).json({
          error: 'Missing Parameter',
          message: `Required parameter '${paramName}' is missing`,
          field: paramName
        });
      }
      
      if (!UUID_REGEX.test(paramValue)) {
        return res.status(400).json({
          error: 'Invalid UUID Format',
          message: `Parameter '${paramName}' must be a valid UUID`,
          field: paramName,
          value: paramValue,
          expectedFormat: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
        });
      }
    }
    
    return next();
  };
};

/**
 * Utility function to check if a string is a valid UUID
 * @param value - The string to validate
 * @returns boolean indicating if the string is a valid UUID
 */
export const isValidUUID = (value: string): boolean => {
  return UUID_REGEX.test(value);
};