import prismaDB from '../config/db.js'

export async function getListenerHealth() {
  const lastEvent = await prismaDB.eventLog.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  const stale =
    !lastEvent || Date.now() - lastEvent.createdAt.getTime() > 10 * 60 * 1000

  return {
    lastProcessedBlock: lastEvent?.blockNumber ?? null,
    lastEventAt: lastEvent?.createdAt ?? null,
    stale,
  }
}
