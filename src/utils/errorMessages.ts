/**
 * User-friendly error messages and error categorization
 */

import type { ErrorCategory } from '../hooks/useErrorHandler';

/**
 * Error message templates
 */
export const ERROR_MESSAGES = {
  // Validation errors
  validation: {
    required: 'This field is required',
    invalid_format: 'Please enter a valid format',
    too_long: 'This value is too long',
    too_short: 'This value is too short',
    invalid_email: 'Please enter a valid email address',
    invalid_number: 'Please enter a valid number',
    invalid_date: 'Please enter a valid date',
    player_name_required: 'Player name is required',
    team_name_required: 'Team name is required',
    jersey_number_invalid: 'Jersey number must be between 1 and 99',
    sentiment_invalid: 'Sentiment must be between -4 and 4',
    notes_too_long: 'Notes are too long (maximum 500 characters)',
    event_kind_invalid: 'Please select a valid event type'
  },

  // Network errors
  network: {
    connection_failed: 'Unable to connect. Please check your internet connection.',
    timeout: 'Request timed out. Please try again.',
    server_error: 'Server error occurred. Please try again later.',
    not_found: 'The requested resource was not found.',
    unauthorized: 'You are not authorized to perform this action.',
    forbidden: 'Access to this resource is forbidden.',
    rate_limited: 'Too many requests. Please wait a moment and try again.',
    offline: 'You appear to be offline. Changes will be saved locally.',
    sync_failed: 'Failed to sync data. Your changes are saved locally.'
  },

  // Database errors
  database: {
    save_failed: 'Failed to save data. Please try again.',
    load_failed: 'Failed to load data. Please refresh the page.',
    delete_failed: 'Failed to delete item. Please try again.',
    update_failed: 'Failed to update item. Please try again.',
    quota_exceeded: 'Storage quota exceeded. Please free up some space.',
    corruption: 'Data corruption detected. Please contact support.',
    migration_failed: 'Database update failed. Please refresh the page.',
    transaction_failed: 'Database transaction failed. Please try again.'
  },

  // Permission errors
  permission: {
    access_denied: 'Access denied. You don\'t have permission for this action.',
    login_required: 'Please log in to continue.',
    insufficient_privileges: 'You don\'t have sufficient privileges.',
    resource_locked: 'This resource is currently locked by another user.',
    read_only: 'This resource is read-only.',
    expired_session: 'Your session has expired. Please log in again.'
  },

  // System errors
  system: {
    unexpected_error: 'An unexpected error occurred. Please try refreshing the page.',
    feature_unavailable: 'This feature is currently unavailable.',
    maintenance_mode: 'The system is currently under maintenance.',
    browser_unsupported: 'Your browser is not supported. Please update or use a different browser.',
    javascript_error: 'A JavaScript error occurred. Please refresh the page.',
    memory_error: 'Insufficient memory. Please close other tabs and try again.',
    file_too_large: 'File is too large. Please choose a smaller file.',
    invalid_operation: 'This operation is not valid in the current state.'
  },

  // User errors
  user: {
    operation_cancelled: 'Operation was cancelled.',
    invalid_input: 'Please check your input and try again.',
    duplicate_entry: 'This entry already exists.',
    no_changes: 'No changes were made.',
    confirmation_required: 'Please confirm this action.',
    selection_required: 'Please make a selection first.'
  }
} as const;

/**
 * Action suggestions for different error types
 */
export const ERROR_ACTIONS = {
  validation: [
    'Check your input format',
    'Ensure all required fields are filled',
    'Verify the data meets requirements'
  ],
  network: [
    'Check your internet connection',
    'Try again in a few moments',
    'Contact support if the problem persists'
  ],
  database: [
    'Try saving again',
    'Refresh the page',
    'Check available storage space'
  ],
  permission: [
    'Log in with appropriate credentials',
    'Contact an administrator',
    'Check your account permissions'
  ],
  system: [
    'Refresh the page',
    'Clear your browser cache',
    'Try using a different browser',
    'Contact technical support'
  ],
  user: [
    'Review your input',
    'Try the operation again',
    'Check the current state'
  ]
} as const;

/**
 * Get user-friendly error message based on error details
 */
export function getUserFriendlyMessage(
  error: Error | string,
  category?: ErrorCategory,
  context?: string
): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();

  // If category is provided, use category-specific messages
  if (category) {
    return getCategoryMessage(lowerMessage, category, context);
  }

  // Auto-detect category and get message
  const detectedCategory = detectErrorCategory(lowerMessage);
  return getCategoryMessage(lowerMessage, detectedCategory, context);
}

/**
 * Get category-specific error message
 */
function getCategoryMessage(
  errorMessage: string,
  category: ErrorCategory,
  context?: string
): string {
  const messages = ERROR_MESSAGES[category];
  
  // Try to match specific error patterns
  for (const [key, message] of Object.entries(messages)) {
    if (errorMessage.includes(key.replace('_', ' ')) || 
        errorMessage.includes(key.replace('_', ''))) {
      return String(message);
    }
  }

  // Fallback to generic category message
  switch (category) {
    case 'validation':
      return context 
        ? `Please check the ${context} field and try again.`
        : 'Please check your input and try again.';
    case 'network':
      return 'Connection problem. Please check your internet and try again.';
    case 'database':
      return 'Problem saving data. Please try again.';
    case 'permission':
      return 'You don\'t have permission to perform this action.';
    case 'system':
      return 'Something unexpected happened. Please try refreshing the page.';
    case 'user':
      return 'Operation cancelled or invalid input provided.';
    default:
      return 'An error occurred. Please try again.';
  }
}

/**
 * Detect error category from error message
 */
function detectErrorCategory(errorMessage: string): ErrorCategory {
  // Validation patterns
  if (errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('validation') ||
      errorMessage.includes('format') ||
      errorMessage.includes('too long') ||
      errorMessage.includes('too short')) {
    return 'validation';
  }

  // Network patterns
  if (errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('offline') ||
      errorMessage.includes('sync')) {
    return 'network';
  }

  // Database patterns
  if (errorMessage.includes('database') ||
      errorMessage.includes('indexeddb') ||
      errorMessage.includes('save') ||
      errorMessage.includes('load') ||
      errorMessage.includes('storage') ||
      errorMessage.includes('quota')) {
    return 'database';
  }

  // Permission patterns
  if (errorMessage.includes('permission') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('login')) {
    return 'permission';
  }

  // User patterns
  if (errorMessage.includes('cancelled') ||
      errorMessage.includes('aborted') ||
      errorMessage.includes('user') ||
      errorMessage.includes('duplicate')) {
    return 'user';
  }

  // Default to system error
  return 'system';
}

/**
 * Get action suggestions for an error
 */
export function getErrorActions(category: ErrorCategory): readonly string[] {
  return ERROR_ACTIONS[category] ?? ERROR_ACTIONS.system;
}

/**
 * Format error for display with context
 */
export function formatErrorMessage(
  error: Error | string,
  context?: string,
  includeActions?: boolean
): {
  message: string;
  actions?: readonly string[];
  category: ErrorCategory;
} {
  const category = detectErrorCategory(
    typeof error === 'string' ? error : error.message
  );
  
  const message = getUserFriendlyMessage(error, category, context);
  const actions = includeActions ? getErrorActions(category) : undefined;

  return {
    message,
    actions,
    category
  };
}

/**
 * Check if an error is retryable based on its category and message
 */
export function isRetryableError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const category = detectErrorCategory(errorMessage.toLowerCase());

  // Network and database errors are generally retryable
  if (category === 'network' || category === 'database') {
    return true;
  }

  // Some system errors are retryable
  if (category === 'system') {
    const lowerMessage = errorMessage.toLowerCase();
    return lowerMessage.includes('timeout') ||
           lowerMessage.includes('temporary') ||
           lowerMessage.includes('busy') ||
           lowerMessage.includes('retry');
  }

  // Validation, permission, and user errors are generally not retryable
  return false;
}

export default {
  getUserFriendlyMessage,
  getErrorActions,
  formatErrorMessage,
  isRetryableError,
  ERROR_MESSAGES,
  ERROR_ACTIONS
};