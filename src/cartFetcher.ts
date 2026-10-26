import fetch from "node-fetch";
import dotenv from "dotenv";
import { Order } from "@commercetools/platform-sdk";

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
  return countPaginated(
    "carts",
    `store(key=\\"kwh\\") AND lineItems is defined`,
    from,
    to,
    "lastModifiedAt"
  );
}

export async function fetchAnonymousCartTotal(
  from: string,
  to: string
): Promise<number> {
  return countPaginated(
    "carts",
    `(customerId is not defined) AND store(key=\\"kwh\\") AND lineItems is defined`,
    from,
    to,
    "lastModifiedAt"
  );
}

export async function fetchLoggedInCartTotal(
  from: string,
  to: string
): Promise<number> {
  return countPaginated(
    "carts",
    `(customerId is defined) AND store(key=\\"kwh\\") AND lineItems is defined`,
    from,
    to,
    "lastModifiedAt"
  );
}

export async function fetchOrderTotal(
  from: string,
  to: string
): Promise<number> {
  return countPaginated("orders", `store(key=\\"kwh\\")`, from, to);
}

export async function fetchLoggedInOrderTotal(
  from: string,
  to: string
): Promise<number> {
  return countPaginated(
    "orders",
    `(customerId is defined) AND (anonymousId is not defined) AND store(key=\\"kwh\\")`,
    from,
    to
  );
}

export async function fetchAnonymousOrderTotal(
  from: string,
  to: string
): Promise<number> {
  return countPaginated(
    "orders",
    `(anonymousId is defined) AND store(key=\\"kwh\\")`,
    from,
    to
  );
}

export async function fetchRepeatedCustOrderTotal(
  from: string,
  to: string
): Promise<number> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  await forEachPaginated<{ id: string; customerEmail?: string | null }>(
    "orders",
    `store(key=\\"kwh\\")`,
    from,
    to,
    "createdAt",
    "customerEmail",
    (o) => {
      const email = o?.customerEmail;
      if (!email) return;
      if (seen.has(email)) {
        console.log(`Repeated email found: ${email} => ${repeated.size + 1} repeated so far`);
        repeated.add(email);
      } else {
        seen.add(email);
      }
    }
  );

  const uniqueRepeatedCustomers = [...repeated];
  console.log(`Repeated customers found: ${uniqueRepeatedCustomers.length}`);
  return uniqueRepeatedCustomers.length;
}

type PaginatedResource = "customers" | "orders" | "carts";
type DateField = "createdAt" | "lastModifiedAt";

// Calls onRow once per unique row (by id) in the (from, to) range.
async function forEachPaginated<T extends { id: string }>(
  resource: PaginatedResource,
  baseWhere: string,
  from: string,
  to: string,
  dateField: DateField,
  selection: string,
  onRow: (row: T) => void
): Promise<void> {
  const LIMIT = 500;
  // Commercetools rejects offset above 10,000, so we page by offset and then
  // slide the date cursor forward instead of trusting the capped total.
  const MAX_OFFSET = 10000;
  let offset = 0;
  let cursorFrom = from;
  let cursorOperator = ">";

  const seenIds = new Set<string>();

  while (true) {
    const query = `
        query {
            ${resource}(
                limit: ${LIMIT}
                offset: ${offset}
                sort: ["${dateField} asc"]
                where: "${baseWhere} AND ${dateField} ${cursorOperator} \\"${cursorFrom}\\" AND ${dateField} < \\"${to}\\""
            ) {
                total
                results {
                    id
                    ${dateField}
                    ${selection}
                }
            }
        }
    `;

    const res = await executeGraphQL(query);
    const results: (T & Record<string, any>)[] =
      res?.data?.[resource]?.results ?? [];

    for (const r of results) {
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      onRow(r);
    }

    console.log(
      `Fetched ${results.length} ${resource} (offset: ${offset}, cursorFrom: ${cursorFrom}, unique total: ${seenIds.size})`
    );

    if (results.length === 0) break;

    offset += LIMIT;

    if (results.length === LIMIT && offset + LIMIT > MAX_OFFSET) {
      const lastDate: string = results[results.length - 1][dateField];
      if (lastDate === cursorFrom) {
        throw new Error(
          `Pagination cannot advance for ${resource}: cursor stuck at ${cursorFrom}`
        );
      }
      // ">=" keeps records sharing the last date; seenIds dedupes them.
      cursorFrom = lastDate;
      cursorOperator = ">=";
      offset = 0;
      console.log(`Cursor reset for ${resource} (cursorFrom: ${cursorFrom})`);
    }
  }
}

async function countPaginated(
  resource: PaginatedResource,
  baseWhere: string,
  from: string,
  to: string,
  dateField: DateField = "createdAt"
): Promise<number> {
  let count = 0;
  await forEachPaginated(resource, baseWhere, from, to, dateField, "", () => {
    count++;
  });
  return count;
}

export async function fetchCustomersCreatedTotal(
  from: string,
  to: string
): Promise<number> {
  return countPaginated("customers", `stores(key=\\"kwh\\")`, from, to);
}

export async function fetchFirstTimeBuyersTotal(
  from: string,
  to: string
): Promise<Order[]> {
  const orders: Order[] = [];
  await forEachPaginated<Order>(
    "orders",
    `store(key=\\"kwh\\")`,
    from,
    to,
    "createdAt",
    "customerEmail",
    (row) => {
      orders.push({ customerEmail: row.customerEmail } as Order);
    }
  );
  return orders;
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
