import { GoogleGenAI } from '@google/genai';

/**
 * Returns a configured GoogleGenAI instance pointing at Vertex AI.
 *
 * Auth resolution order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS_BASE64 — base64 service-account JSON
 *    (used in production / hosted environments)
 * 2. Application Default Credentials (ADC) — picked up automatically when
 *    `gcloud auth application-default login` has been run locally
 */
export function createGenAI(): GoogleGenAI {
  const credsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;

  const googleAuthOptions = credsB64
    ? { credentials: JSON.parse(Buffer.from(credsB64, 'base64').toString('utf8')) }
    : undefined;

  return new GoogleGenAI({
    vertexai: true,
    project:  process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    ...(googleAuthOptions && { googleAuthOptions }),
  });
}
