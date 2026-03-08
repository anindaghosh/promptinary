import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { NextRequest, NextResponse } from 'next/server';
import { ensureVertexCredentials } from '@/lib/vertex-credentials';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const IMAGE_GEN_MODEL = process.env.IMAGE_GEN_MODEL || 'imagen-3.0-generate-002';

export async function POST(req: NextRequest) {
    ensureVertexCredentials();
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!PROJECT_ID) {
        return NextResponse.json({ error: 'GOOGLE_CLOUD_PROJECT not configured' }, { status: 500 });
    }

    // Imagen uses the predict REST endpoint, not the Gemini generateContent API.
    try {
        const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${IMAGE_GEN_MODEL}:predict`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instances: [{ prompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: '1:1',
                    safetySetting: 'block_medium_and_above',
                    personGeneration: 'allow_adult',
                },
            }),
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Imagen API ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const prediction = data.predictions?.[0];

        if (prediction?.bytesBase64Encoded) {
            const mimeType = prediction.mimeType || 'image/png';
            return NextResponse.json({
                imageData: `data:${mimeType};base64,${prediction.bytesBase64Encoded}`,
                success: true,
            });
        }

        throw new Error('No image in Imagen response');
    } catch (imagenError: unknown) {
        const msg = imagenError instanceof Error ? imagenError.message : String(imagenError);
        console.warn('[generate-image] Imagen 3 failed, trying Gemini fallback:', msg);
    }

    // Fallback: Gemini 2.0 Flash with native image output
    try {
        const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
        const model = vertexAI.preview.getGenerativeModel({
            model: 'gemini-2.0-flash-preview-image-generation',
        });

        const response = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: `Generate a high-quality image: ${prompt}` }],
            }],
            generationConfig: {
                // @ts-expect-error — image output config not in SDK types yet
                responseModalities: ['IMAGE', 'TEXT'],
            },
        });

        const candidate = response.response.candidates?.[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData);

        if (imagePart?.inlineData) {
            const { data: base64Data, mimeType } = imagePart.inlineData;
            return NextResponse.json({
                imageData: `data:${mimeType};base64,${base64Data}`,
                success: true,
                usedFallback: true,
            });
        }

        throw new Error('No image in Gemini response');
    } catch (fallbackError: unknown) {
        const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        console.error('[generate-image] Fallback also failed:', msg);
        return NextResponse.json(
            { error: 'Image generation failed', details: msg },
            { status: 500 }
        );
    }
}
