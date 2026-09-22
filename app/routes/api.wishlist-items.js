// api.wishlist-items.js
import { authenticate } from "../shopify.server";
import prisma           from "../db.server";

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
    // Verify the request came through Shopify's app proxy before touching the DB.
    await authenticate.public.appProxy(request);

    const url        = new URL(request.url);
    // Trust Shopify's own signed params, not a client-supplied customerId —
    // otherwise anyone could read another customer's wishlist items.
    const shop       = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    const items = await prisma.wishlist.findMany({
      where: { shop, customerId },
      orderBy: { createdAt: "desc" },
    });

    return new Response(JSON.stringify({ items }), {
      status: 200, headers: CORS_HEADERS,
    });

  } catch (err) {
    console.error("[wishlist-items]", err.message);
    return new Response(JSON.stringify({ items: [] }), {
      status: 200, headers: CORS_HEADERS,
    });
  }
}
