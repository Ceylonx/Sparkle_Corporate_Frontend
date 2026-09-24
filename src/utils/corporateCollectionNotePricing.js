/**
 * Corporate collection note / invoice line pricing: tax-inclusive unit (SSCL via /0.975 + VAT),
 * then delivery surcharge % on that amount. Used by View / Add / Update pickup and invoicing flows.
 */

/** SSCL / VAT % from sales_corporate_taxes rows (matched by tax_name). */
export function pickCorporateTaxRatePercent(taxes, name) {
    const row = (taxes ?? []).find(
        (t) => String(t.tax_name ?? "").trim().toLowerCase() === String(name).trim().toLowerCase()
    );
    if (!row) return 0;
    const r = parseFloat(row.tax_rate);
    return Number.isFinite(r) ? r : 0;
}

export function isNoTaxCustomerType(taxTypeRaw) {
    const s = String(taxTypeRaw ?? "").trim().toLowerCase();
    return s.includes("no") || s.includes("non");
}

/**
 * Checks whether a customer has a valid, non-placeholder VAT number.
 */
export function hasCustomerVatNumber(valOrCustomer) {
    if (!valOrCustomer) return false;
    let raw = "";
    if (typeof valOrCustomer === "object") {
        raw = valOrCustomer.customer_vat_number ??
              valOrCustomer.vat_number ??
              valOrCustomer.vat_no ??
              valOrCustomer.vat ??
              "";
    } else {
        raw = String(valOrCustomer);
    }
    const val = String(raw).trim();
    if (!val) return false;
    const lower = val.toLowerCase();
    if (
        lower === "00000" ||
        lower === "0000" ||
        lower === "0" ||
        lower === "-" ||
        lower === "—" ||
        lower === "null" ||
        lower === "undefined" ||
        lower === "none" ||
        lower === "n/a"
    ) {
        return false;
    }
    return true;
}

/**
 * Unit price after SSCL (via /0.975) and VAT on supply — before delivery surcharge on top.
 * Matches invoice math: SSCL = (base / 0.975) × (SSCL%/100), TVS = base + SSCL, VAT on TVS.
 */
export function computeTaxInclusiveUnitPrice(basePrice, ssclPct, vatPct) {
    const base = parseFloat(String(basePrice));
    const bp = Number.isFinite(base) ? base : 0;
    const ssclR = parseFloat(String(ssclPct));
    const s = Number.isFinite(ssclR) ? ssclR : 0;
    const vatR = parseFloat(String(vatPct));
    const v = Number.isFinite(vatR) ? vatR : 0;
    const ssclAmount = (bp / 0.975) * (s / 100);
    const totalSupply = bp + ssclAmount;
    const vatAmount = (totalSupply * v) / 100;
    const taxInclusive = totalSupply + vatAmount;
    return parseFloat(taxInclusive.toFixed(2));
}

/**
 * Final per-unit line rate: tax-inclusive price + delivery surcharge % on that amount.
 * Used for all corporate customers (daily / period / collection note / delivery note).
 */
export function computeLineFinalRateWithDelivery(basePrice, ssclPct, vatPct, deliverySurchargePct) {
    const ti = computeTaxInclusiveUnitPrice(basePrice, ssclPct, vatPct);
    const sur = parseFloat(String(deliverySurchargePct));
    const d = Number.isFinite(sur) && sur >= 0 ? sur : 0;
    const finalRate = ti + (ti * d) / 100;
    return parseFloat(finalRate.toFixed(2));
}

/** @deprecated alias — same as {@link computeLineFinalRateWithDelivery} */
export function computeNoTaxFinalRate(basePrice, ssclPct, vatPct, deliverySurchargePct) {
    return computeLineFinalRateWithDelivery(basePrice, ssclPct, vatPct, deliverySurchargePct);
}

/**
 * @param {number} ssclPct
 * @param {number} vatPct
 * @deprecated Prefer {@link computeLineFinalRateWithDelivery}; kept for call sites passing sscl/vat last.
 */
export function computeTaxCustomerFinalRate(basePrice, deliverySurchargePct, ssclPct, vatPct) {
    return computeLineFinalRateWithDelivery(basePrice, ssclPct, vatPct, deliverySurchargePct);
}

/**
 * Resolve delivery surcharge % from customer service_types list.
 * If no match (e.g. empty list after fetch), use fallbackPercentage from saved order (create payload).
 */
export function resolveDeliverySurchargePercent(
    deliveryTypeRaw,
    customerServiceTypes,
    fallbackPercentage
) {
    const deliveryType = (deliveryTypeRaw || "Normal").trim();
    const normalized =
        deliveryType.charAt(0).toUpperCase() + deliveryType.slice(1).toLowerCase();
    if (normalized === "Normal") return 0;
    const matched = (customerServiceTypes ?? []).find(
        (st) => st.service_type?.trim().toLowerCase() === normalized.toLowerCase()
    );
    const fromList = parseFloat(matched?.percentage);
    if (Number.isFinite(fromList) && fromList >= 0) return fromList;
    const fb = parseFloat(String(fallbackPercentage ?? ""));
    return Number.isFinite(fb) && fb >= 0 ? fb : 0;
}

function amountFromPriceListRow(pl) {
    if (!pl) return 0;
    return parseFloat(pl.amount ?? pl.price_list_washing_price ?? pl.washing_price ?? 0) || 0;
}

function resolveServiceTypeFromLine(line, itemTypes, corpItemIdForLookup) {
    let resolvedServiceType = line.service_type;
    if (!resolvedServiceType && line.service_types) {
        let parsedTypes = line.service_types;
        if (typeof parsedTypes === "string") {
            try {
                parsedTypes = JSON.parse(parsedTypes);
            } catch {
                parsedTypes = [];
            }
        }
        if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
            resolvedServiceType = parsedTypes[0]?.service_type_name;
        }
    }
    if (!resolvedServiceType) {
        const itemInfo = itemTypes.find(
            (it) =>
                String(it.item_type_id) === String(corpItemIdForLookup) ||
                String(it.corp_item_auto_id) === String(line.item_id)
        );
        resolvedServiceType = itemInfo?.service_type;
        if (!resolvedServiceType && itemInfo?.service_types) {
            let parsedTypes = itemInfo.service_types;
            if (typeof parsedTypes === "string") {
                try {
                    parsedTypes = JSON.parse(parsedTypes);
                } catch {
                    parsedTypes = [];
                }
            }
            if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
                resolvedServiceType = parsedTypes[0]?.service_type_name;
            }
        }
    }
    return resolvedServiceType || "Washing";
}

export function buildCollectionNoteLinesFromApiOrderItems({
    items,
    customerPriceList,
    deliveryTypeRaw,
    customerServiceTypes,
    corporateTaxRates,
    itemTypes,
    taxType: _taxType,
    deliveryPercentageFallback,
    isInvoicing,
    customer,
    vatNumber,
}) {
    if (!items?.length) return [];

    const surchargePercent = resolveDeliverySurchargePercent(
        deliveryTypeRaw,
        customerServiceTypes,
        deliveryPercentageFallback
    );

    // Rule:
    // If Customer has a valid VAT number -> Show tax-exclusive rate (ssclRate = 0, vatRate = 0).
    // If Customer does not have a VAT number -> Show tax-inclusive rate (ssclRate = rates.sscl, vatRate = rates.vat).
    let hasVat = false;
    if (vatNumber !== undefined || customer !== undefined) {
        hasVat = hasCustomerVatNumber(vatNumber) || hasCustomerVatNumber(customer);
    } else if (_taxType !== undefined) {
        hasVat = hasCustomerVatNumber(_taxType) || !isNoTaxCustomerType(_taxType);
    }

    const ssclRate = hasVat ? 0 : (corporateTaxRates?.sscl ?? 0);
    const vatRate = hasVat ? 0 : (corporateTaxRates?.vat ?? 0);

    return items.map((item) => {
        const corpItemId = item.corp_item_id || item.item_id || "";
        let qty = Number(item.corp_item_quantity || item.quantity || 0);
        if (isInvoicing) {
            qty = item.delivered_qty !== undefined && item.delivered_qty !== null
                ? Number(item.delivered_qty)
                : item.final_packed_qty !== undefined && item.final_packed_qty !== null
                ? Number(item.final_packed_qty)
                : qty;
        }
        const storedPrice = Number(item.corp_item_price || item.price || 0);

        const itemPriceObj = customerPriceList.find(
            (p) => String(p.corp_item_id) === String(corpItemId)
        );

        const basePriceRaw = itemPriceObj
            ? amountFromPriceListRow(itemPriceObj)
            : qty > 0
              ? storedPrice / qty
              : 0;
        const basePrice = parseFloat(parseFloat(String(basePriceRaw)).toFixed(2));

        const itemDeliveryType = item.delivery_type || item.deliveryType || deliveryTypeRaw;
        const itemSurchargePercent = resolveDeliverySurchargePercent(
            itemDeliveryType,
            customerServiceTypes,
            item.delivery_percentage || item.deliveryPercentage || deliveryPercentageFallback
        );

        const finalRate = computeLineFinalRateWithDelivery(
            basePrice,
            ssclRate,
            vatRate,
            itemSurchargePercent
        );

        const orderValue = parseFloat((finalRate * qty).toFixed(2));

        const resolvedServiceType = resolveServiceTypeFromLine(item, itemTypes, corpItemId);

        return {
            ...item,
            item_id: corpItemId,
            corp_item_id: corpItemId,
            item_name: item.corp_item_name ?? item.item_name,
            item_category_id: item.item_category_id,
            item_category_name: item.item_category_name ?? item.category_name,
            quantity: qty,
            remark: item.corp_item_remark || item.remark || "",
            service_type: resolvedServiceType,
            delivery_type: itemDeliveryType,
            delivery_percentage: item.delivery_percentage || item.deliveryPercentage || deliveryPercentageFallback,
            rate: finalRate,
            orderValue,
        };
    });
}

/**
 * Priced lines for an ALREADY-GENERATED invoice: uses each item's own stored corp_item_price
 * (the price actually charged at invoicing time) instead of looking up today's price list.
 * Price lists change over time, so re-deriving a historical invoice's amounts from the
 * *current* price list would show numbers that were never actually billed. Mirrors the
 * pricing CorporateDailyInvoiceGenerate.jsx uses for its own "view an existing invoice" mode,
 * so any other surface previewing the same invoice_id (e.g. Credit/Debit Notes) agrees with it.
 *
 * Quantity is read from item.corp_item_quantity / item.quantity as given — callers decide what
 * that means for their context (e.g. delivered_qty for a read-only preview, or the current
 * balance-after-notes for an adjustment table), this helper only resolves the price.
 */
export function buildInvoicePricedLinesFromGeneratedItems({
    items,
    customerServiceTypes,
    corporateTaxRates,
    taxType,
    deliveryTypeRaw,
}) {
    if (!items?.length) return [];

    const isTaxCustomer = !isNoTaxCustomerType(taxType);
    const ssclRate = isTaxCustomer ? 0 : (corporateTaxRates?.sscl ?? 0);
    const vatRate = isTaxCustomer ? 0 : (corporateTaxRates?.vat ?? 0);

    return items.map((item) => {
        const corpItemId = item.corp_item_id || item.item_id || "";
        const qty = Number(item.corp_item_quantity ?? item.quantity ?? 0);
        const basePrice = Number(item.corp_item_price || 0);

        const itemDeliveryType = item.delivery_type || item.deliveryType || deliveryTypeRaw || "NORMAL";
        const itemSurchargePercent = resolveDeliverySurchargePercent(
            itemDeliveryType,
            customerServiceTypes,
            item.delivery_percentage ?? item.deliveryPercentage
        );

        const rate = computeLineFinalRateWithDelivery(basePrice, ssclRate, vatRate, itemSurchargePercent);
        const orderValue = parseFloat((rate * qty).toFixed(2));

        return {
            ...item,
            item_id: corpItemId,
            corp_item_id: corpItemId,
            item_name: item.corp_item_name ?? item.item_name,
            item_category_name: item.item_category_name ?? item.category_name,
            quantity: qty,
            service_type: item.service_type || "Washing",
            delivery_type: itemDeliveryType,
            rate,
            orderValue,
        };
    });
}

function findPriceListForDraftRow(priceList, order, itemTypes) {
    const itemInfo =
        itemTypes.find((it) => String(it.corp_item_auto_id) === String(order.item_id)) ||
        itemTypes.find(
            (it) =>
                String(it.item_type_id) === String(order.item_id) ||
                String(it.corp_item_id) === String(order.item_id)
        );
    const idCandidates = [
        order.item_id,
        order.corp_item_id,
        itemInfo?.corp_item_auto_id,
        itemInfo?.corp_item_id,
        itemInfo?.item_type_id,
    ].filter((x) => x != null && x !== "");

    let pl = null;
    for (const id of idCandidates) {
        pl = priceList.find(
            (p) =>
                String(p.corp_item_auto_id ?? "") === String(id) ||
                String(p.corp_item_id ?? "") === String(id) ||
                String(p.item_type_id ?? "") === String(id)
        );
        if (pl) break;
    }
    return { pl, itemInfo };
}

export function buildCollectionNoteLinesFromDraftRows({
    orders,
    customerPriceList,
    deliveryTypeRaw,
    customerServiceTypes,
    corporateTaxRates,
    itemTypes,
    taxType: _taxType,
    deliveryPercentageFallback,
    customer,
    vatNumber,
}) {
    if (!orders?.length) return [];

    const surchargePercent = resolveDeliverySurchargePercent(
        deliveryTypeRaw,
        customerServiceTypes,
        deliveryPercentageFallback
    );

    // Rule:
    // If Customer has a valid VAT number -> Show tax-exclusive rate (ssclRate = 0, vatRate = 0).
    // If Customer does not have a VAT number -> Show tax-inclusive rate (ssclRate = rates.sscl, vatRate = rates.vat).
    let hasVat = false;
    if (vatNumber !== undefined || customer !== undefined) {
        hasVat = hasCustomerVatNumber(vatNumber) || hasCustomerVatNumber(customer);
    } else if (_taxType !== undefined) {
        hasVat = hasCustomerVatNumber(_taxType) || !isNoTaxCustomerType(_taxType);
    }

    const ssclRate = hasVat ? 0 : (corporateTaxRates?.sscl ?? 0);
    const vatRate = hasVat ? 0 : (corporateTaxRates?.vat ?? 0);

    return orders.map((order) => {
        const { pl, itemInfo } = findPriceListForDraftRow(
            customerPriceList,
            order,
            itemTypes
        );
        const basePriceRaw = amountFromPriceListRow(pl);
        const basePrice = parseFloat(parseFloat(String(basePriceRaw)).toFixed(2));
        const qty = Number(order.quantity || 0);

        const finalRate = computeLineFinalRateWithDelivery(
            basePrice,
            ssclRate,
            vatRate,
            surchargePercent
        );

        const orderValue = parseFloat((finalRate * qty).toFixed(2));

        const corpItemIdStr =
            itemInfo?.item_type_id || order.corp_item_id || order.item_id || String(order.item_id);
        const resolvedServiceType = resolveServiceTypeFromLine(order, itemTypes, corpItemIdStr);

        return {
            ...order,
            corp_item_id: corpItemIdStr,
            item_id: corpItemIdStr,
            item_name: itemInfo?.item_type_name || order.item_name || "",
            service_type: resolvedServiceType,
            rate: finalRate,
            orderValue,
        };
    });
}

/**
 * Per-line unit rate and line total (same rules as collection note).
 * @param {object} item
 * @param {object} options — same as buildCollectionNoteLinesFromApiOrderItems except items
 */
export function getCalculatedRate(item, options) {
    const rows = buildCollectionNoteLinesFromApiOrderItems({
        ...options,
        items: [item],
    });
    const row = rows[0];
    const qty = Number(row?.quantity ?? item.corp_item_quantity ?? item.quantity ?? 0);
    const rate = Number(row?.rate ?? 0);
    const orderValue = Number(row?.orderValue ?? 0);
    return {
        rate: parseFloat(rate.toFixed(2)),
        orderValue: parseFloat(orderValue.toFixed(2)),
        quantity: qty,
    };
}
