// app/routes/api.wishlist-shared-items.jsx
import { authenticate }        from "../shopify.server";
import prisma                  from "../db.server";
import { getWishlistSettings } from "../models/wishlist-settings.server";

const CORS_HEADERS = {
  "Content-Type":                "application/json",
  "Cache-Control":               "no-store",
  "Access-Control-Allow-Origin": "*",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);

    const url   = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing parameters.", items: [] }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // The token itself is the credential here (it's a random, unguessable,
    // globally-unique value) — look it up directly instead of trusting the
    // client-supplied `shop` query param to scope the lookup.
    const share = await prisma.wishlistShare.findUnique({
      where: { token },
    });

    if (!share) {
      return new Response(
        JSON.stringify({ error: "Share link not found or expired.", items: [] }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Check expiry
    if (share.expiresAt && new Date() > share.expiresAt) {
      return new Response(
        JSON.stringify({ error: "This share link has expired.", items: [] }),
        { status: 410, headers: CORS_HEADERS }
      );
    }

    // Respect the merchant's on/off switch — if they've disabled sharing,
    // previously generated links should stop working too.
    const settings = await getWishlistSettings(admin);
    if (!settings.enable_share) {
      return new Response(
        JSON.stringify({ error: "Wishlist sharing is disabled for this store.", items: [] }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Fetch this customer's wishlist items
    const items = await prisma.wishlist.findMany({
      where: { shop: share.shop, customerId: share.customerId },
      orderBy: { createdAt: "desc" },
    });

    return new Response(
      JSON.stringify({ items }),
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (err) {
    console.error("[wishlist-shared-items]", err.message);
    return new Response(
      JSON.stringify({ error: "Server error.", items: [] }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
