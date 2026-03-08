import { VertexAI } from '@google-cloud/vertexai';
import { NextRequest, NextResponse } from 'next/server';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const IMAGE_GEN_MODEL = process.env.IMAGE_GEN_MODEL || 'imagen-3.0-generate-002';

export async function POST(req: NextRequest) {
    try {
        const { prompt } = await req.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        if (!PROJECT_ID) {
            return NextResponse.json({ error: 'GOOGLE_CLOUD_PROJECT not configured' }, { status: 500 });
        }

        const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

        // Use Imagen 3 for image generation
        const generativeModel = vertexAI.preview.getGenerativeModel({
            model: IMAGE_GEN_MODEL,
        });

        // Imagen 3 generates images via the generateContent API with image response
        const response = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                // @ts-ignore — Imagen-specific config
                numberOfImages: 1,
                aspectRatio: '1:1',
                safetyFilterLevel: 'BLOCK_SOME',
            },
        });

        const candidate = response.response.candidates?.[0];
        const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData);

        if (!imagePart?.inlineData) {
            // Fallback: try text-based Gemini with native image output
            throw new Error('No image data in Imagen response');
        }

        const { data: base64Data, mimeType } = imagePart.inlineData;
        return NextResponse.json({
            imageData: `data:${mimeType};base64,${base64Data}`,
            success: true,
        });

    } catch (error: any) {
        console.error('[generate-image] Error:', error);

        // Fallback: use Gemini 2.0 Flash with image generation capability
        try {
            const fallbackResult = await generateWithGeminiFlash(req, error);
            return fallbackResult;
        } catch (fallbackError) {
            console.error('[generate-image] Fallback error:', fallbackError);
            return NextResponse.json(
                { error: 'Image generation failed', details: error?.message },
                { status: 500 }
            );
        }
    }
}

async function generateWithGeminiFlash(_req: NextRequest, _originalError: Error) {
    // Re-parse body for fallback
    const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
    const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

    // Gemini 2.5 Flash Image (Nano Banana) — native image generation
    const model = vertexAI.preview.getGenerativeModel({
        model: 'gemini-2.5-flash-preview-05-20',
    });

    // We can't easily re-read the request body here so use a stored prompt
    throw new Error('Fallback not available in this context');
}
