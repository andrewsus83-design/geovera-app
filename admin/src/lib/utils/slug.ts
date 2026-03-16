export function autoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}
