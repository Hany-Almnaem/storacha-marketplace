export const GATEWAY_URL = 'https://w3s.link/ipfs'
export const GATEWAY_TIMEOUT_MS = 60000
export const MAX_RETRIES = 3

const RETRY_BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getGatewayUrl(cid: string): string {
  const normalizedCid = cid.trim()
  if (!normalizedCid) {
    throw new Error('CID is required')
  }

  return `${GATEWAY_URL}/${normalizedCid}`
}

function getTotalBytes(headers: Headers): number {
  const contentLength = headers.get('content-length')
  if (!contentLength) {
    return 0
  }

  const parsed = Number.parseInt(contentLength, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

async function readResponseData(
  response: Response,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  if (!response.body || !onProgress) {
    return response.arrayBuffer()
  }

  const reader = response.body.getReader()
  const total = getTotalBytes(response.headers)
  const chunks: Uint8Array[] = []
  let loaded = 0

  let done = false
  while (!done) {
    const chunk = await reader.read()
    done = chunk.done
    const value = chunk.value

    if (done || !value) {
      continue
    }

    chunks.push(value)
    loaded += value.byteLength
    onProgress(loaded, total)
  }

  const merged = new Uint8Array(loaded)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return merged.buffer
}

async function fetchAttempt(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
  }, GATEWAY_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: abortController.signal })

    if (!response.ok) {
      throw new Error(`Gateway request failed with status ${response.status}`)
    }

    return await readResponseData(response, onProgress)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Gateway request timed out')
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Gateway request failed')
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchFromGateway(
  cid: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const url = getGatewayUrl(cid)
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchAttempt(url, onProgress)
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Gateway request failed')

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
        await sleep(delayMs)
      }
    }
  }

  throw new Error(
    `Failed to fetch from gateway after ${MAX_RETRIES} attempts: ${lastError?.message ?? 'Unknown error'}`
  )
}
