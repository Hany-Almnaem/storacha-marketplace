import { describe, it, expect, vi, beforeEach } from 'vitest'

const listenMock = vi.hoisted(() =>
  vi.fn((_port, cb) => {
    cb?.()
    return { close: vi.fn((cb) => cb?.()) }
  })
)

vi.mock('express', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    default: () => ({
      use: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      listen: listenMock,
    }),
  }
})

vi.mock('../services/eventListener.js', () => ({
  startPurchaseListener: vi.fn(),
  stopPurchaseListener: vi.fn(),
}))

describe('index.ts lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NODE_ENV = 'production'
  })

  it('starts server on boot', async () => {
    await import('../index')
    expect(listenMock).toHaveBeenCalled()
  })

  it('stops listener on SIGTERM', async () => {
    const _mod = await import('../index')
    const { stopPurchaseListener } =
      await import('../services/eventListener.js')

    process.emit('SIGTERM')

    expect(stopPurchaseListener).toHaveBeenCalled()
  })
})
