// app/config/plans.js

export const PLANS = {
  free: {
    id:        "free",
    name:      "Free",
    price:     0,
    interval:  null,
    trialDays: 0,
    features: {
      maxItems:          100,
      guestWishlist:     false,
      drawer:            false,
      analytics:         false,
      toastNotifications: false,
    },
  },
  starter: {
    id:        "starter",
    name:      "Starter",
    price:     9.99,
    interval:  "EVERY_30_DAYS",
    trialDays: 7,
    features: {
      maxItems:          1000,
      guestWishlist:     true,
      drawer:            true,
      analytics:         false,
      toastNotifications: true,
    },
  },
  pro: {
    id:        "pro",
    name:      "Pro",
    price:     29.99,
    interval:  "EVERY_30_DAYS",
    trialDays: 7,
    features: {
      maxItems:          Infinity,
      guestWishlist:     true,
      drawer:            true,
      analytics:         true,
      toastNotifications: true,
    },
  },
};

/**
 * Pass the subscription name that comes back from Shopify GraphQL.
 * Returns the matching plan object, or free plan if nothing matches.
 */
export function getPlanByName(shopifyName) {
  if (!shopifyName) return PLANS.free;
  const match = Object.values(PLANS).find(
    (p) => p.name.toLowerCase() === shopifyName.toLowerCase()
  );
  return match ?? PLANS.free;
}