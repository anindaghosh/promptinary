import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { createGenAI } from '@/lib/genai';

const REFERENCE_IMAGES: Record<string, { filename: string; category: string; difficulty: string; title: string }> = {
  'img-001': { filename: 'starry-night.jpg',    category: 'Fine Art',     difficulty: 'Hard',   title: 'Starry Night Style' },
  'img-002': { filename: 'mountain-lake.jpg',   category: 'Photography',  difficulty: 'Medium', title: 'Mountain Lake' },
  'img-003': { filename: 'neon-city.jpg',        category: 'Concept Art',  difficulty: 'Hard',   title: 'Neon Cityscape' },
  'img-004': { filename: 'cherry-blossom.jpg',  category: 'Nature',       difficulty: 'Easy',   title: 'Cherry Blossoms' },
  'img-005': { filename: 'lighthouse.jpg',      category: 'Architecture', difficulty: 'Medium', title: 'Lighthouse at Dusk' },
  'img-006': { filename: 'hot-air-balloon.jpg', category: 'Photography',  difficulty: 'Medium', title: 'Hot Air Balloons' },
  'img-007': { filename: 'underwater.jpg',      category: 'Nature',       difficulty: 'Hard',   title: 'Underwater Coral' },
  'img-008': { filename: 'desert-dunes.jpg',    category: 'Photography',  difficulty: 'Easy',   title: 'Desert Dunes' },
  'img-009': { filename: 'space-nebula.jpg',    category: 'Concept Art',  difficulty: 'Hard',   title: 'Space Nebula' },
  'img-010': { filename: 'autumn-forest.jpg',   category: 'Nature',       difficulty: 'Easy',   title: 'Autumn Forest' },
  'img-011': { filename: 'tokyo-street.jpg',    category: 'Photography',  difficulty: 'Medium', title: 'Tokyo Street' },
  'img-012': { filename: 'abstract-waves.jpg',  category: 'Fine Art',     difficulty: 'Hard',   title: 'Abstract Waves' },
  'img-013': { filename: 'castle-ruins.jpg',    category: 'Architecture', difficulty: 'Medium', title: 'Castle Ruins' },
  'img-014': { filename: 'arctic-fox.jpg',      category: 'Nature',       difficulty: 'Medium', title: 'Arctic Fox' },
  'img-015': { filename: 'art-deco.jpg',        category: 'Architecture', difficulty: 'Hard',   title: 'Art Deco Interior' },
  'img-016': { filename: 'tulip-fields.jpg',    category: 'Nature',       difficulty: 'Easy',   title: 'Tulip Fields' },
  'img-017': { filename: 'steampunk.jpg',       category: 'Concept Art',  difficulty: 'Hard',   title: 'Steampunk City' },
  'img-018': { filename: 'greek-island.jpg',    category: 'Photography',  difficulty: 'Easy',   title: 'Greek Island' },
  'img-019': { filename: 'cubist-portrait.jpg', category: 'Fine Art',     difficulty: 'Hard',   title: 'Cubist Portrait' },
  'img-020': { filename: 'waterfall.jpg',       category: 'Nature',       difficulty: 'Medium', title: 'Jungle Waterfall' },
};

export async function POST(req: NextRequest) {
  try {
    const { referenceImageId, generatedImageBase64 } = await req.json();

    if (!referenceImageId || !generatedImageBase64) {
      return NextResponse.json(
        { error: 'referenceImageId and generatedImageBase64 are required' },
        { status: 400 }
      );
    }

    const imageInfo = REFERENCE_IMAGES[referenceImageId];
    if (!imageInfo) {
      return NextResponse.json({ error: 'Unknown reference image ID' }, { status: 400 });
    }

    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      return NextResponse.json({ error: 'GOOGLE_CLOUD_PROJECT not configured' }, { status: 500 });
    }

    // Load reference image from public folder
    const refImagePath = path.join(process.cwd(), 'public', 'reference-images', imageInfo.filename);
    let refBase64: string;
    let refMimeType = 'image/jpeg';
    try {
      refBase64 = readFileSync(refImagePath).toString('base64');
      if (imageInfo.filename.endsWith('.png')) refMimeType = 'image/png';
    } catch {
      return NextResponse.json({ error: 'Reference image not found on server' }, { status: 500 });
    }

    // Normalise generated image: handle Storage URL, data URL, or raw base64
    let cleanGenerated: string;
    let genMimeType = 'image/jpeg';

    if (generatedImageBase64.startsWith('http://') || generatedImageBase64.startsWith('https://')) {
      // It's a Storage URL — fetch and convert to base64
      const imgRes = await fetch(generatedImageBase64);
      const imgBuf = await imgRes.arrayBuffer();
      cleanGenerated = Buffer.from(imgBuf).toString('base64');
      const ct = imgRes.headers.get('content-type') ?? '';
      if (ct.includes('png')) genMimeType = 'image/png';
    } else if (generatedImageBase64.includes(',')) {
      // data URL
      cleanGenerated = generatedImageBase64.split(',')[1];
      if (generatedImageBase64.startsWith('data:image/png')) genMimeType = 'image/png';
    } else {
      // raw base64
      cleanGenerated = generatedImageBase64;
    }

    const scoringPrompt = `You are an expert visual similarity judge for an AI image prompt game.

You are given two images:
1. REFERENCE IMAGE: The original target image (category: ${imageInfo.category}, titled "${imageInfo.title}")
2. GENERATED IMAGE: An image created by an AI based on a player's text prompt

Your job is to score how well the generated image matches the reference image.

Evaluate across these dimensions:
- Composition & layout (30%): framing, perspective, arrangement of elements
- Color palette & lighting (25%): dominant colors, contrast, mood lighting
- Subject & content (30%): main subjects, objects, scene elements present
- Style & atmosphere (15%): artistic style, mood, texture, overall feel

Return ONLY valid JSON with this exact format:
{
  "similarityScore": <integer 0-100>,
  "breakdown": {
    "composition": <integer 0-100>,
    "colorPalette": <integer 0-100>,
    "subjectContent": <integer 0-100>,
    "styleAtmosphere": <integer 0-100>
  },
  "reasoning": "<2-3 sentence explanation of the score, what matched well and what didn't>"
}`;

    const ai = createGenAI();

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: refMimeType,  data: refBase64       } },
            { inlineData: { mimeType: genMimeType,  data: cleanGenerated  } },
            { text: scoringPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini');

    const parsed = JSON.parse(text);
    return NextResponse.json({
      similarityScore: parsed.similarityScore ?? 0,
      breakdown:       parsed.breakdown       ?? {},
      reasoning:       parsed.reasoning       ?? '',
    });

  } catch (error: any) {
    console.error('[score-image] Error:', error);
    // Return a neutral score on failure so the game can continue
    return NextResponse.json({
      similarityScore: 0,
      breakdown: {},
      reasoning: 'Scoring unavailable for this round.',
    });
  }
}
