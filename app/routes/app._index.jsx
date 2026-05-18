import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { Layout, InlineGrid, Card, Text, IndexTable, Thumbnail, Link } from "@shopify/polaris";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "@shopify/polaris/build/esm/styles.css";

import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // themes (already done)
  const res = await admin.graphql(`
    {
      themes(first: 15) {
        edges {
          node {
            id
            name
            role
          }
        }
      }
    }
  `);

  const themeData = await res.json();
  const themes = themeData.data.themes.edges.map(e => e.node);

  const shop = session.shop;

  // 🔥 STATS
  const totalWishlistItems = await prisma.wishlist.count({ where: { shop } });

  const totalCustomers = await prisma.wishlist.groupBy({
    by: ["customerId"],
    where: { shop },
  });

  const totalProducts = await prisma.wishlist.groupBy({
    by: ["productId"],
    where: { shop },
  });

  // Top 10 products (group by productId)
  const topProducts = await prisma.wishlist.groupBy({
    by: ["productId", "productHandle"],
    where: { shop },
    _count: {
      productId: true,
    },
    orderBy: {
      _count: {
        productId: "desc",
      },
    },
    take: 10,
  });

  const productIds = topProducts.map(p => p.productId);

  let productImages = {};

  if (productIds.length > 0) {
    const idsQuery = productIds.map(id => `id:${id.split("/").pop()}`).join(" OR ");

    const imgRes = await admin.graphql(`
    {
      products(first: 10, query: "${idsQuery}") {
        edges {
          node {
            id
            title
            featuredImage {
              url
            }
          }
        }
      }
    }
  `);

    const imgData = await imgRes.json();
    imgData.data.products.edges.forEach(({ node }) => {
      productImages[node.id] = {
        title: node.title,
        image: node.featuredImage?.url ?? "",
      };
    });
  }

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const wishlistByDate = await prisma.wishlist.findMany({
  where: { shop, createdAt: { gte: thirtyDaysAgo } },
  select: { createdAt: true, customerId: true },
  orderBy: { createdAt: "asc" },
});

// Date wise group karo
const dateMap = {};
wishlistByDate.forEach(({ createdAt, customerId }) => {
  const date = createdAt.toISOString().split("T")[0]; // "2026-05-03"
  if (!dateMap[date]) {
    dateMap[date] = { date, wishlist: 0, customer: new Set(), order: 0 };
  }
  dateMap[date].wishlist += 1;
  dateMap[date].customer.add(customerId);
});

// Set ko number mein convert karo
const chartData = Object.values(dateMap).map(d => ({
  date: d.date,
  wishlist: d.wishlist,
  customer: d.customer.size,
  order: d.order,
}));


  return {
    themes,
    shop,
    stats: {
      totalWishlistItems,
      totalCustomers: totalCustomers.length,
      totalProducts: totalProducts.length,
    },
    topProducts,
    productImages,
    chartData
  };
};

import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function Dashboard() {
  const { themes, shop, stats, topProducts, productImages, chartData } = useLoaderData();
  const shopify = useAppBridge();

  const [selectedTheme, setSelectedTheme] = useState(
    themes.find(t => t.role === "MAIN")?.id
  );

  // THEME EDITOR REDIRECT
  const openThemeEditor = () => {
    if (!selectedTheme) {
      alert("Please select a theme");
      return;
    }

    const themeId = selectedTheme.split("/").pop();

    const url = `https://${shop}/admin/themes/${themeId}/editor?context=apps`;

    window.open(url, "_blank");
  };

  const rows = topProducts.map((p, index) => {
    // productId numeric hai, GID banao
    const gid = `gid://shopify/Product/${p.productId}`;
    const productData = productImages[gid] ?? {};

    return {
      id: String(index + 1),
      img: productData.image ?? "",
      name: productData.title ?? p.productHandle ?? "Unknown",
      url: `https://${shop}/admin/products/${p.productId}`,
      count: p._count.productId,
    };
  });

  return (
    <s-page heading="Wishlist">

      {/* 🔥 SETUP GUIDE */}
      <Layout.Section>
        <s-section>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack paddingBlockEnd="base">
              <s-heading>Setup Guide</s-heading>
              <s-text>Use this personalized guide to get your store ready for sales.</s-text>
            </s-stack>
            <s-box borderWidth="base" borderRadius="base">
              {/* 🔥 STEP 1 */}
              <s-box marginBlockEnd="base">

                <s-stack padding="base" direction="inline" gap="small-200" alignitems="center">
                  <s-icon type="check-circle" tone="critical"></s-icon>
                  <s-heading variant="headingMd">Activate theme extension</s-heading>
                </s-stack>
                <s-box padding="base" background="subdued" borderradius="base" paddingblockstart="none">
                  <s-grid gridtemplatecolumns="1fr auto" gap="base" alignitems="end">
                    <s-stack gap="small-200">
                      <s-stack gap="base" paddingBlockStart="base">
                        <s-paragraph>
                          Here you can choose where you want to activate and test the Wishlist app. Please ensure that the Wishlist App Embed is enabled in the Theme Editor.
                        </s-paragraph>
                      </s-stack>
                      <s-grid gridtemplatecolumns="3fr 1fr" alignitems="center" gap="base" padding="base">

                        {/* 🔥 THEME DROPDOWN */}
                        <s-select
                          value={selectedTheme}
                          onChange={(e) => setSelectedTheme(e.target.value)}
                        >
                          {themes.map((theme) => (
                            <s-option key={theme.id} value={theme.id}>
                              {theme.name} {theme.role === "MAIN" ? "(Live)" : ""}
                            </s-option>
                          ))}
                        </s-select>

                        {/* 🔥 BUTTON */}

                        <s-button variant="primary" onClick={openThemeEditor}>
                          Go to theme editor
                        </s-button>

                      </s-grid>
                    </s-stack>

                    <s-box maxblocksize="80px" maxinlinesize="80px">
                      <s-image src="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg" alt="Setup illustration"></s-image>
                    </s-box>
                  </s-grid>
                </s-box>
              </s-box>
              <s-divider></s-divider>
              {/* 🔥 STEP 2 */}
              <s-box>
                <s-grid gridtemplatecolumns="1fr auto" gap="base" padding="base" alignitems="center">
                  <s-stack direction="inline" gap="small-200" alignitems="center">
                    <s-icon type="circle-dashed" tone="critical"></s-icon>
                    <s-heading variant="headingMd">Single click Wishlist activation</s-heading>
                  </s-stack>
                </s-grid>
                <s-box padding="base" background="subdued" borderradius="base" paddingblockstart="none">
                  <s-grid gridtemplatecolumns="1fr auto" gap="base" alignitems="end">
                    <s-grid gridtemplatecolumns="3fr 1fr" alignitems="center" gap="base">

                      <s-stack gap="small-200">
                        <s-stack paddingblockstart="base">
                          <s-paragraph >Once enabled, wishlist will automatically work on your store.</s-paragraph>
                        </s-stack>
                        <s-grid gridtemplatecolumns="3fr 1fr" alignitems="center" gap="base" padding="base">
                          <s-button variant="primary" href="/app/wishlist-settings">
                            Manage wishlist features
                          </s-button>
                        </s-grid>

                      </s-stack>
                    </s-grid>

                    <s-box maxblocksize="80px" maxinlinesize="80px">
                      <s-image src="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg" alt="Setup illustration"></s-image>
                    </s-box>
                  </s-grid>
                </s-box>
              </s-box>
            </s-box>
          </s-box>

        </s-section>
      </Layout.Section>

      <Layout.Section>
        <InlineGrid columns={3} gap="400">

          <Card>
            <Text variant="headingMd" as="h6">Total Page View</Text>
            <Text variant="bodyLg">0</Text>
          </Card>

          <Card>
            <Text variant="headingMd" as="h6">Total Wishlist Items</Text>
            <Text variant="bodyLg">{stats.totalWishlistItems}</Text>
          </Card>

          <Card>
            <Text variant="headingMd" as="h6">Total Customers</Text>
            <Text variant="bodyLg">{stats.totalCustomers}</Text>
          </Card>

          <Card>
            <Text variant="headingMd" as="h6">Total Voting Products</Text>
            <Text variant="bodyLg">{stats.totalProducts}</Text>
          </Card>

          <Card>
            <Text variant="headingMd" as="h6">Cart From the Wishlist</Text>
            <Text variant="bodyLg">0</Text>
          </Card>

          <Card>
            <Text variant="headingMd" as="h6">Total Orders From the Wishlist</Text>
            <Text variant="bodyLg">0</Text>
          </Card>

        </InlineGrid>
      </Layout.Section>

      <Layout.Section>
        <Card>
          <div style={{ paddingBottom: "15px" }}>
            <Text variant="headingMd" as="h6">
              Top 10 Wishlist Items
            </Text>
          </div>

          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={rows.length}
            headings={[
              { title: "Icons" },
              { title: "Products" },
              { title: "Wishlist Count", alignment: "end" },
            ]}
            selectable={false}
          >
            {rows.map(({ id, img, name, url, count }) => (
              <IndexTable.Row id={id} key={id} position={id}>
                <IndexTable.Cell>
                  <Thumbnail source={img} size="small" alt={name} />
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <Link url={url} target="_blank" dataPrimaryLink>
                    <Text variant="bodyMd" fontWeight="bold">
                      {name}
                    </Text>
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

 <Layout.Section>
  <Card>
    <div style={{ textAlign: "center", marginBottom: "8px" }}>
      <Text variant="headingMd" as="h6">Statistics</Text>
    </div>

    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray=""
            vertical={false}
            stroke="#e6e6e6"
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#666" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => val.slice(0, 7)} // "2026/05"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#666" }}
            tickLine={false}
            axisLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e0e0e0",
              fontSize: "12px",
            }}
          />
          <Legend
            verticalAlign="top"
            align="center"
            iconType="square"
            wrapperStyle={{ fontSize: "12px", paddingBottom: "8px" }}
          />
          <Line
            type="linear"
            dataKey="wishlist"
            name="Wishlist"
            stroke="#FF6B8A"
            strokeWidth={2}
            dot={{ r: 4, fill: "#FF6B8A" }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="linear"
            dataKey="customer"
            name="Customer"
            stroke="#4BA3F5"
            strokeWidth={2}
            dot={{ r: 4, fill: "#4BA3F5" }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="linear"
            dataKey="order"
            name="Order"
            stroke="#82CA9D"
            strokeWidth={2}
            dot={{ r: 4, fill: "#82CA9D" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </Card>
</Layout.Section>
    </s-page>
  );
}