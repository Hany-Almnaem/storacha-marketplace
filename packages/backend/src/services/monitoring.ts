import prismaDB from '../config/db.js'

import { getLastPollTime } from './eventListener.js'

const STALE_THRESHOLD_MS =
  Number(process.env['INDEXER_STALE_THRESHOLD_MS']) || 10 * 60 * 1000

export async function getListenerHealth() {
  const lastEvent = await prismaDB.eventLog.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  const now = Date.now()
  const lastPollTime = getLastPollTime()
  const stale = lastPollTime === 0 || now - lastPollTime > STALE_THRESHOLD_MS

  return {
    lastProcessedBlock: lastEvent?.blockNumber ?? null,
    lastEventAt: lastEvent?.createdAt ?? null,
    lastPollTime: lastPollTime > 0 ? new Date(lastPollTime) : null,
    stale,
    thresholdMs: STALE_THRESHOLD_MS,
  }
}
