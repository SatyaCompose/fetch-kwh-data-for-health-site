import fetch from "node-fetch";
import dotenv from "dotenv";
import { Customer, Order } from "@commercetools/platform-sdk";

dotenv.config();

type MetricMode =
  | "CART_TOTAL"
  | "ANONYMOUS_CART"
  | "LOGGED_IN_CART"
  | "FIRST_TIME_BUYERS";

const metricMap: Record<
  MetricMode,
  (from: string, to: string) => Promise<number>
> = {
  CART_TOTAL: fetchCartTotal,
  ANONYMOUS_CART: fetchAnonymousCartTotal,
  LOGGED_IN_CART: fetchLoggedInCartTotal,
  FIRST_TIME_BUYERS: async (from, to) => {
    const orders = await fetchFirstTimeBuyersTotal(from, to);
    return fetchOrderByEmail(orders);
  },
};

const {
  CT_PROJECT_KEY,
  CT_CLIENT_ID,
  CT_CLIENT_SECRET,
  CT_AUTH_URL,
  CT_API_URL,
} = process.env;

if (
  !CT_PROJECT_KEY ||
  !CT_CLIENT_ID ||
  !CT_CLIENT_SECRET ||
  !CT_AUTH_URL ||
  !CT_API_URL
) {
  throw new Error("Missing required commercetools environment variables");
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const res = await fetch(`${CT_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${CT_CLIENT_ID}:${CT_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(
      `Failed to get access token: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as TokenResponse;

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  console.log("ACCESS TOKEN OBTAINED");
  return tokenCache.token;
}

export async function executeGraphQL(query: string) {
  const token = await getAccessToken();

  const res = await fetch(`${CT_API_URL}/${CT_PROJECT_KEY}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GraphQL request failed: ${res.status} ${errorText}`);
  }

  const result = await res.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result;
}

async function fetchCartTotal(from: string, to: string): Promise<number> {
  const query = `
        query {
            carts(
                where: "lastModifiedAt > \\"${from}\\" AND lastModifiedAt < \\"${to}\\" AND store(key=\\"kwh\\") AND lineItems is defined"
            ) {
                total
            }
        }
    `;

  const res = await executeGraphQL(query);
  return res?.data?.carts?.total ?? 0;
}

export async function fetchAnonymousCartTotal(
  from: string,
  to: string
): Promise<number> {
  const query = `
        query {
            carts(
                where: "(customerId is not defined) AND lastModifiedAt > \\"${from}\\" AND lastModifiedAt < \\"${to}\\" AND store(key=\\"kwh\\") AND lineItems is defined"
            ) {
                total
            }
        }
    `;

  const res = await executeGraphQL(query);
  return res?.data?.carts?.total ?? 0;
}

export async function fetchLoggedInCartTotal(
  from: string,
  to: string
): Promise<number> {
  const query = `
        query {
            carts(
                where: "(customerId is defined) AND lastModifiedAt > \\"${from}\\" AND lastModifiedAt < \\"${to}\\" AND store(key=\\"kwh\\") AND lineItems is defined"
            ) {
                total
            }
        }
    `;

  const res = await executeGraphQL(query);
  return res?.data?.carts?.total ?? 0;
}

export async function fetchOrderTotal(
  from: string,
  to: string
): Promise<number> {
  const query = `
        query {
            orders(
                where: "createdAt > \\"${from}\\" AND createdAt < \\"${to}\\" AND store(key=\\"kwh\\")"
            ) {
                total
            }
        }
    `;

  const res = await executeGraphQL(query);
  return res?.data?.orders?.total ?? 0;
}

export async function fetchLoggedInOrderTotal(
  from: string,
  to: string
): Promise<number> {
  const query = `
        query {
            orders(
                where: "(customerId is defined) AND createdAt > \\"${from}\\" AND createdAt < \\"${to}\\" AND store(key=\\"kwh\\")"
            ) {
                total
            }
        }
    `;

  const res = await executeGraphQL(query);
  return res?.data?.orders?.total ?? 0;
}

export async function fetchAnonymousOrderTotal(
  from: string,
  to: string
): Promise<number> {
  const query = `
        query {
            orders(
                where: "(customerId is not defined) AND createdAt > \\"${from}\\" AND createdAt < \\"${to}\\" AND store(key=\\"kwh\\")"
            ) {
                total
            }
        }
    `;

  const res = await executeGraphQL(query);
  return res?.data?.orders?.total ?? 0;
}

export async function fetchRepeatedCustOrderTotal(
  from: string,
  to: string
): Promise<number> {
  const LIMIT = 500;
  let offset = 0;
  let fetchedCount = 0;
  let totalCount = Infinity;

  const seen = new Set<string>();
  const repeated = new Set<string>();

  do {
    const query = `
        query {
            orders(
                limit: ${LIMIT}
                offset: ${offset}
                sort: ["createdAt asc"]
                where: "createdAt > \\"${from}\\" AND createdAt < \\"${to}\\" AND store(key=\\"kwh\\")"
            ) {
                total
                results {
                    customerEmail
                }
            }
        }
    `;

    const res = await executeGraphQL(query);
    const orders: Order[] = res?.data?.orders?.results ?? [];
    totalCount = res?.data?.orders?.total ?? 0;

    console.log(
      `Fetched ${orders.length} orders (offset: ${offset}, total: ${totalCount})`
    );

    for (const o of orders) {
      const email = o?.customerEmail;
      if (!email) continue;
      if (seen.has(email)) {
        console.log(`Repeated email found: ${email} => ${repeated?.size + 1} repeated so far`);
        repeated.add(email);
      } else {
        seen.add(email);
      }
    }

    fetchedCount += orders.length;
    offset += LIMIT;
  } while (fetchedCount < totalCount);
  const uniqueRepeatedCustomers = [...repeated];
  console.log(`Repeated customers found: ${uniqueRepeatedCustomers?.length}`);
  return uniqueRepeatedCustomers.length;
}

export async function fetchCustomersCreatedTotal(
  from: string,
  to: string
): Promise<number> {
  const query = `
        query {
            customers(
                where: "stores(key=\\"kwh\\") AND createdAt > \\"${from}\\" AND createdAt < \\"${to}\\""
            ) {
                total
            }
        }
    `;
  console.log("Fetching customers created total with query:", query);
  const res = await executeGraphQL(query);

  return res?.data?.customers?.total ?? 0;
}

export async function fetchFirstTimeBuyersTotal(
  from: string,
  to: string
): Promise<Order[]> {
  const ordersQuery = `
        query {
            orders(
                where: "createdAt > \\"${from}\\" AND createdAt < \\"${to}\\" AND store(key=\\"kwh\\")"
            ) {
                total
                results{
                    customerEmail
                }
            }
        }
    `;
  const res = await executeGraphQL(ordersQuery);
  const ordersDetails = res?.data?.orders?.results ?? [];
  return ordersDetails;
}

export const fetchOrderByEmail = async (orderDetails: Order[]) => {
  const orderByEmail = (email: string) => {
    return `
            query {
                orders(
                    where: "store(key=\\"kwh\\") AND customerEmail=\\"${email}\\""
                ) {
                    total
                }
            }
    `;
  };
  let count = 0;
  for (const order of orderDetails) {
    const query = orderByEmail(order?.customerEmail as string);

    const res = await executeGraphQL(query);
    const total = res?.data?.orders?.total ?? 0;
    console.log(order?.customerEmail, "=> ", total);
    if (total === 1) {
      count++;
    }
  }

  return count;
};

export async function fetchHourlyCartTotal(
  from: string,
  to: string,
  mode: MetricMode
): Promise<number> {
  try {
    return await executeMetric(mode, from, to);
  } catch (error) {
    console.error("Failed to fetch total:", error);
    throw error;
  }
}

async function executeMetric(
  mode: MetricMode,
  from: string,
  to: string
): Promise<number> {
  const metricFn = metricMap[mode];

  if (!metricFn) {
    throw new Error(`Unsupported metric mode: ${mode}`);
  }

  const total = await metricFn(from, to);

  if (total < 10000) {
    return total;
  }

  console.log(`Total ${total} exceeds 10000, splitting into 30-min intervals`);

  const fromDate = new Date(from);
  const midpoint = new Date(fromDate.getTime() + 30 * 60 * 1000);

  const [firstHalfTotal, secondHalfTotal] = await Promise.all([
    metricFn(from, midpoint.toISOString()),
    metricFn(midpoint.toISOString(), to),
  ]);

  const combinedTotal = firstHalfTotal + secondHalfTotal;

  console.log(
    `30-min intervals: ${firstHalfTotal} + ${secondHalfTotal} = ${combinedTotal}`
  );

  return combinedTotal;
}
