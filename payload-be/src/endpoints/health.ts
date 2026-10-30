import type { Endpoint, PayloadRequest } from 'payload'

/**
 * B4 / SEC-017: a liveness + readiness endpoint.
 *
 * The container healthcheck (docker-compose.yml) and the deployment guide both
 * probe `/api/health`. The handler performs a real database round-trip so a
 * hung process or a lost database connection is reported as `503` rather than a
 * misleading `200`.
 */
export const healthHandler = async (req: PayloadRequest): Promise<Response> => {
  const startedAt = Date.now()

  try {
    // A count is the cheapest round-trip that proves the database responds.
    const { totalDocs } = await req.payload.count({
      collection: 'penggunas',
      overrideAccess: true,
      req,
    })

    return Response.json(
      {
        status: 'ok',
        db: { ok: true, penggunas: totalDocs },
        uptime: Math.round(process.uptime()),
        latencyMs: Date.now() - startedAt,
      },
      { status: 200 },
    )
  } catch (error) {
    req.payload.logger.error({ err: error, msg: 'health check: database round-trip failed' })

    return Response.json(
      {
        status: 'error',
        db: { ok: false },
        uptime: Math.round(process.uptime()),
      },
      { status: 503 },
    )
  }
}

/** `GET /api/health` */
export const healthEndpoint: Endpoint = {
  path: '/health',
  method: 'get',
  handler: healthHandler,
}
