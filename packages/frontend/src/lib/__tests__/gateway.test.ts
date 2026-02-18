import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchFromGateway,
  GATEWAY_TIMEOUT_MS,
  GATEWAY_URL,
  MAX_RETRIES,
} from '../gateway'

describe('gateway utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('builds w3s.link gateway URL from CID', async () => {
    const payload = new TextEncoder().encode('hello')
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchFromGateway('bafy-test-cid')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${GATEWAY_URL}/bafy-test-cid`)
    expect(new TextDecoder().decode(result)).toBe('hello')
  })

  it('retries failed requests and succeeds on a later attempt', async () => {
    vi.useFakeTimers()

    const payload = new Uint8Array([1, 2, 3, 4])
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary network issue'))
      .mockRejectedValueOnce(new Error('gateway unavailable'))
      .mockResolvedValueOnce(new Response(payload))

    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchFromGateway('bafy-retry-cid')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new Uint8Array(result)).toEqual(payload)
  })

  it('throws timeout error after max retries', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }
    )

    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchFromGateway('bafy-timeout-cid')
    const assertion = expect(promise).rejects.toThrow(
      `Failed to fetch from gateway after ${MAX_RETRIES} attempts: Gateway request timed out`
    )
    await vi.runAllTimersAsync()

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES)
  })

  it('reports download progress while reading stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4, 5]))
        controller.close()
      },
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        headers: {
          'content-length': '5',
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const onProgress = vi.fn()
    const data = await fetchFromGateway('bafy-progress-cid', onProgress)

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress.mock.calls[0]).toEqual([2, 5])
    expect(onProgress.mock.calls[1]).toEqual([5, 5])
    expect(new Uint8Array(data)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('uses configured timeout constant', async () => {
    expect(GATEWAY_TIMEOUT_MS).toBe(60000)
  })
})
