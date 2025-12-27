export type ApiErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'FEATURE_LOCKED'
  | 'INVALID_PAYLOAD'
  | 'ACCESS_DENIED';

export type ApiErrorDetails = Record<string, unknown>;

export type ApiErrorLike = Error & {
  statusCode: number;
  code: ApiErrorCode;
  details?: ApiErrorDetails;
};

export function createApiError(params: {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetails;
}): ApiErrorLike {
  const err = new Error(params.message) as ApiErrorLike;
  err.statusCode = params.statusCode;
  err.code = params.code;
  if (params.details) err.details = params.details;
  return err;
}

