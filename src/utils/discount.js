// Shared helper for list/table "Total Amount" columns: orders store their discount as either
// a percentage string ("10%") or a flat Rs. amount ("500"), same format used across Order Entry,
// Service Order, Transfer Note, Dispatch Note and Invoice. Returns rawTotal minus that discount.
export function applyDiscountToAmount(rawTotal, discount) {
    const total = Number(rawTotal) || 0;
    if (discount == null || discount === "") return total;
    const discountStr = String(discount).trim();
    if (discountStr === "") return total;
    const isPercent = discountStr.endsWith('%');
    const numericPart = parseFloat(discountStr.replace('%', '').trim());
    if (isNaN(numericPart) || numericPart === 0) return total;
    const discountAmount = isPercent ? (total * numericPart / 100) : numericPart;
    return total - discountAmount;
}
