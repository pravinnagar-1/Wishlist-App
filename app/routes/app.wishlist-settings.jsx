import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";
import {
  Page, Card, BlockStack, Text, Icon, InlineGrid,
  RadioButton, Select, TextField, Button, Banner, InlineStack, Checkbox
} from "@shopify/polaris";
import { SettingsIcon, AppsIcon, XIcon, NotificationIcon } from "@shopify/polaris-icons";
import {
  METAFIELD_NAMESPACE,
  METAFIELD_KEY,
  DEFAULT_WISHLIST_SETTINGS,
  clampSettingsToPlan,
} from "../models/wishlist-settings.server";
import { getCurrentPlan }      from "../models/subscription.server";

const tabList = [
  { id: "launching",  label: "Launching Point" },
  { id: "product",    label: "Product Page" },
  { id: "wishlist",   label: "Wishlist Page" },
  { id: "collection", label: "Collection Page" },
];

const positionOptions = [
  { label: "Left",         value: "left" },
  { label: "Right",        value: "right" },
  { label: "Bottom Left",  value: "bottom_left" },
  { label: "Bottom Right", value: "bottom_right" },
];

const radiusOptions = [
  { label: "Circle",  value: "circle" },
  { label: "Rounded", value: "rounded" },
  { label: "Square",  value: "square" },
];

// ─── Color Field with picker popup ───────────────────────────────────────────
function ColorField({ label, value, onChange }) {
  const inputRef = useRef(null);
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: "#202223" }}>{label}</div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          border: "1px solid #c9cccf", borderRadius: 8, padding: "6px 10px",
          background: "#fff", cursor: "text",
        }}
        onClick={() => inputRef.current?.click()}
      >
        {/* Color swatch — click karo popup khulega */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: 4,
              background: value, border: "1px solid #ccc",
              cursor: "pointer",
            }}
          />
          <input
            ref={inputRef}
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: "100%",
              opacity: 0, cursor: "pointer", padding: 0, border: "none",
            }}
          />
        </div>
        {/* Hex input */}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onClick={e => e.stopPropagation()}
          style={{
            border: "none", outline: "none", flex: 1,
            fontSize: 14, color: "#202223", background: "transparent",
          }}
        />
      </div>
    </div>
  );
}

// ─── Loader ──────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

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

  const plan = await getCurrentPlan(admin);
  settings   = clampSettingsToPlan(settings, plan.features);

  // Note: plan.features.maxItems can be Infinity (Pro plan), which JSON
  // can't represent — leave it out here, it's only needed server-side.
  return new Response(JSON.stringify({
    settings,
    plan: {
      id:                 plan.id,
      name:               plan.name,
      guestWishlist:      plan.features.guestWishlist,
      drawer:             plan.features.drawer,
      analytics:          plan.features.analytics,
      toastNotifications: plan.features.toastNotifications,
    },
  }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body      = await request.json();

  const payload = {
    launching_point:   body.launching_point   ?? "both",
    position:          body.position          ?? "bottom_right",
    vertical_position: body.vertical_position ?? "lowest",
    bg_color:          body.bg_color          ?? "#000000",
    icon_color:        body.icon_color        ?? "#ffffff",
    icon_radius:       body.icon_radius       ?? "circle",
    // Product Page
    product_btn_style: body.product_btn_style ?? "style1",
    before_btn_label:  body.before_btn_label  ?? "Add to Wishlist",
    before_bg_color:   body.before_bg_color   ?? "#000000",
    before_icon_color: body.before_icon_color ?? "#ffffff",
    after_btn_label:   body.after_btn_label   ?? "Added to Wishlist",
    after_bg_color:    body.after_bg_color    ?? "#228B22",
    after_icon_color:  body.after_icon_color  ?? "#000000",
    // Collection Page
    collection_position:  body.collection_position  ?? "top_right",
    collection_icon_type: body.collection_icon_type ?? "heart",
    collection_custom_selector: body.collection_custom_selector ?? "",
    // Wishlist Page
    wishlist_content_type: body.wishlist_content_type ?? "separate_page",
    wishlist_page_title:   body.wishlist_page_title   ?? "My Wishlists",
    // notification
    notification_postion: body.notification_postion   ?? "top_left",
    notification_duration: body.notification_duration   ?? "1",
    notification_show: body.notification_show   ?? true,
    // General Settings
    guest_wishlist:    body.guest_wishlist    ?? false,
    show_vendor:       body.show_vendor       ?? false,
    remove_after_cart: body.remove_after_cart ?? false,
    stay_on_page:      body.stay_on_page      ?? false,
    show_add_to_cart:  body.show_add_to_cart  ?? true,
    show_sold_out:     body.show_sold_out     ?? false,
    allow_quantity:    body.allow_quantity    ?? false,
    allow_variant:     body.allow_variant     ?? false,
    // Wishlist Share
    enable_share:      body.enable_share      ?? true,
  };

  // Re-check the plan on save too — never trust the client to have honestly
  // disabled something it wasn't allowed to turn on.
  const plan        = await getCurrentPlan(admin);
  const clampedPayload = clampSettingsToPlan(payload, plan.features);

  const shopRes  = await admin.graphql(`query { shop { id } }`);
  const shopData = await shopRes.json();
  const shopId   = shopData?.data?.shop?.id;

  const mutation = await admin.graphql(`
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key namespace value }
        userErrors  { field message }
      }
    }
  `, {
    variables: {
      metafields: [{
        ownerId:   shopId,
        namespace: METAFIELD_NAMESPACE,
        key:       METAFIELD_KEY,
        type:      "json",
        value:     JSON.stringify(clampedPayload),
      }],
    },
  });

  const mutData = await mutation.json();
  const errors  = mutData?.data?.metafieldsSet?.userErrors ?? [];

  if (errors.length > 0) {
    return new Response(JSON.stringify({ ok: false, errors }), {
      status: 422, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, settings: clampedPayload }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function WishlistSettingsPage() {
  const { settings, plan } = useLoaderData();

  const fetcher      = useFetcher();

  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [selectedTab,     setSelectedTab]     = useState(0);
  const [showBanner,      setShowBanner]      = useState(false);

  // ── Launching Point state ── loader se initialize
  const [entryPoint,     setEntryPoint]     = useState(settings.launching_point);
  const [buttonPosition, setButtonPosition] = useState(settings.position);
  const [bgColor,        setBgColor]        = useState(settings.bg_color);
  const [textIconColor,  setTextIconColor]  = useState(settings.icon_color);
  const [iconRadius,     setIconRadius]     = useState(settings.icon_radius);
  const [verticalPosition, setVerticalPosition] = useState(settings.vertical_position ?? "lowest");

  // ── Product Page state ── loader se initialize (FIX #3)
  const [productBtnStyle,  setProductBtnStyle]  = useState(settings.product_btn_style ?? "style1");
  const [previewType,      setPreviewType]      = useState("before");
  const [beforeBtnLabel,   setBeforeBtnLabel]   = useState(settings.before_btn_label  ?? "Add to Wishlist");
  const [beforeBgColor,    setBeforeBgColor]    = useState(settings.before_bg_color   ?? "#000000");
  const [beforeIconColor,  setBeforeIconColor]  = useState(settings.before_icon_color ?? "#ffffff");
  const [afterBtnLabel,    setAfterBtnLabel]    = useState(settings.after_btn_label   ?? "Added to Wishlist");
  const [afterBgColor,     setAfterBgColor]     = useState(settings.after_bg_color    ?? "#228B22");
  const [afterIconColor,   setAfterIconColor]   = useState(settings.after_icon_color  ?? "#000000");

  // Collection Page state
  const [collectionPosition, setCollectionPosition] = useState(settings.collection_position ?? "top_right");
  const [collectionIconType, setCollectionIconType] = useState(settings.collection_icon_type ?? "heart");
  const [collectionCustomSelector, setCollectionCustomSelector] = useState(settings.collection_custom_selector ?? "");

    // Wishlist Page & Like state
  const [wishlistContentType, setWishlistContentType] = useState(settings.wishlist_content_type ?? "separate_page");
  const [wishlistPageTitle,   setWishlistPageTitle]   = useState(settings.wishlist_page_title   ?? "My Wishlists");

    // ── Notification Settings state ──
  const [notifModalOpen,  setNotifModalOpen]  = useState(false);
  const [notifEnabled,    setNotifEnabled]    = useState(settings.notification_show ?? true);
  const [notifPosition,   setNotifPosition]   = useState(settings.notification_postion ?? "top_left");
  const [notifDuration,   setNotifDuration]   = useState(settings.notification_duration ?? "1");
  const [brandingEnabled, setBrandingEnabled] = useState(false);
  const [customBranding,  setCustomBranding]  = useState("Powered by Wishlist");

  // General Settings state
  const [generalModalOpen,   setGeneralModalOpen]   = useState(false);
  const [generalTab,         setGeneralTab]         = useState(0); // 0=General, 1=Wishlist page
  const [wishlistShare,      setWishlistShare]      = useState(settings.enable_share        ?? true);
  const [guestWishlist,      setGuestWishlist]      = useState(settings.guest_wishlist      ?? false);
  const [showVendor,         setShowVendor]         = useState(settings.show_vendor         ?? false);
  const [removeAfterCart,    setRemoveAfterCart]    = useState(settings.remove_after_cart   ?? false);
  const [stayOnPage,         setStayOnPage]         = useState(settings.stay_on_page        ?? false);
  const [showAddToCart,      setShowAddToCart]      = useState(settings.show_add_to_cart    ?? true);
  const [showSoldOut,        setShowSoldOut]        = useState(settings.show_sold_out        ?? false);
  const [allowQuantity,      setAllowQuantity]      = useState(settings.allow_quantity       ?? false);
  const [allowVariant,       setAllowVariant]       = useState(settings.allow_variant        ?? false);

  const saving      = fetcher.state === "submitting";
  const saveSuccess = fetcher.state === "idle" && fetcher.data?.ok === true;
  const saveError   = fetcher.state === "idle" && fetcher.data?.ok === false
    ? "Settings not save, try again."
    : "";

  // ── FIX #1: isDirty — actual saved values se compare karo ────────────────
  const isDirty = (() => {
    const saved = fetcher.data?.settings ?? settings;
    return (
      entryPoint     !== (saved.launching_point   ?? "both")          ||
      buttonPosition !== (saved.position          ?? "bottom_right")  ||
      bgColor        !== (saved.bg_color          ?? "#000000")       ||
      textIconColor  !== (saved.icon_color        ?? "#ffffff")       ||
      iconRadius     !== (saved.icon_radius       ?? "circle")        ||
      verticalPosition !== (saved.vertical_position ?? "lowest")   ||
      productBtnStyle !== (saved.product_btn_style ?? "style1")       ||
      beforeBtnLabel  !== (saved.before_btn_label  ?? "Add to Wishlist")   ||
      beforeBgColor   !== (saved.before_bg_color   ?? "#000000")      ||
      beforeIconColor !== (saved.before_icon_color ?? "#ffffff")      ||
      afterBtnLabel   !== (saved.after_btn_label   ?? "Added to Wishlist") ||
      afterBgColor    !== (saved.after_bg_color    ?? "#228B22")      ||
      afterIconColor  !== (saved.after_icon_color  ?? "#000000")      ||
      collectionPosition !== (saved.collection_position ?? "top_right") ||
      collectionIconType !== (saved.collection_icon_type ?? "heart")    ||
      collectionCustomSelector !== (saved.collection_custom_selector ?? "")  ||      
      wishlistContentType !== (saved.wishlist_content_type ?? "separate_page")    ||
      wishlistPageTitle   !== (saved.wishlist_page_title   ?? "My Wishlists")
    );
  })();
  // Notification
  const isDirtyNotification = (() => {
    const saved = fetcher.data?.settings ?? settings;
    return (
      notifEnabled   !== (saved.notification_show   ?? true) ||
      notifDuration   !== (saved.notification_duration   ?? "1") ||
      notifPosition   !== (saved.notification_postion   ?? "top_left")
    );
  })();

  const isDirtyGeneral = (() => {
   const saved = fetcher.data?.settings ?? settings;
    return (
    guestWishlist   !== (saved.guest_wishlist    ?? false) ||
    showVendor      !== (saved.show_vendor       ?? false) ||
    removeAfterCart !== (saved.remove_after_cart ?? false) ||
    stayOnPage      !== (saved.stay_on_page      ?? false) ||
    showAddToCart   !== (saved.show_add_to_cart  ?? true)  ||
    showSoldOut     !== (saved.show_sold_out     ?? false)  ||
    allowQuantity   !== (saved.allow_quantity    ?? false)  ||
    allowVariant    !== (saved.allow_variant     ?? false)  ||
    wishlistShare   !== (saved.enable_share      ?? true)
    );
  })();

  useEffect(() => {
    if (saveSuccess) {
      setShowBanner(true);
      const t = setTimeout(() => setShowBanner(false), 2500);
      return () => clearTimeout(t);
    }
  }, [saveSuccess]);

  // Discard — saved state pe wapas jao
  const handleDiscard = () => {
    const saved = fetcher.data?.settings ?? settings;
    setEntryPoint(saved.launching_point   ?? "both");
    setButtonPosition(saved.position      ?? "bottom_right");
    setVerticalPosition(saved.vertical_position ?? "lowest");
    setBgColor(saved.bg_color             ?? "#000000");
    setTextIconColor(saved.icon_color     ?? "#ffffff");
    setIconRadius(saved.icon_radius       ?? "circle");
    setProductBtnStyle(saved.product_btn_style ?? "style1");
    setBeforeBtnLabel(saved.before_btn_label   ?? "Add to Wishlist");
    setBeforeBgColor(saved.before_bg_color     ?? "#000000");
    setBeforeIconColor(saved.before_icon_color ?? "#ffffff");
    setAfterBtnLabel(saved.after_btn_label     ?? "Added to Wishlist");
    setAfterBgColor(saved.after_bg_color       ?? "#228B22");
    setAfterIconColor(saved.after_icon_color   ?? "#000000");
    // Collection Page
    setCollectionPosition(saved.collection_position ?? "top_right");
    setCollectionIconType(saved.collection_icon_type ?? "heart");
    // Wishlist Page
    setWishlistContentType(saved.wishlist_content_type ?? "separate_page");
    setWishlistPageTitle(saved.wishlist_page_title     ?? "My Wishlists");
    setCollectionCustomSelector(saved.collection_custom_selector  ?? "");
    // notification
    setNotifEnabled(saved.notification_show ?? true);
    setNotifDuration(saved.notification_duration ?? "1");
    setNotifPosition(saved.notification_postion ?? "top_left");
    // General
    setGuestWishlist(saved.guest_wishlist    ?? false);
    setShowVendor(saved.show_vendor          ?? false);
    setRemoveAfterCart(saved.remove_after_cart ?? false);
    setStayOnPage(saved.stay_on_page         ?? false);
    setShowAddToCart(saved.show_add_to_cart  ?? true);
    setShowSoldOut(saved.show_sold_out       ?? false);
    setAllowQuantity(saved.allow_quantity    ?? false);
    setAllowVariant(saved.allow_variant      ?? false);
    setWishlistShare(saved.enable_share      ?? true);
  };

  const handleSave = () => {
    fetcher.submit(
      {
        launching_point:   entryPoint,
        position:          buttonPosition,
        bg_color:          bgColor,
        icon_color:        textIconColor,
        icon_radius:       iconRadius,
        vertical_position: verticalPosition,
        product_btn_style: productBtnStyle,
        before_btn_label:  beforeBtnLabel,
        before_bg_color:   beforeBgColor,
        before_icon_color: beforeIconColor,
        after_btn_label:   afterBtnLabel,
        after_bg_color:    afterBgColor,
        after_icon_color:  afterIconColor,
        // Collection Page
        collection_position:  collectionPosition,
        collection_icon_type: collectionIconType,
        collection_custom_selector: collectionCustomSelector,
        // Wishlist Page
        wishlist_content_type: wishlistContentType,
        wishlist_page_title:   wishlistPageTitle,
        // notification
        notification_postion: notifPosition,
        notification_duration: notifDuration, 
        notification_show:notifEnabled,
        // General
        guest_wishlist:    guestWishlist,
        show_vendor:       showVendor,
        remove_after_cart: removeAfterCart,
        stay_on_page:      stayOnPage,
        show_add_to_cart:  showAddToCart,
        show_sold_out:     showSoldOut,
        allow_quantity:    allowQuantity,
        allow_variant:     allowVariant,
        enable_share:      wishlistShare,
      },
      { method: "POST", action: "/app/wishlist-settings", encType: "application/json" }
    );
  };

  const showFloating = entryPoint === "floating_btn" || entryPoint === "both";
  const showMenu     = entryPoint === "header"       || entryPoint === "both";
  const activeBtnLabel  = previewType === "before" ? beforeBtnLabel  : afterBtnLabel;
  const activeBgColor   = previewType === "before" ? beforeBgColor   : afterBgColor;
  const activeIconColor = previewType === "before" ? beforeIconColor : afterIconColor;

  return (
    <Page title="Settings">
      <InlineGrid columns={2} gap="400">
        <div onClick={() => setGeneralModalOpen(true)} style={{ cursor: "pointer" }}>
        <Card>
          <BlockStack gap="400">
            <div style={{ width: 44, height: 44, borderRadius: 8, background: "#F4F4F4", border: "1px solid #E0E0E0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon source={SettingsIcon} tone="base" />
            </div>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">General Settings</Text>
              <Text variant="bodyMd" tone="subdued">The settings to enhance the appearance of your storefront's user interface.</Text>
            </BlockStack>
          </BlockStack>
        </Card>
        </div>
        <div onClick={() => setWidgetModalOpen(true)} style={{ cursor: "pointer" }}>
          <Card>
            <BlockStack gap="400">
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "#F4F4F4", border: "1px solid #E0E0E0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon source={AppsIcon} tone="base" />
              </div>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Widget Settings</Text>
                <Text variant="bodyMd" tone="subdued">Control the widgets displayed in your storefront for better engagement.</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </div>
        <div onClick={() => setNotifModalOpen(true)} style={{ cursor: "pointer" }}>
        <Card>
          <BlockStack gap="400">
            <div style={{ width: 44, height: 44, borderRadius: 8, background: "#F4F4F4", border: "1px solid #E0E0E0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon source={NotificationIcon} tone="base" />
            </div>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Notification Settings</Text>
              <Text variant="bodyMd" tone="subdued">Manage your wishlist notifications for customers.</Text>
            </BlockStack>
          </BlockStack>
        </Card> 
        </div>
      </InlineGrid>

      {widgetModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
          <div onClick={() => setWidgetModalOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

          <div style={{
            position: "relative", width: "100%", margin: "32px 24px", borderRadius: 12,
            background: "radial-gradient( circle at center,#ffffff 0%, #f7f7f2 0%, #eef2d5 100%)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            background: "url('/images/model_bg.png') center center / cover no-repeat",
            backgroundColor:"#fff",
          }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #E4E4E4", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: "#def40a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <rect width="30" height="30" fill="#DEF509"/>
                    <path d="M16.225 23.8H14.375V21.95H16.225V23.8ZM14.375 21.95H12.525V20.1H14.375V21.95ZM18.075 21.95H16.225V20.1H18.075V21.95ZM12.525 20.1H10.675V18.25H12.525V20.1ZM19.925 20.1H18.075V18.25H19.925V20.1ZM10.675 18.25H8.82499V16.4H10.675V18.25ZM21.775 18.25H19.925V16.4H21.775V18.25ZM8.82499 16.4H6.97499V14.55H8.82499V16.4ZM23.625 16.4H21.775V14.55H23.625V16.4ZM6.97499 14.55H5.12499V9H6.97499V14.55ZM25.475 14.55H23.625V9H25.475V14.55ZM16.225 10.85H14.375V9H16.225V10.85ZM8.82499 9H6.97499V7.15H8.82499V9ZM14.375 9H12.525V7.15H14.375V9ZM18.075 9H16.225V7.15H18.075V9ZM23.625 9H21.775V7.15H23.625V9ZM12.525 7.15H8.82499V5.3H12.525V7.15ZM21.775 7.15H18.075V5.3H21.775V7.15Z" fill="white"/>
                    <path d="M15.475 24.55H13.625V22.7H15.475V24.55ZM13.625 22.7H11.775V20.85H13.625V22.7ZM17.325 22.7H15.475V20.85H17.325V22.7ZM11.775 20.85H9.92499V19H11.775V20.85ZM19.175 20.85H17.325V19H19.175V20.85ZM9.92499 19H8.07499V17.15H9.92499V19ZM21.025 19H19.175V17.15H21.025V19ZM8.07499 17.15H6.22499V15.3H8.07499V17.15ZM22.875 17.15H21.025V15.3H22.875V17.15ZM6.22499 15.3H4.37499V9.75H6.22499V15.3ZM24.725 15.3H22.875V9.75H24.725V15.3ZM15.475 11.6H13.625V9.75H15.475V11.6ZM8.07499 9.75H6.22499V7.9H8.07499V9.75ZM13.625 9.75H11.775V7.9H13.625V9.75ZM17.325 9.75H15.475V7.9H17.325V9.75ZM22.875 9.75H21.025V7.9H22.875V9.75ZM11.775 7.9H8.07499V6.05H11.775V7.9ZM21.025 7.9H17.325V6.05H21.025V7.9Z" fill="black"/>
                    <path d="M10.7764 7.27519L12.5449 8.52812L14.3418 10.7723L14.3828 10.823L14.4385 10.7889L14.8135 10.5643L14.8223 10.5594L14.8291 10.5525L17.8818 7.42461H20.3682L23.1035 10.16L23.6211 14.2273L22.1465 16.0701L19.751 18.1687L19.7998 18.2254L19.75 18.1678L19.7412 18.1775L18.1709 20.1219L16.2295 21.616L16.2217 21.6219L16.2158 21.6287L14.6914 23.5877L12.6523 21.6209L7.10352 16.0721L7.10156 16.0711L5.3252 14.368V10.7557L8.80566 7.27519H10.7764Z" fill="black" stroke="black" strokeWidth="0.15"/>
                  </svg>
                </div>
                <Text variant="headingMd" as="h2">Customize Wishlist</Text>
              </div>
              <button onClick={() => setWidgetModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "#666" }}>
                <Icon source={XIcon} />
              </button>
            </div>

          <div style={{ display: "flex", alignItems: "stretch", flex: 1, minHeight: 0 }}>
            {/* Tabs */}
            <div style={{ display: "flex", background:'#fff', minWidth:'230px', height:"100%", justifyContent: "flex-start", flexDirection:'column', gap: 20, padding: "30px 20px 20px 20px" }}>
              {tabList.map((tab, index) => (
                <button key={tab.id} onClick={() => setSelectedTab(index)} style={{
                  padding: "10px 25px 10px 12px", textAlign:"left", borderRadius: 5, fontSize: 15, cursor: "pointer", transition: "all 0.15s ease",
                  border: selectedTab === index ? "none" : "none",
                  background: selectedTab === index ? "#F7FFA9" : "transparent",
                  color: selectedTab === index ? "#000" : "#000",
                  fontWeight: selectedTab === index ? 600 : 400,
                }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: 24, overflowY: "auto", minHeight: 0, scrollbarWidth:'none' }}>
            {/* FIX #1: Unsaved bar — real comparison se */}
            {isDirty && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 24px", background: "#fff", color: "#000",
                fontSize: 14, boxShadow: "rgba(0,0,0,0.2) 0px 8px 16px",
                borderBottom: "1px solid #E4E4E4",
                borderRadius:'5px',
                marginBottom:15
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight:'normal' }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="#000">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Unsaved changes
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={handleDiscard} tone="critical">Discard</Button>
                  <Button onClick={handleSave} disabled={saving} variant="primary">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
              {showBanner && (
                <div style={{ display:'none', marginBottom: 15 }}>
                  <Banner tone="success">Settings saved successfully!</Banner>
                </div>
              )}
              {saveError && (
                <div style={{ marginBottom: 15 }}>
                  <Banner tone="critical">{saveError}</Banner>
                </div>
              )}

              {/* ── Tab 0: Launching Point ── */}
              {selectedTab === 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>
                  <div style={{ background: "#fff", borderRadius: 10, padding: 20, backdropFilter: "blur(8px)" }}>
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold">How should the primary entry point be presented?</Text>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <RadioButton label="Floating Button" checked={entryPoint === "floating_btn"} id="floating_btn" name="entryPoint" onChange={() => setEntryPoint("floating_btn")} />
                        <RadioButton label="Header" checked={entryPoint === "header"}   id="header" name="entryPoint" onChange={() => setEntryPoint("header")} />
                        <RadioButton label="Both" checked={entryPoint === "both"}  id="both"  name="entryPoint" onChange={() => setEntryPoint("both")} />
                        </div>
                      </BlockStack>
                      {(entryPoint === "floating_btn" || entryPoint === "both") && (
                        <Select label="Select a position for the button:" options={positionOptions} value={buttonPosition} onChange={setButtonPosition} />
                      )}
                      {(entryPoint === "floating_btn" || entryPoint === "both") && (
                        <BlockStack gap="200">
                          <Text variant="bodyMd" fontWeight="bold">Vertical Position</Text>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <RadioButton
                            label="Lowest"
                            checked={verticalPosition === "lowest"}
                            id="vp_lowest"
                            name="verticalPosition"
                            onChange={() => setVerticalPosition("lowest")}
                          />
                          <RadioButton
                            label="Higher"
                            checked={verticalPosition === "higher"}
                            id="vp_higher"
                            name="verticalPosition"
                            onChange={() => setVerticalPosition("higher")}
                          />
                          <RadioButton
                            label="Highest"
                            checked={verticalPosition === "highest"}
                            id="vp_highest"
                            name="verticalPosition"
                            onChange={() => setVerticalPosition("highest")}
                          />
                          </div>
                        </BlockStack>
                      )}
                      {/* FIX #2: ColorField with picker */}
                      <ColorField label="Background Color"  value={bgColor}       onChange={setBgColor} />
                      <ColorField label="Text/Icon Color"   value={textIconColor} onChange={setTextIconColor} />
                      {(entryPoint === "floating_btn" || entryPoint === "both") && (
                        <Select label="Icon button radius" options={radiusOptions} value={iconRadius} onChange={setIconRadius} />
                      )}
                    </BlockStack>
                  </div>

                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, position: "relative", overflow: "hidden", minHeight: 420 }}>
                  <div style={{ borderBottom:'1px solid #D9D9D9', paddingBottom:10, marginBottom:10, fontWeight:600, fontSize:14 }}>Preview</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", justifyContent: "flex-end", background: "#fff", borderRadius: 6, padding: "6px 10px" }}>
                      {[80, 80, 60, 70, 50, 60, 70, 60].map((w, i) => (
                        <div key={i} style={{ width: w, height: 10, background: "#ddd", borderRadius: 4 }} />
                      ))}
                      {showMenu && (
                        <div style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        </div>
                      )}
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: "50%" }} />
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ width: "45%", height: 160, background: "#ddd", borderRadius: 6 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {[100, 70, 90, 60, 80, 60, 70].map((w, i) => (
                          <div key={i} style={{ width: `${w}%`, height: 10, background: "#ddd", borderRadius: 4 }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ margin: "12px 0", borderTop: "1px solid #e5e5e5" }} />
                    <div style={{ marginBottom: 12, borderTop: "1px solid #e5e5e5" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 90, background: "#ddd", borderRadius: 6 }} />)}
                    </div>
                    {showFloating && (() => {
                      const verticalOffset = verticalPosition === "highest" ? 20
                                          : verticalPosition === "higher"  ? 10
                                          : 0;
                      const isBottom = buttonPosition === "bottom_left" || buttonPosition === "bottom_right";
                      const isSide   = buttonPosition === "left"        || buttonPosition === "right";

                      return (
                        <div style={{
                          position: "absolute",
                          left:   buttonPosition === "left"  || buttonPosition === "bottom_left"  ? 16 : "auto",
                          right:  buttonPosition === "right" || buttonPosition === "bottom_right" ? 16 : "auto",
                          top:    isSide   ? "50%" : "auto",
                          bottom: isBottom ? 16 + verticalOffset : "auto",
                          transform: isSide
                            ? `translateY(calc(-50% - ${verticalOffset}px))`
                            : "none",
                          width: 36, height: 36,
                          borderRadius: iconRadius === "circle" ? "50%" : iconRadius === "rounded" ? 8 : 0,
                          background: bgColor, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg viewBox="0 0 20 20" width="20" height="20" fill={textIconColor}>
                            <path fillRule="evenodd" d="M8.469 5.785c-.966-1.047-2.505-1.047-3.47 0-.998 1.081-.998 2.857 0 3.939l5.001 5.42 5.002-5.42c.997-1.082.997-2.858 0-3.939-.966-1.047-2.505-1.047-3.47 0l-.98 1.062a.75.75 0 0 1-1.103 0l-.98-1.062Zm-4.573-1.017c1.56-1.69 4.115-1.69 5.675 0l.429.464.429-.464c1.56-1.69 4.115-1.69 5.675 0 1.528 1.656 1.528 4.317 0 5.973l-5.185 5.62a1.25 1.25 0 0 1-1.838 0l-5.185-5.62c-1.528-1.656-1.528-4.317 0-5.973Z" />
                          </svg>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── Tab 1: Product Page ── */}
              {selectedTab === 1 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>
                  <div style={{ background: "#fff", borderRadius: 10, padding: 20, backdropFilter: "blur(8px)" }}>
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold">Button Type</Text>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>     
                            <RadioButton label="Icon and Text" name="productBtnStyle" checked={productBtnStyle === "style1"} onChange={() => setProductBtnStyle("style1")} />
                            <RadioButton label="Only Text" name="productBtnStyle" checked={productBtnStyle === "style2"} onChange={() => setProductBtnStyle("style2")} />         
                            <RadioButton label="Only Icon" name="productBtnStyle" checked={productBtnStyle === "style3"} onChange={() => setProductBtnStyle("style3")} />
                        </div>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold">Button Text</Text>
                        <RadioButton label="Before Wishlist" checked={previewType === "before"} id="before" name="previewType" onChange={() => setPreviewType("before")} />
                        <RadioButton label="After Wishlist"  checked={previewType === "after"}  id="after"  name="previewType" onChange={() => setPreviewType("after")} />
                      </BlockStack>

                      <BlockStack gap="300">
                        <Text variant="bodyMd" fontWeight="bold">
                          {previewType === "before" ? "Before" : "After"} Button Settings
                        </Text>
                        <TextField
                          label="Text"
                          value={previewType === "before" ? beforeBtnLabel : afterBtnLabel}
                          onChange={previewType === "before" ? setBeforeBtnLabel : setAfterBtnLabel}
                          autoComplete="off"
                        />
                        {/* FIX #2: ColorField with picker */}
                        <ColorField
                          label="Button Background Color"
                          value={previewType === "before" ? beforeBgColor : afterBgColor}
                          onChange={previewType === "before" ? setBeforeBgColor : setAfterBgColor}
                        />
                        <ColorField
                          label="Button Text/Icon Color"
                          value={previewType === "before" ? beforeIconColor : afterIconColor}
                          onChange={previewType === "before" ? setBeforeIconColor : setAfterIconColor}
                        />
                      </BlockStack>
                    </BlockStack>
                  </div>

                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, position: "relative", overflow: "hidden", minHeight: 420 }}>
                    <div style={{ borderBottom:'1px solid #D9D9D9', paddingBottom:10, marginBottom:10, fontWeight:600, fontSize:14 }}>Preview</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", justifyContent: "flex-end", background: "#fff", borderRadius: 6, padding: "6px 10px" }}>
                      {[80, 80, 60, 70, 50, 60, 70, 60].map((w, i) => (
                        <div key={i} style={{ width: w, height: 10, background: "#ddd", borderRadius: 4 }} />
                      ))}
                      <div style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: "50%" }} />
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ width: "45%", height: 160, background: "#ddd", borderRadius: 6 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {[100, 60, 80].map((w, i) => (
                          <div key={i} style={{ width: `${w}%`, height: 10, background: "#ddd", borderRadius: 4 }} />
                        ))}
                        <div style={{ marginTop: 12 }}>
                          {productBtnStyle === "style1" && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: activeBgColor, color: activeIconColor, fontSize: 13, fontWeight: 500 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeIconColor} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                              {activeBtnLabel}
                            </div>
                          )}
                          {productBtnStyle === "style2" && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 16px", borderRadius: 4, background: activeBgColor, color: activeIconColor, fontSize: 13, fontWeight: 500 }}>
                              {activeBtnLabel}
                            </div>
                          )}
                          {productBtnStyle === "style3" && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", borderRadius: 4, background: activeBgColor }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={activeIconColor} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                            </div>
                          )}
                        </div>
                        {[90, 70, 60, 80, 60].map((w, i) => (
                          <div key={i} style={{ width: `${w}%`, height: 10, background: "#ddd", borderRadius: 4, marginTop: 6 }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ margin: "12px 0", borderTop: "1px solid #e5e5e5" }} />
                    <div style={{ marginBottom: 12, borderTop: "1px solid #e5e5e5" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 90, background: "#ddd", borderRadius: 6 }} />)}
                    </div>
                  </div>
                </div>
              )}

              {selectedTab === 2 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>
                  {/* Left: Form */}
                  <div style={{ background: "#fff", borderRadius: 10, padding: 20, backdropFilter: "blur(8px)" }}>
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold">Appearance</Text>
                        <Text variant="bodyMd" fontWeight="bold">Button Type</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <RadioButton
                          label={plan.drawer ? "Side Drawer" : "Side Drawer 🔒 (Starter plan+)"}
                          checked={wishlistContentType === "side_drawer"}
                          disabled={!plan.drawer}
                          id="wl_drawer" name="wishlistType"
                          onChange={() => setWishlistContentType("side_drawer")}
                        />
                        <RadioButton label="Separate Page"   checked={wishlistContentType === "separate_page"}   id="wl_page"   name="wishlistType" onChange={() => setWishlistContentType("separate_page")} />
                        <RadioButton label="Pop-up"  checked={wishlistContentType === "pop-up"}  id="wl_popup"  name="wishlistType" onChange={() => setWishlistContentType("pop-up")} />
                        </div>
                        {!plan.drawer && (
                          <Text variant="bodySm" tone="subdued">
                            Side Drawer display is available on the Starter and Pro plans. &nbsp;
                            <s-link tone="critical" href="/app/pricing">Upgrade →</s-link>
                          </Text>
                        )}
                      </BlockStack>

                    <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="bold">Page Title</Text>
                      <TextField
                        value={wishlistPageTitle}
                        onChange={setWishlistPageTitle}
                        autoComplete="off"
                      />
                    </BlockStack>
                    </BlockStack>
                  </div>

                  {/* Right: Live Preview */}
                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, overflow: "hidden", minHeight: 420, position: "relative" }}>
                   <div style={{ borderBottom:'1px solid #D9D9D9', paddingBottom:10, marginBottom:10, fontWeight:600, fontSize:14 }}>Preview</div>
                    {/* Navbar */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", justifyContent: "flex-end", background: "#fff", borderRadius: 6, padding: "6px 10px" }}>
                      {[80, 80, 60, 70, 50, 60, 70, 60].map((w, i) => (
                        <div key={i} style={{ width: w, height: 10, background: "#ddd", borderRadius: 4 }} />
                      ))}
                      <div style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: "50%" }} />
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: 3 }} />
                    </div>

                    {/* PAGE preview  */}
                    {wishlistContentType === "separate_page" && (
                      <div style={{ background: "#fff", borderRadius: 8, padding: 16, minHeight: 340 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 8 }}>{wishlistPageTitle}</div>
                        <div style={{ height: 1, background: "#e5e5e5", marginBottom: 14 }} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                          {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden", background: "#fff", position: "relative" }}>
                              {/* X button */}
                              <div style={{ position: "absolute", top: 6, right: 8, fontSize: 12, color: "#555", cursor: "pointer" }}>✕</div>
                              <div style={{ height: 150, background: "#f0f0f0" }} />
                              <div style={{ padding: "8px 8px 10px" }}>
                                <div style={{ width: "80%", height: 8, background: "#ddd", borderRadius: 3, marginBottom: 5 }} />
                                <div style={{ width: "50%", height: 8, background: "#ddd", borderRadius: 3, marginBottom: 8 }} />
                                <div style={{ background: "#111", color: "#fff", fontSize: 10, textAlign: "center", padding: "5px 0", borderRadius: 4 }}>Add to Cart</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* POPUP preview — image 2 jaisi */}
                    {wishlistContentType === "pop-up" && (
                      <div style={{ position: "relative", minHeight: 340, background: "rgba(0,0,0,0.25)", borderRadius: 8, overflow: "hidden" }}>
                        {/* Blurred background suggestion */}
                        <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(2px)" }} />
                        {/* Centered modal */}
                        <div style={{
                          position: "absolute", top: "50%", left: "50%",
                          transform: "translate(-50%, -50%)",
                          background: "#fff", borderRadius: 12, width: "90%",
                          maxHeight: "85%", overflow: "hidden",
                          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
                        }}>
                          {/* Modal header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 8px" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{wishlistPageTitle}</div>
                            <div style={{ fontSize: 14, color: "#555" }}>✕</div>
                          </div>
                          <div style={{ height: 1, background: "#eee", marginBottom: 10 }} />
                          {/* 3 col product grid */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 12px 12px" }}>
                            {[1, 2, 3].map(i => (
                              <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                                <div style={{ position: "absolute", top: 4, right: 6, fontSize: 10, color: "#555" }}>✕</div>
                                <div style={{ height: 120, background: "#f0f0f0" }} />
                                <div style={{ padding: "6px 6px 8px" }}>
                                  <div style={{ width: "85%", height: 6, background: "#ddd", borderRadius: 3, marginBottom: 4 }} />
                                  <div style={{ width: "55%", height: 6, background: "#ddd", borderRadius: 3, marginBottom: 6 }} />
                                  <div style={{ background: "#111", color: "#fff", fontSize: 9, textAlign: "center", padding: "4px 0", borderRadius: 3 }}>Add to Cart</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* DRAWER preview */}
                    {wishlistContentType === "side_drawer" && (
                      <div style={{ position: "relative", minHeight: 340, background: "rgba(0,0,0,0.1)", borderRadius: 8, overflow: "hidden" }}>
                        {/* Right side drawer */}
                        <div style={{
                          position: "absolute", top: 10, right: 0, bottom: 10,
                          width: "62%", background: "#fff",
                          display: "flex", flexDirection: "column",
                          borderRadius: 8
                        }}>
                          {/* Drawer header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 8px" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{wishlistPageTitle}</div>
                            <div style={{ fontSize: 14, color: "#555" }}>✕</div>
                          </div>
                          <div style={{ height: 1, background: "#eee" }} />
                          {/* 2 col product grid */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 10px", overflowY: "auto", flex: 1 }}>
                            {[1, 2, 3, 4].map(i => (
                              <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                                <div style={{ position: "absolute", top: 4, right: 6, fontSize: 10, color: "#555" }}>✕</div>
                                <div style={{ height: 65, background: "#f0f0f0" }} />
                                <div style={{ padding: "6px 6px 8px" }}>
                                  <div style={{ width: "85%", height: 6, background: "#ddd", borderRadius: 3, marginBottom: 4 }} />
                                  <div style={{ width: "55%", height: 6, background: "#ddd", borderRadius: 3, marginBottom: 6 }} />
                                  <div style={{ background: "#111", color: "#fff", fontSize: 9, textAlign: "center", padding: "4px 0", borderRadius: 3 }}>Add to Cart</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedTab === 3 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>
                  {/* Left: Form */}
                  <div style={{ background: "#fff", borderRadius: 10, padding: 20, backdropFilter: "blur(8px)" }}>
                    <BlockStack gap="400">

                      <TextField
                        label="Wishlist Icon Selector (optional, advanced)"
                        helpText="The icon is placed on product cards automatically — you don't need to fill this in. Only set a CSS selector here if the icon appears in the wrong spot on your theme and you want to target the card manually."
                        placeholder="Leave blank for automatic detection (recommended)"
                        value={collectionCustomSelector}
                        onChange={setCollectionCustomSelector}
                        autoComplete="off"
                      />

                      <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="bold">Button Position on tile</Text>
                      <InlineGrid columns={2} gap="200">
                        {[
                          { label: "Top Right",    value: "top_right" },
                          { label: "Top Left",     value: "top_left" },
                          { label: "Bottom Right", value: "bottom_right" },
                          { label: "Bottom Left",  value: "bottom_left" },
                        ].map(({ label, value }) => (
                          <RadioButton
                            key={value}
                            label={label}
                            checked={collectionPosition === value}
                            id={`position_${value}`}
                            name="collectionPosition"
                            onChange={() => setCollectionPosition(value)}
                          />
                        ))}
                      </InlineGrid>
                    </BlockStack>

                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold">Icon Type</Text>
                        <div style={{ display: "flex", gap: 15 }}>
                          {[
                            { value: "heart",    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
                            { value: "star",     icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
                            { value: "bookmark", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
                          ].map(({ value, icon }) => (
                            <label key={value} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                              <div style={{
                                borderRadius: 6,
                                minWidth:90,
                                padding:'8px 10px',
                                display: "flex", alignItems: "center", justifyContent: "center", gap:10,
                                background: collectionIconType === value ? "#F7FFA9" : "#F7F7F7",
                                color: collectionIconType === value ? "000000" : "#000000",
                                textTransform:"capitalize"
                              }}>
                                {icon} {value}
                              </div>
                              <input type="radio" name="collectionIconType" value={value}
                                checked={collectionIconType === value}
                                onChange={() => setCollectionIconType(value)}
                                style={{ display: "none" }}
                              />
                              {/* <Text variant="bodySm">{value.charAt(0).toUpperCase() + value.slice(1)}</Text> */}
                            </label>
                          ))}
                        </div>
                      </BlockStack>

                    </BlockStack>
                  </div>

                  {/* Right: Live Preview */}
                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, overflow: "hidden", minHeight: 420 }}>
                    <div style={{ borderBottom:'1px solid #D9D9D9', paddingBottom:10, marginBottom:10, fontWeight:600, fontSize:14 }}>Preview</div>
                    {/* Navbar */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "flex-end", background: "#fff", borderRadius: 6, padding: "6px 10px" }}>
                      {[80, 80, 60, 70, 50, 60, 70, 60].map((w, i) => (
                        <div key={i} style={{ width: w, height: 10, background: "#ddd", borderRadius: 4 }} />
                      ))}
                      <div style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: "50%" }} />
                      <div style={{ width: 18, height: 18, background: "#ddd", borderRadius: 3 }} />
                    </div>

                    {/* Product grid 2x2 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} style={{ position: "relative" }}>
                          <div style={{ height: 150, background: "#ddd", borderRadius: 6, position: "relative" }} >
                          {/* Wishlist icon — position ke hisaab se */}
                          <div style={{
                            position: "absolute",
                            top:    collectionPosition.includes("top")    ? 8 : "auto",
                            bottom: collectionPosition.includes("bottom") ? 8 : "auto",
                            left:   collectionPosition.includes("left")   ? 8 : "auto",
                            right:  collectionPosition.includes("right")  ? 8 : "auto",
                            width: 26, height: 26, borderRadius: "50%",
                            background: "#000",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {collectionIconType === "heart" && (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="1">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                              </svg>
                            )}
                            {collectionIconType === "star" && (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="1">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            )}
                            {collectionIconType === "bookmark" && (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="1">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                              </svg>
                            )}
                          </div>
                           </div>
                          {/* Product info lines */}
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                            <div style={{ width: "80%", height: 8, background: "#ddd", borderRadius: 3 }} />
                            <div style={{ width: "50%", height: 8, background: "#ddd", borderRadius: 3, marginBottom:3 }} />
                            <div style={{ background: "#111", color: "#fff", fontSize: 9, textAlign: "center", padding: "4px 0", borderRadius: 3 }}>Add to Cart</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ── Notification Settings Modal ── */}
      {notifModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
          {/* Backdrop */}
          <div onClick={() => setNotifModalOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

          {/* Modal */}
          <div style={{
            position: "relative", width: "90%", margin: "32px 24px", borderRadius: 12,
            background: "linear-gradient(135deg, #e8f0fe 0%, #dce8fb 40%, #e4eef9 70%, #eaf1fd 100%)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            background: "url('/images/model_bg.png') center center / cover no-repeat",
             backgroundColor:"#fff",
          }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #E4E4E4", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: "#def40a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <rect width="30" height="30" fill="#DEF509"/>
                    <path d="M16.225 23.8H14.375V21.95H16.225V23.8ZM14.375 21.95H12.525V20.1H14.375V21.95ZM18.075 21.95H16.225V20.1H18.075V21.95ZM12.525 20.1H10.675V18.25H12.525V20.1ZM19.925 20.1H18.075V18.25H19.925V20.1ZM10.675 18.25H8.82499V16.4H10.675V18.25ZM21.775 18.25H19.925V16.4H21.775V18.25ZM8.82499 16.4H6.97499V14.55H8.82499V16.4ZM23.625 16.4H21.775V14.55H23.625V16.4ZM6.97499 14.55H5.12499V9H6.97499V14.55ZM25.475 14.55H23.625V9H25.475V14.55ZM16.225 10.85H14.375V9H16.225V10.85ZM8.82499 9H6.97499V7.15H8.82499V9ZM14.375 9H12.525V7.15H14.375V9ZM18.075 9H16.225V7.15H18.075V9ZM23.625 9H21.775V7.15H23.625V9ZM12.525 7.15H8.82499V5.3H12.525V7.15ZM21.775 7.15H18.075V5.3H21.775V7.15Z" fill="white"/>
                    <path d="M15.475 24.55H13.625V22.7H15.475V24.55ZM13.625 22.7H11.775V20.85H13.625V22.7ZM17.325 22.7H15.475V20.85H17.325V22.7ZM11.775 20.85H9.92499V19H11.775V20.85ZM19.175 20.85H17.325V19H19.175V20.85ZM9.92499 19H8.07499V17.15H9.92499V19ZM21.025 19H19.175V17.15H21.025V19ZM8.07499 17.15H6.22499V15.3H8.07499V17.15ZM22.875 17.15H21.025V15.3H22.875V17.15ZM6.22499 15.3H4.37499V9.75H6.22499V15.3ZM24.725 15.3H22.875V9.75H24.725V15.3ZM15.475 11.6H13.625V9.75H15.475V11.6ZM8.07499 9.75H6.22499V7.9H8.07499V9.75ZM13.625 9.75H11.775V7.9H13.625V9.75ZM17.325 9.75H15.475V7.9H17.325V9.75ZM22.875 9.75H21.025V7.9H22.875V9.75ZM11.775 7.9H8.07499V6.05H11.775V7.9ZM21.025 7.9H17.325V6.05H21.025V7.9Z" fill="black"/>
                    <path d="M10.7764 7.27519L12.5449 8.52812L14.3418 10.7723L14.3828 10.823L14.4385 10.7889L14.8135 10.5643L14.8223 10.5594L14.8291 10.5525L17.8818 7.42461H20.3682L23.1035 10.16L23.6211 14.2273L22.1465 16.0701L19.751 18.1687L19.7998 18.2254L19.75 18.1678L19.7412 18.1775L18.1709 20.1219L16.2295 21.616L16.2217 21.6219L16.2158 21.6287L14.6914 23.5877L12.6523 21.6209L7.10352 16.0721L7.10156 16.0711L5.3252 14.368V10.7557L8.80566 7.27519H10.7764Z" fill="black" stroke="black" strokeWidth="0.15"/>
                  </svg>
                </div>
                <Text variant="headingMd" as="h2">Customize Notification</Text>
              </div>
              <button onClick={() => setNotifModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "#666" }}>
                <Icon source={XIcon} />
              </button>
            </div>

            {/* FIX #1: Unsaved bar — real comparison se */}
            {isDirtyNotification && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 24px", background: "#fff", color: "#000",
                fontSize: 14, boxShadow: "rgba(0,0,0,0.2) 0px 8px 16px",
                borderBottom: "1px solid #E4E4E4",
                marginBottom:15
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="#000">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Unsaved changes
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={handleDiscard} tone="critical">Discard</Button>
                  <Button onClick={handleSave} disabled={saving} variant="primary">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
            {showBanner && (
              <div style={{ display:'none', marginBottom: 15 }}>
                <Banner tone="success">Settings saved successfully!</Banner>
              </div>
            )}
            {saveError && (
              <div style={{ marginBottom: 15 }}>
                <Banner tone="critical">{saveError}</Banner>
              </div>
            )}

            {/* Single Tab */}
            <div style={{ display: "none", justifyContent: "center", gap: 10, padding: "20px 24px 10px" }}>
              <button style={{
                padding: "10px 22px", borderRadius: 8, fontSize: 14,
                border: "none", background: "#f7ffa9", color: "#000", fontWeight: 600, cursor: "default",
              }}>
                Notification Setting
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: 24, overflowY: "auto", scrollbarWidth:'none' }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>

                {/* Left: Form */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 20 }}>
                  <BlockStack gap="400">

                    {/* Wishlist Notification Popup toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Text variant="bodyMd" fontWeight="bold">
                        Wishlist Notification Popup{!plan.toastNotifications && " 🔒"}
                      </Text>
                      <div
                        onClick={() => plan.toastNotifications && setNotifEnabled(v => !v)}
                        style={{
                          width: 44, height: 24, borderRadius: 12,
                          cursor: plan.toastNotifications ? "pointer" : "not-allowed",
                          background: notifEnabled && plan.toastNotifications ? "#DEF509" : "#d1d5db",
                          position: "relative", transition: "background 0.2s", flexShrink: 0,
                          opacity: plan.toastNotifications ? 1 : 0.6,
                        }}
                      >
                        <div style={{
                          position: "absolute", top: 2,
                          left: notifEnabled && plan.toastNotifications ? 22 : 2,
                          width: 20, height: 20, borderRadius: "50%",
                          background: "#fff", transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </div>
                    </div>
                    {!plan.toastNotifications && (
                      <Text variant="bodySm" tone="subdued">
                        Toast notifications are available on the Starter and Pro plans. &nbsp;
                        <s-link tone="critical" href="/app/pricing">Upgrade →</s-link>
                      </Text>
                    )}

                    {/* Location dropdown */}
                    <Select
                      label="Select a location for the notification popup on your site."
                      options={[
                        { label: "Top Left",     value: "top_left" },
                        { label: "Top Center",     value: "top_center" },
                        { label: "Top Right",     value: "top_right" },
                        { label: "Middle Left",     value: "middle_left" },
                        { label: "Middle Center",     value: "middle_center" },
                        { label: "Middle Right",     value: "middle_right" },
                        { label: "Bottom Left",  value: "bottom_left" },
                        { label: "Bottom Center", value: "bottom_center" },
                        { label: "Bottom Right", value: "bottom_right" },
                      ]}
                      value={notifPosition}
                      onChange={setNotifPosition}
                      disabled={!notifEnabled}
                    />

                    {/* Duration */}
                    <BlockStack gap="100">
                      <TextField
                        label="Duration for displaying the notification popup"
                        type="number"
                        value={notifDuration}
                        onChange={(val) => {
                          const n = Math.min(60, Math.max(1, Number(val)));
                          setNotifDuration(String(n));
                        }}
                        min={1}
                        max={60}
                        autoComplete="off"
                        disabled={!notifEnabled}
                      />
                      <Text variant="bodySm" tone="subdued">
                        Minimum duration is 1 second and maximum is 60 seconds.
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Note: The notification popup will automatically disappear once the specified duration time is over.
                      </Text>
                    </BlockStack>

                    {/* Branding toggle */}
                    <div style={{ display: "none", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Text variant="bodyMd" fontWeight="bold">ENABLE/DISABLE BRANDING</Text>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e0701a" strokeWidth="2.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                      <div style={{
                        width: 44, height: 24, borderRadius: 12,
                        background: brandingEnabled ? "#f7ffa9" : "#d1d5db",
                        position: "relative", opacity: 0.6, cursor: "not-allowed", flexShrink: 0,
                      }}>
                        <div style={{
                          position: "absolute", top: 2,
                          left: brandingEnabled ? 22 : 2,
                          width: 20, height: 20, borderRadius: "50%",
                          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </div>
                    </div>

                    {/* Custom Branding field (disabled) */}
                    <div style={{ display: "none" }}>
                      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Custom Branding</div>
                      <div style={{
                        padding: "8px 12px", borderRadius: 8,
                        border: "1px solid #e5e7eb", background: "#f9fafb",
                        color: "#9ca3af", fontSize: 14,
                      }}>
                        {customBranding}
                      </div>
                    </div>

                  </BlockStack>
                </div>

                {/* Right: Live Preview */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 16, position: "relative", overflow: "hidden", minHeight: 420 }}>

                  {/* Fake navbar */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", justifyContent: "flex-end", background: "#fff", borderRadius: 6, padding: "6px 10px" }}>
                    {[80, 60, 70, 50, 60, 70, 60].map((w, i) => (
                      <div key={i} style={{ width: w, height: 10, background: "#ddd", borderRadius: 4 }} />
                    ))}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
                      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                    </svg>
                  </div>

                  {/* Notification popup — position changes with dropdown */}
                  {notifEnabled && (
                    <div style={{
                      position: "absolute",
                      top:    notifPosition.includes("top") ? 56 : notifPosition.includes("middle") ? "50%" : "auto",
                      bottom: notifPosition.includes("bottom") ? 16 : "auto",
                      left:   notifPosition.includes("left")? 16 : notifPosition.includes("center") ? "50%" : "auto",
                      right:  notifPosition.includes("right")  ? 16 : "auto",
                      transform:  notifPosition.includes("middle") &&
                      notifPosition.includes("center")
                        ? "translate(-50%, -50%)"
                        : notifPosition.includes("middle")
                        ? "translateY(-50%)"
                        : notifPosition.includes("center")
                        ? "translateX(-50%)"
                        : "none",
                      background: "#fff", borderRadius: 10,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                      padding: "12px 14px",
                      display: "flex", alignItems: "flex-start", gap: 10,
                      width: 220, zIndex: 10,
                      border: "1px solid #e5e7eb",
                    }}> 
                      <div style={{ width: 50, height: 50, borderRadius: 6, background: "#e5e7eb", flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: "#111", lineHeight: 'normal' }}>
                        <span style={{ fontWeight: 700 }}>Slim fit shirt</span>
                        {" has been added to wishlist successfully"}
                      </div>
                    </div>
                  )}

                  {/* Page skeleton */}
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ width: "40%", height: 160, background: "#ddd", borderRadius: 6 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      {[100, 70, 90, 60, 80, 60, 70, 50, 80, 65].map((w, i) => (
                        <div key={i} style={{ width: `${w}%`, height: 10, background: "#ddd", borderRadius: 4 }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ margin: "14px 0", borderTop: "1px solid #e5e5e5" }} />
                  <div style={{ marginBottom: 14, borderTop: "1px solid #e5e5e5" }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    {[1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 90, background: "#ddd", borderRadius: 6 }} />)}
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── General Settings Modal ── */}
      {generalModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
          <div onClick={() => setGeneralModalOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

          <div style={{
            position: "relative", width: "90%", margin: "32px 24px", borderRadius: 12,
            background: "linear-gradient(135deg, #e8f0fe 0%, #dce8fb 40%, #e4eef9 70%, #eaf1fd 100%)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",  
            background: "url('/images/model_bg.png') center center / cover no-repeat",
            backgroundColor:"#fff",
          }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #E4E4E4", background: "#fff" }}>
              <InlineStack gap="300" align="center" blockAlign="center">
                <div style={{ width: 28, height: 28, borderRadius: 6, background: "#def40a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <rect width="30" height="30" fill="#DEF509"/>
                    <path d="M16.225 23.8H14.375V21.95H16.225V23.8ZM14.375 21.95H12.525V20.1H14.375V21.95ZM18.075 21.95H16.225V20.1H18.075V21.95ZM12.525 20.1H10.675V18.25H12.525V20.1ZM19.925 20.1H18.075V18.25H19.925V20.1ZM10.675 18.25H8.82499V16.4H10.675V18.25ZM21.775 18.25H19.925V16.4H21.775V18.25ZM8.82499 16.4H6.97499V14.55H8.82499V16.4ZM23.625 16.4H21.775V14.55H23.625V16.4ZM6.97499 14.55H5.12499V9H6.97499V14.55ZM25.475 14.55H23.625V9H25.475V14.55ZM16.225 10.85H14.375V9H16.225V10.85ZM8.82499 9H6.97499V7.15H8.82499V9ZM14.375 9H12.525V7.15H14.375V9ZM18.075 9H16.225V7.15H18.075V9ZM23.625 9H21.775V7.15H23.625V9ZM12.525 7.15H8.82499V5.3H12.525V7.15ZM21.775 7.15H18.075V5.3H21.775V7.15Z" fill="white"/>
                    <path d="M15.475 24.55H13.625V22.7H15.475V24.55ZM13.625 22.7H11.775V20.85H13.625V22.7ZM17.325 22.7H15.475V20.85H17.325V22.7ZM11.775 20.85H9.92499V19H11.775V20.85ZM19.175 20.85H17.325V19H19.175V20.85ZM9.92499 19H8.07499V17.15H9.92499V19ZM21.025 19H19.175V17.15H21.025V19ZM8.07499 17.15H6.22499V15.3H8.07499V17.15ZM22.875 17.15H21.025V15.3H22.875V17.15ZM6.22499 15.3H4.37499V9.75H6.22499V15.3ZM24.725 15.3H22.875V9.75H24.725V15.3ZM15.475 11.6H13.625V9.75H15.475V11.6ZM8.07499 9.75H6.22499V7.9H8.07499V9.75ZM13.625 9.75H11.775V7.9H13.625V9.75ZM17.325 9.75H15.475V7.9H17.325V9.75ZM22.875 9.75H21.025V7.9H22.875V9.75ZM11.775 7.9H8.07499V6.05H11.775V7.9ZM21.025 7.9H17.325V6.05H21.025V7.9Z" fill="black"/>
                    <path d="M10.7764 7.27519L12.5449 8.52812L14.3418 10.7723L14.3828 10.823L14.4385 10.7889L14.8135 10.5643L14.8223 10.5594L14.8291 10.5525L17.8818 7.42461H20.3682L23.1035 10.16L23.6211 14.2273L22.1465 16.0701L19.751 18.1687L19.7998 18.2254L19.75 18.1678L19.7412 18.1775L18.1709 20.1219L16.2295 21.616L16.2217 21.6219L16.2158 21.6287L14.6914 23.5877L12.6523 21.6209L7.10352 16.0721L7.10156 16.0711L5.3252 14.368V10.7557L8.80566 7.27519H10.7764Z" fill="black" stroke="black" strokeWidth="0.15"/>
                  </svg>
                </div>
                <Text variant="headingMd" as="h2">Wishlist Configuration</Text>
              </InlineStack>
              <Button icon={XIcon} variant="plain" onClick={() => setGeneralModalOpen(false)} accessibilityLabel="Close" />
            </div>

            <div style={{ display: "flex", alignItems: "stretch", flex: 1, minHeight: 0 }}>
            {/* Tabs */}
            <div style={{ display: "flex", background:'#fff', minWidth:'230px', height:"100%", justifyContent: "flex-start", flexDirection:'column', gap: 20, padding: "30px 20px 20px 20px" }}>
              {["General", "Wishlist page", "Wishlist share"].map((label, idx) => (
                <button key={idx} onClick={() => setGeneralTab(idx)} style={{
                  padding: "10px 25px 10px 12px", textAlign:"left", borderRadius: 5, fontSize: 15, cursor: "pointer", transition: "all 0.15s ease",
                  background: generalTab === idx ? "#F7FFA9" : "transparent",
                  border: selectedTab === idx ? "none" : "none",
                  color: generalTab === idx ? "#000" : "#000",
                  fontWeight: generalTab === idx ? 600 : 400,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: 24, overflowY: "auto", scrollbarWidth:'none' }}>

            {/* Unsaved bar */}
            {isDirtyGeneral && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 24px", background: "#fff", color: "#000",
                fontSize: 14, boxShadow: "rgba(0,0,0,0.2) 0px 8px 16px",
                borderBottom: "1px solid #E4E4E4",
                marginBottom:15
              }}>
                <InlineStack gap="200" align="center">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="#000">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <Text>Unsaved changes</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Button onClick={handleDiscard} tone="critical">Discard</Button>
                  <Button onClick={handleSave} disabled={saving} variant="primary">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </InlineStack>
              </div>
            )}
              {showBanner && (
                <div style={{ display:'none', marginBottom: 15 }}>
                  <Banner tone="success">Settings saved successfully!</Banner>
                </div>
              )}
              {saveError && (
                <div style={{ marginBottom: 15 }}>
                  <Banner tone="critical">{saveError}</Banner>
                </div>
              )}

              {/* ── General Tab ── */}
              {generalTab === 0 && (
                <InlineGrid columns={2} gap="400">

                  {/* Guest Wishlist Card */}
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" align="center">
                          <Text variant="bodyMd" fontWeight="bold">
                            Guest Wishlist{!plan.guestWishlist && " 🔒"}
                          </Text>
                        </InlineStack>
                        <div
                          onClick={() => plan.guestWishlist && setGuestWishlist(v => !v)}
                          style={{
                            width: 44, height: 24, borderRadius: 12,
                            cursor: plan.guestWishlist ? "pointer" : "not-allowed",
                            background: guestWishlist && plan.guestWishlist ? "#DEF509" : "#d1d5db",
                            position: "relative", transition: "background 0.2s", flexShrink: 0,
                            opacity: plan.guestWishlist ? 1 : 0.6,
                          }}
                        >
                          <div style={{
                            position: "absolute", top: 2, left: guestWishlist && plan.guestWishlist ? 22 : 2,
                            width: 20, height: 20, borderRadius: "50%",
                            background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </div>
                      </InlineStack>
                      <Text variant="bodyMd" tone="subdued">Allow visitors to add product into wishlist without login.</Text>
                      {!plan.guestWishlist && (
                        <Text variant="bodySm" tone="subdued">
                          Available on the Starter and Pro plans. &nbsp;
                          <s-link tone="critical" href="/app/pricing">Upgrade →</s-link>
                        </Text>
                      )}
                      {/* Preview image mock */}
                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#f9fafb" }}>
                        <div style={{ padding: 10 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                            {[1,2,3,4,5,6,7,8,9].map(i => (
                              <div key={i} style={{ background: "#e5e7eb", borderRadius: 6, padding: 6 }}>
                                <div style={{ height: 100, background: "#d1d5db", borderRadius: 4, marginBottom: 4 }} />
                                <div style={{ height: 6, background: "#d1d5db", borderRadius: 3, marginBottom: 3 }} />
                                <div style={{ height: 6, background: "#d1d5db", borderRadius: 3, width: "70%" }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </BlockStack>
                  </Card>

                  {/* Show Vendor Card */}
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="bold">Show Vendor</Text>
                        <div
                          onClick={() => setShowVendor(v => !v)}
                          style={{
                            width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                            background: showVendor ? "#DEF509" : "#d1d5db",
                            position: "relative", transition: "background 0.2s", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            position: "absolute", top: 2, left: showVendor ? 22 : 2,
                            width: 20, height: 20, borderRadius: "50%",
                            background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </div>
                      </InlineStack>
                      <Text variant="bodyMd" tone="subdued">Display the vendor's name on products in the wishlist page.</Text>
                      {/* Preview mock — wishlist popup style */}
                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#f9fafb", padding: 10 }}>
                        {/* <div style={{ height: 8, background: "#d1d5db", borderRadius: 3, width: "40%", marginBottom: 8 }} /> */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                          {[1,2,3,4,5,6,7,8,9].map(i => (
                            <div key={i} style={{ background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                              <div style={{ height: 80, background: "#e5e7eb" }} />
                              <div style={{ padding: 6 }}>
                                {showVendor && <div style={{ height: 5, background: "#F7FFA9", borderRadius: 2, width: "60%", marginBottom: 4 }} />}
                                <div style={{ height: 6, background: "#d1d5db", borderRadius: 3, marginBottom: 3 }} />
                                <div style={{ height: 6, background: "#d1d5db", borderRadius: 3, width: "50%", marginBottom: 6 }} />
                                <div style={{ height: 18, background: "#111", borderRadius: 3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </BlockStack>
                  </Card>

                </InlineGrid>
              )}

              {/* ── Wishlist page Tab ── */}
              {generalTab === 1 && (
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Wishlist Page & Popup setting</Text>
                    <BlockStack gap="300">
                      <Checkbox
                        label="Remove product from the wishlist after adding product to the cart"
                        checked={removeAfterCart}
                        onChange={setRemoveAfterCart}
                      />
                      <Checkbox
                        label="Stay on the wishlist page after adding product to the cart"
                        checked={stayOnPage}
                        onChange={setStayOnPage}
                      />
                      <Checkbox
                        label="Show add to cart button on wishlisted products"
                        checked={showAddToCart}
                        onChange={setShowAddToCart}
                      />
                      <Checkbox
                        label="Show a 'Sold Out' badge on wishlisted products"
                        checked={showSoldOut}
                        onChange={setShowSoldOut}
                      />
                      <div style={{ display:"none" }}>
                      <Checkbox
                        label="Allow customers to directly adjust the quantity of products within their wishlist"
                        checked={allowQuantity}
                        onChange={setAllowQuantity}
                      />
                      <Checkbox
                        label="Allow customers to choose the variant directly on the products listed within the wishlist"
                        checked={allowVariant}
                        onChange={setAllowVariant}
                      />
                      </div>
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* ── Wishlist Share Tab ── */}
              {generalTab === 2 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>

                  {/* Left: controls */}
                  <div style={{ background: "#fff", borderRadius: 10, padding: 20 }}>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="bold">Wishlist Share</Text>
                          <Text variant="bodySm" tone="subdued">
                            Allow customers to share their wishlist via social media or a direct link.
                          </Text>
                        </BlockStack>
                        <div
                          onClick={() => setWishlistShare(v => !v)}
                          style={{
                            width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                            background: wishlistShare ? "#DEF509" : "#d1d5db",
                            position: "relative", transition: "background 0.2s", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            position: "absolute", top: 2,
                            left: wishlistShare ? 22 : 2,
                            width: 20, height: 20, borderRadius: "50%",
                            background: "#fff", transition: "left 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </div>
                      </InlineStack>

                      {wishlistShare && (
                        <BlockStack gap="200">
                          <Text variant="bodySm" tone="subdued">
                            A Share button will appear in the wishlist popup header. Customers can share
                            via WhatsApp, Facebook, X, Email, Pinterest, or copy a direct link.
                          </Text>
                        </BlockStack>
                      )}
                    </BlockStack>
                  </div>

                  {/* Right: live preview */}
                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, overflow: "hidden", minHeight: 460 }}>
                    <div style={{ borderBottom: "1px solid #D9D9D9", paddingBottom: 10, marginBottom: 14, fontWeight: 600, fontSize: 14 }}>Preview</div>

                    {/* Fake wishlist popup header showing the Share button */}
                    <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f0f0f0", background: "#fff" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>My Wishlist</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {wishlistShare && (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "5px 10px", border: "1px solid #ddd",
                              borderRadius: 6, background: "#fff", fontSize: 11,
                              color: "#333", cursor: "pointer",
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                              </svg>
                              Share
                            </div>
                          )}
                          <div style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      {/* Fake wishlist items inside the popup */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: 10 }}>
                        {[1, 2, 3].map(i => (
                          <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
                            <div style={{ height: 60, background: "#f0f0f0" }} />
                            <div style={{ padding: "6px 6px 8px" }}>
                              <div style={{ width: "85%", height: 5, background: "#ddd", borderRadius: 3, marginBottom: 4 }} />
                              <div style={{ width: "55%", height: 5, background: "#ddd", borderRadius: 3, marginBottom: 5 }} />
                              <div style={{ background: "#111", color: "#fff", fontSize: 8, textAlign: "center", padding: "3px 0", borderRadius: 3 }}>Add to Cart</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Share popup preview — only shown when enabled */}
                    {wishlistShare ? (
                      <div>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                          Share popup (opens when customer clicks Share)
                        </div>
                        <div style={{
                          border: "1px solid #e5e5e5", borderRadius: 12,
                          overflow: "hidden", background: "#fff",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                        }}>
                          {/* Share popup header */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Share your wishlist</span>
                            <div style={{ color: "#aaa" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                              </svg>
                            </div>
                          </div>

                          <div style={{ padding: "14px 16px" }}>
                            {/* Share via label */}
                            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Share via</div>

                            {/* Social icons */}
                            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                              {[
                                { bg: "#25D366", label: "WhatsApp", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> },
                                { bg: "#1877F2", label: "Facebook", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
                                { bg: "#000",    label: "X",        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                                { bg: "#6366f1", label: "Email",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                                { bg: "#E60023", label: "Pinterest", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg> },
                              ].map(({ bg, label, icon }) => (
                                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {icon}
                                  </div>
                                  <span style={{ fontSize: 9, color: "#888" }}>{label}</span>
                                </div>
                              ))}
                            </div>

                            {/* Copy link label */}
                            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Or copy link</div>

                            {/* Copy row */}
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <div style={{
                                flex: 1, background: "#f7f7f7", border: "1px solid #e8e8e8",
                                borderRadius: 7, padding: "7px 10px", fontSize: 10, color: "#999",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                https://store.myshopify.com/apps/wishlist?share=a3f9c2...
                              </div>
                              <div style={{
                                flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                                padding: "7px 12px", background: "#111", color: "#fff",
                                borderRadius: 7, fontSize: 11, fontWeight: 500,
                              }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                </svg>
                                Copy
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Disabled state */
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        padding: "30px 20px", border: "1px dashed #e0e0e0", borderRadius: 10,
                        background: "#fafafa",
                      }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                          </svg>
                        </div>
                        <div style={{ fontSize: 13, color: "#999", textAlign: "center" }}>
                          Enable wishlist sharing to see the preview
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
