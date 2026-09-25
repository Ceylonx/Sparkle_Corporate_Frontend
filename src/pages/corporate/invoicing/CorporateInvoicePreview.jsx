import React, { forwardRef, useMemo, useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import logo from "../../../assets/logo.png";
import { computeCorporateTaxInvoiceSummary, grandTotalToAmountInWords, computeSsclVatFromBase } from "../../../utils/corporateTaxInvoiceMath";
import { computePeriodWindow, calendarDayLabel } from "../../../utils/periodInvoiceWindow";
import axios from "axios";

const DEFAULT_PAYMENT_TERMS = 'Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only';

function normalizeServiceType(raw) {
    const st = String(raw || "Washing").trim();
    const lower = st.toLowerCase();
    if (lower.includes("dry")) return "Dry Clean";
    if (lower.includes("press")) return "Pressing";
    return st.charAt(0).toUpperCase() + st.slice(1).toLowerCase();
}

function formatDeliveryType(val) {
    if (!val) return "Normal";
    const str = String(val).replace(/_/g, " ").trim().toLowerCase();
    return str.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatSignatureDateTime(rawDate) {
    if (!rawDate) return { dateStr: "", timeStr: "" };
    const d = new Date(rawDate);
    if (!Number.isFinite(d.getTime())) return { dateStr: "", timeStr: "" };
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    
    return {
        dateStr: `${yyyy}/${mm}/${dd}`,
        timeStr: `${hours}.${minutes} ${ampm}`
    };
}

function formatMoney(n) {
    const v = parseFloat(Number(n || 0).toFixed(2));
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPlainRate(n) {
    const num = Number(n || 0);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

/** Table / subtotal amounts like the reference: RS 3000.00 (no thousands grouping). */
function formatRsPlain(n) {
    return `RS ${Number(n || 0).toFixed(2)}`;
}

/** Percent text for labels e.g. 10 or 10.25 */
function formatPercentForLabel(p) {
    const v = Number(p ?? 0);
    if (!Number.isFinite(v)) return "0";
    if (Number.isInteger(v)) return String(v);
    const fixed = v.toFixed(2);
    return fixed.replace(/\.?0+$/, "") || "0";
}

function isPickupStyleInvoiceRef(s) {
    const t = String(s || "").trim();
    return /^PE_ORDER/i.test(t) || /^PE_/i.test(t);
}

/** Service type heading: WASHING, DRY CLEAN, PRESSING */
function serviceTypeHeading(serviceType) {
    const s = String(serviceType || "").trim();
    if (!s) return "WASHING";
    return s.toUpperCase();
}

/**
 * Header info row: label (bold, left) + colon + value (normal, right-aligned in remaining space).
 */
function TaxInvHeaderInfoRow({ label, value, valueClassName = "" }) {
    const labelText = String(label || "").trim();
    const withColon = labelText.endsWith(":") ? labelText : `${labelText}:`;
    return (
        <div
            className="tax-inv-header-info-row flex w-full min-w-0 items-baseline gap-x-1.5 uppercase"
            style={{ display: "flex", justifyContent: "flex-start" }}
        >
            <span className="shrink-0 text-left font-bold text-neutral-900">{withColon}</span>
            <span className={`min-w-0 flex-1 text-right font-normal normal-case break-words ${valueClassName}`.trim()}>
                {value}
            </span>
        </div>
    );
}

const DEFAULT_TERMS = 'Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only';

const DEFAULT_TAX_INVOICE_SUPPLIER = {
    companyName: "C L SOLUTIONS ( PVT ) LTD",
    vatNo: "108812540-7000",
    address: "NO:583/71, AUGUSTINE PREMATHIRATHNA ROAD",
    operationAddress: "NO 391, AVISSAWELLA ROAD, WELLAMPITIYA",
    hotline: "011-4701566/ 076-4660661",
};

const FALLBACK_SUPPLIER_EMAIL = "info@sparklelaundry.lk";

/** Vertical (rotated) text for the narrow per-day Order/Delivery/Room/Gate Pass cells in the
 * DAYS grid — same styling as CorporatePeriodInvoicePreview.jsx's verticalCellClass. */
const VERTICAL_DAY_CELL_CLASS =
    "max-h-[80px] min-h-[44px] w-[13px] max-w-[15px] mx-auto py-0.5 px-0 text-[5.5px] leading-tight print:max-h-[65px] print:min-h-[28px] print:w-[12px] print:max-w-[14px] print:text-[4.5px] text-center align-middle break-all whitespace-pre-wrap [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180";

/** Normalize a date-ish value to YYYY/MM/DD for header display. */
function formatHeaderDateSlash(raw) {
    if (raw == null || raw === "") return "";
    
    if (raw instanceof Date) {
        if (Number.isFinite(raw.getTime())) {
            const yyyy = raw.getFullYear();
            const mm = String(raw.getMonth() + 1).padStart(2, "0");
            const dd = String(raw.getDate()).padStart(2, "0");
            return `${yyyy}/${mm}/${dd}`;
        }
        return "";
    }

    // Convert input to a string
    let str = String(raw).trim();
    if (str.includes("T")) {
        str = str.split("T")[0];
    } else if (str.includes(" ")) {
        str = str.split(" ")[0];
    }
    
    // Replace all dashes with forward slashes
    return str.replace(/-/g, "/");
}

/**
 * Group priced lines by Delivery Note (CDN ID), then by service type and category.
 */
function buildSectionedData(lines) {
    const groupsMap = {};

    (lines || []).forEach((line) => {
        const serviceType = normalizeServiceType(line.service_type || "Washing");
        const deliveryType = String(line.delivery_type || line.deliveryType || "NORMAL").trim().toUpperCase();
        
        // Group key combining Service Type and Delivery Type
        const key = `${serviceType}::${deliveryType}`;

        if (!groupsMap[key]) {
            groupsMap[key] = {
                serviceType,
                deliveryType,
                items: []
            };
        }
        groupsMap[key].items.push(line);
    });

    const groups = Object.values(groupsMap);

    // Sort by Service Type priority, then by Delivery Type
    const priority = { Washing: 1, Pressing: 2, "Dry Clean": 3 };
    groups.sort((a, b) => {
        const priorityA = priority[a.serviceType] || 99;
        const priorityB = priority[b.serviceType] || 99;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        return a.deliveryType.localeCompare(b.deliveryType);
    });

    return groups.map((group) => {
        const categoryGroups = {};
        let globalNo = 1;
        group.items.forEach((item) => {
            const categoryName = String(item.item_category_name || "ROOM LINEN").trim() || "ROOM LINEN";
            if (!categoryGroups[categoryName]) {
                categoryGroups[categoryName] = [];
            }
            
            const qty = item.qty !== undefined ? item.qty : Number(item.quantity || item.qty || 0);
            const rate = item.rate !== undefined ? item.rate : Number(item.rate || 0);
            const orderValue = item.orderValue !== undefined ? Number(item.orderValue) : (qty * rate);

            // Same item can be split across multiple delivery notes on one invoice (e.g. a
            // partial delivery followed by the rest later) — merge those into a single line
            // instead of showing the same item code/name twice.
            const mergeKey = String(item.corp_item_id || item.item_id || item.item_name || "").trim().toLowerCase();
            const existing = categoryGroups[categoryName].find((row) => row.mergeKey === mergeKey);
            if (existing) {
                const mergedQty = existing.qty + qty;
                const mergedValue = existing.orderValue + orderValue;
                existing.qty = mergedQty;
                existing.orderValue = mergedValue;
                existing.rate = mergedQty > 0 ? mergedValue / mergedQty : existing.rate;
            } else {
                categoryGroups[categoryName].push({
                    ...item,
                    qty,
                    rate,
                    orderValue,
                    mergeKey,
                    noStr: String(globalNo++).padStart(2, "0"),
                });
            }
        });

        return {
            serviceType: group.serviceType,
            deliveryType: group.deliveryType,
            categories: categoryGroups
        };
    });
}

function startOfLocalDay(d) {
    const x = new Date(d);
    return Number.isFinite(x.getTime()) ? new Date(x.getFullYear(), x.getMonth(), x.getDate()) : null;
}

function dayIndexForDate(dateMs, periodStartDay, numDays) {
    if (periodStartDay == null || !Number.isFinite(dateMs)) return 1;
    const day = startOfLocalDay(dateMs);
    if (!day) return 1;
    const diffDays = Math.round((day - periodStartDay) / 86400000) + 1;
    return Math.min(numDays, Math.max(1, diffDays));
}

/**
 * Pure display regrouping of already-priced lines into a "DAYS" grid pivot (Period Invoicing
 * customers) — matches the visual layout of CorporatePeriodInvoicePreview.jsx, but never
 * re-prices anything: it just buckets the same rate/orderValue already on each line by which
 * day of the invoicing cycle it belongs to.
 */
function buildPeriodDayPivot(lines, configuredNumDays) {
    let earliestDay = null;
    (lines || []).forEach((l) => {
        if (!l?.pickup_date) return;
        const d = startOfLocalDay(l.pickup_date);
        if (d && (!earliestDay || d < earliestDay)) earliestDay = d;
    });
    // Anchor the grid to the invoicing cycle's calendar boundary (day 1 or, for a 15-day
    // period, day 16) rather than to whichever line happens to be earliest — otherwise a
    // day's column shifts whenever the first delivery of the cycle isn't day 1 of the cycle.
    // For a 15-day period, numDays also varies with the second half's real month length
    // (28-31 days) instead of always being a fixed 15 columns.
    const { periodStartDay, numDays } = computePeriodWindow(earliestDay, configuredNumDays);
    const dayNumbers = Array.from({ length: numDays }, (_, i) => i + 1);

    // Per-day Order No / Delivery Note No / Room No / Gate Pass No — these fields already come
    // through on pricedLines rows via the raw item spread.
    const cells = dayNumbers.map(() => ({ orderIds: new Set(), deliveryNoteIds: new Set(), roomNos: new Set(), gatePasses: new Set() }));
    (lines || []).forEach((line) => {
        const di = dayIndexForDate(line.pickup_date ? new Date(line.pickup_date).getTime() : NaN, periodStartDay, numDays);
        const cell = cells[di - 1];
        if (!cell) return;
        if (line.pickup_entry_id) cell.orderIds.add(String(line.pickup_entry_id));
        if (line.delivery_id) cell.deliveryNoteIds.add(String(line.delivery_id));
        if (line.room_no && line.room_no !== "—" && line.room_no !== "---") cell.roomNos.add(String(line.room_no));
        if (line.gate_pass_no && line.gate_pass_no !== "—" && line.gate_pass_no !== "---") cell.gatePasses.add(String(line.gate_pass_no));
    });
    const headerByDay = cells.map((c) => ({
        orderIds: [...c.orderIds].join("\n"),
        deliveryNoteIds: [...c.deliveryNoteIds].join("\n"),
        roomNos: [...c.roomNos].join("\n"),
        gatePasses: [...c.gatePasses].join("\n"),
    }));

    // Rows keyed by service type + delivery type + item, day-bucketed quantities, value-weighted rate
    const rowMap = new Map();
    (lines || []).forEach((line) => {
        const corpId = String(line.corp_item_id || line.item_id || "").trim();
        if (!corpId) return;
        const serviceType = normalizeServiceType(line.service_type || "Washing");
        const deliveryType = String(line.delivery_type || "NORMAL").trim().toUpperCase();
        const key = `${serviceType}::${deliveryType}::${corpId}`;
        let row = rowMap.get(key);
        if (!row) {
            row = {
                corp_item_id: corpId,
                item_name: line.item_name || "-",
                item_category_name: String(line.item_category_name || "ROOM LINEN").trim() || "ROOM LINEN",
                service_type: serviceType,
                delivery_type: deliveryType,
                dayQty: {},
                valueSum: 0,
            };
            rowMap.set(key, row);
        }
        const qty = Number(line.qty ?? line.quantity ?? 0);
        const val = Number(line.orderValue) || 0;
        const di = dayIndexForDate(line.pickup_date ? new Date(line.pickup_date).getTime() : NaN, periodStartDay, numDays);
        row.dayQty[di] = (row.dayQty[di] || 0) + qty;
        row.valueSum += val;
    });

    const rows = [...rowMap.values()].map((r) => {
        const totalQty = dayNumbers.reduce((s, d) => s + (r.dayQty[d] || 0), 0);
        return { ...r, totalQty, rate: totalQty > 0 ? parseFloat((r.valueSum / totalQty).toFixed(2)) : 0, amount: parseFloat(r.valueSum.toFixed(2)) };
    });

    const byGroup = {};
    rows.forEach((r) => {
        const key = `${r.service_type}::${r.delivery_type}`;
        if (!byGroup[key]) byGroup[key] = { serviceType: r.service_type, deliveryType: r.delivery_type, items: [] };
        byGroup[key].items.push(r);
    });
    const priority = { Washing: 1, Pressing: 2, "Dry Clean": 3 };
    const serviceBlocks = Object.values(byGroup)
        .sort((a, b) => (priority[a.serviceType] || 99) - (priority[b.serviceType] || 99) || a.deliveryType.localeCompare(b.deliveryType))
        .map((g) => {
            const categories = {};
            g.items.forEach((row) => {
                if (!categories[row.item_category_name]) categories[row.item_category_name] = [];
                categories[row.item_category_name].push(row);
            });
            return { serviceType: g.serviceType, deliveryType: g.deliveryType, categories, sortedCats: Object.keys(categories).sort() };
        });

    return { dayNumbers, headerByDay, serviceBlocks, periodStartDay };
}

/**
 * @param {object} props
 * @param {object} props.order
 * @param {object|null} props.customerProfile
 * @param {Array<object>} props.pricedLines — from buildCollectionNoteLinesFromApiOrderItems + pickup_label
 * @param {object} props.supplierLegal — optional strings from corporate settings (no hardcoded fake data)
 * @param {number} props.ssclRatePct
 * @param {number} props.vatRatePct
 * @param {number} props.effectiveDiscountPercent
 * @param {number} [props.transportMultiplierOverride] — e.g. daily invoice: rate × invoicing period
 * @param {object|null} [props.matchedCustomer] — row from get-all-corporate-customers matched to order.customer_id
 * @param {boolean} [props.corporateCustomerListLoading] — while list is loading, show Loading… for list-driven fields when tracking has customer_id
 * @param {string|null} [props.checkedBySignature] — data URL, same pattern as delivery note confirmation signature
 * @param {string|null} [props.checkedByUser]
 * @param {string|null} [props.approvedByUser]
 */
const CorporateInvoicePreview = forwardRef(function CorporateInvoicePreview(
    {
        order,
        originalResponses = [],
        customerProfile,
        matchedCustomer: propMatchedCustomer,
        corporateCustomerListLoading = false,
        pricedLines,
        supplierLegal,
        ssclRatePct,
        vatRatePct,
        effectiveDiscountPercent,
        transportMultiplierOverride,
        checkedBySignature = null,
        checkedByUser = null,
        approvedByUser = null,
        approvedBySignature = null,
        preparationSignature = null,
        preparedByName = null,
        noteCreatedAt = null,
        noteActivityLog = null,
        isCancelled = false,
        isCreditNote = false,
        isDebitNote = false,
        noteNo = "",
        noteDate = "",
        noteReason = "",
        adjustedItems = null,
        manualLaundryCharges = null,
        additionalTransportCharge = 0,
        realInvoiceId = null,
        notes = null,
        terms_and_conditions = null,
        onEditTransport = null,
        isTripCountEdited = false,
        // Credit/Debit Notes "Change Invoice Items" mode already shows Invoice Number inside
        // the item table's own metadata rows, so the summary box's copy is redundant there.
        // Defaults to false so every other caller (Enter Amount Manually, View Note, the
        // regular Invoicing Bill Preview, etc.) keeps showing it as before.
        hideInvoiceNumberInSummary = false,
    },
    ref
) {
    const orderNo = (order?.pickup_entry_id && order.pickup_entry_id !== "—" ? order.pickup_entry_id : "") ||
        (originalResponses && originalResponses.length > 0
            ? [...new Set(originalResponses.map(o => o.pickup_entry_id || o.order_no || o.order_id).filter(v => v && String(v).trim() !== "—"))].join(", ")
            : "") ||
        order?.order_no ||
        order?.invoice_id ||
        "—";
    const deliveryNoteNo = (order?.delivery_id && order.delivery_id !== "—" ? order.delivery_id : "") ||
        (order?.delivery_note_no && order.delivery_note_no !== "—" ? order.delivery_note_no : "") ||
        (originalResponses && originalResponses.length > 0
            ? [...new Set(originalResponses.map(o => o.delivery_id || o.delivery_note_no || o.delivery_note_id).filter(v => v && String(v).trim() !== "—"))].join(", ")
            : "") ||
        "—";
    const roomNo = (order?.room_no && order.room_no !== "—" && order.room_no !== "---" ? order.room_no : "") ||
        (originalResponses && originalResponses.length > 0
            ? [...new Set(originalResponses.map(o => o.room_no || o.roomNo || o.pickup_entry?.room_no).filter(v => v && String(v).trim() !== "—" && String(v).trim() !== "---"))].join(", ")
            : "") ||
        "—";
    const gatePassNo = (order?.gate_pass_no && order.gate_pass_no !== "—" && order.gate_pass_no !== "---" ? order.gate_pass_no : "") ||
        (originalResponses && originalResponses.length > 0
            ? [...new Set(originalResponses.map(o => o.gate_pass_no || o.gatePassNo || o.pickup_entry?.gate_pass_no).filter(v => v && String(v).trim() !== "—" && String(v).trim() !== "---"))].join(", ")
            : "") ||
        "—";
    const deliveryType = order?.delivery_type || order?.deliveryType || "NORMAL";

    const [fetchedCustomers, setFetchedCustomers] = useState([]);
    const [isLocalListLoading, setIsLocalListLoading] = useState(false);

    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                setIsLocalListLoading(true);
                const userId = localStorage.getItem("userId");
                const baseUrl = import.meta.env.VITE_SERVER_API;
                const response = await axios.get(`${baseUrl}/customer/get-all-corporate-customers/${userId}`);
                const list = response?.data?.customers
                    || response?.data?.corporate_customers
                    || response?.data?.allCustomers
                    || response?.data?.data
                    || [];
                setFetchedCustomers(list);
            } catch (error) {
                console.error("Error fetching corporate customers in preview:", error);
            } finally {
                setIsLocalListLoading(false);
            }
        };
        fetchCustomers();
    }, []);

    const matchedCustomerData = useMemo(() => {
        const targetId = order?.customer_id ?? order?.customer_auto_id;
        if (!targetId || !fetchedCustomers.length) return null;
        return fetchedCustomers.find(c => String(c.customer_id) === String(targetId) || String(c.customer_auto_id) === String(targetId));
    }, [fetchedCustomers, order]);

    const matchedCustomer = propMatchedCustomer || matchedCustomerData;
    const corporateCustomerListLoadingLocal = corporateCustomerListLoading || isLocalListLoading;

    const placeOfSupply = useMemo(() => {
        return order?.delivered_location || order?.deliveredLocation || order?.place_of_supply || order?.placeOfSupply || "";
    }, [order]);

    const isNoTaxCustomer = useMemo(() => {
        const raw =
            matchedCustomer?.tax_type ??
            customerProfile?.tax_type ??
            (customerProfile?.customer && typeof customerProfile.customer === "object"
                ? customerProfile.customer.tax_type
                : null) ??
            order?.tax_type ??
            "";
        return String(raw).trim().toLowerCase() === "no tax";
    }, [
        matchedCustomer?.tax_type,
        customerProfile?.tax_type,
        customerProfile?.customer,
        order?.tax_type,
    ]);

    const customerHeaderDisplay = useMemo(() => {
        const raw = customerProfile;
        const c =
            raw && typeof raw === "object" && raw.customer && typeof raw.customer === "object"
                ? raw.customer
                : raw || {};
        const pick = (...parts) => {
            for (const p of parts) {
                if (p == null) continue;
                const s = String(p).trim();
                if (s !== "") return s;
            }
            return "---";
        };
        const idRaw = c.customer_auto_id ?? order?.customer_id ?? c.customer_id;
        const idStr = idRaw != null && String(idRaw).trim() !== "" ? String(idRaw).trim() : "";
        return {
            companyName: pick(
                c.customer_company_name,
                c.company_name,
                order?.customer_company_name,
                order?.company_name
            ),
            vatNo: pick(c.customer_vat_number, order?.customer_vat_number, order?.vat_no),
            customerId: idStr || "---",
            address: pick(c.customer_address, order?.customer_address, c.address),
            phone: pick(c.customer_phone, c.phone_number, order?.customer_phone, order?.phone_number),
            email: pick(c.customer_email, c.email, order?.customer_email, order?.email),
            placeOfSupply: placeOfSupply || "---",
        };
    }, [customerProfile, order, pricedLines, placeOfSupply]);

    const trackingCustomerId = order?.customer_id ?? order?.customer_auto_id;
    const trackingCustomerIdStr =
        trackingCustomerId != null && String(trackingCustomerId).trim() !== ""
            ? String(trackingCustomerId).trim()
            : "";
    const showListMatchLoading =
        Boolean(corporateCustomerListLoadingLocal) && trackingCustomerIdStr !== "" && matchedCustomer == null;

    const listFetchSettled = corporateCustomerListLoadingLocal === false;
    const noListMatchAfterFetch =
        listFetchSettled && trackingCustomerIdStr !== "" && matchedCustomer == null;

    const listOrFallback = (listValue, headerFallback) => {
        if (matchedCustomer != null && typeof matchedCustomer === "object") {
            const v = listValue;
            if (v != null && String(v).trim() !== "") return String(v).trim();
            return "---";
        }
        if (showListMatchLoading) return "Loading...";
        if (noListMatchAfterFetch) return "---";
        return headerFallback;
    };

    const companyNameDisplay = listOrFallback(
        matchedCustomer?.company_name ?? matchedCustomer?.customer_company_name,
        customerHeaderDisplay.companyName
    );
    const vatNoDisplay = listOrFallback(
        matchedCustomer?.customer_vat_number,
        customerHeaderDisplay.vatNo
    );
    const hasVatNo = useMemo(() => {
        const cleaned = String(vatNoDisplay || "").trim();
        return cleaned !== "" && cleaned !== "---" && cleaned !== "-" && cleaned !== "0000" && cleaned !== "00000";
    }, [vatNoDisplay]);

    const shouldShowAsTaxInvoice = useMemo(() => {
        return Boolean(hasVatNo);
    }, [hasVatNo]);

    const addressDisplay = listOrFallback(
        matchedCustomer?.customer_address,
        customerHeaderDisplay.address
    );
    const phoneDisplay = listOrFallback(
        matchedCustomer?.customer_phone,
        customerHeaderDisplay.phone
    );
    const emailDisplay = listOrFallback(
        matchedCustomer?.customer_email,
        customerHeaderDisplay.email
    );

    const taxInvoiceNo =
        realInvoiceId ||
        order?.realInvoiceId ||
        order?.tax_invoice_no ||
        order?.invoice_no ||
        (order?.invoice_id && !isPickupStyleInvoiceRef(order?.invoice_id) ? order?.invoice_id : "") ||
        "";

    const invoiceDateStr = (() => {
        const raw = order?.invoice_date || order?.invoicing_date || order?.created_at || order?.printed_at;
        return formatHeaderDateSlash(raw);
    })();

    const parsedAdjustedItems = useMemo(() => {
        if (!adjustedItems) return null;
        let items = [];
        try {
            items = typeof adjustedItems === 'string' ? JSON.parse(adjustedItems) : adjustedItems;
        } catch (e) {
            console.error("Failed to parse adjustedItems:", e);
            return null;
        }

        if (isCreditNote) {
            return items
                .map(item => {
                    const returnedQty = Number(item.quantity || 0) - Number(item.adjusted_quantity || 0);
                    return {
                        ...item,
                        adjusted_quantity: returnedQty,
                        unit_price: item.unit_price || 0,
                    };
                })
                .filter(item => item.adjusted_quantity > 0);
        }
        return items;
    }, [adjustedItems, isCreditNote]);

    const serviceType = useMemo(() => {
        const unique = new Set();
        (pricedLines || []).forEach(line => {
            if (line.service_type) {
                unique.add(normalizeServiceType(line.service_type));
            }
        });
        return unique.size > 0 ? Array.from(unique).join(", ").toUpperCase() : "WASHING";
    }, [pricedLines]);

    const isScenarioB = useMemo(() => {
        if (isCreditNote || isDebitNote) return true;
        if (!parsedAdjustedItems || parsedAdjustedItems.length === 0) return false;
        // Verify if any quantity actually changed
        return parsedAdjustedItems.some(item => Number(item.adjusted_quantity) !== Number(item.quantity));
    }, [parsedAdjustedItems, isCreditNote, isDebitNote]);

    const activeLines = isScenarioB ? parsedAdjustedItems : pricedLines;

    const adjustedActiveLines = useMemo(() => {
        return (activeLines || []).map(line => {
            const qty = isScenarioB
                ? Number(line.adjusted_quantity || 0)
                : Number(line.qty || line.quantity || 0);
            const rawRate = isScenarioB
                ? Number(line.unit_price || 0)
                : Number(line.rate || 0);

            let taxExclRate = rawRate;
            let taxInclRate = rawRate;

            if (hasVatNo) {
                taxExclRate = rawRate;
                taxInclRate = Number((rawRate * 1.18 / 0.975).toFixed(2));
            } else {
                taxInclRate = rawRate;
                taxExclRate = Number((rawRate * 0.975 / 1.18).toFixed(2));
            }

            const taxExclAmount = Number((qty * taxExclRate).toFixed(2));
            const taxInclAmount = Number((qty * taxInclRate).toFixed(2));

            return {
                ...line,
                qty,
                taxExclRate,
                taxInclRate,
                taxExclAmount,
                taxInclAmount,
            };
        });
    }, [activeLines, isScenarioB, hasVatNo]);

    const adjustedServiceBlocks = useMemo(() => {
        if (!parsedAdjustedItems) return [];
        
        // Group by service type
        const byService = {};
        parsedAdjustedItems.forEach((item) => {
            const st = normalizeServiceType(item.service_type || "Washing");
            if (!byService[st]) {
                byService[st] = [];
            }
            byService[st].push(item);
        });

        // For each service type, group by category
        return Object.keys(byService).map((st) => {
            const itemsInService = byService[st];
            const categories = {};
            let globalNo = 1;
            
            itemsInService.forEach((item) => {
                const cat = String(item.item_category_name || "ROOM LINEN").trim();
                if (!categories[cat]) {
                    categories[cat] = [];
                }
                categories[cat].push({
                    ...item,
                    noStr: String(globalNo++).padStart(2, "0"),
                });
            });

            return {
                serviceType: st,
                deliveryType: itemsInService[0]?.delivery_type || "NORMAL",
                categories,
            };
        });
    }, [parsedAdjustedItems]);

    const laundryCharges = useMemo(() => {
        if (manualLaundryCharges !== undefined && manualLaundryCharges !== null) {
            return parseFloat(Number(manualLaundryCharges).toFixed(2));
        }
        return parseFloat(
            adjustedActiveLines.reduce((sum, line) => {
                if (shouldShowAsTaxInvoice) {
                    return sum + line.taxExclAmount;
                } else {
                    return sum + (isScenarioB ? (line.qty * line.unit_price) : (line.taxInclAmount ?? (line.qty * line.taxInclRate)));
                }
            }, 0).toFixed(2)
        );
    }, [adjustedActiveLines, shouldShowAsTaxInvoice, isScenarioB, manualLaundryCharges]);

    const damageDeduction = useMemo(() => {
        const seenOrderItems = new Set();
        return parseFloat(
            adjustedActiveLines.reduce((sum, line) => {
                const key = line.order_item_auto_id ?? `${line.pickup_entry_id || ""}::${line.corp_item_id || line.item_id || ""}`;
                if (seenOrderItems.has(key)) return sum;
                seenOrderItems.add(key);
                const itemDamageQty = Number(line.damaged_qty || line.damage_quantity || 0);
                const itemRate = shouldShowAsTaxInvoice ? line.taxExclRate : line.taxInclRate;
                return sum + (itemDamageQty * itemRate);
            }, 0).toFixed(2)
        );
    }, [adjustedActiveLines, shouldShowAsTaxInvoice]);

    const invoiceType = useMemo(() => {
        if (matchedCustomer) {
            if (matchedCustomer.customer_invoice_type != null) return matchedCustomer.customer_invoice_type;
            if (matchedCustomer.customer?.customer_invoice_type != null) return matchedCustomer.customer.customer_invoice_type;
        }
        if (customerProfile) {
            if (customerProfile.customer_invoice_type != null) return customerProfile.customer_invoice_type;
            if (customerProfile.customer?.customer_invoice_type != null) return customerProfile.customer.customer_invoice_type;
        }
        return "";
    }, [matchedCustomer, customerProfile]);

    const invoicingPeriod = useMemo(() => {
        if (matchedCustomer) {
            if (matchedCustomer.customer_invoicing_period != null) return matchedCustomer.customer_invoicing_period;
            if (matchedCustomer.customer?.customer_invoicing_period != null) return matchedCustomer.customer.customer_invoicing_period;
        }
        if (customerProfile) {
            if (customerProfile.customer_invoicing_period != null) return customerProfile.customer_invoicing_period;
            if (customerProfile.customer?.customer_invoicing_period != null) return customerProfile.customer.customer_invoicing_period;
        }
        return 1;
    }, [matchedCustomer, customerProfile]);

    const activeLocations = useMemo(() => {
        if (matchedCustomer) {
            if (Array.isArray(matchedCustomer.locations)) return matchedCustomer.locations;
            if (Array.isArray(matchedCustomer.customer?.locations)) return matchedCustomer.customer.locations;
        }
        if (customerProfile) {
            if (Array.isArray(customerProfile.locations)) return customerProfile.locations;
            if (Array.isArray(customerProfile.customer?.locations)) return customerProfile.customer.locations;
        }
        return [];
    }, [matchedCustomer, customerProfile]);

    const locationRate = useMemo(() => {
        const locations = matchedCustomer?.locations ?? customerProfile?.locations ?? [];
        const orderLoc = String(order?.place_of_supply || order?.placeOfSupply || order?.delivered_location || order?.deliveredLocation || "").trim().toLowerCase();
        const normalizeLocName = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        
        const matchedLoc = locations.find(loc => 
            normalizeLocName(loc?.location_name) === normalizeLocName(orderLoc)
        );
        
        if (matchedLoc) {
            return parseFloat(matchedLoc.transport_rate) || 0;
        }
        
        if (locations.length === 1) {
            return parseFloat(locations[0].transport_rate) || 0;
        }
        
        return parseFloat(order?.entry_transport_rate) || 0;
    }, [order, matchedCustomer, customerProfile]);

    // Manual "Transport Charge" typed on the Credit/Debit Note creation form — a flat add-on, so
    // it's applied AFTER any period-based transport multiplier rather than folded into a rate.
    const extraTransportCharge = parseFloat(additionalTransportCharge) || 0;

    const summary = useMemo(() => {
        const isDaily = String(invoiceType || "").toLowerCase().includes("daily");
        const finalMultiplier = transportMultiplierOverride !== undefined && transportMultiplierOverride !== null
            ? parseFloat(transportMultiplierOverride)
            : (isDaily ? 1 : parseFloat(invoicingPeriod || 1));
        const extraTransport = extraTransportCharge;

        // A Debit Note's Transport Rate is exactly what's saved on the note (or being typed on
        // its creation form) — never the invoice's own location/trip-based auto-calculated rate,
        // and never multiplied by the invoicing period (it's a flat charge, not a per-trip rate).
        // Its amount also never carries the customer's invoice discount — a Debit Note charges an
        // extra amount on top of the invoice, so discounting it would be discounting a charge that
        // was never part of the original discounted invoice total.
        if (isDebitNote) {
            return computeCorporateTaxInvoiceSummary({
                laundryCharges: laundryCharges - damageDeduction,
                customerDiscountPct: 0,
                transportRate: extraTransport,
                customerInvoiceType: isDaily ? "Daily Invoice" : "Period Invoice",
                invoicingPeriod: 1,
                ssclRatePct: shouldShowAsTaxInvoice ? (ssclRatePct || 2.5) : 0,
                vatRatePct: shouldShowAsTaxInvoice ? (vatRatePct || 18) : 0,
                transportMultiplierOverride: 1,
            });
        }

        // Priority 1: If realInvoiceId is present (View Mode) AND order.transport_charge is available, and not edited in session
        if (realInvoiceId && order && order.transport_charge !== undefined && order.transport_charge !== null && !isTripCountEdited) {
            const dbTransport = (parseFloat(order.transport_charge) || 0) + extraTransport;
            const dbSubTotal = laundryCharges;
            const calculatedDiscPct = order.display_discount_percent !== undefined && order.display_discount_percent !== null
                ? parseFloat(order.display_discount_percent)
                : (parseFloat(order.discount) || 0);
            const isTaxCalculations = hasVatNo;

            return computeCorporateTaxInvoiceSummary({
                laundryCharges: dbSubTotal,
                customerDiscountPct: calculatedDiscPct,
                transportRate: dbTransport,
                customerInvoiceType: isDaily ? "Daily Invoice" : "Period Invoice",
                invoicingPeriod: 1,
                ssclRatePct: isTaxCalculations ? (ssclRatePct || 2.5) : 0,
                vatRatePct: isTaxCalculations ? (vatRatePct || 18) : 0,
                transportMultiplierOverride: 1,
            });
        }

        // Priority 2/3: Default / manual override calculation
        const base = computeCorporateTaxInvoiceSummary({
            laundryCharges: laundryCharges - damageDeduction,
            customerDiscountPct: effectiveDiscountPercent,
            transportRate: locationRate,
            customerInvoiceType: isDaily ? "Daily Invoice" : "Period Invoice",
            invoicingPeriod: parseFloat(invoicingPeriod || 1),
            ssclRatePct: shouldShowAsTaxInvoice ? (ssclRatePct || 2.5) : 0,
            vatRatePct: shouldShowAsTaxInvoice ? (vatRatePct || 18) : 0,
            transportMultiplierOverride: finalMultiplier,
        });
        if (!extraTransport) return base;

        // extraTransport is a flat add-on (not multiplied by invoicing period like the
        // location-based transport rate above), so it's folded in after computeCorporateTaxInvoiceSummary
        // rather than into transportRate — then SSCL/VAT/grand total are recomputed on top of it
        // using the same cascade the util applies internally.
        const transportCharge = parseFloat((base.transportCharge + extraTransport).toFixed(2));
        const totalBeforeSscl = parseFloat((base.totalBeforeSscl + extraTransport).toFixed(2));
        const ssclAmount = parseFloat(((totalBeforeSscl / 0.975) * (base.ssclRatePct / 100)).toFixed(2));
        const totalValueOfSupply = parseFloat((totalBeforeSscl + ssclAmount).toFixed(2));
        const vatAmount = parseFloat(((totalValueOfSupply * base.vatRatePct) / 100).toFixed(2));
        const grandTotal = parseFloat((totalValueOfSupply + vatAmount).toFixed(2));

        return {
            ...base,
            transportCharge,
            totalBeforeSscl,
            ssclAmount,
            totalValueOfSupply,
            vatAmount,
            grandTotal,
            amountInWords: grandTotalToAmountInWords(grandTotal),
        };
    }, [
        laundryCharges,
        damageDeduction,
        effectiveDiscountPercent,
        locationRate,
        invoiceType,
        invoicingPeriod,
        ssclRatePct,
        vatRatePct,
        transportMultiplierOverride,
        additionalTransportCharge,
        isDebitNote,
        realInvoiceId,
        order,
        isTripCountEdited,
        shouldShowAsTaxInvoice,
        hasVatNo,
        matchedCustomer,
        customerProfile,
    ]);

    // Period Invoicing customer detection — same fallback chain as isNoTaxCustomer above, just
    // reading customer_invoice_type instead of tax_type. Drives the DAYS-grid item table below.
    const isPeriodInvoice = useMemo(() => {
        const raw =
            matchedCustomer?.customer_invoice_type ??
            customerProfile?.customer_invoice_type ??
            (customerProfile?.customer && typeof customerProfile.customer === "object"
                ? customerProfile.customer.customer_invoice_type
                : null) ??
            order?.customer_invoice_type ??
            "";
        return String(raw).trim().toLowerCase().includes("period");
    }, [
        matchedCustomer?.customer_invoice_type,
        customerProfile?.customer_invoice_type,
        customerProfile?.customer,
        order?.customer_invoice_type,
    ]);

    const numDaysForPeriod = useMemo(() => {
        const raw =
            matchedCustomer?.customer_invoicing_period ??
            customerProfile?.customer_invoicing_period ??
            customerProfile?.customer?.customer_invoicing_period;
        const p = Math.floor(Number(raw));
        const n = Number.isFinite(p) && p > 0 ? p : 15;
        return Math.min(30, Math.max(1, n));
    }, [
        matchedCustomer?.customer_invoicing_period,
        customerProfile?.customer_invoicing_period,
        customerProfile?.customer,
    ]);

    // Credit Note tax-registration check: VAT assigned in the customer's tax list, or a valid VAT
    // number on file. Kept separate from isNoTaxCustomer (tax_type string) since Credit Note
    // generation is driven by assigned_taxes / vat_number specifically, per the customer profile.
    const isCustomerVatRegistered = useMemo(() => {
        const pickAssignedTaxes = (obj) => (obj && Array.isArray(obj.assigned_taxes) ? obj.assigned_taxes : null);
        const assignedTaxes =
            pickAssignedTaxes(matchedCustomer) ??
            pickAssignedTaxes(customerProfile) ??
            pickAssignedTaxes(customerProfile?.customer) ??
            [];
        const hasVatAssigned = assignedTaxes.some(
            (t) => String(t?.tax_name || t?.name || "").trim().toUpperCase() === "VAT"
        );

        const rawVatNumber = String(
            matchedCustomer?.customer_vat_number ??
            customerProfile?.customer_vat_number ??
            customerProfile?.customer?.customer_vat_number ??
            order?.customer_vat_number ??
            order?.vat_no ??
            ""
        ).trim();
        const hasValidVatNumber = rawVatNumber !== "" && rawVatNumber !== "---";

        return hasVatAssigned || hasValidVatNumber;
    }, [matchedCustomer, customerProfile, order]);

    // Credit Note tax breakdown: SSCL -> Total Value of Supply -> VAT -> Grand Total, computed
    // directly off "Total" (laundryCharges, the credited amount) with no discount/transport step —
    // Credit Notes don't carry a Transport Charge. Always computed (both VAT and non-VAT
    // customers) — only its *display* is conditional.
    const creditNoteTaxBreakdown = useMemo(
        () => computeSsclVatFromBase(laundryCharges, ssclRatePct, vatRatePct),
        [laundryCharges, ssclRatePct, vatRatePct]
    );

    const amountInWordsDisplay = useMemo(() => {
        if (isCreditNote) {
            // Both VAT and non-VAT Credit Notes state the tax-inclusive grand total in words —
            // creditNoteTaxBreakdown is computed unconditionally off laundryCharges + system
            // SSCL/VAT rates, so this is correct for either case even though only VAT-registered
            // customers see the SSCL/VAT breakdown rows themselves.
            return creditNoteTaxBreakdown.amountInWords;
        }
        if (!hasVatNo) {
            return grandTotalToAmountInWords(summary.totalBeforeSscl);
        }
        return summary.amountInWords || "";
    }, [isCreditNote, laundryCharges, hasVatNo, summary.amountInWords, summary.totalBeforeSscl]);



    const globalMetadata = useMemo(() => {
        const pickVal = (o, keys) => {
            if (!o || typeof o !== "object") return "";
            for (const k of keys) {
                const v = o[k] ?? o.pickup_entry?.[k];
                if (v != null && String(v).trim() !== "" && String(v).trim() !== "—" && String(v).trim() !== "---") {
                    return String(v).trim();
                }
            }
            return "";
        };

        const allOrderNos = [...new Set(
            (originalResponses || [])
                .map((o) => pickVal(o, ["pickup_entry_id", "order_no", "order_id", "invoice_id"]))
                .filter(Boolean)
        )].join(", ");

        const allDeliveryNoteNos = [...new Set(
            (originalResponses || [])
                .map((o) => pickVal(o, ["delivery_note_no", "delivery_note_id", "delivery_id"]))
                .filter(Boolean)
        )].join(", ");

        const allRoomNos = [...new Set(
            (originalResponses || [])
                .map((o) => pickVal(o, ["room_no", "roomNo", "room_number"]))
                .filter(Boolean)
        )].join(", ");

        const allGatePassNos = [...new Set(
            (originalResponses || [])
                .map((o) => pickVal(o, ["gate_pass_no", "gatePassNo", "gate_pass", "gate_pass_number"]))
                .filter(Boolean)
        )].join(", ");

        const orderIds = new Set();
        const deliveryIds = new Set();
        const roomNos = new Set();
        const gatePassNos = new Set();

        (activeLines || []).forEach((line) => {
            const oNo = line.pickup_entry_id || line.order_no || line.order_id || orderNo;
            if (oNo && oNo !== "—" && oNo !== "---") orderIds.add(String(oNo).trim());

            const dNo = line.delivery_id || line.delivery_note_id || line.delivery_note_no || deliveryNoteNo;
            if (dNo && dNo !== "—" && dNo !== "---") deliveryIds.add(String(dNo).trim());

            const rNo = line.room_no || line.roomNo || line.room_number || (roomNo !== "—" ? roomNo : "");
            if (rNo && rNo !== "—" && rNo !== "---") roomNos.add(String(rNo).trim());

            const gNo = line.gate_pass_no || line.gatePassNo || line.gate_pass || (gatePassNo !== "—" ? gatePassNo : "");
            if (gNo && gNo !== "—" && gNo !== "---") gatePassNos.add(String(gNo).trim());
        });

        const orderNoResult =
            allOrderNos ||
            (orderIds.size > 0 ? Array.from(orderIds).join(", ") : "") ||
            pickVal(order, ["pickup_entry_id", "order_no", "order_id", "invoice_id"]) ||
            (orderNo !== "—" ? orderNo : "") ||
            "—";

        const deliveryNoteNoResult =
            allDeliveryNoteNos ||
            (deliveryIds.size > 0 ? Array.from(deliveryIds).join(", ") : "") ||
            pickVal(order, ["delivery_note_no", "delivery_note_id", "delivery_id"]) ||
            (deliveryNoteNo !== "—" ? deliveryNoteNo : "") ||
            "—";

        const roomNoResult =
            allRoomNos ||
            (roomNos.size > 0 ? Array.from(roomNos).join(", ") : "") ||
            pickVal(order, ["room_no", "roomNo", "room_number"]) ||
            (roomNo !== "—" ? roomNo : "") ||
            "—";

        const gatePassNoResult =
            allGatePassNos ||
            (gatePassNos.size > 0 ? Array.from(gatePassNos).join(", ") : "") ||
            pickVal(order, ["gate_pass_no", "gatePassNo", "gate_pass", "gate_pass_number"]) ||
            (gatePassNo !== "—" ? gatePassNo : "") ||
            "—";

        return {
            orderNo: orderNoResult,
            deliveryNoteNo: deliveryNoteNoResult,
            roomNo: roomNoResult,
            gatePassNo: gatePassNoResult,
        };
    }, [activeLines, originalResponses, orderNo, deliveryNoteNo, roomNo, gatePassNo, order]);

    const sections = useMemo(() => {
        return buildSectionedData(adjustedActiveLines);
    }, [adjustedActiveLines]);

    // DAYS-grid pivot for Period Invoicing customers. For a plain invoice view, pivot the full
    // pricedLines. For an actual Credit Note with adjusted items (isScenarioB), pivot only the
    // returned items — parsedAdjustedItems is already filtered to returnedQty > 0 and carries
    // adjusted_quantity/unit_price rather than qty/orderValue, so remap those before pivoting.
    // Debit Notes never reach the adjusted-items branch in practice ("Change Invoice Items" is
    // disabled for them), and with no adjustedItems the guard below returns null, same as today.
    const periodPivot = useMemo(() => {
        if (!isPeriodInvoice) return null;
        if (isScenarioB) {
            if (!parsedAdjustedItems || parsedAdjustedItems.length === 0) return null;
            const returnedLines = parsedAdjustedItems.map((l) => ({
                ...l,
                qty: Number(l.adjusted_quantity || 0),
                orderValue: parseFloat((Number(l.adjusted_quantity || 0) * Number(l.unit_price || 0)).toFixed(2)),
            }));
            return buildPeriodDayPivot(returnedLines, numDaysForPeriod);
        }
        return buildPeriodDayPivot(pricedLines, numDaysForPeriod);
    }, [isPeriodInvoice, isScenarioB, parsedAdjustedItems, pricedLines, numDaysForPeriod]);

    const totals = useMemo(() => {
        let totalQty = 0;
        let totalRate = 0;
        (adjustedActiveLines || []).forEach((row) => {
            totalQty += row.qty;
            totalRate += row.taxExclRate;
        });
        return { totalQty, totalRate };
    }, [adjustedActiveLines]);

    /** Pickup date(s) for invoiced lines: one date or earliest — latest range. */
    const dateOfDeliveryDisplay = useMemo(() => {
        const unique = new Set();
        (pricedLines || []).forEach((line) => {
            if (line.pickup_date) {
                const s = formatHeaderDateSlash(line.pickup_date);
                if (s) unique.add(s);
            } else if (line.pickup_label) {
                const lab = String(line.pickup_label).trim();
                if (lab && lab !== "—") unique.add(lab);
            }
        });
        const sorted = Array.from(unique).sort();
        if (sorted.length === 0) {
            return formatHeaderDateSlash(order?.delivery_date) || "";
        }
        if (sorted.length === 1) return sorted[0];
        return `${sorted[0]} - ${sorted[sorted.length - 1]}`;
    }, [pricedLines, order?.delivery_date]);

    const supplierDisplay = useMemo(() => {
        const sl = supplierLegal || {};
        const emailFromSettings = String(sl.email || "").trim();
        return {
            ...DEFAULT_TAX_INVOICE_SUPPLIER,
            email: emailFromSettings || FALLBACK_SUPPLIER_EMAIL,
        };
    }, [supplierLegal]);



    const pricedLineCount = (pricedLines || []).length;

    const renderInvoiceHeader = (isPrint = false) => {
        return (
            <div className={isPrint ? "flex flex-col w-full text-left" : "print:hidden flex flex-col w-full text-left"}>
                {/* Top Header (logo and printed date/time) */}
                <div className="tax-inv-print-top-header flex items-start justify-between print:pt-0">
                    <img src={logo} alt="Sparkle" className="w-32 md:w-44 object-contain print:w-44" />
                    <div className="flex flex-col items-end text-right">
                        <div className="text-[11px] md:text-[12px] print:text-[9px] flex flex-wrap gap-x-4 gap-y-1 justify-end text-right print:gap-x-2">
                            <div className="flex gap-1.5">
                                <span className="font-bold">Printed Date :</span>
                                <span className="font-normal">{new Date().toLocaleDateString()}</span>
                            </div>
                            <div className="flex gap-1.5">
                                <span className="font-bold">Time :</span>
                                <span className="font-normal">
                                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </div>
                        </div>
                        {order?.status === "Deactive" && (
                            <p className="font-bold text-red-600 text-base uppercase tracking-widest mt-1">
                                CANCELLED
                            </p>
                        )}
                    </div>
                </div>

                {/* Document Title (Tax Invoice, etc.) */}
                <div className="w-full flex -mt-10 md:-mt-14 print:-mt-10">
                    <div className="text-left w-[38%] md:w-[38%] print:w-[38%] ms-auto px-3 print:px-2.5">
                        <div className="text-xl md:text-2xl font-bold tracking-wide uppercase print:text-[1.2rem] print:leading-tight text-neutral-900">
                            {isCreditNote ? (hasVatNo ? "TAX CREDIT NOTE" : "CREDIT NOTE") : isDebitNote ? (hasVatNo ? "TAX DEBIT NOTE" : "DEBIT NOTE") : (shouldShowAsTaxInvoice ? "TAX INVOICE" : "INVOICE")}
                        </div>
                    </div>
                </div>

                {/* Supplier / Purchaser Details Row */}
                <div className="tax-inv-supplier-customer-row flex flex-row justify-between mt-10 md:mt-14 print:mt-10 text-[11px] md:text-[12px] leading-snug print:mt-1 print:text-[9px] print:leading-tight w-full items-start">
                    <div className="tax-inv-info-grid flex flex-col px-3 pt-0 pb-1 w-[52%] md:w-[52%] print:w-[52%] min-w-0 text-neutral-900 text-left -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                        <div className="font-bold text-[12px] print:text-[10px]">
                            {isCreditNote ? "Credit Note No" : isDebitNote ? "Debit Note No" : (shouldShowAsTaxInvoice ? "Tax Invoice No" : "Invoice No")} : {isCreditNote || isDebitNote ? (noteNo || "") : (taxInvoiceNo ? String(taxInvoiceNo) : "---")}
                        </div>
                        <div className="mt-1.5 font-bold text-[12px] print:text-[10px]">Supplier's Details</div>
                        <div className="text-[11px] print:text-[9px] mt-0.5">VAT NO  : 108812540-7000</div>
                        <div className="font-bold text-[11px] print:text-[9px]">C L SOLUTIONS ( PVT ) LTD</div>
                        <div className="text-[11px] print:text-[9px]">Registered Address : No:583/71, Augustine Premathirathna Road</div>
                        <div className="text-[11px] print:text-[9px]">Blue Diamond Road ) Liyanagemulla , Seeduwa</div>
                        <div className="text-[11px] print:text-[9px]">Operational Address : No 391 , Avissawella Road , Wellampitiya</div>
                        <div className="text-[11px] print:text-[9px]">Hot Line : 011-4701566</div>
                        <div className="text-[11px] print:text-[9px]">Hot Line : 0764660661</div>
                        <div className="text-[11px] print:text-[9px]">Email : info@sparklelaundry.lk  WEB : www.sparklelaundry.lk</div>
                        <div className="mt-1.5 text-[11px] print:text-[9px] font-semibold">
                            Date of Delivery : {dateOfDeliveryDisplay} 
                        </div>
                    </div>
                    <div className="tax-inv-info-grid flex flex-col px-3 pt-0 pb-1 w-[38%] md:w-[38%] print:w-[38%] min-w-0 text-neutral-900 text-left ms-auto -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                        <div className="font-bold text-[12px] print:text-[10px]">
                            {isCreditNote ? "Date of Credit Note" : isDebitNote ? "Date of Debit Note" : "Date of Invoice"} : {(isCreditNote || isDebitNote ? noteDate : invoiceDateStr) || "---"}
                        </div>
                        <div className="mt-1.5 font-bold text-[12px] print:text-[10px]">Purchaser's Details</div>
                        <div className="text-[11px] print:text-[9px] mt-0.5">VAT NO  : {vatNoDisplay}</div>
                        <div className="font-bold text-[11px] print:text-[9px] uppercase">
                            {companyNameDisplay}
                            {(() => {
                                const brand = String(
                                    order?.customer_name || 
                                    order?.customer_contact_person || 
                                    (customerProfile?.customer && (customerProfile.customer.customer_name || customerProfile.customer.customer_contact_person)) ||
                                    customerProfile?.customer_name || 
                                    customerProfile?.customer_contact_person || 
                                    ""
                                ).trim();
                                return brand ? ` (${brand})` : "";
                            })()}
                        </div>
                        <div className="text-[11px] print:text-[9px]">Registered Address : {addressDisplay}</div>
                        <div className="text-[11px] print:text-[9px]">Tel : {phoneDisplay}</div>
                        <div className="text-[11px] print:text-[9px]">Email : {emailDisplay}  WEB :</div>
                    </div>
                </div>
                {isPrint && <div className="hidden print:block print:h-4 w-full" />}
            </div>
        );
    };

    const renderDoc = () => {

        const manyLines = pricedLineCount >= 22;

        return (
        <div
            className="bg-white rounded-[10px] border border-[#e5e7ef] shadow-[0_2px_20px_rgba(0,0,0,0.03)] px-5 pt-4 pb-5 text-black text-[12px] leading-snug print:block print:w-full print:mx-auto print:box-border print:pt-2 print:px-2.5 print:pb-2 print:text-[11px] print:leading-tight print:overflow-x-hidden print:break-words print:shadow-none print:border-0 print:p-0 print:bg-white"
        >
            
            <table className="w-full border-none border-collapse print-main-table">
                <thead className="hidden print:table-header-group print-main-thead">
                    <tr>
                        <td className="border-none p-0">
                            {renderInvoiceHeader(true)}
                        </td>
                    </tr>
                </thead>
                <tbody className="print-main-tbody">
                    <tr className="print:hidden">
                        <td className="border-none p-0">
                            {renderInvoiceHeader(false)}
                        </td>
                    </tr>
                    <tr className="print-block-row">
                        <td className="border-none p-0">
                            <div
                                className={`tax-inv-page1-screen print:tax-inv-page1-print print:corporate-tax-invoice-page1-print ${manyLines ? "print:tax-inv-page1-print--many-lines" : ""}`}
                            >
            {/* Unified Sectioned Table */}
            {sections.length > 0 ? (
                <div className="tax-inv-pickup-block mt-4 print:mt-1.5 animate-fade-in">
                    <table className="border border-black/20 border-collapse w-full text-xs text-black">
                        <thead>
                            <tr className="border-b border-black/20">
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black">Item Code</th>
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black">Item Name &amp; Description</th>
                                <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Uom</th>
                                <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Qty</th>
                                <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Rate</th>
                                <th rowSpan={5} className="p-2 text-center font-bold bg-white text-black align-middle">Amount</th>
                            </tr>
                            {/* Top-Level Global Metadata (rendered ONLY ONCE at the top of <thead>) */}
                            <tr key="global-order-no" className="border-b border-black/20 bg-white text-left">
                                <td className="border-r border-black/20 p-2 font-bold text-xs">Order No</td>
                                <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{globalMetadata.orderNo}</td>
                            </tr>
                            <tr key="global-delivery-note-no" className="border-b border-black/20 bg-white text-left">
                                <td className="border-r border-black/20 p-2 font-bold text-xs">Delivery Note No</td>
                                <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{globalMetadata.deliveryNoteNo}</td>
                            </tr>
                            <tr key="global-room-no" className="border-b border-black/20 bg-white text-left">
                                <td className="border-r border-black/20 p-2 font-bold text-xs">Room No</td>
                                <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{globalMetadata.roomNo}</td>
                            </tr>
                            <tr key="global-gate-pass-no" className="border-b border-black/20 bg-white text-left">
                                <td className="border-r border-black/20 p-2 font-bold text-xs">Gate Pass No</td>
                                <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{globalMetadata.gatePassNo}</td>
                            </tr>
                        </thead>
                        <tbody>
                            {sections.map((section, secIdx) => {
                                const rows = [];
                                
                                // 1. SERVICE TYPE row
                                rows.push(
                                    <tr key={`service-type-${secIdx}`} className="border-b border-black/20 bg-white text-left">
                                        <td className="border-r border-black/20 p-2 font-bold text-xs">Service Type</td>
                                        <td colSpan={5} className="p-2 text-xs font-semibold text-black">{serviceTypeHeading(section.serviceType)}</td>
                                    </tr>
                                );
                                
                                // 2. DELIVERY TYPE row
                                rows.push(
                                    <tr key={`delivery-type-${secIdx}`} className="border-b border-black/20 bg-white text-left">
                                        <td className="border-r border-black/20 p-2 font-bold text-xs">Delivery Type</td>
                                        <td colSpan={5} className="p-2 text-xs font-semibold text-black">{formatDeliveryType(section.deliveryType)}</td>
                                    </tr>
                                );

                                let secQtySum = 0;
                                let secRateSum = 0;
                                let secAmountSum = 0;

                                // 3. Category & Items
                                Object.keys(section.categories).forEach((categoryName) => {
                                    const catItems = section.categories[categoryName];
                                    rows.push(
                                        <tr key={`cat-${secIdx}-${categoryName}`} className="bg-white text-left border-b border-black/20">
                                            <td colSpan={6} className="p-2 font-bold text-xs text-black">{categoryName}</td>
                                        </tr>
                                    );

                                    let catQtySum = 0;
                                    let catAmountSum = 0;

                                    catItems.forEach((row, itemIdx) => {
                                        const displayRate = shouldShowAsTaxInvoice ? row.taxExclRate : row.taxInclRate;
                                        const displayAmount = shouldShowAsTaxInvoice ? row.taxExclAmount : (row.taxInclAmount ?? Number((row.qty * row.taxInclRate).toFixed(2)));

                                        secQtySum += row.qty;
                                        secRateSum += displayRate;
                                        secAmountSum += displayAmount;

                                        catQtySum += row.qty;
                                        catAmountSum += displayAmount;

                                        rows.push(
                                            <tr key={`${secIdx}-${categoryName}-${row.noStr}-${itemIdx}`} className="border-b border-black/20 last:border-b-0 text-center bg-white text-xs">
                                                <td className="border-r border-black/20 px-2 py-1.5 align-middle text-left font-mono">{row.corp_item_id || row.item_id || "—"}</td>
                                                <td className="border-r border-black/20 px-2 py-1.5 align-middle text-left">{row.item_name || "—"}</td>
                                                <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">Pcs</td>
                                                <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">{row.qty}</td>
                                                <td className="border-r border-black/20 px-2 py-1.5 align-middle text-right">
                                                    {shouldShowAsTaxInvoice ? (
                                                        <span className="font-semibold text-neutral-900">{formatMoney(displayRate)}</span>
                                                    ) : (
                                                        isScenarioB ? formatPlainRate(displayRate) : formatMoney(displayRate)
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 align-middle text-right">{formatRsPlain(displayAmount)}</td>
                                            </tr>
                                        );
                                    });

                                    // Category Subtotal row
                                    rows.push(
                                        <tr key={`cat-subtotal-${secIdx}-${categoryName}`} className="bg-white text-black font-normal text-xs border-b border-black/20 text-center">
                                            <td colSpan={3} className="p-2 text-left pl-4 border-r border-black/20">Sub Total ({categoryName})</td>
                                            <td className="p-2 align-middle text-center border-r border-black/20">{catQtySum}</td>
                                            <td className="p-2 align-middle text-right border-r border-black/20"></td>
                                            <td className="p-2 align-middle text-right">{formatRsPlain(catAmountSum)}</td>
                                        </tr>
                                    );
                                });

                                return rows;
                            })}
                            {sections.length >= 1 && (
                                <tr className="bg-white text-black font-normal text-xs text-center">
                                    <td colSpan={3} className="p-2 text-left pl-4 border-r border-black/20">Total</td>
                                    <td className="p-2 align-middle text-center border-r border-black/20">{totals.totalQty}</td>
                                    <td className="p-2 align-middle text-right border-r border-black/20"></td>
                                    <td className="p-2 align-middle text-right">{formatRsPlain(laundryCharges)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : null}

            <div className="tax-inv-summary-wrap mt-3 border border-black/20 text-[9px] font-normal text-black bg-white divide-y divide-black/20 rounded-sm">
                <div className="px-2 py-1 flex justify-between">
                    <span>
                        {(isCreditNote || isDebitNote)
                            ? (noteReason?.trim() || (isCreditNote ? "Total Amount" : "Laundry Charge"))
                            : "Laundry Charge"}
                    </span>
                    <span>{formatMoney(laundryCharges)}</span>
                </div>
                {!isCreditNote && damageDeduction > 0 && (
                    <div className="px-2 py-1 flex justify-between text-black bg-white">
                        <span>Damaged Deduction</span>
                        <span>- {formatMoney(damageDeduction)}</span>
                    </div>
                )}
                {!isCreditNote && damageDeduction > 0 && (
                    <div className="px-2 py-1 flex justify-between bg-white text-black">
                        <span>Net Laundry Charge</span>
                        <span>{formatMoney(laundryCharges - damageDeduction)}</span>
                    </div>
                )}
                {!isCreditNote && (
                    <>
                        {/* A Debit Note never carries the customer's invoice discount (see the
                            isDebitNote branch of `summary` above) — no discount applies, so the
                            row itself is dropped rather than shown pinned at 0.00. */}
                        {!isDebitNote && (
                            <div className="px-2 py-1 flex justify-between">
                                <span>Discount &nbsp; ( {Number(order?.display_discount_percent ?? summary.discountPercent).toFixed(2)}% )</span>
                                <span>{formatMoney(summary.discountAmount)}</span>
                            </div>
                        )}
                        <div className="px-2 py-1 flex justify-between items-center">
                            <span>Transport Rate</span>
                            <span>{formatMoney(summary.transportCharge)}</span>
                        </div>
                        <div className="px-2 py-1 flex justify-between font-normal bg-white">
                            <span>Total</span>
                            <span>{formatMoney(summary.totalBeforeSscl)}</span>
                        </div>
                        {shouldShowAsTaxInvoice && (
                            <>
                                <div className="px-2 py-1 flex justify-between">
                                    <span>SSCL TAX {formatPercentForLabel(summary.ssclRatePct)}%</span>
                                    <span>{formatMoney(summary.ssclAmount)}</span>
                                </div>
                                <div className="px-2 py-1 flex justify-between">
                                    <span>Total Value of Supply</span>
                                    <span>{formatMoney(summary.totalValueOfSupply)}</span>
                                </div>
                                <div className="px-2 py-1 flex justify-between">
                                    <span>VAT Amount &nbsp; @ {formatPercentForLabel(summary.vatRatePct)}%</span>
                                    <span>{formatMoney(summary.vatAmount)}</span>
                                </div>
                                <div className="px-2 py-1 flex justify-between font-normal bg-white text-[9px]">
                                    <span>Total Amount Including VAT</span>
                                    <span>{formatMoney(summary.grandTotal)}</span>
                                </div>
                            </>
                        )}
                    </>
                )}
                {isCreditNote && isCustomerVatRegistered && (
                    <>
                        <div className="p-2 flex justify-between">
                            <span>SSCL TAX {formatPercentForLabel(creditNoteTaxBreakdown.ssclRatePct)}%</span>
                            <span>{Number(creditNoteTaxBreakdown.ssclAmount).toFixed(2)}</span>
                        </div>
                        <div className="p-2 flex justify-between">
                            <span>Total Value of Supply</span>
                            <span>{Number(creditNoteTaxBreakdown.totalValueOfSupply).toFixed(2)}</span>
                        </div>
                        <div className="p-2 flex justify-between">
                            <span>VAT Amount &nbsp; @ {formatPercentForLabel(creditNoteTaxBreakdown.vatRatePct)}%</span>
                            <span>{Number(creditNoteTaxBreakdown.vatAmount).toFixed(2)}</span>
                        </div>
                        <div className="p-2 flex justify-between font-extrabold bg-[#EAEAEA] text-[13px]">
                            <span>Total Amount Including VAT</span>
                            <span>{Number(creditNoteTaxBreakdown.grandTotal).toFixed(2)}</span>
                        </div>
                    </>
                )}
            </div>

            <div className="tax-inv-amount-words border border-black/20 mt-1.5 text-[9px] font-normal text-black bg-white px-2 py-1 flex justify-between items-center rounded-sm">
                <span>Amount In Words</span>
                <div className="text-right font-normal">
                    <span>Rupees </span>
                    <span className="font-normal">{String(amountInWordsDisplay || "").replace(/\s+Only\s*$/i, "").trim()}</span>
                    <span className="font-normal"> Only</span>
                </div>
            </div>
                            </div>
                        </td>
                    </tr>

            {!isCreditNote && !isDebitNote && (() => {
                const finalNotes = notes !== null ? notes : (order?.notes || order?.note || "");
                const finalTerms = terms_and_conditions !== null ? terms_and_conditions : (order?.terms_and_conditions || order?.terms || "");
                if (!finalNotes && !finalTerms) return null;
                const isDefaultTerms = !finalTerms || finalTerms === DEFAULT_TERMS || finalTerms === "Test 02";

                return (
                    <tr className="print-block-row">
                        <td className="border-none p-0">
                            <div
                                className={`tax-inv-page1-screen print:tax-inv-page1-print print:corporate-tax-invoice-page1-print ${manyLines ? "print:tax-inv-page1-print--many-lines" : ""}`}
                            >
                    <div className="flex flex-col w-full gap-2 text-[9px] print:text-[9px] text-black normal-case leading-relaxed">
                        {finalTerms && (
                            <div className="flex flex-col mt-1">
                                {isDefaultTerms ? (
                                    <div className="flex flex-col mt-1">
                                        <span className="font-normal text-[9px] print:text-[9px] mb-1 text-left">Terms And Conditions</span>
                                        <ol className="list-none p-0 m-0 flex flex-col gap-y-1">
                                            <li className="flex gap-x-1.5 items-start">
                                                <span className="font-normal">1.</span>
                                                <span>If there are any queries regarding this document, please contact the Invoicing Department at +94 011 4701 5666.</span>
                                            </li>
                                            <li className="flex gap-x-1.5 items-start">
                                                <span className="font-normal">2.</span>
                                                <span>All cheques are to be drawn in favour of &ldquo;C L Solutions (Pvt) Ltd&rdquo; and crossed &ldquo;A/C Payee&rdquo;.</span>
                                            </li>
                                            <li className="flex gap-x-1.5 items-start">
                                                <span className="font-normal">3.</span>
                                                <div className="flex flex-col w-full">
                                                    <span>Please make payment via online transfer to our bank account as follows:</span>
                                                    <div className="grid grid-cols-2 gap-x-6 mt-1.5 text-neutral-900 text-[9px] print:text-[9px]">
                                                        <div className="flex flex-col gap-y-0.5">
                                                            <div>Bank Name & Code : <span className="font-normal text-neutral-800">Seylan Bank PLC &ndash; 7287</span></div>
                                                            <div>Branch & Code : <span className="font-normal text-neutral-800">Peradeniya &ndash; 157</span></div>
                                                            <div>Account No : <span className="font-normal text-neutral-800">157013577220001</span></div>
                                                        </div>
                                                        <div className="flex flex-col gap-y-0.5">
                                                            <div>Bank Name & Code : <span className="font-normal text-neutral-800">Nations Trust Bank PLC &ndash; 7162</span></div>
                                                            <div>Branch & Code : <span className="font-normal text-neutral-800">Nawam Mawatha &ndash; 24</span></div>
                                                            <div>Account No : <span className="font-normal text-neutral-800">100240011603</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </li>
                                            <li className="flex gap-x-1.5 items-start mt-1">
                                                <span className="font-normal">4.</span>
                                                <span>Bank transfers to the company&rsquo;s bank account, credit card payments, and cheques made payable to the company are accepted. The company shall not be liable for any cash payments or transfers made to individual accounts.</span>
                                            </li>
                                        </ol>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-normal text-[9px] print:text-[9px] mb-1 text-left">Terms And Conditions</span>
                                        <p className="mt-1 font-normal break-words whitespace-pre-wrap text-neutral-800">
                                            {finalTerms}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                            </div>
                        </td>
                    </tr>
                );
            })()}

            <tr className="print-block-row">
                <td className="border-none p-0">
                    <div
                        className={`tax-inv-page1-screen print:tax-inv-page1-print print:corporate-tax-invoice-page1-print ${manyLines ? "print:tax-inv-page1-print--many-lines" : ""}`}
                    >
                        <div className="border-t-2 border-[#002A74] w-full mt-4 print:mt-2" />
                        <div className="tax-inv-signatures grid grid-cols-3 gap-x-4 w-full mt-3 mb-3 normal-case print:mt-2 print:mb-2 text-center text-black">
                {/* Prepared by */}
                <div className="flex flex-col items-center w-full">
                    {(() => {
                        const name = preparedByName || localStorage.getItem("userName") || order?.signed_by || order?.customer_name || "";
                        const rawDate = order?.printed_at || order?.created_at || order?.invoice_date || new Date();
                        const { dateStr, timeStr } = formatSignatureDateTime(rawDate);
                        return (
                            <>
                                <span className="font-normal text-[9px] print:text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                    {name || "\u00A0"}
                                </span>
                                <span className="text-[9px] print:text-[9px] text-neutral-500 mt-0.5 leading-none">
                                    {dateStr ? `${dateStr} : ${timeStr}` : "\u00A0"}
                                </span>
                            </>
                        );
                    })()}
                    <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5" style={{ marginTop: "36px" }} />
                    <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                        Prepared By
                    </span>
                </div>

                {/* Checked by */}
                <div className="flex flex-col items-center w-full">
                    {(() => {
                        const name = checkedByUser || "";
                        let rawDate = null;
                        if (checkedByUser) {
                            rawDate = order?.checked_at || order?.updated_at;
                            if (!rawDate && order?.activity_log) {
                                const parseActivityLog = (log) => {
                                    if (!log) return [];
                                    if (typeof log === "string") {
                                        try { return JSON.parse(log); } catch (_) { return []; }
                                    }
                                    return Array.isArray(log) ? log : [];
                                };
                                const logs = parseActivityLog(order.activity_log);
                                const checkLog = logs.find(l => l.type === "Checked");
                                if (checkLog) {
                                    rawDate = checkLog.timestamp;
                                }
                            }
                            if (!rawDate) {
                                rawDate = new Date();
                            }
                        }
                        const { dateStr, timeStr } = formatSignatureDateTime(rawDate);
                        return (
                            <>
                                <span className="font-normal text-[9px] print:text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                    {name || "\u00A0"}
                                </span>
                                <span className="text-[9px] print:text-[9px] text-neutral-500 mt-0.5 leading-none">
                                    {dateStr ? `${dateStr} : ${timeStr}` : "\u00A0"}
                                </span>
                            </>
                        );
                    })()}
                    <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5" style={{ marginTop: "36px" }} />
                    <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                        Checked By
                    </span>
                </div>

                {/* Approved by */}
                <div className="flex flex-col items-center w-full">
                    {(() => {
                        const name = approvedByUser || "";
                        let rawDate = null;
                        if (approvedByUser) {
                            rawDate = order?.approved_at || order?.updated_at;
                            if (!rawDate && order?.activity_log) {
                                const parseActivityLog = (log) => {
                                    if (!log) return [];
                                    if (typeof log === "string") {
                                        try { return JSON.parse(log); } catch (_) { return []; }
                                    }
                                    return Array.isArray(log) ? log : [];
                                };
                                const logs = parseActivityLog(order.activity_log);
                                const approveLog = logs.find(l => l.type === "Approved");
                                if (approveLog) {
                                    rawDate = approveLog.timestamp;
                                }
                            }
                            if (!rawDate) {
                                rawDate = new Date();
                            }
                        }
                        const { dateStr, timeStr } = formatSignatureDateTime(rawDate);
                        return (
                            <>
                                <span className="font-normal text-[9px] print:text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                    {name || "\u00A0"}
                                </span>
                                <span className="text-[9px] print:text-[9px] text-neutral-500 mt-0.5 leading-none">
                                    {dateStr ? `${dateStr} : ${timeStr}` : "\u00A0"}
                                </span>
                            </>
                        );
                    })()}
                    <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5" style={{ marginTop: "36px" }} />
                    <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                        Approved By
                    </span>
                </div>
            </div>

            <div className="border-t-2 border-[#002A74] w-full" />
                    </div>
                </td>
            </tr>

            <tr className="print-block-row">
                <td className="border-none p-0">
                    <div
                        className={`tax-inv-page1-screen print:tax-inv-page1-print print:corporate-tax-invoice-page1-print ${manyLines ? "print:tax-inv-page1-print--many-lines" : ""}`}
                    >
                        <div className="tax-inv-handover-panel mt-3 print:mt-1.5 flex flex-col text-black normal-case">
                <div className="tax-inv-handover-group flex flex-col gap-y-2 print:gap-y-1">
                    <div className="tax-inv-handover-intro flex flex-col">
                        <h2 className="font-normal text-[9px] print:text-[9px] text-left tracking-tight mb-1.5 print:mb-1">
                            Hand Over Details &mdash; Goods Received Confirmation
                        </h2>

                        {/* Section A */}
                        <div className="flex flex-col">
                            <p className="font-normal text-[9px] print:text-[9px] mb-0.5">
                                A. Delivered By (Supplier &mdash; Sparkle Laundry Representative)
                            </p>
                            <table className="w-full border-collapse border border-black/20 text-[9px] print:text-[9px] text-black">
                                <tbody>
                                    <tr className="border-b border-black/20">
                                        <td className="w-[12%] border-r border-black/20 p-1 font-normal bg-white">Name:</td>
                                        <td className="w-[21%] border-r border-black/20 p-1"></td>
                                        <td className="w-[12%] border-r border-black/20 p-1 font-normal bg-white">Date:</td>
                                        <td className="w-[21%] border-r border-black/20 p-1"></td>
                                        <td className="w-[12%] border-r border-black/20 p-1 font-normal bg-white">Time:</td>
                                        <td className="w-[22%] p-1"></td>
                                    </tr>
                                    <tr>
                                        <td className="border-r border-black/20 p-1 font-normal bg-white">Emp ID No:</td>
                                        <td className="border-r border-black/20 p-1"></td>
                                        <td className="border-r border-black/20 p-1 font-normal bg-white">Vehicle No:</td>
                                        <td className="border-r border-black/20 p-1"></td>
                                        <td className="border-r border-black/20 p-1 font-normal bg-white">Contact No:</td>
                                        <td className="p-1"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section B */}
                    <div className="tax-inv-handover-section-b flex flex-col">
                        <p className="font-normal text-[9px] print:text-[9px] mb-0.5">
                            B. Received By (Customer / Purchaser Representative)
                        </p>
                        <table className="w-full border-collapse border border-black/20 text-[9px] print:text-[9px] text-black">
                            <tbody>
                                <tr className="border-b border-black/20">
                                    <td className="w-[15%] border-r border-black/20 p-1 font-normal bg-white">Name:</td>
                                    <td className="w-[50%] border-r border-black/20 p-1"></td>
                                    <td className="w-[15%] border-r border-black/20 p-1 font-normal bg-white">NIC / ID No:</td>
                                    <td className="w-[20%] p-1"></td>
                                </tr>
                                <tr className="border-b border-black/20">
                                    <td className="border-r border-black/20 p-1 font-normal bg-white">Designation:</td>
                                    <td className="border-r border-black/20 p-1"></td>
                                    <td className="border-r border-black/20 p-1 font-normal bg-white">Department:</td>
                                    <td className="p-1"></td>
                                </tr>
                                <tr className="border-b border-black/20">
                                    <td className="border-r border-black/20 p-1 font-normal bg-white h-7">Signature:</td>
                                    <td className="border-r border-black/20 p-1"></td>
                                    <td className="border-r border-black/20 p-1 font-normal text-center align-middle" rowSpan={2} colSpan={2}>
                                        <div className="flex flex-col items-center justify-center p-1 leading-tight">
                                            <span className="font-normal">Official Seal / Stamp:</span>
                                            <span className="italic text-[8.5px] text-neutral-500 font-normal mt-0.5">(Affix Official Seal Here)</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="p-1 text-[8.5px] print:text-[8.5px] italic border-r border-black/20 font-normal leading-relaxed text-neutral-700 bg-white" colSpan={2}>
                                        I confirm that the above goods/services have been received in good condition, as per the quantities and descriptions listed in this invoice.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <p className="pt-2 text-center text-[9px] print:text-[9px] font-normal italic text-neutral-500">
                        This is a system-generated document. Hence no manual signature is required.
                    </p>
                </div>
            </div>
                    </div>
                </td>
            </tr>
                </tbody>
            </table>
        </div>
        );
    };

    return (
        <div ref={ref} className="corporate-tax-invoice-preview-root">
            <style>
                {`
                  @media print {
                    table.print-main-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        border: none !important;
                    }
                    thead.print-main-thead {
                        display: table-header-group !important;
                    }
                    tbody.print-main-tbody {
                        display: table-row-group !important;
                    }
                    table.print-main-table > tbody > tr {
                        page-break-inside: auto !important;
                        break-inside: auto !important;
                    }
                    .tax-inv-pickup-block table tr {
                        page-break-inside: auto !important;
                        break-inside: auto !important;
                    }
                    .tax-inv-pickup-block table thead {
                        display: table-row-group !important;
                    }
                    @page {
                      size: A4 portrait !important;
                      margin: 8mm 8mm 20mm 8mm !important;
                      @bottom-right {
                        content: "Page " counter(page) " of " counter(pages);
                        font-size: 9px;
                        color: #4b5563;
                      }
                    }
                    .corporate-tax-invoice-preview-root {
                      -webkit-print-color-adjust: exact;
                      print-color-adjust: exact;
                      background: #ffffff !important;
                    }
                    .corporate-tax-invoice-page1-print {
                      padding: 0 !important;
                      width: 100%;
                      max-width: 100%;
                      display: block !important;
                    }
                    .tax-inv-handover-panel {
                      padding: 0 !important;
                      margin-top: 10px !important;
                      width: 100%;
                      max-width: 100%;
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                    }
                    .tax-inv-supplier-customer-row {
                      margin-top: 10px !important;
                    }
                    .tax-inv-info-grid {
                      margin-top: 0px !important;
                    }
                    .tax-inv-summary-wrap {
                      margin-top: 6px !important;
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                    }
                    .tax-inv-handover-group,
                    .tax-inv-handover-intro,
                    .tax-inv-handover-section-b {
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                    }
                    .tax-inv-sys-footer {
                      margin-top: 6px !important;
                      width: 100% !important;
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                    }
                    tr.print-block-row {
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                    }
                    .mt-10, .mt-14, .print\\:mt-10 {
                        margin-top: 6px !important;
                    }
                    .tax-inv-summary-wrap > div,
                    .tax-inv-amount-words {
                        padding: 2px 4px !important;
                        font-size: 9px !important;
                        line-height: 1.1 !important;
                        font-weight: normal !important;
                    }
                    .tax-inv-summary-wrap > div span,
                    .tax-inv-amount-words span,
                    .tax-inv-amount-words div {
                        font-size: 9px !important;
                        font-weight: normal !important;
                    }
                    .tax-inv-summary-wrap > div.font-extrabold,
                    .tax-inv-summary-wrap > div.font-bold,
                    .tax-inv-summary-wrap > div.font-extrabold span,
                    .tax-inv-summary-wrap > div.font-bold span {
                        font-weight: bold !important;
                    }
                    .tax-inv-signatures {
                        margin-top: 6px !important;
                        gap: 12px !important;
                    }
                    th, td {
                        padding: 2px 4px !important;
                        font-size: 9px !important;
                        line-height: 1.1 !important;
                    }
                    .h-14 {
                        height: 24px !important;
                    }
                    .w-40 {
                        width: 100px !important;
                    }
                    img.max-h-\\[40px\\] {
                        max-height: 22px !important;
                        width: 100px !important;
                    }
                  }
                `}
            </style>
            {renderDoc()}
        </div>
    );
});

export default CorporateInvoicePreview;

