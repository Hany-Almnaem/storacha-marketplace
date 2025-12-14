import { describe, it, expect, vi } from 'vitest'

import { notifySeller } from '../services/notification'

describe('notifySeller', () => {
  it('logs seller notification', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await notifySeller({
      seller: '0xSeller',
      purchaseId: 'purchase123',
    })

    expect(spy).toHaveBeenCalledWith(
      'Seller 0xSeller notified for purchase purchase123'
    )

    spy.mockRestore()
  })
})
