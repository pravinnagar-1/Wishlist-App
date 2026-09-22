// api.wishlist-remove.js
import { authenticate } from "../shopify.server";
import prisma           from "../db.server";

const CORS_HEADERS = {
  "Content-Type":                "application/json",
  "Cache-Control":               "no-store",
  "Access-Control-Allow-Origin": "*",
};

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // Same as wishlist-add: verify the request really came via Shopify's app proxy.
    await authenticate.public.appProxy(request);

    // Trust only the signed shop/customer identity from Shopify's proxy —
    // not whatever the client put in the POST body.
    const url        = new URL(request.url);
    const shop       = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return new Response(JSON.stringify({
        success: false,
        error: "You must be logged in to use the wishlist.",
      }), { status: 401, headers: CORS_HEADERS });
    }

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing fields",
      }), { status: 400, headers: CORS_HEADERS });
    }

    const deleted = await prisma.wishlist.deleteMany({
      where: {
        shop,
        productId: String(productId),
        customerId,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      deleted,
    }), { headers: CORS_HEADERS });

  } catch (err) {
    console.error("[wishlist-remove]", err.message);
    return new Response(JSON.stringify({
      success: false,
      error: "Server error",
    }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function loader() {
  return new Response(JSON.stringify({ message: "OK" }), {
    headers: { "Content-Type": "application/json" },
  });
}
