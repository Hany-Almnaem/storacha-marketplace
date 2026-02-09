/**
 * Frontend form validation utilities.
 * Mirrors backend validation rules from packages/backend/src/lib/validation.ts
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface ListingFormErrors {
  title?: string
  description?: string
  price?: string
}

// Validation constants matching backend
const VALIDATION_RULES = {
  title: {
    minLength: 3,
    maxLength: 100,
  },
  description: {
    minLength: 10,
    maxLength: 5000,
  },
  price: {
    pattern: /^\d+(\.\d{1,6})?$/,
  },
} as const

/**
 * Validates title field
 */
export function validateTitle(title: string): ValidationResult {
  const trimmed = title.trim()

  if (!trimmed) {
    return { valid: false, error: 'Title is required' }
  }

  if (trimmed.length < VALIDATION_RULES.title.minLength) {
    return {
      valid: false,
      error: `Title must be at least ${VALIDATION_RULES.title.minLength} characters`,
    }
  }

  if (trimmed.length > VALIDATION_RULES.title.maxLength) {
    return {
      valid: false,
      error: `Title must be at most ${VALIDATION_RULES.title.maxLength} characters`,
    }
  }

  return { valid: true }
}

/**
 * Validates description field
 */
export function validateDescription(description: string): ValidationResult {
  const trimmed = description.trim()

  if (!trimmed) {
    return { valid: false, error: 'Description is required' }
  }

  if (trimmed.length < VALIDATION_RULES.description.minLength) {
    return {
      valid: false,
      error: `Description must be at least ${VALIDATION_RULES.description.minLength} characters`,
    }
  }

  if (trimmed.length > VALIDATION_RULES.description.maxLength) {
    return {
      valid: false,
      error: `Description must be at most ${VALIDATION_RULES.description.maxLength} characters`,
    }
  }

  return { valid: true }
}

/**
 * Validates price field (USDC format)
 */
export function validatePrice(price: string): ValidationResult {
  const trimmed = price.trim()

  if (!trimmed) {
    return { valid: false, error: 'Price is required' }
  }

  const numValue = parseFloat(trimmed)

  if (isNaN(numValue) || numValue <= 0) {
    return { valid: false, error: 'Price must be a positive number' }
  }

  if (!VALIDATION_RULES.price.pattern.test(trimmed)) {
    return { valid: false, error: 'Price must have at most 6 decimal places' }
  }

  return { valid: true }
}

/**
 * Validates all listing form fields
 * Returns errors object with field-specific messages
 */
export function validateListingForm(
  title: string,
  description: string,
  price: string
): { valid: boolean; errors: ListingFormErrors } {
  const errors: ListingFormErrors = {}

  const titleResult = validateTitle(title)
  if (!titleResult.valid) {
    errors.title = titleResult.error
  }

  const descriptionResult = validateDescription(description)
  if (!descriptionResult.valid) {
    errors.description = descriptionResult.error
  }

  const priceResult = validatePrice(price)
  if (!priceResult.valid) {
    errors.price = priceResult.error
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Returns character count indicator with color
 */
export function getCharCountStatus(
  current: number,
  min: number,
  max: number
): { text: string; className: string } {
  if (current < min) {
    return {
      text: `${current}/${min} min`,
      className: 'text-amber-600',
    }
  }

  if (current > max) {
    return {
      text: `${current}/${max} max`,
      className: 'text-red-600',
    }
  }

  return {
    text: `${current}/${max}`,
    className: 'text-gray-500',
  }
}
