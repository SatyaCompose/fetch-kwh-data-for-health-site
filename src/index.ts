import { MetricMode, runMetric } from "./runAllMetrics";

async function runHealthDataJob() {
    const START_DATE = "2026-02-02T00:00:00.000Z";
    const END_DATE = "2026-02-08T23:59:00.000Z";
    const MODE = process.env.MODE as MetricMode;

    const total = await runMetric(MODE, START_DATE, END_DATE);
    console.log("================================");
    console.log(`TOTAL ( ${START_DATE?.split('T')[0]} To ${END_DATE?.split('T')[0]} days): ${total}`);
}

runHealthDataJob().catch(console.error);
