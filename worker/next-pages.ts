interface Env { ROOMS: DurableObjectNamespace; ACCOUNTS: DurableObjectNamespace; ASSETS: Fetcher }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (/^\/api\/account\/(register|login|logout|me|recover|practice|security)$/.test(path)||/^\/api\/admin\/(users|user-login)$/.test(path)) {
      const forwarded=new Request(request);forwarded.headers.delete('X-100next-Country');
      const country=request.cf?.country;if(typeof country==='string'&&/^[A-Z]{2}$/.test(country))forwarded.headers.set('X-100next-Country',country);
      return env.ACCOUNTS.getByName('accounts-v1').fetch(forwarded);
    }
    const room = /^\/api\/rooms\/(100-[a-f0-9]{12})\/(create|join|connect)$/.exec(path);
    if (room) return env.ROOMS.getByName(room[1]).fetch(request);
    if (path.startsWith('/api/')) {
      return Response.json({ error: 'Unknown room endpoint.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
