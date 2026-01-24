/**
 * Storacha client wrapper for encrypted blob storage.
 * Handles authentication, space management, and uploads.
 */

import * as Client from '@storacha/client'

type StorachaClient = Awaited<ReturnType<typeof Client.create>>
type StorachaSpace = Awaited<ReturnType<StorachaClient['createSpace']>>

/**
 * Initializes Storacha client and authenticates with email.
 *
 * Authentication flow:
 * 1. Calls client.login(email)
 * 2. Storacha sends verification email
 * 3. Human must click link in email
 * 4. Claims delegations to activate account capabilities
 * 5. Function returns after verification complete
 *
 * Why email auth? Storacha uses email-based accounts for now. Wallet-based
 * login is planned for future versions per project spec.
 *
 * CRITICAL: After login, we must claim delegations to activate the account's
 * storage capabilities. Without this, space creation and uploads will fail.
 *
 * @param email - Storacha account email (must be valid email format)
 * @returns Authenticated Storacha client instance
 * @throws {Error} If email invalid or login fails
 */
export async function initializeClient(email: string): Promise<StorachaClient> {
  if (!email || !email.includes('@')) {
    throw new Error(`Invalid email format: ${email}`)
  }

  try {
    const client = await Client.create()

    try {
      const delegations = await client.capability.access.claim()
      if (delegations) {
        console.log('Storacha: Existing session found and verified.')
        return client
      }
    } catch {
      console.log('Storacha: No existing session, starting login flow.')
    }

    await client.login(email as `${string}@${string}`)

    // Claim delegations to activate account capabilities
    await client.capability.access.claim()

    return client
  } catch (error) {
    throw new Error(
      `Storacha login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Gets existing space or creates new one.
 *
 * Space reuse logic:
 * - If STORACHA_SPACE_DID env var is set, attempts to use existing space
 * - If not set or space not found, creates new space with given name
 *
 * Why spaces? Storacha organizes data into isolated namespaces called "spaces".
 * Each seller should have their own space for their datasets.
 *
 * CRITICAL: After creating a new space, it must be provisioned with an account.
 * The space needs to be added to your Storacha account to get storage capabilities.
 *
 * @param client - Authenticated Storacha client
 * @param spaceName - Human-readable name for new space (if creating)
 * @returns Space object with DID (decentralized identifier)
 * @throws {Error} If space creation/retrieval fails
 */
export async function getOrCreateSpace(
  client: StorachaClient,
  spaceName: string
): Promise<StorachaSpace> {
  const existingDID = process.env['STORACHA_SPACE_DID']

  if (existingDID) {
    const spaces = client.spaces()
    const space = spaces.find((s) => s.did() === existingDID)
    if (space) {
      await client.setCurrentSpace(space.did())
      return space as unknown as StorachaSpace
    }
    console.warn(`Space ${existingDID} not found, creating new space`)
  }

  try {
    // Get account for space provisioning
    const accounts = client.accounts()
    const account = Object.values(accounts)[0]

    if (!account) {
      throw new Error(
        'No Storacha account found. Ensure you have completed email verification and the account is active.'
      )
    }

    // Create space with account (automatically provisions it)
    const space = await client.createSpace(spaceName, { account })
    await client.setCurrentSpace(space.did())

    return space
  } catch (error) {
    throw new Error(
      `Failed to create space: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Uploads blob to Storacha.
 *
 * Blob storage: Storacha stores content-addressed blobs and announces them
 * to IPNI (InterPlanetary Network Indexer) for discoverability. Blobs are
 * retrieved via public gateways like w3s.link.
 *
 * @param client - Authenticated client with active space (call getOrCreateSpace first)
 * @param data - Blob data as Uint8Array (typically encrypted file)
 * @returns CID string (e.g., "bafybeiabc...")
 * @throws {Error} If upload fails or no space is set
 */
export async function uploadBlob(
  client: StorachaClient,
  data: Uint8Array
): Promise<string> {
  try {
    const blob = new Blob([new Uint8Array(data)])
    const cid = await client.uploadFile(blob as File)
    return cid.toString()
  } catch (error) {
    throw new Error(
      `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
