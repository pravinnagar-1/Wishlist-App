import { redirect } from "react-router";
import { authenticate, login } from "../../shopify.server";
import { renderWishlistProxyPage } from "../../models/wishlist-proxy-page.server";

// This is a RESOURCE route (no default-exported component) on purpose.
// It has to do two very different jobs at the same backend path "/":
//   1. Serve the wishlist page for app-proxy requests to /apps/wishlist
//      (Shopify strips "/apps/wishlist" and forwards the empty remainder
//      here) — must return arbitrary raw content (a Liquid response).
//   2. Handle the OAuth/marketing landing page otherwise.
// A UI route (one with a component) wraps everything in root.jsx's layout
// and only lets you short-circuit with a *thrown* redirect — throwing any
// other Response just renders React Router's generic error page instead of
// the actual content. A resource route's loader return value becomes the
// HTTP response directly, exactly like every api.* route in this app, so
// that's what this needs to be.
export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // App proxy requests to the BASE proxy URL (https://{shop}/apps/wishlist,
  // with nothing after it) land here too — Shopify strips the "/apps/wishlist"
  // prefix and forwards the (now empty) remaining path to our app's root.
  // Only a genuinely signed proxy request has a `signature` param, so this
  // never intercepts a normal visit to the bare app URL or the OAuth
  // `?shop=` redirect below.
  if (url.searchParams.get("signature")) {
    try {
      await authenticate.public.appProxy(request);
      return renderWishlistProxyPage();
    } catch (err) {
      if (err instanceof Response) {
        // Shopify's own auth-failure response (e.g. bad/missing signature) —
        // propagate it as-is instead of masking it.
        return err;
      }
      console.error("[_index loader] unexpected app proxy error:", err);
      // fall through to the normal landing page below
    }
  }

  if (url.searchParams.get("shop")) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return new Response(
    `<!doctype html>
<html lang="en">
<head><meta charSet="utf-8"><title>Hipkers Wishlist</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;">
  <h1 style="font-size:22px;">Hipkers Wishlist</h1>
  <p style="color:#555;">A wishlist app for your Shopify store.</p>
  ${login ? `
  <form method="post" action="/auth/login" style="margin-top:24px;">
    <label style="display:block;font-size:13px;color:#333;margin-bottom:6px;">
      Shop domain
      <input type="text" name="shop" placeholder="my-shop-domain.myshopify.com"
        style="display:block;width:100%;padding:8px;margin-top:4px;box-sizing:border-box;" />
    </label>
    <button type="submit" style="padding:8px 16px;margin-top:10px;">Log in</button>
  </form>` : ""}
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
};
