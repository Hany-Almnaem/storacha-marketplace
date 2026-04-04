import { pinoHttp } from 'pino-http'

import { logger } from '../lib/logger.js'

/**
 * Standard request logging middleware using pino-http.
 * Includes duration, common headers, and status code.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
    }),
  },
})

export default httpLogger
