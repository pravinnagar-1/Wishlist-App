import prisma from "../db.server";

export default async function handler(req, res) {

  const { customerId } = req.query;

  const items = await prisma.wishlist.findMany({
    where: {
      customerId
    }
  });

  res.status(200).json(items);

}