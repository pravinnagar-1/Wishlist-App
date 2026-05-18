import { authenticate } from "../shopify.server";

const METAFIELD_NAMESPACE = "wishlist_app";
const METAFIELD_KEY       = "launching_settings";

const DEFAULT_SETTINGS = {
  // Launching Point
  launching_point: "both",
  position:        "bottom_right",
  vertical_position: "lowest",
  bg_color:        "#000000",
  icon_color:      "#ffffff",
  icon_radius:     "circle",
  // Product Page
  product_btn_style: "style1",
  before_btn_label:  "Add to Wishlist",
  before_bg_color:   "#000000",
  before_icon_color: "#ffffff",
  after_btn_label:   "Added to Wishlist",
  after_bg_color:    "#228B22",
  after_icon_color:  "#000000",
   // Collection Page
  collection_position:  "top_right",
  collection_icon_type: "heart",
  // Wishlist Page
  wishlist_content_type: "page",
  wishlist_page_title:   "My Wishlists",
  // notification
  notification_postion:"top_left",
  notification_duration:"1",
  notification_show:true,
  // General Settings
  guest_wishlist:     false,
  show_vendor:        false,
  remove_after_cart:  false,
  stay_on_page:       false,
  show_add_to_cart:   true,
  show_sold_out:      true,
  allow_quantity:     true,
  allow_variant:      true,  
};

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
    const { admin, liquid } = await authenticate.public.appProxy(request);

    const response = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
            value
          }
        }
      }
    `);

    const data = await response.json();
    const raw  = data?.data?.shop?.metafield?.value;

    let settings = { ...DEFAULT_SETTINGS };
    if (raw) {
      try { settings = { ...settings, ...JSON.parse(raw) }; } catch {}
    }

    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    console.error("[Wishlist API] Error:", err.message);
    // Default return karo taaki liquid fallback kaam kare
    return new Response(JSON.stringify(DEFAULT_SETTINGS), {
      status: 200,
      headers: corsHeaders,
    });
  }
}
