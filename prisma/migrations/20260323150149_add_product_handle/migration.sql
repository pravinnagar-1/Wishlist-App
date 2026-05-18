/*
  Warnings:

  - A unique constraint covering the columns `[shop,customerId,productId,productHandle]` on the table `Wishlist` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Wishlist_shop_customerId_productId_key";

-- AlterTable
ALTER TABLE "Wishlist" ADD COLUMN "productHandle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_shop_customerId_productId_productHandle_key" ON "Wishlist"("shop", "customerId", "productId", "productHandle");
