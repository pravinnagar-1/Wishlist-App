// app/models/wishlist-settings.server.js
//
// Single source of truth for the merchant's wishlist settings (stored as a
// shop metafield). Used by the admin settings page, the public storefront
// settings API, and any other route (share-create, shared-items) that needs
// to know whether a feature is enabled for a shop.

export const METAFIELD_NAMESPACE = "wishlist_app";
export const METAFIELD_KEY       = "launching_settings";

export const DEFAULT_WISHLIST_SETTINGS = {
  // Launching Point
  launching_point:   "both",
  position:          "bottom_right",
  vertical_position: "lowest",
  bg_color:          "#000000",
  icon_color:        "#ffffff",
  icon_radius:       "circle",
  // Product Page
  product_btn_style: "style1",
  before_btn_label:  "Add to Wishlist",
  before_bg_color:   "#000000",
  before_icon_color: "#ffffff",
  after_btn_label:   "Added to Wishlist",
  after_bg_color:    "#228B22",
  after_icon_color:  "#000000",
  // Collection Page
  collection_position:       "top_right",
  collection_icon_type:      "heart",
  collection_custom_selector: "",
  // Wishlist Page
  wishlist_content_type: "page",
  wishlist_page_title:   "My Wishlists",
  // Notification
  notification_postion:  "top_left",
  notification_duration: "1",
  notification_show:     true,
  // General Settings
  guest_wishlist:    false,
  show_vendor:        false,
  remove_after_cart:  false,
  stay_on_page:       false,
  show_add_to_cart:   true,
  show_sold_out:      false,
  allow_quantity:     false,
  allow_variant:      false,
  // Wishlist Share — merchant on/off switch for the "Share wishlist" feature.
  // Defaults to true so existing installs keep working exactly as before.
  enable_share:       true,
};

/**
 * Reads the merchant's wishlist settings from the shop metafield.
 * `admin` is the authenticated GraphQL client (from authenticate.admin or
 * authenticate.public.appProxy — both return one scoped to the right shop).
 */
export async function getWishlistSettings(admin) {
  try {
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

    let settings = { ...DEFAULT_WISHLIST_SETTINGS };
    if (raw) {
      try { settings = { ...settings, ...JSON.parse(raw) }; } catch {}
    }
    return settings;
  } catch (err) {
    console.error("[getWishlistSettings]", err.message);
    return { ...DEFAULT_WISHLIST_SETTINGS };
  }
}

/**
 * Clamps settings down to whatever the shop's current plan actually allows.
 * Used on read (storefront + admin) so behaviour always matches the shop's
 * *current* plan — even if the settings were saved back when they were on a
 * higher plan and have since downgraded — and on write, so a crafted request
 * can't save a feature the shop isn't paying for.
 */
export function clampSettingsToPlan(settings, planFeatures) {
  const clamped = { ...settings };
  if (!planFeatures.guestWishlist) {
    clamped.guest_wishlist = false;
  }
  if (!planFeatures.drawer && clamped.wishlist_content_type === "side_drawer") {
    clamped.wishlist_content_type = "pop-up";
  }
  if (!planFeatures.toastNotifications) {
    clamped.notification_show = false;
  }
  return clamped;
}

/**
 * Convenience: fetch settings AND clamp them to the shop's current plan in
 * one call. This is what every read path (storefront API, admin loader)
 * should use, so a downgrade takes effect immediately everywhere.
 */
export async function getWishlistSettingsForPlan(admin, planFeatures) {
  const settings = await getWishlistSettings(admin);
  return clampSettingsToPlan(settings, planFeatures);
}
