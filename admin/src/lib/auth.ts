import { GoogleAuth } from 'google-auth-library';

// Local: usa ADC (gcloud auth application-default login).
// Servidor (Railway): si existe GCP_SA_KEY (JSON del service account), se usa esa.
const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
const saJson = process.env.GCP_SA_KEY?.trim();
const auth = saJson
  ? new GoogleAuth({ scopes, credentials: JSON.parse(saJson) })
  : new GoogleAuth({ scopes });

let cached: { token: string; exp: number } | null = null;

/** Invalida el token cacheado (úsalo tras un 401 para forzar refresh). */
export function invalidateToken(): void { cached = null; }

export async function getAccessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  if (!res.token) {
    throw new Error('No se pudo obtener token ADC. Corre: gcloud auth application-default login');
  }
  // los tokens duran ~1h; refrescamos a los 50 min
  cached = { token: res.token, exp: Date.now() + 50 * 60_000 };
  return res.token;
}
