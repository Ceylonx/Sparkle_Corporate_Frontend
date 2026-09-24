// Local (non-UTC) date helpers shared by the retail list pages' date-range filters.

export function getLocalDateString(date) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The date inputs default to blank; the range filter only takes effect once the user
// has picked both a start and an end date — until then the list shows everything.
export function isDateRangeFilterActive(startDate, endDate) {
    return Boolean(startDate) && Boolean(endDate);
}

export function isDateWithinRange(dateValue, startDate, endDate) {
    const dateStr = getLocalDateString(dateValue instanceof Date ? dateValue : new Date(dateValue));
    if (!dateStr) return false;
    return dateStr >= startDate && dateStr <= endDate;
}
