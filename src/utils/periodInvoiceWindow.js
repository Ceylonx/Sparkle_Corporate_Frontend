// Calendar math for corporate "Period Invoicing" DAYS-grid tables, which split a semi-monthly
// (15-day) billing cycle into two calendar halves per month: day 1-15, and day 16 through the
// month's real last day (28-31, leap-year aware) — rather than a fixed 15-day column count.

export function getDaysInMonth(year, month0) {
    return new Date(year, month0 + 1, 0).getDate(); // "day 0 of next month" — leap-year correct
}

/**
 * @param {Date|null} earliestDay - local-midnight Date for the earliest order/line in the invoice.
 * @param {number} configuredPeriodDays - the customer's raw customer_invoicing_period setting (1, 15, or 30 days).
 * @returns {{ periodStartDay: Date|null, numDays: number }} the calendar window the DAYS grid should render.
 */
export function computePeriodWindow(earliestDay, configuredPeriodDays) {
    if (!earliestDay) return { periodStartDay: null, numDays: configuredPeriodDays };
    const year = earliestDay.getFullYear();
    const month = earliestDay.getMonth();
    if (configuredPeriodDays === 15) {
        const isFirstHalf = earliestDay.getDate() <= 15;
        const periodStartDay = new Date(year, month, isFirstHalf ? 1 : 16);
        const numDays = isFirstHalf ? 15 : getDaysInMonth(year, month) - 15;
        return { periodStartDay, numDays };
    }
    const cycleStartDate = Math.floor((earliestDay.getDate() - 1) / configuredPeriodDays) * configuredPeriodDays + 1;
    return { periodStartDay: new Date(year, month, cycleStartDate), numDays: configuredPeriodDays };
}

/** Calendar-day label for a 1-based relative column index within the current window. */
export function calendarDayLabel(periodStartDay, relativeIndex) {
    return periodStartDay ? periodStartDay.getDate() + relativeIndex - 1 : relativeIndex;
}
