Here is a complete, structured `README.md` including the new `commercetools.ts` authentication and GraphQL layer.

---

# fetch-kwh-data-for-health-site

Analytics utility for extracting **Cart, Order, and Customer metrics** from the KWH store using the **Commercetools GraphQL API**.

This project supports dynamic metric switching, interval-based batching, automatic 10k threshold handling, and secure OAuth token management.

---

# 🏗 Architecture Overview

```
src/
│
├── index.ts
│     └── Entry point (date range + MODE execution)
│
├── runAllMetrics.ts
│     ├── Metric routing
│     ├── Interval-based execution
│     └── Full-range execution
│
├── cartFetcher.ts
│     ├── Metric implementations
│     ├── First-time buyer logic
│     └── 10k result split handling
│
├── commercetools.ts
│     ├── OAuth token handling
│     ├── Token caching with expiry
│     └── GraphQL execution wrapper
│
└── intervalGenerator.ts
      └── Generates dynamic time intervals
```

---

# 🚀 Features

* Secure OAuth token caching
* Automatic token refresh before expiry
* GraphQL error handling
* Dynamic metric execution via `MODE`
* Hourly / custom interval batching
* Automatic 30-minute splitting if results exceed 10,000
* Repeated customer detection
* First-time buyer detection
* Store-scoped queries (`store(key="kwh")`)

---

# 📦 Requirements

* Node.js **v24**
* npm
* Commercetools API credentials

Verify version:

```bash
node -v
```

---

# 🔐 Environment Variables

If you do not already have a `.env`, copy `.env.example` to `.env` in the root and fill in the values:

```
CT_PROJECT_KEY=
CT_CLIENT_ID=
CT_CLIENT_SECRET=
CT_AUTH_URL=
CT_API_URL=
MODE=CART_TOTAL
```

### Required Variables

| Variable         | Description               |
| ---------------- | ------------------------- |
| CT_PROJECT_KEY   | Commercetools project key |
| CT_CLIENT_ID     | API client ID             |
| CT_CLIENT_SECRET | API client secret         |
| CT_AUTH_URL      | OAuth base URL            |
| CT_API_URL       | API base URL              |
| MODE             | Metric to execute         |

---

# ▶️ Running the Project

```bash
npm install
npm run dev
```

The script will execute the selected metric and print the final total.

---

# 🧠 Metric Modes

## Interval-Based Metrics

These are processed using hourly intervals (or 4-hour intervals for first-time buyers).

| Mode                | Description                              |
| ------------------- | ---------------------------------------- |
| `CART_TOTAL`        | Total carts with line items              |
| `ANONYMOUS_CART`    | Carts without customerId                 |
| `LOGGED_IN_CART`    | Carts with customerId                    |
| `FIRST_TIME_BUYERS` | Customers whose lifetime order count = 1 |

---

## Full-Range Metrics

Executed once for the full date range.

| Mode               | Description                              |
| ------------------ | ---------------------------------------- |
| `LOGGED_IN_ORDERS` | Orders from registered customers         |
| `ANONYMOUS_ORDERS` | Orders without customerId                |
| `REPEATED_ORDERS`  | Customers with multiple orders in period |
| `TOTAL_ORDERS`     | Total orders                             |
| `TOTAL_CUSTOMERS`  | Customers created                        |

---

# 📅 Date Configuration

Defined in `index.ts`:

```ts
const START_DATE = "2026-02-02T00:00:00.000Z";
const END_DATE = "2026-02-08T23:59:00.000Z";
```

Output format:

```
TOTAL ( 2026-02-02 To 2026-02-08 days): 845
```

---

# 🔄 Interval Engine

For interval-based metrics:

1. `generateHourlyIntervals()` creates time slices.
2. Each interval is queried individually.
3. If results exceed **10,000**:

   * Interval is split into two 30-minute queries.
   * Executed in parallel.
   * Totals combined.

This protects against Commercetools GraphQL total limits.

---

# 🔐 Commercetools Integration (commercetools.ts)

## OAuth Token Handling

* Uses Client Credentials flow
* Caches token in memory
* Automatically refreshes before expiry

### Token Retrieval Flow

```
POST {CT_AUTH_URL}/oauth/token
grant_type=client_credentials
```

Token is cached with expiry:

```ts
expiresAt = Date.now() + (expires_in - 60) * 1000
```

---

## GraphQL Execution

All queries are executed via:

```
POST {CT_API_URL}/{PROJECT_KEY}/graphql
```

Features:

* Automatic Bearer token injection
* HTTP status validation
* GraphQL error validation
* Structured error throwing

---

# 🧮 Special Logic

## Repeated Customers

* Collects orders
* Tracks customer IDs
* Counts customers appearing more than once

---

## First-Time Buyers

1. Fetch orders in interval
2. Extract `customerEmail`
3. Query lifetime order count per email
4. Count emails with exactly 1 order

---

# 📈 Example Output

```
ACCESS TOKEN OBTAINED
[2026-02-02T00:00:00.000Z → 2026-02-02T01:00:00.000Z] total: 34
[2026-02-02T01:00:00.000Z → 2026-02-02T02:00:00.000Z] total: 29
...
================================
TOTAL ( 2026-02-02 To 2026-02-08 days): 845
```

---

# ⚠️ Performance Considerations

* FIRST_TIME_BUYERS mode may generate multiple GraphQL calls (one per email)
* Execution is sequential to protect against API rate limits
* Token is cached to avoid repeated authentication calls

---

# 🛡 Security Notes

* Never commit `.env`
* Do not log access tokens
* Ensure `.gitignore` includes:

```
node_modules/
.env
```

---

# 🧪 Suggested Enhancements

* Add exponential retry for GraphQL failures
* Add concurrency pooling
* Convert hardcoded dates to CLI input
* Add structured logging
* Dockerize for cron deployment
* Implement recursive interval splitting

---

# 📌 Purpose

This utility is designed for:

* Health site reporting
* Order segmentation
* Customer lifecycle insights
* Cart behavior analytics
* Store-level performance analysis++