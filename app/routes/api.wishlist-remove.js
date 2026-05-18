// api.wishlist-remove.js

// import prisma from "../db.server";

// export async function action({ request }) {

//   const body = await request.json();

//   const { shop, productId, customerId } = body;

//   console.log("REMOVE API HIT:", body);

//   await prisma.wishlist.deleteMany({
//     where: {
//       shop,
//       productId,
//       customerId
//     }
//   });

//   console.log("DELETED COUNT:", deleted);

//   return new Response(JSON.stringify({ success: true }), {
//     headers: {
//       "Content-Type": "application/json"
//     }
//   });

// }

import prisma from "../db.server";

export async function action({ request }) {
  try {
    const body = await request.json();

    console.log("BODY:", body);

    const { shop, productId, customerId } = body;

    if (!shop || !productId || !customerId) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing fields"
      }), { status: 400 });
    }

    const deleted = await prisma.wishlist.deleteMany({
      where: {
        shop: String(shop),
        productId: String(productId),
        customerId: String(customerId)
      }
    });

    console.log("DELETED:", deleted);

    return new Response(JSON.stringify({
      success: true,
      deleted
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("REMOVE ERROR:", err);

    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function loader() {
  return new Response(JSON.stringify({ message: "OK" }), {
    headers: { "Content-Type": "application/json" }
  });
}