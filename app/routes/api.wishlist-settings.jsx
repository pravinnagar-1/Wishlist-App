import { authenticate }                from "../shopify.server";
import { getCurrentPlan }              from "../models/subscription.server";
import {
  getWishlistSettingsForPlan,
  DEFAULT_WISHLIST_SETTINGS,
} from "../models/wishlist-settings.server";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type":                 "application/json",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // App Proxy authentication
    const { admin } = await authenticate.public.appProxy(request);
    const plan      = await getCurrentPlan(admin);
    const settings  = await getWishlistSettingsForPlan(admin, plan.features);

    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    console.error("[Wishlist API] Error:", err.message);
    // Default return karo taaki liquid fallback kaam kare
    return new Response(JSON.stringify(DEFAULT_WISHLIST_SETTINGS), {
      status: 200,
      headers: corsHeaders,
    });
  }
}
