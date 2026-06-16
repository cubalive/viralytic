// Recupera el clip de una operación Veo ya iniciada (valida el parseo de respuesta).
import { fetchOperationUrl, vertexPost } from '../src/lib/vertex';
import { saveBase64 } from '../src/lib/files';

const MODEL = 'veo-3.0-fast-generate-001';
const opName = 'projects/passkal/locations/us-central1/publishers/google/models/veo-3.0-fast-generate-001/operations/7610ba6b-5bbb-4cc5-a201-bdea8b2e41f0';
const url = fetchOperationUrl(MODEL);

for (let i = 0; i < 60; i++) {
  const s: any = await vertexPost(url, { operationName: opName });
  if (s?.done) {
    if (s.error) { console.log('ERROR:', JSON.stringify(s.error).slice(0, 300)); break; }
    const vids = s?.response?.videos ?? s?.response?.generatedSamples ?? s?.response?.predictions ?? [];
    const v = vids?.[0];
    const b64 = v?.bytesBase64Encoded ?? v?.video?.bytesBase64Encoded;
    const uri = v?.gcsUri ?? v?.video?.gcsUri;
    if (b64) { await saveBase64('data/output/_veo_test.mp4', b64); console.log('SAVED → data/output/_veo_test.mp4'); }
    else { console.log('Sin video inline. uri=', uri, '\nrespuesta:', JSON.stringify(s.response).slice(0, 500)); }
    break;
  }
  console.log(`generando... ${(i + 1) * 10}s`);
  await new Promise((r) => setTimeout(r, 10000));
}
