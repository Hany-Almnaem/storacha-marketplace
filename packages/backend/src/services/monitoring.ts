import prismaDB from '../config/db.js'

const STALE_THRESHOLD_MS =
  Number(process.env['INDEXER_STALE_THRESHOLD_MS']) || 10 * 60 * 1000

export async function getListenerHealth() {
  const lastEvent = await prismaDB.eventLog.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  const now = Date.now()
  const lastEventTime = lastEvent?.createdAt.getTime() ?? 0
  const stale = !lastEvent || now - lastEventTime > STALE_THRESHOLD_MS

  return {
    lastProcessedBlock: lastEvent?.blockNumber ?? null,
    lastEventAt: lastEvent?.createdAt ?? null,
    stale,
    thresholdMs: STALE_THRESHOLD_MS,
  }
}
