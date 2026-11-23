import { Product, ProductUnit, Customer } from '../types/pos';
import {
  findCustomerSpecialPrice,
  findUpcomingCustomerSpecialPrice,
  isCustomerMember,
} from './customerUtils';

export function getEffectiveCustomerCategory(
  customer?: Customer | null
): string | undefined {
  if (!customer) return undefined;
  const trimmed = customer.customerCategory?.trim();
  if (trimmed) return trimmed;
  return isCustomerMember(customer) ? 'MEMBER' : 'UMUM';
}

export interface ResolvedProductDiscount {
  baseUnitPrice: number;
  effectiveUnitPrice: number;
  discountPercent: number;
  savingsPerUnit: number;
  hasDiscount: boolean;
  source: 'CUSTOMER_SPECIAL' | 'PRODUCT_PROMO' | 'NONE';
  promoLabel?: string;
  customerPriceCategory?: string;
  upcomingTier?: {
    minQuantity: number;
    specialPrice: number;
    unitName: string;
    customerCategory: string;
  };
}

/**
 * Hitung harga dasar satuan termasuk penyesuaian varian (jika dipilih).
 */
export function computeStandardUnitPrice(
  product: Product,
  unit: ProductUnit,
  selectedVariant?: string
): number {
  let standardUnitPrice = unit.sellingPrice;
  if (selectedVariant && product.variants) {
    const vObj = product.variants.find(
      (v) => v.name.toLowerCase() === selectedVariant.toLowerCase()
    );
    if (vObj && vObj.price !== undefined && vObj.price > 0) {
      standardUnitPrice = vObj.price * (unit.conversionFactor || 1);
    } else if (vObj && vObj.priceAdjustment) {
      standardUnitPrice = Math.max(
        0,
        unit.sellingPrice + vObj.priceAdjustment * (unit.conversionFactor || 1)
      );
    }
  }
  return Math.max(0, Math.round(standardUnitPrice));
}

/**
 * Resolves the effective selling price for a product/unit considering:
 * 1) Product-level promo discountPercent (0-100)
 * 2) Customer category special pricing (single or tiered quantity)
 * Prefers whichever offers a lower price (or applies customer special when configured).
 */
export function resolveProductDiscount(
  product: Product,
  unit: ProductUnit,
  selectedVariant?: string,
  selectedCustomer?: Customer | null,
  quantity: number = 1
): ResolvedProductDiscount {
  const baseUnitPrice = computeStandardUnitPrice(product, unit, selectedVariant);
  const rawPromoPct = Math.min(99, Math.max(0, Number(product.discountPercent) || 0));
  const promoPrice =
    rawPromoPct > 0
      ? Math.max(0, Math.round(baseUnitPrice * (1 - rawPromoPct / 100)))
      : baseUnitPrice;

  const activeCategory = getEffectiveCustomerCategory(selectedCustomer || null);
  const specialPricing = findCustomerSpecialPrice(product, activeCategory, unit, quantity);
  const upcoming = activeCategory
    ? findUpcomingCustomerSpecialPrice(product, activeCategory, unit, quantity)
    : null;

  const upcomingTier =
    upcoming && activeCategory
      ? {
          minQuantity: upcoming.minQuantity,
          specialPrice: upcoming.nextRule.price,
          unitName: unit.unitName,
          customerCategory: activeCategory,
        }
      : undefined;

  // Determine winning discount
  if (specialPricing && rawPromoPct > 0) {
    // Compare both and use whichever is better for customer (or special if equal)
    if (specialPricing.specialPrice <= promoPrice) {
      const savingsPerUnit = Math.max(0, baseUnitPrice - specialPricing.specialPrice);
      const pct =
        baseUnitPrice > 0
          ? Math.round((savingsPerUnit / baseUnitPrice) * 1000) / 10
          : 0;
      return {
        baseUnitPrice,
        effectiveUnitPrice: specialPricing.specialPrice,
        discountPercent: Math.max(0, pct),
        savingsPerUnit,
        hasDiscount: savingsPerUnit > 0,
        source: 'CUSTOMER_SPECIAL',
        customerPriceCategory: activeCategory,
        promoLabel: product.promoLabel,
        upcomingTier,
      };
    }
  }

  if (specialPricing && (!rawPromoPct || specialPricing.specialPrice < baseUnitPrice)) {
    const savingsPerUnit = Math.max(0, baseUnitPrice - specialPricing.specialPrice);
    const pct =
      baseUnitPrice > 0 ? Math.round((savingsPerUnit / baseUnitPrice) * 1000) / 10 : 0;
    return {
      baseUnitPrice,
      effectiveUnitPrice: specialPricing.specialPrice,
      discountPercent: Math.max(0, pct),
      savingsPerUnit,
      hasDiscount: savingsPerUnit > 0,
      source: 'CUSTOMER_SPECIAL',
      customerPriceCategory: activeCategory,
      upcomingTier,
    };
  }

  if (rawPromoPct > 0 && promoPrice < baseUnitPrice) {
    const savingsPerUnit = Math.max(0, baseUnitPrice - promoPrice);
    return {
      baseUnitPrice,
      effectiveUnitPrice: promoPrice,
      discountPercent: Math.round(rawPromoPct * 10) / 10,
      savingsPerUnit,
      hasDiscount: true,
      source: 'PRODUCT_PROMO',
      promoLabel: product.promoLabel?.trim() || 'PROMO',
      upcomingTier,
    };
  }

  return {
    baseUnitPrice,
    effectiveUnitPrice: baseUnitPrice,
    discountPercent: 0,
    savingsPerUnit: 0,
    hasDiscount: false,
    source: 'NONE',
    upcomingTier,
  };
}

/**
 * Checks whether a product currently has any active discount or tiered promo
 * visible to the active customer.
 */
export function productHasAnyDiscount(
  product: Product,
  selectedCustomer?: Customer | null
): boolean {
  if ((Number(product.discountPercent) || 0) > 0) return true;
  const baseUnit = product.units?.[0];
  if (!baseUnit) return false;
  const resolved = resolveProductDiscount(product, baseUnit, undefined, selectedCustomer, 1);
  if (resolved.hasDiscount || resolved.upcomingTier) return true;

  // Also check if any multi-unit has an active customer special price
  const activeCat = getEffectiveCustomerCategory(selectedCustomer || null);
  return product.units.some((u) => {
    const sp = findCustomerSpecialPrice(product, activeCat, u, 1);
    if (sp && sp.specialPrice < u.sellingPrice) return true;
    const up = findUpcomingCustomerSpecialPrice(product, activeCat, u, 1);
    return Boolean(up);
  });
}
