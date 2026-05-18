import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Thumbnail,
  Link,
  Text,
  TextField,
  Button,
  InlineStack,
  Icon,
} from "@shopify/polaris";
import { ImportIcon, ExportIcon, SearchIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Wishlist items fetch karo
  const topProducts = await prisma.wishlist.groupBy({
    by: ["productId", "productHandle"],
    where: { shop },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
  });

  // Product images fetch karo
  const productIds = topProducts.map(p => p.productId);
  let productImages = {};

  if (productIds.length > 0) {
    const idsQuery = productIds.map(id => `id:${id}`).join(" OR ");
    const imgRes = await admin.graphql(`
      {
        products(first: 50, query: "${idsQuery}") {
          edges {
            node {
              id
              title
              featuredImage { url }
            }
          }
        }
      }
    `);
    const imgData = await imgRes.json();
    imgData.data.products.edges.forEach(({ node }) => {
      const numericId = node.id.split("/").pop();
      productImages[numericId] = {
        title: node.title,
        image: node.featuredImage?.url ?? "",
      };
    });
  }

  const rows = topProducts.map((p, i) => ({
    id: String(i + 1),
    img: productImages[p.productId]?.image ?? "",
    name: productImages[p.productId]?.title ?? p.productHandle ?? "Unknown",
    url: `https://${shop}/admin/products/${p.productId}`,
    count: p._count.productId,
  }));

  return { rows, shop };
};

export default function WishlistItems() {
  const { rows } = useLoaderData();
  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = useCallback((val) => setSearchValue(val), []);

  // Search filter
  const filteredRows = rows.filter(r =>
    r.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Export CSV
  const handleExport = () => {
    const headers = ["Image", "Title", "Wishlist Count"];
    const csvRows = [
      headers.join(","),
      ...filteredRows.map(r => `${r.img},${r.name},${r.count}`),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wishlist-items.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page
      title="Wishlist Items"
      primaryAction={
        <InlineStack gap="300">
          {/* <Button icon={ImportIcon}>Import</Button> */}
          <Button icon={ExportIcon} onClick={handleExport}>Export</Button>
        </InlineStack>
      }
    >
      <Layout>
        <Layout.Section>
          <Card padding="400">
            {/* Search Bar */}
            <div style={{ padding: "12px 0px", borderBottom: "1px solid #e1e3e5" }}>
              <TextField
                placeholder="Searching in all"
                value={searchValue}
                onChange={handleSearchChange}
                prefix={<Icon
                  source={SearchIcon}
                  tone="base"
                />}
                clearButton
                onClearButtonClick={() => setSearchValue("")}
              />
            </div>

            {/* Table */}
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={filteredRows.length}
              headings={[
                { title: "Image" },
                { title: "Title" },
                { title: "Wishlist Count", alignment: "end" },
              ]}
              selectable={false}
            >
              {filteredRows.map(({ id, img, name, url, count }) => (
                <IndexTable.Row id={id} key={id} position={Number(id)}>
                  <IndexTable.Cell>
                    <Thumbnail
                      source={img || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"}
                      size="small"
                      alt={name}
                    />
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Link url={url} target="_blank" dataPrimaryLink>
                      <Text variant="bodyMd" fontWeight="bold">{name}</Text>
                    </Link>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold" alignment="end" as="span">
                      {count}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}