// app/routes/app.pricing.confirm.jsx

import { authenticate }         from "../shopify.server";
import { redirect }             from "react-router";
import { getPlanByName }        from "../config/plans";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER — Shopify lands here after the merchant confirms billing
// URL looks like: /app/pricing/confirm?charge_id=123456789
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const url       = new URL(request.url);
  const chargeId  = url.searchParams.get("charge_id");

  // No charge_id in the URL — something went wrong before Shopify redirected
  if (!chargeId) {
    return redirect("/app/pricing?error=missing_charge");
  }

  // Ask Shopify to confirm the subscription is actually active
  const response = await admin.graphql(`
    query VerifySubscription($id: ID!) {
      node(id: $id) {
        ... on AppSubscription {
          id
          name
          status
          trialDays
          currentPeriodEnd
        }
      }
    }
  `, {
    variables: {
      // Shopify wants the full GID format, not just the numeric ID
      id: `gid://shopify/AppSubscription/${chargeId}`,
    },
  });

  const data = await response.json();
  const sub  = data?.data?.node;

  // Subscription not found at all
  if (!sub) {
    return redirect("/app/pricing?error=not_found");
  }

  // Merchant clicked "Decline" on Shopify's billing page
  if (sub.status === "DECLINED") {
    return redirect("/app/pricing?error=billing_declined");
  }

  // Success — subscription is active or in trial
  if (sub.status === "ACTIVE" || sub.status === "PENDING") {
    const plan = getPlanByName(sub.name);

    // ── Optional: save plan to your own DB here ────────────────────────────
    // If you have a Prisma DB set up you can do:
    // await db.session.update({
    //   where: { shop: session.shop },
    //   data:  { plan: plan.id },
    // });
    // Otherwise getActivePlan() queries Shopify directly every time, which
    // is fine for low-traffic apps. For high traffic, caching in your DB
    // is better to avoid Shopify API rate limits.
    // ────────────────────────────────────────────────────────────────────────

    return redirect(`/app?subscribed=${plan.id}`);
  }

  // Any other unexpected status
  return redirect("/app/pricing?error=unknown");
}

// This route is pure server logic — no UI needed
export default function Confirm() {
  return null;
}