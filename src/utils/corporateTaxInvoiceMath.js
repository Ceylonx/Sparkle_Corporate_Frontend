const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = [
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under100(n) {
    if (n < 10) return ONES[n];
    if (n < 20) return TEENS[n - 10];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return TENS[t] + (o ? ` ${ONES[o]}` : "");
}

function threeDigitToWords(n) {
    if (n === 0) return "";
    const h = Math.floor(n / 100);
    const t = n % 100;
    let s = "";
    if (h) s = `${ONES[h]} hundred`;
    if (t) s += (s ? " " : "") + under100(t);
    return s;
}

/**
 * @param {number} num non-negative integer
 * @returns {string}
 */
export function numberToEnglishWordsInt(num) {
    if (!Number.isFinite(num) || num < 0) return "";
    if (num === 0) return "zero";
    let n = Math.floor(num);
    const billions = Math.floor(n / 1e9);
    n %= 1e9;
    const millions = Math.floor(n / 1e6);
    n %= 1e6;
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    const parts = [];
    if (billions) parts.push(`${threeDigitToWords(billions)} billion`);
    if (millions) parts.push(`${threeDigitToWords(millions)} million`);
    if (thousands) parts.push(`${threeDigitToWords(thousands)} thousand`);
    if (remainder) parts.push(threeDigitToWords(remainder));
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * @param {number|string} grandTotal
 * @returns {string}
 */
export function grandTotalToAmountInWords(grandTotal) {
    const gt = parseFloat(String(grandTotal));
    if (!Number.isFinite(gt)) return "";
    const intPart = Math.floor(gt);
    const cents = Math.round((gt - intPart) * 100);
    let out = `${numberToEnglishWordsInt(intPart).replace(/\b\w/g, (c) => c.toUpperCase())} Rupees`;
    if (cents > 0) {
        out += ` and ${numberToEnglishWordsInt(cents).replace(/\b\w/g, (c) => c.toUpperCase())} Cents`;
    }
    return `${out} Only`;
}

function isDailyInvoice(customerInvoiceType) {
    const n = String(customerInvoiceType || "")
        .trim()
        .toLowerCase();
    return n === "daily invoice" || n.includes("daily");
}

/**
 * Corporate tax invoice totals (strict order per business rules).
 * @param {object} p
 * @param {number} p.laundryCharges
 * @param {number} p.customerDiscountPct
 * @param {number} p.transportRate
 * @param {string} p.customerInvoiceType e.g. "Daily Invoice" | "Period Invoice"
 * @param {number} [p.transportMultiplierOverride] — when set, transport = rate × this (ignores daily/period rule)
 * @param {number} p.ssclRatePct from settings
 * @param {number} p.vatRatePct from settings
 */
export function computeCorporateTaxInvoiceSummary({
    laundryCharges,
    customerDiscountPct,
    transportRate,
    customerInvoiceType,
    invoicingPeriod,
    ssclRatePct,
    vatRatePct,
    transportMultiplierOverride,
}) {
    // 1) Laundry = sum of line items (caller supplies)
    const laundry = parseFloat(Number(laundryCharges || 0).toFixed(2));
    // 2) Discount = Laundry × (Discount% / 100), subtracted from laundry below
    const discPct = parseFloat(Number(customerDiscountPct || 0).toFixed(2));
    const discountAmount = parseFloat(
        ((Number(laundry) * Number(discPct)) / 100).toFixed(2)
    );
    const amountAfterDiscount = parseFloat((Number(laundry) - Number(discountAmount)).toFixed(2));

    // 3) Transport = Transport_Rate × multiplier (daily: 1; period: invoicing_period; override when set)
    const rate = parseFloat(Number(transportRate || 0).toFixed(2));
    const periodRaw = Number(invoicingPeriod);
    const period = Number.isFinite(periodRaw) && periodRaw > 0 ? Math.floor(periodRaw) : 1;
    let transportMultiplier;
    if (transportMultiplierOverride != null && transportMultiplierOverride !== "") {
        const o = Number(transportMultiplierOverride);
        transportMultiplier = Number.isFinite(o) && o > 0 ? Math.floor(o) : 1;
    } else {
        transportMultiplier = isDailyInvoice(customerInvoiceType) ? 1 : period;
    }
    const transportCharge = parseFloat((Number(rate) * Number(transportMultiplier)).toFixed(2));

    // 4) Total (before SSCL) = (Laundry − Discount) + Transport
    const totalBeforeSscl = parseFloat(
        (Number(amountAfterDiscount) + Number(transportCharge)).toFixed(2)
    );

    // 5) SSCL = (Total / 0.975) × (SSCL% / 100)  e.g. 2.5% → × 0.025
    const sscl = parseFloat(Number(ssclRatePct || 0).toFixed(4));
    const ssclAmount = parseFloat(
        ((Number(totalBeforeSscl) / 0.975) * (Number(sscl) / 100)).toFixed(2)
    );
    // 6) Total value of supply = Total + SSCL
    const totalValueOfSupply = parseFloat(
        (Number(totalBeforeSscl) + Number(ssclAmount)).toFixed(2)
    );

    // 7) VAT = Total_Value_of_Supply × (VAT% / 100)  e.g. 18% → × 0.18
    const vat = parseFloat(Number(vatRatePct || 0).toFixed(4));
    const vatAmount = parseFloat(
        ((Number(totalValueOfSupply) * Number(vat)) / 100).toFixed(2)
    );
    // 8) Grand total = TVS + VAT
    const grandTotal = parseFloat(
        (Number(totalValueOfSupply) + Number(vatAmount)).toFixed(2)
    );

    return {
        laundryCharges: laundry,
        discountPercent: discPct,
        discountAmount,
        amountAfterDiscount,
        transportRate: rate,
        transportMultiplier,
        transportCharge,
        totalBeforeSscl,
        ssclRatePct: sscl,
        ssclAmount,
        totalValueOfSupply,
        vatRatePct: vat,
        vatAmount,
        grandTotal,
        amountInWords: grandTotalToAmountInWords(grandTotal),
    };
}

/**
 * SSCL -> Total Value of Supply -> VAT -> Grand Total chain from a single base amount, with no
 * discount/transport step. Used for Credit Note previews, where "Total" (the credited amount)
 * is directly the base for tax. Unlike computeCorporateTaxInvoiceSummary, the SSCL rate is
 * applied dynamically rather than a hardcoded 0.975 divisor:
 *   ssclAmount = base * (ssclRatePct/100) / (1 - ssclRatePct/100)
 * @param {number} baseAmount
 * @param {number} ssclRatePct
 * @param {number} vatRatePct
 */
export function computeSsclVatFromBase(baseAmount, ssclRatePct, vatRatePct) {
    const base = parseFloat(Number(baseAmount || 0).toFixed(2));
    const ssclR = parseFloat(Number(ssclRatePct || 0).toFixed(4));
    const vatR = parseFloat(Number(vatRatePct || 0).toFixed(4));

    const ssclDivisor = 1 - (ssclR / 100);
    const ssclAmount = parseFloat(
        (ssclDivisor > 0 ? base * ((ssclR / 100) / ssclDivisor) : 0).toFixed(2)
    );
    const totalValueOfSupply = parseFloat((base + ssclAmount).toFixed(2));
    const vatAmount = parseFloat(((totalValueOfSupply * vatR) / 100).toFixed(2));
    const grandTotal = parseFloat((totalValueOfSupply + vatAmount).toFixed(2));

    return {
        baseAmount: base,
        ssclRatePct: ssclR,
        ssclAmount,
        totalValueOfSupply,
        vatRatePct: vatR,
        vatAmount,
        grandTotal,
        amountInWords: grandTotalToAmountInWords(grandTotal),
    };
}

/**
 * Safe finite number for API / SQL bind params (never undefined/NaN).
 * @param {unknown} n
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function invoiceBindNumber(n, fallback = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
}

/**
 * Maps {@link computeCorporateTaxInvoiceSummary} output to flat snake_case amounts
 * for `generate-corporate-invoice`. All values are finite numbers so SQL drivers never see `undefined`.
 * @param {ReturnType<typeof computeCorporateTaxInvoiceSummary>|null|undefined} summary
 */
export function taxSummaryToGenerateInvoiceAmounts(summary) {
    if (!summary || typeof summary !== "object") {
        return {
            sub_total: 0,
            discount_percent: 0,
            discount_amount: 0,
            amount_after_discount: 0,
            transport_charge: 0,
            total_before_sscl: 0,
            sscl_amount: 0,
            sscl_tax_amount: 0,
            sscl_rate_percent: 0,
            total_value_of_supply: 0,
            vat_amount: 0,
            vat_rate_percent: 0,
            grand_total: 0,
            total_amount: 0,
            balance_due: 0,
        };
    }
    const sub = invoiceBindNumber(summary.laundryCharges);
    const discPct = invoiceBindNumber(summary.discountPercent);
    const discAmt = invoiceBindNumber(summary.discountAmount);
    const afterDisc = invoiceBindNumber(summary.amountAfterDiscount);
    const transport = invoiceBindNumber(summary.transportCharge);
    const beforeSscl = invoiceBindNumber(summary.totalBeforeSscl);
    const sscl = invoiceBindNumber(summary.ssclAmount);
    const ssclRate = invoiceBindNumber(summary.ssclRatePct);
    const tvs = invoiceBindNumber(summary.totalValueOfSupply);
    const vat = invoiceBindNumber(summary.vatAmount);
    const vatRate = invoiceBindNumber(summary.vatRatePct);
    const grand = invoiceBindNumber(summary.grandTotal);
    return {
        sub_total: sub,
        discount_percent: discPct,
        discount_amount: discAmt,
        amount_after_discount: afterDisc,
        transport_charge: transport,
        total_before_sscl: beforeSscl,
        sscl_amount: sscl,
        sscl_tax_amount: sscl,
        sscl_rate_percent: ssclRate,
        total_value_of_supply: tvs,
        vat_amount: vat,
        vat_rate_percent: vatRate,
        grand_total: grand,
        total_amount: grand,
        balance_due: grand,
    };
}
