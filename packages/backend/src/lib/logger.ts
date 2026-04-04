import { pino } from 'pino'

const isDev = process.env['NODE_ENV'] === 'development'

export const logger = pino({
  level: process.env['LOG_LEVEL'] || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
  base: {
    env: process.env['NODE_ENV'] || 'development',
  },
})

export default logger
