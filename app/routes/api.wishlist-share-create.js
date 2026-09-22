// app/routes/api.wishlist-share-create.jsx
import { authenticate }        from "../shopify.server";
import prisma                  from "../db.server";
import crypto                  from "crypto";
import { getWishlistSettings } from "../models/wishlist-settings.server";

const CORS_HEADERS = {
  "Content-Type":                "application/json",
  "Cache-Control":               "no-store",
  "Access-Control-Allow-Origin": "*",
};

const SHARE_LINK_TTL_DAYS = 30;

function newExpiry() {
  return new Date(Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);

    // ── Trust only what Shopify itself signed on the proxied request ──────────
    // `shop` and `logged_in_customer_id` are appended + signed by Shopify's app
    // proxy, unlike the `shop`/`customerId` query params a client could type by
    // hand. This stops a customer from generating a share link for someone
    // else's wishlist by editing the request in devtools.
    const url               = new URL(request.url);
    const shop              = url.searchParams.get("shop");
    const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !loggedInCustomerId) {
      return new Response(
        JSON.stringify({ error: "You must be logged in to share your wishlist." }),
        { status: 401, headers: CORS_HEADERS }
      );
    }
    const customerId = loggedInCustomerId;

    // Respect the merchant's on/off switch for this feature.
    const settings = await getWishlistSettings(admin);
    if (!settings.enable_share) {
      return new Response(
        JSON.stringify({ error: "Wishlist sharing is disabled for this store." }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Check if this customer already has a share token — reuse/renew it
    let share = await prisma.wishlistShare.findFirst({
      where: { shop, customerId },
    });

    const now = new Date();

    if (!share) {
      // First time sharing — create a new token with a fresh expiry.
      share = await prisma.wishlistShare.create({
        data: {
          shop,
          customerId,
          token:     crypto.randomBytes(16).toString("hex"),
          expiresAt: newExpiry(),
        },
      });
    } else if (share.expiresAt && share.expiresAt < now) {
      // Old link expired — rotate to a brand new token/expiry instead of
      // handing back a dead link.
      share = await prisma.wishlistShare.update({
        where: { id: share.id },
        data: {
          token:     crypto.randomBytes(16).toString("hex"),
          expiresAt: newExpiry(),
        },
      });
    }

    // Build the storefront URL the customer can share — a dedicated app
    // proxy sub-path (see app/routes/share.js) so the shared view gets its
    // own clean URL and the theme's header/footer/announcement bar.
    const shareableUrl = `https://${shop}/apps/wishlist/share?key=${share.token}`;

    return new Response(
      JSON.stringify({ token: share.token, url: shareableUrl, expiresAt: share.expiresAt }),
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (err) {
    console.error("[wishlist-share-create]", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to create share link." }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
