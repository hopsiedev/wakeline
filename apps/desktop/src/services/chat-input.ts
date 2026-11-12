export type ImageSize = { type: string; size: number };
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export function validateImageSelection(
  existing: ImageSize[],
  incoming: ImageSize[]
): 'type' | 'limit' | null {
  if (incoming.some((file) => !IMAGE_TYPES.includes(file.type))) return 'type';
  const all = [...existing, ...incoming];
  if (
    all.some((f) => f.size > 5 * 1024 * 1024) ||
    all.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024
  )
    return 'limit';
  return null;
}
export function modelLabel(id: string) {
  const names: Record<string, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };
  if (names[id]) return names[id];
  const match = /^claude-(sonnet|opus|haiku)-(\d+)(?:-(\d+))?$/.exec(id);
  return match ? names[match[1]] + ' ' + match[2] + (match[3] ? '.' + match[3] : '') : id;
}
export type ChatAttachment = { id: string; name: string; type: string; size: number; data: string };
export function readImage(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        name: file.name || 'image',
        type: file.type,
        size: file.size,
        data: String(reader.result).split(',')[1],
      });
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

export function pastedImages(
  items: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }>
): File[] {
  return Array.from(items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
}
