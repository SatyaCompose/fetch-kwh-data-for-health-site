export function generateHourlyIntervals(
    startISO: string,
    endISO: string,
    hours: number
) {
    const intervals: Array<{ from: string; to: string }> = [];

    let cursor = new Date(startISO);
    const end = new Date(endISO);

    while (cursor < end) {
        const next = new Date(cursor);
        next.setHours(next.getHours() + hours);

        intervals.push({
            from: cursor.toISOString(),
            to: next.toISOString(),
        });

        cursor = next;
    }

    return intervals;
}
