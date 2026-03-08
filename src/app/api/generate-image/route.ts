import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';
import { createGenAI } from '@/lib/genai';

const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '';

async function uploadToStorage(base64Data: string, path: string): Promise<string | null> {
  if (!STORAGE_BUCKET) return null;
  try {
    const bucket = adminStorage.bucket(STORAGE_BUCKET);
    const file   = bucket.file(path);
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
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    return NextResponse.json({ error: 'GOOGLE_CLOUD_PROJECT not configured' }, { status: 500 });
  }

  const storagePath = `generated-images/${roomCode ?? 'unknown'}/${round ?? 0}/${uid ?? 'anon'}-${Date.now()}.png`;

  const ai = createGenAI();

  // ── Attempt 1: Imagen 3 ───────────────────────────────────────────────────
  try {
    const response = await ai.models.generateImages({
      model:  'imagen-3.0-generate-002',
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio:    '1:1',
        // @ts-ignore — safetyFilterLevel is valid but not in current typings
        safetyFilterLevel: 'BLOCK_SOME',
      },
    });

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (imageBytes) {
      const imageUrl = await uploadToStorage(imageBytes, storagePath);
      return NextResponse.json({
        imageUrl:  imageUrl ?? undefined,
        imageData: imageUrl ? undefined : `data:image/png;base64,${imageBytes}`,
        success: true,
      });
    }
  } catch (imagenErr: any) {
    console.warn('[generate-image] Imagen 3 failed, trying Gemini fallback:', imagenErr?.message);
  }

  // ── Attempt 2: Gemini image generation ────────────────────────────────────
  try {
    const response = await ai.models.generateContent({
      model:    'gemini-2.0-flash-preview-image-generation',
      contents: [{ role: 'user', parts: [{ text: `Generate a high-quality image: ${prompt}` }] }],
      config:   { responseModalities: ['IMAGE', 'TEXT'] },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);

    if (imagePart?.inlineData) {
      const base64Data: string = imagePart.inlineData.data ?? '';
      const mimeType: string   = imagePart.inlineData.mimeType ?? 'image/png';
      const imageUrl = await uploadToStorage(base64Data, storagePath);
      return NextResponse.json({
        imageUrl:  imageUrl ?? undefined,
        imageData: imageUrl ? undefined : `data:${mimeType};base64,${base64Data}`,
        success:   true,
        usedFallback: true,
      });
    }

    throw new Error('No image returned by Gemini');
  } catch (fallbackErr: any) {
    console.error('[generate-image] Both models failed:', fallbackErr?.message);
    return NextResponse.json(
      { error: 'Image generation failed', details: fallbackErr?.message },
      { status: 500 }
    );
  }
}
