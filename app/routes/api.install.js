// api.install.js

import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    mutation {
      scriptTagCreate(input: {
        src: "https://remember-caroline-mentioned-restructuring.trycloudflare.com/wishlist",
        displayScope: ALL
      }) {
        scriptTag {
          id
        }
        userErrors {
          message
        }
      }
    }
  `);

  const data = await response.json();

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" }
  });
}