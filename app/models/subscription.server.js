// app/models/subscription.server.js
import { getPlanByName } from "../config/plans";

/**
 * Fetches the shop's current active subscription directly from Shopify.
 * Shopify is the source of truth — no need to store the plan in your own DB.
 *
 * Returns the raw subscription object from Shopify, or null if on free plan.
 *
 * Usage in any loader:
 *   const activeSub = await getActivePlan(admin);
 *   const plan      = getPlanByName(activeSub?.name);
 */
export async function getActivePlan(admin) {
  const response = await admin.graphql(`
    query GetActiveSubscription {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          trialDays
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price { amount currencyCode }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `);

  const data      = await response.json();
  const subs      = data?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  // Return the first ACTIVE or PENDING subscription, or null
  return subs.find((s) => s.status === "ACTIVE" || s.status === "PENDING") ?? null;
}

/**
 * Convenience wrapper — returns the shop's full plan object (with `.features`)
 * from config/plans.js, resolved from whatever subscription Shopify says is
 * active. Falls back to the Free plan if there's no active subscription.
 *
 * This is the single source of truth for feature-gating: call it wherever
 * you need to know what a shop is currently allowed to do.
 */
export async function getCurrentPlan(admin) {
  const activeSub = await getActivePlan(admin);
  return getPlanByName(activeSub?.name);
}