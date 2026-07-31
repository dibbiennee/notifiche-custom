const MAX_SLUG_LENGTH = 48;

/** Trasforma il nome di un preset in uno slug utilizzabile come segmento di URL. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    // U+0300-U+036F è il blocco dei segni diacritici combinanti che NFD separa.
    // Vanno scritti con gli escape: i caratteri letterali sono invisibili e si
    // perdono in copia-incolla.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  if (!slug) {
    throw new RangeError('Il nome deve contenere almeno una lettera o una cifra');
  }

  return slug;
}
