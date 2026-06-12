import { defineEventHandler, createError, getRequestHeader } from 'h3'

// Keep track of IP requests in-memory
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

const LIMIT = 100 // 100 requests max
const WINDOW_MS = 60 * 1000 // 1 minute window

// Periodic cleanup of expired entries every 5 minutes to prevent memory leaks
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now()
    for (const [ip, data] of rateLimitMap.entries()) {
      if (now > data.resetTime) {
        rateLimitMap.delete(ip)
      }
    }
  }, 5 * 60 * 1000)
}

export default defineEventHandler((event) => {
  // Only apply rate limiting to /api/ routes
  if (!event.path.startsWith('/api/')) return

  // Extract client IP address safely
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : null) || 
             event.node.req.socket.remoteAddress || 
             '127.0.0.1'

  const now = Date.now()
  let clientData = rateLimitMap.get(ip)

  if (!clientData || now > clientData.resetTime) {
    clientData = {
      count: 0,
      resetTime: now + WINDOW_MS
    }
  }

  clientData.count++
  rateLimitMap.set(ip, clientData)

  const remaining = Math.max(0, LIMIT - clientData.count)
  
  // Set standard rate limit headers
  event.node.res.setHeader('X-RateLimit-Limit', LIMIT)
  event.node.res.setHeader('X-RateLimit-Remaining', remaining)
  event.node.res.setHeader('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000))

  if (clientData.count > LIMIT) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
    })
  }
})
