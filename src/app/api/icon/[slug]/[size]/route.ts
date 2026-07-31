import { BadRequestError, NotFoundError, errorResponse } from '@/lib/auth';
import { getStore } from '@/lib/store';
import type { IconSize } from '@/lib/store';

const ALLOWED_SIZES = [192, 512] as const;

type Params = { params: Promise<{ slug: string; size: string }> };

// Nessuna autenticazione: il manifest e la Home di iOS caricano queste URL
// senza poter mandare header.
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { slug, size } = await params;
    const parsed = Number(size) as IconSize;

    if (!ALLOWED_SIZES.includes(parsed as (typeof ALLOWED_SIZES)[number])) {
      throw new BadRequestError('Dimensione icona non ammessa');
    }

    const base64 = await getStore().getIcon(slug, parsed);
    if (!base64) throw new NotFoundError('Icona non trovata');

    return new Response(Buffer.from(base64, 'base64'), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
