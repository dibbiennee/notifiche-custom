import { BadRequestError, assertAuthorized, errorResponse } from '@/lib/auth';
import { slugify } from '@/lib/slug';
import { getStore } from '@/lib/store';
import type { IconSet, Preset } from '@/lib/store';

const MAX_ICON_BASE64_LENGTH = 400_000;

type CreateBody = {
  name?: unknown;
  defaultBody?: unknown;
  icons?: { '192'?: unknown; '512'?: unknown };
};

function readString(value: unknown, field: string, { required = false } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
    return '';
  }
  if (typeof value !== 'string') throw new BadRequestError(`Campo non valido: ${field}`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
  return trimmed;
}

function readIcons(icons: CreateBody['icons']): IconSet {
  const at192 = readString(icons?.['192'], 'icons.192', { required: true });
  const at512 = readString(icons?.['512'], 'icons.512', { required: true });
  for (const value of [at192, at512]) {
    if (value.length > MAX_ICON_BASE64_LENGTH) {
      throw new BadRequestError('Icona troppo grande');
    }
  }
  return { 192: at192, 512: at512 };
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const presets = await getStore().listPresets();
    return Response.json({ presets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const body = (await request.json()) as CreateBody;

    const name = readString(body.name, 'name', { required: true });
    const preset: Preset = {
      slug: slugify(name),
      name,
      defaultBody: readString(body.defaultBody, 'defaultBody'),
      createdAt: Date.now(),
    };

    await getStore().createPreset(preset, readIcons(body.icons));
    return Response.json({ preset }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const slug = new URL(request.url).searchParams.get('slug');
    if (!slug) throw new BadRequestError('Parametro slug mancante');

    await getStore().deletePreset(slug);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
