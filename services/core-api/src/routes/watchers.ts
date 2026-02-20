import type { AuthClaims } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export function registerWatcherRoutes(
  app: FastifyInstance,
  deps: {
    toAuthClaims: (request: FastifyRequest) => AuthClaims;
    assertScope: (claims: AuthClaims, scope: string) => void;
    watcherCheckpointSchema: { safeParse: (value: unknown) => { success: true; data: { chain: string; cursor: string } } | { success: false; error: { issues: Array<{ message?: string }> } } };
    watcherDedupeSchema: { safeParse: (value: unknown) => { success: true; data: { eventKey: string } } | { success: false; error: { issues: Array<{ message?: string }> } } };
    watcherRouteResolveSchema: { safeParse: (value: unknown) => { success: true; data: { chain: string; token: string; depositAddress: string } } | { success: false; error: { issues: Array<{ message?: string }> } } };
  }
): void {
  const { toAuthClaims, assertScope, watcherCheckpointSchema, watcherDedupeSchema, watcherRouteResolveSchema } = deps;
app.get('/internal/v1/watchers/routes', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertScope(claims, 'watchers:internal');
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const queryParams = request.query as { chain?: string };
  const chain = queryParams.chain;
  if (chain !== 'base' && chain !== 'solana') {
    return deny({
      request,
      reply,
      code: 'INVALID_QUERY',
      message: 'chain must be one of base or solana.',
      status: 400
    });
  }

  const rows = await query(
    `
    select token, deposit_address as "depositAddress"
    from deposit_routes
    where chain = $1
      and status = 'active'
    `,
    [chain]
  );

  return reply.send({
    items: rows.rows
  });
});

app.get('/internal/v1/watchers/checkpoint/:watcherName', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertScope(claims, 'watchers:internal');
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const watcherName = (request.params as { watcherName: string }).watcherName;
  const row = await query('select cursor from watcher_checkpoint where watcher_name = $1 limit 1', [watcherName]);
  return reply.send({
    cursor: (row.rows[0] as { cursor?: string } | undefined)?.cursor ?? '0'
  });
});

app.post('/internal/v1/watchers/checkpoint/:watcherName', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertScope(claims, 'watchers:internal');
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const watcherName = (request.params as { watcherName: string }).watcherName;
  const parsed = watcherCheckpointSchema.safeParse(request.body);
  if (!parsed.success) {
    return deny({
      request,
      reply,
      code: 'INVALID_PAYLOAD',
      message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
      status: 400,
      details: parsed.error.issues
    });
  }

  await query(
    `
    insert into watcher_checkpoint (watcher_name, chain, cursor)
    values ($1, $2, $3)
    on conflict (watcher_name)
    do update set
      chain = excluded.chain,
      cursor = excluded.cursor,
      updated_at = now()
    `,
    [watcherName, parsed.data.chain, parsed.data.cursor]
  );

  return reply.status(204).send();
});

app.post('/internal/v1/watchers/dedupe/check/:watcherName', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertScope(claims, 'watchers:internal');
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const parsed = watcherDedupeSchema.safeParse(request.body);
  if (!parsed.success) {
    return deny({
      request,
      reply,
      code: 'INVALID_PAYLOAD',
      message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
      status: 400,
      details: parsed.error.issues
    });
  }

  const row = await query('select 1 from watcher_event_dedupe where event_key = $1 limit 1', [parsed.data.eventKey]);
  return reply.send({
    seen: !!row.rows[0]
  });
});

app.post('/internal/v1/watchers/dedupe/mark/:watcherName', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertScope(claims, 'watchers:internal');
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const watcherName = (request.params as { watcherName: string }).watcherName;
  const parsed = watcherDedupeSchema.safeParse(request.body);
  if (!parsed.success) {
    return deny({
      request,
      reply,
      code: 'INVALID_PAYLOAD',
      message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
      status: 400,
      details: parsed.error.issues
    });
  }

  await query(
    `
    insert into watcher_event_dedupe (event_key, watcher_name)
    values ($1, $2)
    on conflict (event_key) do nothing
    `,
    [parsed.data.eventKey, watcherName]
  );

  return reply.status(204).send();
});

app.post('/internal/v1/watchers/resolve-route', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertScope(claims, 'watchers:internal');
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const parsed = watcherRouteResolveSchema.safeParse(request.body);
  if (!parsed.success) {
    return deny({
      request,
      reply,
      code: 'INVALID_PAYLOAD',
      message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
      status: 400,
      details: parsed.error.issues
    });
  }

  const row = await query(
    `
    select t.transfer_id
    from deposit_routes dr
    join transfers t on t.transfer_id = dr.transfer_id
    where dr.chain = $1
      and dr.token = $2
      and dr.deposit_address = $3
      and dr.status = 'active'
    limit 1
    `,
    [parsed.data.chain, parsed.data.token, parsed.data.depositAddress]
  );

  if (!row.rows[0]) {
    return reply.send({
      found: false
    });
  }

  const transferId = (row.rows[0] as { transfer_id: string }).transfer_id;
  return reply.send({
    found: true,
    transferId
  });
});
}
