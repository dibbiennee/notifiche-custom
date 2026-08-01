import { NotFoundError, errorResponse } from '@/lib/auth';
import { buildManifest } from '@/lib/manifest';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { slug } = await params;
    const preset = await getStore().getPreset(slug);
    if (!preset) throw new NotFoundError('Preset non trovato');

    return new Response(JSON.stringify(buildManifest(preset)), {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
