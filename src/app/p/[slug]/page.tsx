import { notFound } from 'next/navigation';
import { getStore } from '@/lib/store';
import PresetApp from './PresetApp';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const preset = await getStore().getPreset(slug);
  return {
    title: preset?.name ?? 'Notifiche',
    manifest: `/p/${slug}/manifest/`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent' as const,
      title: preset?.name,
    },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const preset = await getStore().getPreset(slug);
  if (!preset) notFound();

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error('VAPID_PUBLIC_KEY non è configurata sul server');

  // La chiave pubblica arriva al client da qui: nessuna variabile NEXT_PUBLIC_ da duplicare.
  return <PresetApp preset={preset} vapidPublicKey={vapidPublicKey} />;
}
