import { VertexAI } from '@google-cloud/vertexai';
import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';

const PROJECT_ID    = process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION      = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const IMAGE_GEN_MODEL = process.env.IMAGE_GEN_MODEL || 'imagen-3.0-generate-002';
const STORAGE_BUCKET  = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '';

async function uploadToStorage(base64Data: string, path: string): Promise<string | null> {
  if (!STORAGE_BUCKET) return null;
  try {
    const bucket = adminStorage.bucket(STORAGE_BUCKET);
    const file   = bucket.file(path);
    // Strip data URL prefix if present
    const clean  = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(clean, 'base64');
    await file.save(buffer, { metadata: { contentType: 'image/png' } });
    await file.makePublic();
    return `https://storage.googleapis.com/${STORAGE_BUCKET}/${path}`;
  } catch (err: any) {
    console.warn('[generate-image] Storage upload failed:', err?.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, roomCode, round, uid } = body;

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'GOOGLE_CLOUD_PROJECT not configured' }, { status: 500 });
  }

  const storagePath = `generated-images/${roomCode ?? 'unknown'}/${round ?? 0}/${uid ?? 'anon'}-${Date.now()}.png`;

  // ── Attempt 1: Imagen 3 ───────────────────────────────────────────────────
  try {
    const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    const model = vertexAI.preview.getGenerativeModel({ model: IMAGE_GEN_MODEL });

    const response = await model.generateContent({
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
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      // Upload to Storage
      const imageUrl = await uploadToStorage(base64Data, storagePath);

      return NextResponse.json({
        imageData: imageUrl ? undefined : dataUrl,
        imageUrl:  imageUrl ?? undefined,
        success: true,
      });
    }
  } catch (imagenError: any) {
    console.warn('[generate-image] Imagen 3 failed, trying Gemini fallback:', imagenError?.message);
  }

  // ── Attempt 2: Gemini 2.0 Flash image generation ──────────────────────────
  try {
    const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    const model = vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.0-flash-preview-image-generation',
    });

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Generate a high-quality image: ${prompt}` }] }],
      generationConfig: {
        // @ts-ignore
        responseModalities: ['IMAGE', 'TEXT'],
      },
    });

    const candidate = response.response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData);

    if (imagePart?.inlineData) {
      const { data: base64Data, mimeType } = imagePart.inlineData;
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      const imageUrl = await uploadToStorage(base64Data, storagePath);

      return NextResponse.json({
        imageData: imageUrl ? undefined : dataUrl,
        imageUrl:  imageUrl ?? undefined,
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
