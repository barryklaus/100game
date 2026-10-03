interface Env { ROOMS: DurableObjectNamespace; ASSETS: Fetcher }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const room = /^\/api\/rooms\/(100-[a-f0-9]{12})\/(create|join|connect)$/.exec(path);
    if (room) return env.ROOMS.getByName(room[1]).fetch(request);
    if (path.startsWith('/api/')) {
      return Response.json({ error: 'Unknown room endpoint.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
