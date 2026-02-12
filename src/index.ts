import { generateHourlyIntervals } from "./intervalGenerator";
import { fetchHourlyCartTotal, fetchLoggedInOrderTotal, fetchAnonymousOrderTotal, fetchRepeatedCustOrderTotal, fetchOrderTotal, fetchCustomersCreatedTotal, fetchFirstTimeBuyersTotal } from "./cartFetcher";

async function run() {
    const START_DATE = "2026-02-02T00:00:00.000Z";
    const END_DATE = "2026-02-08T23:59:00.000Z";

    const intervals = generateHourlyIntervals(START_DATE, END_DATE);
    let total = 0;

    for (const { from, to } of intervals) {
        const hourlyTotal = await fetchHourlyCartTotal(from, to);
        total += hourlyTotal;

        console.log(`[${from} → ${to}] carts: ${hourlyTotal}`);
    }

    // ORDERS: LoogedIn
    // const total = await fetchLoggedInOrderTotal(START_DATE, END_DATE);

    //ORDERS: ANONYMOUS
    // const total = await fetchAnonymousOrderTotal(START_DATE, END_DATE);

    //ORDERS: REPEATED CUSTOMERS
    // const total = await fetchRepeatedCustOrderTotal(START_DATE, END_DATE);

    //ORDERS: TOTAL
    // const total = await fetchOrderTotal(START_DATE, END_DATE);

    //CUSTOMERS: TOTAL
    // const total = await fetchCustomersCreatedTotal(START_DATE, END_DATE);

    console.log("================================");
    console.log(`TOTAL (2 days): ${total}`);
}

run().catch(console.error);
