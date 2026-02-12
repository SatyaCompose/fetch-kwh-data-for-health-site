export function generateHourlyIntervals(
    startISO: string,
    endISO: string
) {
    const intervals: Array<{ from: string; to: string }> = [];

    let cursor = new Date(startISO);
    const end = new Date(endISO);

    while (cursor < end) {
        const next = new Date(cursor);
        next.setHours(next.getHours() + 4);

        intervals.push({
            from: cursor.toISOString(),
            to: next.toISOString(),
        });

        cursor = next;
    }

    return intervals;
}
