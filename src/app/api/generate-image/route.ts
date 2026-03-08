import { VertexAI } from '@google-cloud/vertexai';
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

    // Try Imagen 3 first
    try {
        const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
        const generativeModel = vertexAI.preview.getGenerativeModel({
            model: IMAGE_GEN_MODEL,
        });

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

        if (imagePart?.inlineData) {
            const { data: base64Data, mimeType } = imagePart.inlineData;
            return NextResponse.json({
                imageData: `data:${mimeType};base64,${base64Data}`,
                success: true,
            });
        }
    } catch (imagenError: any) {
        console.warn('[generate-image] Imagen 3 failed, trying Gemini fallback:', imagenError?.message);
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
                // @ts-ignore — image output config
                responseModalities: ['IMAGE', 'TEXT'],
            },
        });

        const candidate = response.response.candidates?.[0];
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
    } catch (fallbackError: any) {
        console.error('[generate-image] Fallback also failed:', fallbackError?.message);
        return NextResponse.json(
            { error: 'Image generation failed', details: fallbackError?.message },
            { status: 500 }
        );
    }
}
