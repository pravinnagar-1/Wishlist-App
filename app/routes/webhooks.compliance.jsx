// app/routes/webhooks.compliance.jsx
//
// Mandatory GDPR compliance webhooks. Every Shopify app (public or custom)
// must respond to these three topics — see shopify.app.toml's
// `compliance_topics` subscription, which points all three at this one route.
//
// Docs: https://shopify.dev/docs/apps/build/privacy-law-compliance

import { authenticate } from "../shopify.server";
import db               from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[compliance] Received ${topic} webhook for ${shop}`);

  switch (topic) {
    // ── A customer (or store owner on their behalf) requests a copy of the
    // data you store about them. You have 30 days to respond. We don't store
    // anything beyond product/variant IDs tied to a customerId, so we just
    // log what we hold — in production, forward this to the merchant/support
    // so they can act on it within the deadline.
    case "CUSTOMERS_DATA_REQUEST": {
      const customerId = payload?.customer?.id ? String(payload.customer.id) : null;
      if (customerId) {
        const items = await db.wishlist.findMany({ where: { shop, customerId } });
        console.log(
          `[compliance] Data request for customer ${customerId} on ${shop}: ` +
          `${items.length} wishlist item(s).`,
          items
        );
        // TODO (production): email/export `items` to the store owner or your
        // support inbox so they can fulfil the request within 30 days.
      }
      break;
    }

    // ── A customer requests deletion of their data (or the store owner
    // requests it on their behalf). Delete everything tied to that customer.
    case "CUSTOMERS_REDACT": {
      const customerId = payload?.customer?.id ? String(payload.customer.id) : null;
      if (customerId) {
        await db.wishlist.deleteMany({ where: { shop, customerId } });
        await db.wishlistShare.deleteMany({ where: { shop, customerId } });
        console.log(`[compliance] Redacted all data for customer ${customerId} on ${shop}.`);
      }
      break;
    }

    // ── Sent ~48 hours after a shop uninstalls the app. Delete everything
    // that belongs to that shop.
    case "SHOP_REDACT": {
      await db.wishlist.deleteMany({ where: { shop } });
      await db.wishlistShare.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      console.log(`[compliance] Redacted all shop data for ${shop}.`);
      break;
    }

    default:
      console.warn(`[compliance] Unhandled compliance topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
