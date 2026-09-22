// app/models/wishlist-proxy-page.server.js
//
// Serves the wishlist "page" directly from the app proxy's base URL
// (https://{shop}/apps/wishlist) instead of a Shopify Page record.
//
// Returning Content-Type: application/liquid tells Shopify to render our
// response through the shop's LIVE theme layout — header, footer,
// announcement bar, and any theme app embeds all render around it exactly
// like a normal storefront page — without ever creating a Page in
// Online Store > Pages.
//
// The actual wishlist grid is built by wishlist.js at runtime (it detects
// this URL and injects the popup markup into the theme's <main>), so this
// only needs to return a lightweight placeholder + no-JS fallback.
//
// IMPORTANT: this must be THROWN from the route loader, not returned — see
// app/routes/_index/route.jsx for why.

export function renderWishlistProxyPage() {
  const liquid = `
{%- comment -%}
  Rendered via app proxy — app/models/wishlist-proxy-page.server.js
  The real wishlist content is injected by wishlist.js into <main>, which
  removes #wishlist-proxy-page-marker once it's ready. This inline spinner
  covers the gap between the page loading and wishlist.js finishing its
  settings fetch + DOM build — without it that gap is a blank page.
{%- endcomment -%}
<div
  id="wishlist-proxy-page-marker"
  style="min-height:40vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;"
>
  <svg width="28" height="28" viewBox="0 0 50 50" style="display:block;">
    <circle cx="25" cy="25" r="20" fill="none" stroke="#e5e5e5" stroke-width="4"></circle>
    <circle cx="25" cy="25" r="20" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="31.4 94.2" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
    </circle>
  </svg>
  <span style="font-size:13px;color:#666;">Loading your wishlist...</span>
</div>
<noscript>Please enable JavaScript in your browser to view your wishlist.</noscript>
`.trim();

  return new Response(liquid, {
    status: 200,
    headers: {
      "Content-Type": "application/liquid",
      "Cache-Control": "no-store",
    },
  });
}
