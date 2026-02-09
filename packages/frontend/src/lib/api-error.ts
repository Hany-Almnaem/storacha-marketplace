/**
 * API error handling utilities.
 * Formats backend validation errors into human-readable messages.
 */

export interface ValidationErrorDetail {
  path: string[]
  message: string
}

export interface ApiErrorResponse {
  error: string
  details?: ValidationErrorDetail[]
}

/**
 * Formats validation error details into a single error message.
 * Extracts field paths and messages from Zod validation errors.
 *
 * @param response - API error response with optional details array
 * @returns Formatted error message string
 */
export function formatApiError(response: ApiErrorResponse): string {
  if (!response.details || response.details.length === 0) {
    return response.error || 'An unknown error occurred'
  }

  const fieldErrors = response.details
    .map((detail) => `${detail.path.join('.')}: ${detail.message}`)
    .join(', ')

  return `${response.error}: ${fieldErrors}`
}

/**
 * Logs validation error details to console for debugging.
 * Only logs if details are present.
 *
 * @param response - API error response
 */
export function logValidationError(response: ApiErrorResponse): void {
  if (response.details && response.details.length > 0) {
    console.error(
      'Validation error details:',
      JSON.stringify(response.details, null, 2)
    )
  }
}
