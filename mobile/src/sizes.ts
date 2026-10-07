// Particle size classes as the size-mix view stacks them; shared by the 3D view and its key.
// Their descriptions are in strings.ts under `sizes`. Mirrors frontend/src/sizes.ts.
export const SIZE_CLASSES = [
  { key: 'fine', name: 'PM1', color: '#a78bfa' },
  { key: 'mid', name: 'PM1–2.5', color: '#60a5fa' },
  { key: 'coarse', name: 'PM2.5–10', color: '#f59e0b' },
] as const;
