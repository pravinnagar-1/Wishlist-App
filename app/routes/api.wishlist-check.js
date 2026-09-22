// app/routes/api.wishlist-check.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const NO_CACHE_HEADERS = {
  "Content-Type":  "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma":        "no-cache",
  "Access-Control-Allow-Origin": "*",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: NO_CACHE_HEADERS });
  }

  try {
    await authenticate.public.appProxy(request);

    const url        = new URL(request.url);
    // `shop` and `logged_in_customer_id` are appended + signed by Shopify's
    // app proxy itself — trust these over any client-supplied query param so
    // one customer can't check/spoof another customer's wishlist status.
    const shop        = url.searchParams.get("shop");
    const customerId  = url.searchParams.get("logged_in_customer_id");
    const productId   = url.searchParams.get("productId");

    // Return false immediately if any required param is missing
    // (no customerId means a guest — nothing to check).
    if (!shop || !customerId || !productId) {
      return new Response(
        JSON.stringify({ exists: false }),
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }

    const wishlist = await prisma.wishlist.findFirst({
      where: {
        shop,
        customerId,
        productId,
      },
    });

    return new Response(
      JSON.stringify({ exists: !!wishlist }),
      { status: 200, headers: NO_CACHE_HEADERS }
    );

  } catch (err) {
    console.error("[wishlist-check]", err.message);
    return new Response(
      JSON.stringify({ exists: false }),
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  }
}
