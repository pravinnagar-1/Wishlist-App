// app/routes/share.js
//
// Serves the shared-wishlist view directly from a dedicated app proxy
// sub-path (https://{shop}/apps/wishlist/share?key=<token>) instead of
// piggybacking on the main /apps/wishlist page. Same mechanism as
// _index/route.jsx: Content-Type: application/liquid renders our response
// through the shop's live theme layout (header, footer, announcement bar),
// and this is a pure resource route (no default component) so the response
// is returned directly, not wrapped by React Router's own document shell.

import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // Only a genuine, Shopify-signed app-proxy request should ever reach this
  // route — a direct hit with no signature just 404s.
  if (!url.searchParams.get("signature")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await authenticate.public.appProxy(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Not found", { status: 404 });
  }

  // The actual lookup/rendering of the shared items happens client-side
  // (wishlist-page.liquid reads ?key= and calls the wishlist-shared-items
  // API, which already handles "not found" / "expired" gracefully) — this
  // just needs to return a placeholder that the theme wraps in its layout.
  const liquid = `
{%- comment -%}
  Rendered via app proxy — app/routes/share.js
  The shared wishlist content is injected by wishlist-page.liquid's script
  once it fetches the items for the ?key= token in the URL.
{%- endcomment -%}
<div
  id="wishlist-share-page-marker"
  style="min-height:40vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;"
>
  <svg width="28" height="28" viewBox="0 0 50 50" style="display:block;">
    <circle cx="25" cy="25" r="20" fill="none" stroke="#e5e5e5" stroke-width="4"></circle>
    <circle cx="25" cy="25" r="20" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="31.4 94.2" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
    </circle>
  </svg>
  <span style="font-size:13px;color:#666;">Loading shared wishlist...</span>
</div>
<noscript>Please enable JavaScript in your browser to view this wishlist.</noscript>
`.trim();

  return new Response(liquid, {
    status: 200,
    headers: {
      "Content-Type": "application/liquid",
      "Cache-Control": "no-store",
    },
  });
};
