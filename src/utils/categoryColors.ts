import { ProductCategory, Product } from '../types/pos';

export interface CategoryColorPreset {
  label: string;
  hex: string;
  bgTint: string;
  borderColor: string;
  textColor: string;
}

export const CATEGORY_COLOR_PRESETS: CategoryColorPreset[] = [
  { label: 'Amber / Gold', hex: '#d97706', bgTint: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-800' },
  { label: 'Orange / Warm', hex: '#ea580c', bgTint: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-800' },
  { label: 'Rose / Merah', hex: '#e11d48', bgTint: 'bg-rose-50', borderColor: 'border-rose-200', textColor: 'text-rose-800' },
  { label: 'Pink / Magenta', hex: '#db2777', bgTint: 'bg-pink-50', borderColor: 'border-pink-200', textColor: 'text-pink-800' },
  { label: 'Purple / Ungu', hex: '#9333ea', bgTint: 'bg-purple-50', borderColor: 'border-purple-200', textColor: 'text-purple-800' },
  { label: 'Indigo', hex: '#4f46e5', bgTint: 'bg-indigo-50', borderColor: 'border-indigo-200', textColor: 'text-indigo-800' },
  { label: 'Sky / Biru', hex: '#0284c7', bgTint: 'bg-sky-50', borderColor: 'border-sky-200', textColor: 'text-sky-800' },
  { label: 'Cyan', hex: '#0891b2', bgTint: 'bg-cyan-50', borderColor: 'border-cyan-200', textColor: 'text-cyan-800' },
  { label: 'Teal', hex: '#0d9488', bgTint: 'bg-teal-50', borderColor: 'border-teal-200', textColor: 'text-teal-800' },
  { label: 'Emerald / Hijau', hex: '#059669', bgTint: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-800' },
  { label: 'Lime', hex: '#65a30d', bgTint: 'bg-lime-50', borderColor: 'border-lime-200', textColor: 'text-lime-800' },
  { label: 'Slate / Abu', hex: '#475569', bgTint: 'bg-slate-100', borderColor: 'border-slate-300', textColor: 'text-slate-800' },
];

/**
 * Returns a consistent hex color for any category name or ID.
 */
export function getCategoryColor(
  categoryNameOrId: string,
  categories: ProductCategory[] = [],
  product?: Product
): string {
  if (product?.categoryColor) {
    return product.categoryColor;
  }

  const query = (categoryNameOrId || '').trim().toLowerCase();
  if (!query || query === 'semua') {
    return '#0284c7';
  }

  // Look for exact match in categories list by name or id
  const found = categories.find(
    (c) => c.name.toLowerCase() === query || c.id.toLowerCase() === query
  );
  if (found && found.color) {
    return found.color;
  }

  // Deterministic fallback based on string hash
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = query.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CATEGORY_COLOR_PRESETS.length;
  return CATEGORY_COLOR_PRESETS[index].hex;
}

/**
 * Checks if color is dark to choose appropriate contrast text (white vs dark slate)
 */
export function isDarkColor(hexColor: string): boolean {
  if (!hexColor) return false;
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return false;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Calculate relative luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 140;
}
