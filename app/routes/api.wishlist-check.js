import prisma from "../db.server";

export async function loader({ request }) {

  const url = new URL(request.url);

  const productId = url.searchParams.get("productId");
  const shop = url.searchParams.get("shop");

  const wishlist = await prisma.wishlist.findFirst({
    where: {
      shop,
      productId
    }
  });

  return new Response(JSON.stringify({
    exists: !!wishlist
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}