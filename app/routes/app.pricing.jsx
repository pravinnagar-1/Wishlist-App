// app/routes/app.pricing.jsx

import { useLoaderData, useFetcher } from "react-router";
import { useEffect }                 from "react";
import { authenticate }              from "../shopify.server";
import { redirect }                  from "react-router";
import { PLANS, getPlanByName }      from "../config/plans";
import { getActivePlan }             from "../models/subscription.server";
import {
  Page, Layout, Card, BlockStack,
  Text, Button, Badge, Banner, InlineStack,
} from "@shopify/polaris";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER — runs when the page loads
// Fetches the current plan from Shopify and passes it to the component
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const activeSub = await getActivePlan(admin);
  const plan      = getPlanByName(activeSub?.name);
  const url       = new URL(request.url);

  return Response.json({
    currentPlanId:  plan.id,
    trialDaysLeft:  activeSub?.trialDays     ?? 0,
    periodEnd:      activeSub?.currentPeriodEnd ?? null,
    // Read error from query string — set by the confirm route on failure
    error:          url.searchParams.get("error") ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION — runs when the merchant clicks Upgrade
// Creates a Shopify subscription and redirects to their billing page
// ─────────────────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData           = await request.formData();
  const planId             = formData.get("plan");
  const plan               = PLANS[planId];

  if (!plan) {
    return Response.json({ error: "Invalid plan selected." }, { status: 400 });
  }

  if (plan.price === 0) {
    return Response.json({ redirectTo: "/app/pricing" });
  }

  const response = await admin.graphql(`
    mutation CreateSubscription(
      $name:      String!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $returnUrl: URL!
      $trialDays: Int
      $test:      Boolean
    ) {
      appSubscriptionCreate(
        name:       $name
        returnUrl:  $returnUrl
        trialDays:  $trialDays
        lineItems:  $lineItems
        test:       $test
      ) {
        userErrors      { field message }
        appSubscription { id status }
        confirmationUrl
      }
    }
  `, {
    variables: {
      name:      plan.name,
      trialDays: plan.trialDays,
      test:      process.env.NODE_ENV !== "production",
      returnUrl: `https://${session.shop}/admin/apps/wishlist/app/pricing/confirm`,
      lineItems: [{
        plan: {
          appRecurringPricingDetails: {
            price:    { amount: plan.price, currencyCode: "USD" },
            interval: plan.interval,
          },
        },
      }],
    },
  });

  const data       = await response.json();
  const result     = data?.data?.appSubscriptionCreate;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length > 0) {
    return Response.json({ error: userErrors[0].message }, { status: 422 });
  }

  // Return the URL as JSON — never redirect() from the server for billing
  return Response.json({ confirmationUrl: result.confirmationUrl });
}


// ─────────────────────────────────────────────────────────────────────────────
// PLAN CARD — renders a single pricing card
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_FEATURES = {
  free: [
    { text: "Up to 100 wishlist items",     included: true  },
    { text: "Pop-up & page display",        included: true  },
    { text: "Add to cart from wishlist",    included: true  },
    { text: "Guest wishlist",               included: false },
    { text: "Toast notifications",          included: false },
    { text: "Analytics dashboard",          included: false },
  ],
  starter: [
    { text: "Up to 1,000 wishlist items",   included: true  },
    { text: "Pop-up, page & drawer",        included: true  },
    { text: "Add to cart from wishlist",    included: true  },
    { text: "Guest wishlist",               included: true  },
    { text: "Toast notifications",          included: true  },
    { text: "Analytics dashboard",          included: false },
  ],
  pro: [
    { text: "Unlimited wishlist items",     included: true  },
    { text: "All display types",            included: true  },
    { text: "Add to cart from wishlist",    included: true  },
    { text: "Guest wishlist",               included: true  },
    { text: "Toast notifications",          included: true  },
    { text: "Analytics dashboard",          included: true  },
  ],
};

function PlanCard({ plan, isCurrent, isPopular, fetcher }) {
  const isSubmitting = fetcher.state === "submitting"
    && fetcher.formData?.get("plan") === plan.id;

  return (
    <Card>
      <BlockStack gap="400">
        {/* Badges */}
        <InlineStack gap="200">
          {isPopular && <Badge tone="info">Most popular</Badge>}
          {isCurrent && <Badge tone="success">Current plan</Badge>}
        </InlineStack>

        {/* Name + price */}
        <BlockStack gap="100">
          <Text variant="headingMd" as="h3">{plan.name}</Text>
          <Text variant="headingXl" as="p">
            {plan.price === 0 ? "$0.00" : `$${plan.price}`}
            {plan.price == 0 && (
              <Text variant="bodyMd" as="span" tone="subdued"> / month</Text>
            )}
            {plan.price > 0 && (
              <Text variant="bodyMd" as="span" tone="subdued"> / month</Text>
            )}
          </Text>
          {plan.trialDays > 0 && (
            <Text variant="bodySm" tone="subdued">
              {plan.trialDays}-day free trial included
            </Text>
          )}
        </BlockStack>

        {/* Feature list */}
        <BlockStack gap="200">
          {PLAN_FEATURES[plan.id].map(({ text, included }) => (
            <InlineStack key={text} gap="200" blockAlign="center">
              <Text
                as="span"
                tone={included ? "success" : "subdued"}
                fontWeight="medium"
              >
                {included ? "✓" : "✗"}
              </Text>
              <Text
                as="span"
                tone={included ? undefined : "subdued"}
              >
                {text}
              </Text>
            </InlineStack>
          ))}
        </BlockStack>

        {/* CTA button — wrapped in a form so it submits the plan id */}
        <fetcher.Form method="POST">
          <input type="hidden" name="plan" value={plan.id} />
          <Button
            variant={isPopular && !isCurrent ? "primary" : "secondary"}
            fullWidth
            submit
            disabled={isCurrent || isSubmitting}
            loading={isSubmitting}
          >
            {isCurrent        ? "Current plan"
            : plan.price === 0 ? "Downgrade to Free"
            : `Upgrade to ${plan.name}`}
          </Button>
        </fetcher.Form>
      </BlockStack>
    </Card>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT — what the merchant sees
// ─────────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { currentPlanId, trialDaysLeft, periodEnd, error } = useLoaderData();
  const fetcher    = useFetcher();
  const submitError = fetcher.data?.error;

    // ── This is the fix ─────────────────────────────────────────────────────
  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      // window.top breaks out of the Shopify admin iframe entirely.
      // Without this the billing page loads inside the iframe and refuses.
      setTimeout(() => {
      window.top.location.href = fetcher.data.confirmationUrl;
      }, 0);
    }

    if (fetcher.data?.redirectTo) {
      // Internal redirects (e.g. downgrade to free) stay inside the app —
      // no need to break out of the iframe like the billing confirmation URL.
      setTimeout(() => {
        window.location.href = fetcher.data.redirectTo;
      }, 0);
    }
  }, [fetcher.data]);
  // ────────────────────────────────────────────────────────────────────────
  
  return (
    <Page
      title="Plans & Pricing"
      subtitle="Upgrade or downgrade anytime. Billed through your Shopify account."
    >
      <Layout>

        {/* Show error if billing was declined or something went wrong */}
        {(error || submitError) && (
          <Layout.Section>
            <Banner
              title="There was a problem with billing"
              tone="critical"
              onDismiss={() => {}}
            >
              <Text as="p">
                {error === "billing_declined"
                  ? "Your billing confirmation was declined. No charge was made. Please try again."
                  : error === "not_found"
                  ? "We could not verify your subscription. Please contact support."
                  : submitError ?? "Something went wrong. Please try again."}
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Show trial reminder if they are mid-trial */}
        {trialDaysLeft > 0 && (
          <Layout.Section>
            <Banner title="Free trial active" tone="info">
              <Text as="p">
                You have {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} remaining
                in your free trial.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Three plan cards side by side */}
        <Layout.Section>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 15,
            alignItems: "end",
          }}>
            {Object.values(PLANS).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={currentPlanId === plan.id}
                isPopular={plan.id === "starter"}
                fetcher={fetcher}
              />
            ))}
          </div>
        </Layout.Section>

        {/* Current period end date */}
        {periodEnd && (
          <Layout.Section>
            <Text variant="bodySm" tone="subdued" alignment="center">
              Current billing period ends{" "}
              {new Date(periodEnd).toLocaleDateString("en-GB", {
                day: "numeric", month: "long", year: "numeric",
              })}.
            </Text>
          </Layout.Section>
        )}

        {/* Reassurance note */}
        <Layout.Section>
          <Text variant="bodySm" tone="subdued" alignment="center">
            All payments are processed securely by Shopify.
            You can cancel anytime from your Shopify billing settings.
          </Text>
        </Layout.Section>

      </Layout>
    </Page>
  );
}