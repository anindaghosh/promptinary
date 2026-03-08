import { writeFileSync } from 'fs';
import path from 'path';

/**
 * Ensures Vertex AI credentials are available for serverless (Vercel).
 * When GOOGLE_SERVICE_ACCOUNT_JSON is set, writes it to /tmp and sets
 * GOOGLE_APPLICATION_CREDENTIALS so the Vertex AI SDK can authenticate.
 * Call this at the start of any API route that uses Vertex AI.
 */
export function ensureVertexCredentials(): void {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return; // Already set (e.g. local dev)

    const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!json) return;

    try {
        JSON.parse(json); // Validate
        const credentialsPath = path.join('/tmp', 'vertex-credentials.json');
        writeFileSync(credentialsPath, json);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    } catch (e) {
        console.error('[vertex-credentials] Failed to set credentials:', e);
    }
}
