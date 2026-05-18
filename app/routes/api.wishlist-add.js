// api.wishlist-add.js

import prisma from "../db.server";

export async function action({ request }) {

  const body = await request.json();
  const { shop, productId, variantId, customerId, productHandle } = body;

  // check existing
  const existing = await prisma.wishlist.findFirst({
    where: {
      shop,
      productId,
      customerId
    }
  });

  if (existing) {
    return new Response(JSON.stringify({ success: true, message: "Already added" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const wishlist = await prisma.wishlist.create({
    data: {
      shop,
      productId,
      variantId,
      customerId,
      productHandle
    }
  });

  return new Response(JSON.stringify({ success: true, data: wishlist }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export async function loader() {
  return new Response(JSON.stringify({ message: "OK" }), {
    headers: { "Content-Type": "application/json" }
  });
}