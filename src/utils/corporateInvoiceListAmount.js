/**
 * Generated-invoice Amount / Transport Charge, recomputed from the invoice's own items the same
 * way the invoice bill prices them (per-line delivery-type surcharge from the customer's service
 * types, e.g. Urgent) — shared by the Daily/Period invoice lists and the Credit/Debit Notes
 * linked-invoice table so all three agree with the bill.
 */
import { hasCustomerVatNumber, resolveDeliverySurchargePercent } from "./corporateCollectionNotePricing";

export const computeInvoiceTransportCharge = (invoice, customerProfile, isPeriod = false) => {
    if (invoice.transport_charge !== undefined && invoice.transport_charge !== null && parseFloat(invoice.transport_charge) > 0) {
        return parseFloat(invoice.transport_charge) || 0;
    }
    const items = invoice.items || [];
    let transportRate = 0;
    const locations = customerProfile?.locations ?? customerProfile?.customer?.locations ?? [];
    
    if (Array.isArray(locations) && locations.length > 0) {
        const uniqueLocations = new Set();
        
        const invoiceLoc = invoice.delivered_location || invoice.deliveredLocation || invoice.place_of_supply || invoice.placeOfSupply;
        if (invoiceLoc && String(invoiceLoc).trim() !== "") {
            uniqueLocations.add(String(invoiceLoc).trim().toLowerCase());
        }
        
        items.forEach(it => {
            const itemLoc = it.delivered_location || it.deliveredLocation || it.place_of_supply || it.placeOfSupply;
            if (itemLoc && String(itemLoc).trim() !== "") {
                uniqueLocations.add(String(itemLoc).trim().toLowerCase());
            }
        });
        
        const normalizeLocName = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        uniqueLocations.forEach(locName => {
            const matchedLoc = locations.find(loc => 
                normalizeLocName(loc?.location_name) === normalizeLocName(locName)
            );
            if (matchedLoc) {
                transportRate += parseFloat(matchedLoc.transport_rate) || 0;
            }
        });

        if (transportRate === 0 && locations.length === 1) {
            transportRate = parseFloat(locations[0].transport_rate) || 0;
        }
    }
    
    if (transportRate === 0) {
        transportRate = parseFloat(invoice.transport_rate_per_trip || invoice.entry_transport_rate || invoice.transport_rate || 0);
    }
    
    const tripCount = invoice.trip_count !== undefined && invoice.trip_count !== null && Number(invoice.trip_count) > 0
        ? Number(invoice.trip_count)
        : (isPeriod ? (parseFloat(customerProfile?.customer_invoicing_period || customerProfile?.customer?.customer_invoicing_period || 1) || 1) : 1);

    return transportRate * tripCount;
};

export const computeInvoiceAmountFromItems = (invoice, customerProfile, { isPeriod = false } = {}) => {
    const hasVat = hasCustomerVatNumber(
        customerProfile?.customer_vat_number ??
        customerProfile?.vat_number ??
        customerProfile?.vat_no ??
        (customerProfile?.customer && (customerProfile.customer.customer_vat_number ?? customerProfile.customer.vat_number)) ??
        invoice.customer_vat_number ??
        invoice.vat_no
    );

    const transportCharge = computeInvoiceTransportCharge(invoice, customerProfile, isPeriod);
    const items = invoice.items || [];

    let laundryCharges = 0;
    if (items.length > 0) {
        const ssclRate = hasVat ? 0 : 2.5;
        const vatRate = hasVat ? 0 : 18;

        // Customer service types ([{ service_type: "Urgent", percentage }]) — source of each
        // delivery type's surcharge %, same as the invoice bill (buildInvoicePricedLinesFromGeneratedItems).
        let customerServiceTypes = customerProfile?.service_types ?? customerProfile?.customer?.service_types ?? [];
        if (typeof customerServiceTypes === "string") {
            try {
                customerServiceTypes = JSON.parse(customerServiceTypes);
            } catch {
                customerServiceTypes = [];
            }
        }
        if (!Array.isArray(customerServiceTypes)) customerServiceTypes = [];

        const pricedLines = items.map(it => {
            const qty = Number(it.delivered_qty || it.qty || 0);
            const basePrice = Number(it.corp_item_price || it.rate || 0);
            // Per-line surcharge from that line's own delivery type (e.g. Urgent), matched against
            // the customer's service types, falling back to the line's stored delivery_percentage —
            // previously this used only invoice.delivery_percentage (usually absent), so Urgent
            // lines were listed without their surcharge and the Amount disagreed with the bill.
            const surchargePercent = resolveDeliverySurchargePercent(
                it.delivery_type || it.deliveryType || invoice.delivery_type || invoice.deliveryType || "NORMAL",
                customerServiceTypes,
                it.delivery_percentage ?? it.deliveryPercentage ?? invoice.delivery_percentage
            );
            const ssclAmount = (basePrice / 0.975) * (ssclRate / 100);
            const totalSupply = basePrice + ssclAmount;
            const vatAmount = (totalSupply * vatRate) / 100;
            const ti = Number((totalSupply + vatAmount).toFixed(2));
            const finalRate = Number((ti + (ti * surchargePercent) / 100).toFixed(2));
            return {
                orderValue: Number((qty * finalRate).toFixed(2))
            };
        });
        laundryCharges = pricedLines.reduce((sum, it) => sum + it.orderValue, 0);
    } else if (invoice.sub_total !== undefined && invoice.sub_total !== null && Number(invoice.sub_total) > 0) {
        laundryCharges = parseFloat(invoice.sub_total) || 0;
    } else {
        if (!hasVat && (invoice.total_before_sscl || invoice.sub_total)) {
            return parseFloat(invoice.total_before_sscl || invoice.sub_total);
        }
        return Number(invoice.total_amount || invoice.final_grand_total || invoice.sub_total || invoice.cash_amount || 0);
    }

    const discountPct = Number(invoice.discount || 0);
    const discountVal = Number(((laundryCharges * discountPct) / 100).toFixed(2));
    const amountAfterDiscount = Number((laundryCharges - discountVal).toFixed(2));

    const totalBeforeSscl = Number((amountAfterDiscount + transportCharge).toFixed(2));
    if (!hasVat) {
        return totalBeforeSscl;
    } else {
        const ssclRatePct = 2.5;
        const vatRatePct = 18;
        const ssclAmount = Number(((totalBeforeSscl / 0.975) * (ssclRatePct / 100)).toFixed(2));
        const totalValueOfSupply = Number((totalBeforeSscl + ssclAmount).toFixed(2));
        const vatAmount = Number(((totalValueOfSupply * vatRatePct) / 100).toFixed(2));
        return Number((totalValueOfSupply + vatAmount).toFixed(2));
    }
};

