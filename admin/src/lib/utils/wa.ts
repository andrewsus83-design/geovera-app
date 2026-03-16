export function normalizeWA(input: string): string {
  let num = input.replace(/\D/g, '');
  // Strip double country code (user pasted +6285... into field that already shows +62)
  if (num.startsWith('6262')) {
    num = num.slice(2);
  }
  if (num.startsWith('0')) {
    num = '62' + num.slice(1);
  }
  if (!num.startsWith('62')) {
    num = '62' + num;
  }
  return num;
}

export function formatWA(num: string): string {
  if (!num) return '';
  const clean = num.replace(/\D/g, '');
  if (clean.startsWith('62') && clean.length >= 10) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
  }
  return num;
}

export function validateWA(input: string): boolean {
  const num = normalizeWA(input);
  return /^62\d{9,13}$/.test(num);
}
