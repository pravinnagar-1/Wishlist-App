// api.wishlist-add.js
import { authenticate }   from "../shopify.server";
import prisma             from "../db.server";
import { getCurrentPlan } from "../models/subscription.server";

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
    // IMPORTANT: verifies this request really came through Shopify's app proxy
    // (signed request). Without this, anyone who finds the backend URL could
    // add/read wishlist data for any shop by calling this endpoint directly.
    const { admin } = await authenticate.public.appProxy(request);

    // Trust only what Shopify itself signed on the proxied request — `shop`
    // and `logged_in_customer_id` — instead of the shop/customerId the client
    // put in the POST body, which anyone could edit in devtools to write into
    // a different shop's DB or a different customer's wishlist.
    const url         = new URL(request.url);
    const shop        = url.searchParams.get("shop");
    const customerId  = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return new Response(
        JSON.stringify({ success: false, error: "You must be logged in to use the wishlist." }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const { productId, variantId, productHandle } = body;

    if (!productId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // check existing
    const existing = await prisma.wishlist.findFirst({
      where: { shop, productId, customerId },
    });

    if (existing) {
      // Return the same shape as the "created" branch below —
      // the storefront JS always reads data.data.productHandle from this response.
      return new Response(
        JSON.stringify({ success: true, message: "Already added", data: existing }),
        { headers: CORS_HEADERS }
      );
    }

    // Plan limit — how many wishlist items this shop is allowed to store in
    // total (Free: 100, Starter: 1000, Pro: unlimited). Checked here, not on
    // read, so existing items never disappear on downgrade — only new adds
    // beyond the cap are blocked.
    const plan = await getCurrentPlan(admin);
    if (Number.isFinite(plan.features.maxItems)) {
      const currentCount = await prisma.wishlist.count({ where: { shop } });
      if (currentCount >= plan.features.maxItems) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `You've reached the ${plan.features.maxItems}-item wishlist limit on the ${plan.name} plan. Upgrade to add more.`,
            limitReached: true,
          }),
          { status: 403, headers: CORS_HEADERS }
        );
      }
    }

    const wishlist = await prisma.wishlist.create({
      data: { shop, productId, variantId, customerId, productHandle },
    });

    return new Response(
      JSON.stringify({ success: true, data: wishlist }),
      { headers: CORS_HEADERS }
    );

  } catch (err) {
    console.error("[wishlist-add]", err.message);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function loader() {
  return new Response(JSON.stringify({ message: "OK" }), {
    headers: { "Content-Type": "application/json" },
  });
}
