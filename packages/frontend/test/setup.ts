/**
 * Test environment setup and polyfills.
 * Ensures crypto.subtle is available and provides File API compatibility.
 */

if (!globalThis.crypto?.subtle) {
  throw new Error(
    'crypto.subtle is not available. Ensure Node.js >= 20.0.0 is installed.'
  )
}

console.log('✓ Test environment: crypto.subtle available')
