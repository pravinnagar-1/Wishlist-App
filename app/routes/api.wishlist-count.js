import prisma from "../db.server";

export async function loader({ request }) {

  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("customerId");

  const count = await prisma.wishlist.count({
    where: {
      shop,
      customerId
    }
  });

  return new Response(JSON.stringify({ count }), {
    headers: {
      "Content-Type": "application/json"
    }
  });

}