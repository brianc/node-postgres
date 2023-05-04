import { Client } from 'pg'

export interface Env {
  USER: string
  PGUSER: string
  PGPASSWORD: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 })

    const params = url.searchParams
    const ssl = params.has('ssl')

    var client = new Client({
      user: env.PGUSER || env.USER,
      password: env.PGPASSWORD,
      ssl,
    })
    await client.connect()
    const resp = Response.json(await client.query('SELECT $1::text', ['Hello, World!']))
    // Clean up the client, ensuring we don't kill the worker before that is completed.
    ctx.waitUntil(client.end())
    return resp
  },
}
