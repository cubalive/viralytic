import { NextResponse, type NextRequest } from 'next/server';

// El admin de la web ES el dashboard que construimos (corre en la PC, expuesto por túnel).
// La SaaS vieja queda RETIRADA: todo getviralytic.com redirige al admin real.
// ADMIN_TUNNEL_URL permite re-apuntar el túnel sin tocar código (vercel env + redeploy).
const ADMIN =
  process.env.ADMIN_TUNNEL_URL ||
  'https://angel-muslim-proven-professional.trycloudflare.com';

export function middleware(_request: NextRequest) {
  return NextResponse.redirect(ADMIN, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
