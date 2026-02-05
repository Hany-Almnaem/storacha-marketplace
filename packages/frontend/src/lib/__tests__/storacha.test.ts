import { describe, it, expect, vi, beforeEach } from 'vitest'

import * as storacha from '../storacha'

// Mock @storacha/client
vi.mock('@storacha/client', () => ({
  create: vi.fn(),
}))

describe('storacha utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates email format', async () => {
    await expect(storacha.initializeClient('invalid-email')).rejects.toThrow(
      'Invalid email format'
    )
  })

  it('validates empty email', async () => {
    await expect(storacha.initializeClient('')).rejects.toThrow(
      'Invalid email format'
    )
  })

  it('initializes client with valid email', async () => {
    const mockClient = {
      login: vi.fn().mockResolvedValue(undefined),
      capability: {
        access: {
          claim: vi.fn().mockResolvedValue([]),
        },
      },
      accounts: () => ({}),
    }

    const { create } = await import('@storacha/client')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(create).mockResolvedValue(mockClient as any)

    const client = await storacha.initializeClient('test@example.com')
    expect(mockClient.login).toHaveBeenCalledWith('test@example.com')
    expect(mockClient.capability.access.claim).toHaveBeenCalled()
    expect(client).toBeDefined()
  })

  it('handles login failure gracefully', async () => {
    const mockClient = {
      login: vi.fn().mockRejectedValue(new Error('Network error')),
      capability: {
        access: {
          claim: vi.fn(),
        },
      },
      accounts: () => ({}),
    }

    const { create } = await import('@storacha/client')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(create).mockResolvedValue(mockClient as any)

    await expect(storacha.initializeClient('test@example.com')).rejects.toThrow(
      'Storacha login failed: Network error'
    )
  })

  it('creates new space when DID not provided', async () => {
    const mockSpace = { did: () => 'did:key:test123' }
    const mockAccount = { did: () => 'did:mailto:test@example.com' }
    const mockClient = {
      spaces: () => [],
      accounts: () => ({ 'did:mailto:test@example.com': mockAccount }),
      createSpace: vi.fn().mockResolvedValue(mockSpace),
      setCurrentSpace: vi.fn().mockResolvedValue(undefined),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const space = await storacha.getOrCreateSpace(
      mockClient as any,
      'test-space'
    )
    expect(mockClient.createSpace).toHaveBeenCalledWith('test-space', {
      account: mockAccount,
    })
    expect(mockClient.setCurrentSpace).toHaveBeenCalledWith('did:key:test123')
    expect(space).toBe(mockSpace)
  })

  it('reuses existing session when accounts and delegations exist', async () => {
    const mockClient = {
      login: vi.fn(),
      capability: {
        access: {
          claim: vi.fn().mockResolvedValue([{}]),
        },
      },
      accounts: () => ({ 'did:mailto:test@example.com': { did: () => '' } }),
    }

    const { create } = await import('@storacha/client')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(create).mockResolvedValue(mockClient as any)

    const client = await storacha.initializeClient('test@example.com')

    expect(mockClient.login).not.toHaveBeenCalled()
    expect(mockClient.capability.access.claim).toHaveBeenCalled()
    expect(client).toBeDefined()
  })

  it('reuses existing space when DID matches', async () => {
    const originalEnv = process.env['STORACHA_SPACE_DID']
    process.env['STORACHA_SPACE_DID'] = 'did:key:existing123'

    const mockSpace = { did: () => 'did:key:existing123' }
    const mockClient = {
      spaces: () => [mockSpace],
      createSpace: vi.fn(),
      setCurrentSpace: vi.fn().mockResolvedValue(undefined),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const space = await storacha.getOrCreateSpace(
      mockClient as any,
      'unused-name'
    )
    expect(mockClient.createSpace).not.toHaveBeenCalled()
    expect(mockClient.setCurrentSpace).toHaveBeenCalledWith(
      'did:key:existing123'
    )
    expect(space).toBe(mockSpace)

    process.env['STORACHA_SPACE_DID'] = originalEnv
  })

  it('creates new space when DID not found', async () => {
    const originalEnv = process.env['STORACHA_SPACE_DID']
    process.env['STORACHA_SPACE_DID'] = 'did:key:nonexistent'

    const mockSpace = { did: () => 'did:key:new123' }
    const mockAccount = { did: () => 'did:mailto:test@example.com' }
    const mockClient = {
      spaces: () => [],
      accounts: () => ({ 'did:mailto:test@example.com': mockAccount }),
      createSpace: vi.fn().mockResolvedValue(mockSpace),
      setCurrentSpace: vi.fn().mockResolvedValue(undefined),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const space = await storacha.getOrCreateSpace(
      mockClient as any,
      'new-space'
    )
    expect(mockClient.createSpace).toHaveBeenCalledWith('new-space', {
      account: mockAccount,
    })
    expect(space).toBe(mockSpace)

    process.env['STORACHA_SPACE_DID'] = originalEnv
  })

  it('handles space creation failure', async () => {
    const mockAccount = { did: () => 'did:mailto:test@example.com' }
    const mockClient = {
      spaces: () => [],
      accounts: () => ({ 'did:mailto:test@example.com': mockAccount }),
      createSpace: vi.fn().mockRejectedValue(new Error('Quota exceeded')),
      setCurrentSpace: vi.fn(),
    }

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storacha.getOrCreateSpace(mockClient as any, 'test-space')
    ).rejects.toThrow('Failed to create space: Quota exceeded')
  })

  it('throws error when no account available', async () => {
    const mockClient = {
      spaces: () => [],
      accounts: () => ({}),
      createSpace: vi.fn(),
      setCurrentSpace: vi.fn(),
    }

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storacha.getOrCreateSpace(mockClient as any, 'test-space')
    ).rejects.toThrow('No Storacha account found')
  })

  it('uploads blob and returns CID', async () => {
    const mockClient = {
      uploadFile: vi.fn().mockResolvedValue({ toString: () => 'bafytest123' }),
    }

    const data = new Uint8Array([1, 2, 3])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cid = await storacha.uploadBlob(mockClient as any, data)

    expect(cid).toBe('bafytest123')
    expect(mockClient.uploadFile).toHaveBeenCalled()
  })

  it('handles upload failure gracefully', async () => {
    const mockClient = {
      uploadFile: vi.fn().mockRejectedValue(new Error('No space set')),
    }

    const data = new Uint8Array([1, 2, 3])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(storacha.uploadBlob(mockClient as any, data)).rejects.toThrow(
      'Upload failed: No space set'
    )
  })

  it('converts Uint8Array to Blob before upload', async () => {
    const mockClient = {
      uploadFile: vi.fn().mockResolvedValue({ toString: () => 'bafytest' }),
    }

    const data = new Uint8Array([65, 66, 67]) // "ABC"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await storacha.uploadBlob(mockClient as any, data)

    const uploadedArg = mockClient.uploadFile.mock.calls[0]?.[0]
    expect(uploadedArg).toBeInstanceOf(Blob)
  })
})
