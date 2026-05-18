// app.wishlist-users.jsx
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Link,
  Text,
  TextField,
  Button,
  InlineStack,
  Icon,
  Thumbnail,
  EmptyState,
} from "@shopify/polaris";
import { ExportIcon, SearchIcon, ImageIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useEffect } from "react";

const PAGE_SIZE = 50;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const customerParam = url.searchParams.get("customer");
  const fromPage = url.searchParams.get("from") ?? "1";
  const pageParam = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

  if (customerParam) {
    const items = await prisma.wishlist.findMany({
      where: { shop, customerId: customerParam },
    });

    // Customer details
    const numericCustomerId = customerParam.toString().split("/").pop();
    const customerRes = await admin.graphql(
      `query GetCustomer($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          email
        }
      }`,
      { variables: { id: `gid://shopify/Customer/${numericCustomerId}` } }
    );
    const customerData = await customerRes.json();
    const customer = customerData?.data?.customer;
    const customerEmail = customer?.email ?? "Unknown";
    const customerName =
      `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim() ||
      customerEmail;

    // Product details — batched via nodes()
    let products = [];
    if (items.length > 0) {
      const productGids = items.map((it) => {
        const raw = it.productId.toString();
        return raw.startsWith("gid://") ? raw : `gid://shopify/Product/${raw}`;
      });

      const prodRes = await admin.graphql(
        `query GetProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              featuredImage { url altText }
            }
          }
        }`,
        { variables: { ids: productGids } }
      );
      const prodData = await prodRes.json();
      products = (prodData?.data?.nodes ?? [])
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          title: p.title,
          image: p.featuredImage?.url ?? null,
          imageAlt: p.featuredImage?.altText ?? p.title,
          adminUrl: `https://${shop}/admin/products/${p.id.split("/").pop()}`,
        }));
    }

    return {
      mode: "detail",
      customerEmail,
      customerName,
      products,
      fromPage,
    };
  }

  // ─── LIST VIEW: paginated customers ───────────────────────────────────────
  const searchQuery = (url.searchParams.get("q") ?? "").trim();

  const allGroups = await prisma.wishlist.groupBy({
    by: ["customerId"],
    where: { shop },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
  });

  // If search is active, intersect wishlist customers with Shopify search results
  let filteredGroups = allGroups;
  if (searchQuery) {
    const searchRes = await admin.graphql(
      `query SearchCustomers($q: String!) {
        customers(first: 250, query: $q) {
          edges { node { id } }
        }
      }`,
      { variables: { q: searchQuery } }
    );
    const searchData = await searchRes.json();
    const matchingGids = new Set(
      (searchData?.data?.customers?.edges ?? []).map((e) => e.node.id)
    );

    filteredGroups = allGroups.filter((g) => {
      const raw = g.customerId.toString();
      const gid = raw.startsWith("gid://") ? raw : `gid://shopify/Customer/${raw}`;
      return matchingGids.has(gid);
    });
  }

  const totalCount = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(pageParam, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageGroups = filteredGroups.slice(start, start + PAGE_SIZE);

  const customerIds = pageGroups.map((c) => c.customerId);
  let customerDetails = {};

  if (customerIds.length > 0) {
    const idsQuery = customerIds
      .map((id) => `id:${id.split("/").pop()}`)
      .join(" OR ");

    const res = await admin.graphql(`
      {
        customers(first: ${PAGE_SIZE}, query: "${idsQuery}") {
          edges {
            node { id firstName lastName email }
          }
        }
      }
    `);

    const data = await res.json();
    data.data.customers.edges.forEach(({ node }) => {
      const numericId = node.id.split("/").pop();
      const fullName =
        `${node.firstName ?? ""} ${node.lastName ?? ""}`.trim() || "Unknown";
      customerDetails[numericId] = { name: fullName, email: node.email ?? "-" };
      customerDetails[node.id] = { name: fullName, email: node.email ?? "-" };
    });
  }

  const rows = pageGroups.map((c, i) => {
    const numericId = c.customerId.toString().split("/").pop();
    const detail =
      customerDetails[numericId] ?? customerDetails[c.customerId] ?? {};
    return {
      id: String(start + i + 1),
      customerId: c.customerId,
      numericId,
      name: detail.name ?? "Customer Name",
      email: detail.email ?? "-",
      count: c._count.productId,
      url: `https://${shop}/admin/customers/${numericId}`,
    };
  });

  return {
    mode: "list",
    rows,
    page: currentPage,
    totalPages,
    totalCount,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    query: searchQuery,
  };
};

export default function WishlistUsers() {
  const data = useLoaderData();

  if (data.mode === "detail") {
    return <CustomerWishlistDetail data={data} />;
  }
  return <WishlistUsersList data={data} />;
}

// ─── Detail View ────────────────────────────────────────────────────────────
function CustomerWishlistDetail({ data }) {
  const navigate = useNavigate();
  const { customerEmail, products, fromPage } = data;

  const handleBack = () => {
    navigate(`/app/wishlist-users?page=${fromPage}`);
  };

  return (
    <Page
      backAction={{ content: "Wishlist Users", onAction: handleBack }}
      title={customerEmail}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={products.length}
              headings={[{ title: "Image" }, { title: "Title" }]}
              selectable={false}
              emptyState={
                <EmptyState
                  heading="No wishlist products"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>This customer hasn't added any products to their wishlist yet.</p>
                </EmptyState>
              }
            >
              {products.map((p, i) => (
                <IndexTable.Row id={p.id} key={p.id} position={i}>
                  <IndexTable.Cell>
                    <Thumbnail
                      source={p.image ?? ImageIcon}
                      alt={p.imageAlt}
                      size="small"
                    />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Link url={p.adminUrl} target="_blank" dataPrimaryLink>
                      <Text variant="bodyMd" fontWeight="bold">
                        {p.title}
                      </Text>
                    </Link>
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

// ─── List View ──────────────────────────────────────────────────────────────
function WishlistUsersList({ data }) {
  const navigate = useNavigate();
  const { rows, page, totalPages, totalCount, hasNext, hasPrevious, query } = data;

  const [searchValue, setSearchValue] = useState(query);

  // Sync local input when URL changes externally (back/forward)
  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  // Debounce search → URL update
  useEffect(() => {
    if (searchValue === query) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (searchValue.trim()) params.set("q", searchValue.trim());
      // page is intentionally reset to 1 on new search
      navigate(`/app/wishlist-users?${params.toString()}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchValue, query, navigate]);

  const handleSearchChange = useCallback((val) => setSearchValue(val), []);

  const handleExport = () => {
    const headers = ["Customer", "Email", "Wishlist Count"];
    const csvRows = [
      headers.join(","),
      ...rows.map((r) => `${r.name},${r.email},${r.count}`),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wishlist-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildPageUrl = (targetPage) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(targetPage));
    return `/app/wishlist-users?${params.toString()}`;
  };

  const handleViewCustomer = (customerId) => {
    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("from", String(page));
    if (query) params.set("fromQ", query);
    navigate(`/app/wishlist-users?${params.toString()}`);
  };

  const showPagination = totalCount > 50;

  return (
    <Page
      title="Wishlist Users"
      primaryAction={
        <InlineStack gap="300">
          <Button icon={ExportIcon} onClick={handleExport}>
            Export
          </Button>
        </InlineStack>
      }
    >
      <Layout>
        <Layout.Section>
          <Card padding="400">
            <div
              style={{
                padding: "12px 0px",
                borderBottom: "1px solid #D9D9D9",
              }}
            >
              <TextField
                placeholder="Search by name or email"
                value={searchValue}
                onChange={handleSearchChange}
                prefix={<Icon source={SearchIcon} tone="base" />}
                clearButton
                onClearButtonClick={() => setSearchValue("")}
                autoComplete="off"
              />
            </div>

            <IndexTable
              resourceName={{ singular: "customer", plural: "customers" }}
              itemCount={rows.length}
              headings={[
                { title: "Customer" },
                { title: "Email" },
                { title: "Wishlist Count", alignment: "end" },
              ]}
              selectable={false}
              emptyState={
                query ? (
                  <EmptyState
                    heading="No customers match your search"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Try a different name or email.</p>
                  </EmptyState>
                ) : undefined
              }
              pagination={
                showPagination
                  ? {
                      hasNext,
                      hasPrevious,
                      onNext: () => navigate(buildPageUrl(page + 1)),
                      onPrevious: () => navigate(buildPageUrl(page - 1)),
                      label: `Page ${page} of ${totalPages} · ${totalCount} customer${totalCount === 1 ? "" : "s"}`,
                    }
                  : undefined
              }
            >
              {rows.map(({ id, customerId, name, email, count }, idx) => (
                <IndexTable.Row id={id} key={id} position={idx}>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold">
                      {name}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text variant="bodyMd">{email}</Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <Button onClick={() => handleViewCustomer(customerId)}>
                        {String(count)}
                      </Button>
                    </div>
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