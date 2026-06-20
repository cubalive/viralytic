import { NextResponse, type NextRequest } from 'next/server';

// Entrar por el dominio = ver NUESTRO admin (corre en la PC, expuesto por túnel).
// Las PÁGINAS humanas de la SaaS vieja redirigen al admin; pero las APIs y el CRON
// siguen VIVOS en Vercel (publican lo que Railway renderiza: Caroline + Supabase).
// Por eso el matcher EXCLUYE /api/ — no rompemos lo que funciona.
// ADMIN_TUNNEL_URL permite re-apuntar el túnel sin tocar código (vercel env + redeploy).
const ADMIN =
  process.env.ADMIN_TUNNEL_URL ||
  'https://admin.getviralytic.com';

export function middleware(_request: NextRequest) {
  return NextResponse.redirect(ADMIN, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
