// Contents of src/common/common.types.ts

/**
 * Represents a generic pagination structure if needed for API responses.
 */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string | null;
  hasNextPage: boolean;
}

/**
 * A generic status type for operations.
 */
export type OperationStatus = 'idle' | 'pending' | 'succeeded' | 'failed';

/**
 * Represents a generic error structure for operations.
 */
export interface OperationError {
  message: string;
  code?: string | number;
  details?: any;
}

// We will add other common types that might be shared across different protocols or UI components. 
