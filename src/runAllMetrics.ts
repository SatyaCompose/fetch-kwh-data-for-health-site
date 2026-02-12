import { generateHourlyIntervals } from "./intervalGenerator";
import { fetchHourlyCartTotal, fetchLoggedInOrderTotal, fetchAnonymousOrderTotal, fetchRepeatedCustOrderTotal, fetchOrderTotal, fetchCustomersCreatedTotal } from "./cartFetcher";

export type MetricMode =
    | "CART_TOTAL"
    | "ANONYMOUS_CART"
    | "LOGGED_IN_CART"
    | "FIRST_TIME_BUYERS"
    | "LOGGED_IN_ORDERS"
    | "ANONYMOUS_ORDERS"
    | "REPEATED_ORDERS"
    | "TOTAL_ORDERS"
    | "TOTAL_CUSTOMERS";

const fullRangeMetricMap: Record<
    Exclude<
        MetricMode,
        "CART_TOTAL" | "ANONYMOUS_CART" | "LOGGED_IN_CART" | "FIRST_TIME_BUYERS"
    >,
    (from: string, to: string) => Promise<number>
> = {
    LOGGED_IN_ORDERS: fetchLoggedInOrderTotal,
    ANONYMOUS_ORDERS: fetchAnonymousOrderTotal,
    REPEATED_ORDERS: fetchRepeatedCustOrderTotal,
    TOTAL_ORDERS: fetchOrderTotal,
    TOTAL_CUSTOMERS: fetchCustomersCreatedTotal
};

export async function runMetric(
    mode: MetricMode,
    START_DATE: string,
    END_DATE: string
): Promise<number> {

    let total = 0;

    // Interval-based metrics
    if (
        mode === "CART_TOTAL" ||
        mode === "ANONYMOUS_CART" ||
        mode === "LOGGED_IN_CART" ||
        mode === "FIRST_TIME_BUYERS"
    ) {
        const intervalHours = mode === "FIRST_TIME_BUYERS" ? 4 : 1
        const intervals = generateHourlyIntervals(START_DATE, END_DATE, intervalHours);

        for (const { from, to } of intervals) {
            const hourlyTotal = await fetchHourlyCartTotal(from, to, mode);
            total += hourlyTotal;

            console.log(`[${from} → ${to}] total: ${hourlyTotal}`);
        }

        return total;
    }

    // Full-range metrics (no interval split)
    const metricFn = fullRangeMetricMap[mode as keyof typeof fullRangeMetricMap];

    if (!metricFn) {
        throw new Error(`Unsupported metric mode: ${mode}`);
    }

    total = await metricFn(START_DATE, END_DATE);

    console.log(`Full range total: ${total}`);

    return total;
}