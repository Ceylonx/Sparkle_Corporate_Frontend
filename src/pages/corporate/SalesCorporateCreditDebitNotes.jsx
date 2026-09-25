import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useReactToPrint } from "react-to-print";
import { MdSearch } from "react-icons/md";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import SignatureCanvas from "react-signature-canvas";
import {
    getAllCreditDebitNotes,
    createCreditDebitNote,
    getApprovedInvoices,
    getInvoicePreviewDetails,
    updateCreditDebitNoteStatus,
    cancelCreditDebitNote,
    getAvailableFinanceLedgers
} from "../../services/corporate/CreditDebitNoteServices";
import CorporateInvoicePreview from "./invoicing/CorporateInvoicePreview";
import { pickCorporateTaxRatePercent, buildCollectionNoteLinesFromApiOrderItems } from "../../utils/corporateCollectionNotePricing";
import { computeSsclVatFromBase } from "../../utils/corporateTaxInvoiceMath";
import { computeInvoiceAmountFromItems } from "../../utils/corporateInvoiceListAmount";
import { getAllCorporateCustomers, getCustomerById, getCorporateCustomerById, unwrapCorporateCustomerGetByIdResponse } from "../../services/CustomerServices";
import { getAllCorporateSettings, getCorporatePriceListByCustomer, getAllCorporateItems } from "../../services/corporate/CorporateSettingsServices";

// Same normalization CorporatePeriodInvoicePreview.jsx uses so item_type_id/corp_item_id line up
// with the price list rows fetched below (getCorporatePriceListByCustomer).
function normalizeCorporateItemsForPricing(rawItems) {
    return (rawItems ?? [])
        .map((item) => ({
            item_type_id: String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
            item_type_name: item.corp_item_name ?? item.item_type_name ?? "-",
            corp_item_auto_id: item.corp_item_auto_id,
            item_category_id: item.item_category_id,
            corp_item_id: item.corp_item_id || String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
            service_type: item.service_type,
            service_types: item.service_types,
        }))
        .filter((item) => item.item_type_id);
}

// Last-resort fallback only — used when Settings > Receipt > Terms & Conditions hasn't been
// configured yet. The real default always comes from corporateSettings.receipt_terms so every
// bill (Invoicing, Credit/Debit Notes) shares one source of truth, same as the Invoicing module.
const DEFAULT_TERMS_AND_CONDITIONS = 'Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only';

const resolveDefaultTerms = (settingsTerms) => {
    const clean = String(settingsTerms || "").trim();
    return clean || DEFAULT_TERMS_AND_CONDITIONS;
};

const toMoneyNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const getNoteDisplayAmount = (note) => {
    if (!note || typeof note !== "object") return 0;

    const baseAmount = toMoneyNumber(note.amount);
    const ssclAmount = toMoneyNumber(note.sscl_amount ?? note.sscl_tax_amount);
    const vatAmount = toMoneyNumber(note.vat_amount);
    // transport_amount/transport_charge/travelling_charge/traveling_charge/manual_transport_charge
    // are all written as the SAME value when a note is created (see buildCreateNoteChargeFields) —
    // they're aliases for one number, not separate charges, so only one is added here.
    const travellingAmount = toMoneyNumber(
        note.transport_amount ??
        note.transport_charge ??
        note.travelling_charge ??
        note.traveling_charge ??
        note.manual_transport_charge
    );

    return toMoneyNumber(baseAmount + ssclAmount + vatAmount + travellingAmount);
};

/** The Transport Charge actually saved on a note — read straight off the database response,
 *  never re-derived or auto-calculated. Same alias chain as getNoteDisplayAmount. */
const getNoteTransportCharge = (note) => {
    if (!note || typeof note !== "object") return 0;
    return toMoneyNumber(
        note.transport_amount ??
        note.transport_charge ??
        note.travelling_charge ??
        note.traveling_charge ??
        note.manual_transport_charge
    );
};

// Same fallbacks CorporateInvoicePreview's Debit Note summary uses when no invoice tax rates are
// available (e.g. a standalone Debit Note), so saved/listed totals match the printed note.
const DEFAULT_SSCL_RATE_PCT = 2.5;
const DEFAULT_VAT_RATE_PCT = 18;

/** A Debit Note's "Total Amount Including VAT", exactly as its printed preview computes it:
 *  (amount + transport) with SSCL then VAT on top for VAT-registered customers. Uses the saved
 *  SSCL/VAT when present; otherwise recomputes them, since older standalone Debit Notes were
 *  saved with sscl_amount/vat_amount = 0 even for VAT-registered customers. */
const getDebitNoteGrandTotal = (note, customer) => {
    const savedSscl = toMoneyNumber(note?.sscl_amount ?? note?.sscl_tax_amount);
    const savedVat = toMoneyNumber(note?.vat_amount);
    if (savedSscl > 0 || savedVat > 0) return getNoteDisplayAmount(note);

    const base = toMoneyNumber(toMoneyNumber(note?.amount) + getNoteTransportCharge(note));
    if (!isVatRegisteredCustomerForNote(null, null, customer)) return base;
    return computeSsclVatFromBase(
        base,
        Number(note?.sscl_rate) || DEFAULT_SSCL_RATE_PCT,
        Number(note?.vat_rate) || DEFAULT_VAT_RATE_PCT
    ).grandTotal;
};

/** Normalizes a note's due_date (Date object, ISO datetime string, or "yyyy-mm-dd") into the
 *  plain "yyyy-mm-dd" a <input type="date"> needs. */
const toDateInputValue = (value) => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString().split("T")[0] : "";
};

const isVatRegisteredCustomerForNote = (customerProfile, invoiceData, fallbackCustomer = null) => {
    const pickAssignedTaxes = (obj) => (obj && Array.isArray(obj.assigned_taxes) ? obj.assigned_taxes : null);
    const assignedTaxes =
        pickAssignedTaxes(fallbackCustomer) ??
        pickAssignedTaxes(customerProfile) ??
        pickAssignedTaxes(customerProfile?.customer) ??
        [];

    const hasVatAssigned = assignedTaxes.some(
        (tax) => String(tax?.tax_name || tax?.name || "").trim().toUpperCase() === "VAT"
    );

    const rawVatNumber = String(
        fallbackCustomer?.customer_vat_number ??
        customerProfile?.customer_vat_number ??
        customerProfile?.customer?.customer_vat_number ??
        invoiceData?.customer_vat_number ??
        invoiceData?.vat_no ??
        ""
    ).trim();

    return hasVatAssigned || (rawVatNumber !== "" && rawVatNumber !== "---");
};

/** Normalize a date-ish value (Date instance or DB string) to YYYY-MM-DD without any UTC
 *  reinterpretation — mirrors CorporateInvoicePreview's formatHeaderDateSlash so this table
 *  shows the same calendar date as the invoice's own Bill Preview. */
function formatInvoiceDatePlain(raw) {
    if (raw == null || raw === "") return null;
    if (raw instanceof Date) {
        if (!Number.isFinite(raw.getTime())) return null;
        const yyyy = raw.getFullYear();
        const mm = String(raw.getMonth() + 1).padStart(2, "0");
        const dd = String(raw.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }
    let str = String(raw).trim();
    if (str.includes("T")) str = str.split("T")[0];
    else if (str.includes(" ")) str = str.split(" ")[0];
    return str || null;
}


// Unique per delivery-note-item row. order_item_auto_id alone is NOT enough here — when the
// same original order item is split across multiple Delivery Orders (e.g. CDN-38 + CDN-39), both
// rows reference the same order_item_auto_id (it identifies the original order line, not the
// specific delivery), so keying adjustedQuantities on it alone made typing a RETURN QTY on one
// Delivery Order's row also change the other. item.id (the delivery-note-item's own row id) is
// unique per row and always wins; delivery_id + order_item_auto_id is the fallback.
function buildLineKey(item, idx) {
    if (item?.id != null) return `row-${item.id}`;
    const doPart = item?.delivery_id || item?.pickup_entry_id || "x";
    const itemPart = item?.order_item_auto_id || item?.corp_item_auto_id || item?.item_auto_id || idx;
    return `${doPart}::${itemPart}`;
}

// Matches a saved note's adjusted_items entry back to today's invoice-preview row for the same
// delivery line. Saved entries never carry the row's own `id` (only what adjustedItemsForPreview
// stashes: order_item_auto_id + delivery_id/pickup_entry_id), so this mirrors buildLineKey's
// fallback branch rather than its `item.id` branch — matching on order_item_auto_id ALONE would
// wrongly lump together an item split across multiple Delivery Orders (see buildLineKey above)
// and over-subtract every split row by the combined total instead of each row's own share.
function buildHistoricalMatchKey(entry) {
    const itemPart = entry?.order_item_auto_id ?? entry?.corp_item_auto_id ?? entry?.item_auto_id;
    if (itemPart == null) return null;
    const doPart = entry?.delivery_id || entry?.pickup_entry_id || "x";
    return `${doPart}::${itemPart}`;
}

// What was actually invoiced for this item — same priority CorporatePeriodInvoicePreview.jsx
// uses: delivered_qty / final_packed_qty (the real delivered amount) beat corp_item_quantity
// (the full ordered amount, which can include qty still pending / sent back for re-wash and
// never delivered), with the display/balance fields as a last-resort fallback.
function resolveInvoicedQty(it) {
    if (it?.delivered_qty !== undefined && it.delivered_qty !== null) return Number(it.delivered_qty);
    if (it?.final_packed_qty !== undefined && it.final_packed_qty !== null) return Number(it.final_packed_qty);
    if (it?.current_display_qty != null) return Number(it.current_display_qty);
    if (it?.display_qty != null) return Number(it.display_qty);
    if (it?.available_balance != null) return Number(it.available_balance);
    return Number(it?.corp_item_quantity || 0);
}

/** Customer service types ([{ service_type: "Urgent", percentage: "10.00" }, ...]) — the source
 *  of each delivery type's surcharge %. The invoice-preview customer often doesn't carry them,
 *  so fall back to the full get-customer-by-id record (selectedCustomer). */
function resolveCustomerServiceTypes(...customers) {
    for (const c of customers) {
        let raw = c?.service_types;
        if (typeof raw === "string") {
            try {
                raw = JSON.parse(raw);
            } catch (_) {
                raw = null;
            }
        }
        if (Array.isArray(raw) && raw.length > 0) return raw;
    }
    return [];
}

/** The invoice's delivery type (e.g. "Urgent") — applied to any line that doesn't carry its own,
 *  so its service-type % is added to the unit price. */
function resolveInvoiceDeliveryType(invoiceData) {
    return invoiceData?.delivery_type || invoiceData?.deliveryType || invoiceData?.invoicing_type || "NORMAL";
}

function formatLogDateTime(raw) {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hh = String(hours).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    
    return `${yyyy}/${mm}/${dd} - ${hh}:${min} ${ampm}`;
}

const parseDiscountInput = (val) => {
    if (!val) return 0;
    const str = String(val).trim();
    if (str.endsWith("%")) {
        return parseFloat(str.slice(0, -1)) || 0;
    }
    return parseFloat(str) || 0;
};

export default function SalesCorporateCreditDebitNotes() {
    const [searchParams] = useSearchParams();
    // Auto-open a specific note's View, e.g. ?viewNoteId=30 from a link on another page (like
    // the invoice preview's "Credit & Debit Notes" panel) — opened once notes have loaded, and
    // only once per page load so closing the view manually doesn't re-open it.
    const hasAutoOpenedNoteRef = useRef(false);
    const printRef = useRef(null);
    // "Create & Print" resets the creation wizard back to the notes list — but that unmounts
    // the printable preview, so the reset must wait until after the print dialog has actually
    // opened (onAfterPrint), same pattern as Add New Order / Delivery Entry / Invoicing.
    const resetWizardAfterPrintRef = useRef(false);
    const resetCreationWizardRef = useRef(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        onAfterPrint: () => {
            if (resetWizardAfterPrintRef.current) {
                resetWizardAfterPrintRef.current = false;
                resetCreationWizardRef.current?.();
            }
        },
    });

    const [notes, setNotes] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    // Separate Tabs State
    const [activeTab, setActiveTab] = useState("Credit Note");

    // Modal & Creation States
    const [isCreating, setIsCreating] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [selectedNote, setSelectedNote] = useState(null);
    // Non-null while the wizard (isCreating) is being reused to EDIT this existing note instead
    // of creating a new one — holds the original note row (id, approval_status, etc.).
    const [editingNote, setEditingNote] = useState(null);
    // Real note_no/note_date from the create/update success response — shown on the printable
    // preview so "Create & Print" prints the actual note number instead of the TEMP placeholder.
    const [savedNoteHeader, setSavedNoteHeader] = useState(null);

    // Corporate settings (Settings > Receipt) — source of truth for the default Terms &
    // Conditions shown across every bill, same as the Invoicing module.
    const [corporateSettings, setCorporateSettings] = useState(null);

    // Preview States
    const [viewingNote, setViewingNote] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [enterNote, setEnterNote] = useState("");
    const [enterTerms, setEnterTerms] = useState("");
    const [previewBank, setPreviewBank] = useState("BOC");
    const [previewDiscount, setPreviewDiscount] = useState("");
    const [isCancellingNote, setIsCancellingNote] = useState(false);
    // Which Check/Approve transition is currently in flight — disables both buttons and shows a
    // spinner on the one clicked, so a slow request can't be double-submitted.
    const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);

    // Form States
    const [noteType, setNoteType] = useState("Credit Note"); // 'Credit Note' or 'Debit Note'
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [amount, setAmount] = useState("");
    // Optional extra Transport Charge typed on the "Enter Amount Manually" step — added on top of
    // whatever transport rate the note would otherwise carry (see manual_transport_charge below).
    const [transportCharge, setTransportCharge] = useState("");
    // Due Date — Debit Note only.
    const [dueDate, setDueDate] = useState("");
    const [reason, setReason] = useState("");
    const [description, setDescription] = useState("");

    // Creation Step 1 States
    const [selectedLedgerAccount, setSelectedLedgerAccount] = useState("");
    const [ledgers, setLedgers] = useState([]);
    const [isLedgersLoading, setIsLedgersLoading] = useState(false);

    // Fetch the ledger list lazily, only once the create wizard is actually opened (Step 1 is
    // the only place it's used) — not as part of the list page's initial load.
    useEffect(() => {
        if (!isCreating || ledgers.length > 0 || isLedgersLoading) return;
        setIsLedgersLoading(true);
        getAvailableFinanceLedgers()
            .then((res) => {
                if (res?.success) setLedgers(res.data || []);
            })
            .catch((err) => {
                console.error("Ledgers fetch failed, falling back to empty list", err);
            })
            .finally(() => setIsLedgersLoading(false));
    }, [isCreating, ledgers.length, isLedgersLoading]);

    const [creationMode, setCreationMode] = useState("Enter Amount Manually"); // 'Enter Amount Manually' or 'Change Invoice Items'
    const [invoicePreviewData, setInvoicePreviewData] = useState(null);
    const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false);
    // Customer price list + item types for the currently previewed invoice — fetched the same
    // way CorporatePeriodInvoicePreview.jsx does, since the invoice-preview items only carry
    // quantities/ids, not a priced rate; rate is resolved by matching corp_item_id against the
    // customer's price list (getCorporatePriceListByCustomer), same as invoice generation does.
    const [notePriceList, setNotePriceList] = useState([]);
    const [noteItemTypes, setNoteItemTypes] = useState([]);
    // Quantity already returned against this invoice by prior (non-cancelled) Credit/Debit
    // Notes, keyed per delivery line (buildHistoricalMatchKey) — summed across every such note so
    // the "Change Invoice Items" table's QTY/BALANCE QTY show only what's actually left to adjust,
    // and a fresh RETURN QTY starts at 0 instead of replaying an old note's already-submitted
    // amount. Deliberately applied ONLY to the displayed qty fields, never fed into the pricing
    // builder below — UNIT PRICE must keep resolving off each item's true original quantity.
    const [previouslyReturnedQty, setPreviouslyReturnedQty] = useState({});
    const [adjustedQuantities, setAdjustedQuantities] = useState({});
    const [stashedNoteData, setStashedNoteData] = useState(null);
    const [selectedBank, setSelectedBank] = useState("BOC");
    const [discount, setDiscount] = useState("");

    useEffect(() => {
        if (noteType === "Debit Note" && creationMode === "Change Invoice Items") {
            setCreationMode("Enter Amount Manually");
        }
    }, [noteType, creationMode]);

    // Transport Charge doesn't apply to Credit Notes — clear it if the user switches note type
    // after having typed one in, so a stale value can't sneak into a Credit Note submission.
    // Scoped to the create/edit wizard: noteType isn't synced when View opens a saved note
    // (handleViewNote), so outside the wizard this would wipe a Debit Note's saved Transport
    // Charge off its preview.
    useEffect(() => {
        if (isCreating && noteType === "Credit Note" && transportCharge !== "") {
            setTransportCharge("");
        }
    }, [isCreating, noteType, transportCharge]);

    // Due Date is Debit Note only — same reasoning (and same wizard-only scope) as Transport Charge above.
    useEffect(() => {
        if (isCreating && noteType === "Credit Note" && dueDate !== "") {
            setDueDate("");
        }
    }, [isCreating, noteType, dueDate]);

    // Searchable dropdown state
    const [invoiceSearch, setInvoiceSearch] = useState("");
    const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Select Customer (filters the linked invoice dropdown to that customer's invoices)
    const [corporateCustomers, setCorporateCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState("");
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const customerDropdownRef = useRef(null);

    // Signature Modal States
    const sigCanvasRef = useRef(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);

    // Priced items for creation Adjustment Table
    const pricedLinesForCreation = useMemo(() => {
        if (!invoicePreviewData || !invoicePreviewData.items || !invoicePreviewData.items.length) return [];

        const invoiceData = invoicePreviewData.invoice;
        const customerProfile = invoicePreviewData.customer;
        const taxes = invoicePreviewData.taxes || [];

        const taxRates = {
            sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
            vat: pickCorporateTaxRatePercent(taxes, "VAT"),
        };

        const itemsWithPickup = invoicePreviewData.items.map((it) => ({
            ...it,
            corp_item_quantity: resolveInvoicedQty(it),
            pickup_date: it.pickup_date || invoiceData.printed_at,
        }));

        // Only borrow selectedCustomer's service types when it's this invoice's own customer.
        const invoiceCustomerId = invoiceData?.customer_id ?? customerProfile?.customer_id;
        const fetchedCustomer =
            selectedCustomer && String(selectedCustomer.customer_id) === String(invoiceCustomerId)
                ? selectedCustomer
                : null;
        // Delivery type's service-type % (e.g. Urgent 10%) is added onto each unit price by the
        // builder below (resolveDeliverySurchargePercent) — so Rs 100 on an Urgent invoice → Rs 110.
        const customerServiceTypes = resolveCustomerServiceTypes(customerProfile, fetchedCustomer);

        const taxType = customerProfile?.tax_type ?? invoiceData.vat_status ?? "";
        const vatNumber = customerProfile?.customer_vat_number ?? customerProfile?.vat_number ?? customerProfile?.vat_no;

        const built = buildCollectionNoteLinesFromApiOrderItems({
            items: itemsWithPickup,
            customerPriceList: notePriceList,
            itemTypes: noteItemTypes,
            deliveryTypeRaw: resolveInvoiceDeliveryType(invoiceData),
            customerServiceTypes,
            corporateTaxRates: taxRates,
            taxType,
            vatNumber,
            customer: customerProfile,
            deliveryPercentageFallback: 0,
        });

        const enrichedRows = built.map((row, idx) => {
            const raw = itemsWithPickup[idx];
            // QTY/BALANCE QTY only — never fed back into the pricing builder above, so UNIT
            // PRICE keeps resolving off each item's true original quantity untouched.
            const lineKey = buildHistoricalMatchKey(raw);
            const alreadyReturned = lineKey != null ? Number(previouslyReturnedQty[lineKey] || 0) : 0;
            const remainingQty = Math.max(0, Number(raw?.corp_item_quantity || 0) - alreadyReturned);
            return {
                ...row,
                unit_price: Number(raw?.unit_price || 0),
                order_item_auto_id: raw?.order_item_auto_id || raw?.corp_item_auto_id || raw?.item_auto_id || null,
                lineKey: buildLineKey(raw, idx),
                current_display_qty: remainingQty,
                display_qty: remainingQty,
                available_balance: remainingQty
            };
        });

        // Rows stay one-per-Delivery-Order (not merged across delivery notes) — the "Change
        // Invoice Items" table groups by Delivery Order (see itemsByDeliveryOrder below) rather
        // than collapsing the same item from two delivery notes into one row.
        return enrichedRows;
    }, [invoicePreviewData, notePriceList, noteItemTypes, previouslyReturnedQty, selectedCustomer]);

    // Group the granular rows by Delivery Order (delivery_id, e.g. "CDN-24") for display in the
    // "Change Invoice Items" table. Purely a display-layer grouping — pricedLinesForCreation
    // itself stays flat for handleCreateNote / adjustedItemsForPreview / the summary boxes.
    const itemsByDeliveryOrder = useMemo(() => {
        const visible = pricedLinesForCreation.filter((r) => r.current_display_qty > 0);
        const groups = new Map();
        visible.forEach((row) => {
            const key = row.delivery_id || row.pickup_entry_id || "General Delivery";
            if (!groups.has(key)) groups.set(key, { deliveryOrderId: key, items: [] });
            groups.get(key).items.push(row);
        });
        return [...groups.values()].sort((a, b) => {
            const dateA = a.items[0]?.pickup_date ? new Date(a.items[0].pickup_date).getTime() : 0;
            const dateB = b.items[0]?.pickup_date ? new Date(b.items[0].pickup_date).getTime() : 0;
            return dateA - dateB;
        });
    }, [pricedLinesForCreation]);

    // Memos for creation preview
    // adjustedQuantities holds the RETURN quantity typed by the user directly (0 = nothing
    // returned for that row). "adjusted_quantity" sent downstream still means KEPT quantity
    // (orgQty - returnQty), matching what CorporateInvoicePreview.jsx already expects when it
    // derives returnedQty = quantity - adjusted_quantity for a credit note — so only this page's
    // input/display convention changes, not the stored contract.
    const adjustedItemsForPreview = useMemo(() => {
        if (!pricedLinesForCreation || !pricedLinesForCreation.length) return [];
        return pricedLinesForCreation.map((item, idx) => {
            const orgQty = item.current_display_qty;
            const uniqueId = item.lineKey;
            const returnQtyVal = adjustedQuantities[uniqueId];
            const returnQty = returnQtyVal !== undefined ? (returnQtyVal === "" ? 0 : Number(returnQtyVal)) : 0;
            const keptQty = orgQty - returnQty;
            return {
                corp_item_id: item.corp_item_id,
                item_name: item.item_name,
                item_category_name: item.item_category_name || "ROOM LINEN",
                quantity: orgQty,
                adjusted_quantity: keptQty,
                unit_price: item.rate || 0,
                org_amount: orgQty * (item.rate || 0),
                adj_amount: keptQty * (item.rate || 0),
                difference: keptQty - orgQty,
                diff: keptQty - orgQty,
                service_type: item.service_type || "Washing",
                order_item_auto_id: item.order_item_auto_id,
                // Day / Delivery Order metadata — needed so a Period customer's Credit Note
                // preview can bucket returned items into the DAYS grid (CorporateInvoicePreview.jsx).
                pickup_date: item.pickup_date,
                delivery_type: item.delivery_type,
                delivery_id: item.delivery_id,
                pickup_entry_id: item.pickup_entry_id,
                room_no: item.room_no,
                gate_pass_no: item.gate_pass_no,
            };
        });
    }, [pricedLinesForCreation, adjustedQuantities]);

    const isAdjusted = useMemo(() => {
        if (creationMode === "Enter Amount Manually") return false;
        if (!pricedLinesForCreation || !pricedLinesForCreation.length) return false;
        return pricedLinesForCreation.some((item, idx) => {
            const uniqueId = item.lineKey;
            const returnQtyVal = adjustedQuantities[uniqueId];
            return returnQtyVal !== undefined && returnQtyVal !== "" && Number(returnQtyVal) !== 0;
        });
    }, [pricedLinesForCreation, adjustedQuantities, creationMode]);

    const taxRates = useMemo(() => {
        const data = isCreating ? invoicePreviewData : previewData;
        if (!data) return { sscl: 0, vat: 0 };
        const taxes = data.taxes || [];
        return {
            sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
            vat: pickCorporateTaxRatePercent(taxes, "VAT"),
        };
    }, [previewData, invoicePreviewData, isCreating]);

    const buildCreateNoteChargeFields = (rawAmount, manualTransportChargeInput = 0) => {
        const baseAmount = toMoneyNumber(Math.abs(Number(rawAmount) || 0));
        const isVatCustomer = isVatRegisteredCustomerForNote(
            invoicePreviewData?.customer,
            invoicePreviewData?.invoice,
            selectedCustomer
        );
        // Transport charge on a Credit/Debit Note comes ONLY from the manual "Transport Charge"
        // field on the creation form — never auto-copied from the linked invoice's own transport
        // rate, since that rate belongs to the invoice, not the note being created against it.
        const manualTransportCharge = toMoneyNumber(Math.abs(Number(manualTransportChargeInput) || 0));
        // Manual Transport Charge is folded into the taxable base here (matching how the note
        // preview adds it on top of the credited/debited amount before computing SSCL/VAT), so the
        // submitted totals actually reflect what was typed instead of taxing baseAmount alone.
        const taxableBase = toMoneyNumber(baseAmount + manualTransportCharge);
        // With no linked invoice (standalone Debit Note) taxRates are 0 — fall back to the same
        // defaults the printed note uses, so SSCL/VAT aren't saved as 0 for a VAT customer.
        const taxBreakdown = isVatCustomer
            ? computeSsclVatFromBase(
                taxableBase,
                taxRates.sscl || DEFAULT_SSCL_RATE_PCT,
                taxRates.vat || DEFAULT_VAT_RATE_PCT
            )
            : computeSsclVatFromBase(taxableBase, 0, 0);

        const payload = {
            sscl_rate_percent: toMoneyNumber(taxBreakdown.ssclRatePct),
            sscl_amount: toMoneyNumber(taxBreakdown.ssclAmount),
            sscl_tax_amount: toMoneyNumber(taxBreakdown.ssclAmount),
            vat_rate_percent: toMoneyNumber(taxBreakdown.vatRatePct),
            vat_amount: toMoneyNumber(taxBreakdown.vatAmount),
        };

        if (manualTransportCharge > 0) {
            payload.transport_amount = manualTransportCharge;
            payload.transport_charge = manualTransportCharge;
            payload.travelling_charge = manualTransportCharge;
            payload.traveling_charge = manualTransportCharge;
            payload.manual_transport_charge = manualTransportCharge;
        }

        return payload;
    };

    const supplierLegal = useMemo(() => {
        const data = isCreating ? invoicePreviewData : previewData;
        if (!data || !data.settings) return {};
        const settings = data.settings;
        const pick = (obj, keys) => {
            if (!obj) return "";
            for (const k of keys) {
                const v = obj[k];
                if (v != null && String(v).trim() !== "") return String(v).trim();
            }
            return "";
        };
        return {
            companyName: pick(settings, ["supplier_company_name", "company_legal_name", "laundry_company_name", "registered_company_name"]),
            vatNo: pick(settings, ["supplier_vat_no", "company_vat_no", "company_vat_number"]),
            address: pick(settings, ["supplier_address", "registered_address", "company_address"]),
            operationAddress: pick(settings, ["operation_address", "supplier_operation_address", "laundry_address"]),
            hotline: pick(settings, ["hotline", "company_phone", "supplier_phone"]),
            email: pick(settings, ["company_email", "supplier_email", "info_email"]),
        };
    }, [previewData, invoicePreviewData, isCreating]);

    const effectiveDiscountPercent = useMemo(() => {
        // viewingNote takes precedence over isCreating: clicking "View" on the linked invoice
        // (Step 1) sets viewingNote without clearing isCreating, since "Back" from the preview
        // should return to the in-progress creation wizard — so both can be true at once here.
        if (viewingNote) {
            if (viewingNote.isInvoiceOnly) {
                return Number(previewData?.invoice?.discount || 0);
            }
            return previewDiscount !== "" ? parseDiscountInput(previewDiscount) : (viewingNote.discount !== null && viewingNote.discount !== undefined ? Number(viewingNote.discount) : 0);
        }
        if (isCreating) {
            return discount !== "" ? parseDiscountInput(discount) : (invoicePreviewData?.invoice?.discount || 0);
        }
        if (!previewData || !previewData.invoice) return 0;
        return Number(previewData.invoice.discount || 0);
    }, [previewData, invoicePreviewData, isCreating, discount, viewingNote, previewDiscount]);

    const manualLaundryChargesForPreview = useMemo(() => {
        // Same precedence note as effectiveDiscountPercent above.
        if (viewingNote) {
            if (viewingNote.isInvoiceOnly) return undefined;
            // adjusted_items can come back as null, the string "null", or an empty array (all of
            // which mean "no real item adjustment was saved" — an empty array is truthy in JS, so
            // it must be checked for explicitly or this wrongly ignores the note's saved amount).
            const raw = viewingNote.adjusted_items;
            let parsedAdj = null;
            if (raw && raw !== "null") {
                try {
                    parsedAdj = typeof raw === "string" ? JSON.parse(raw) : raw;
                } catch (_) {
                    parsedAdj = null;
                }
            }
            const hasAdj = Array.isArray(parsedAdj) && parsedAdj.length > 0;
            // Live-reflect the editable Amount field so the preview updates as you type,
            // instead of the frozen value the note was originally saved with.
            return !hasAdj ? Number(amount) : undefined;
        }
        if (isCreating) {
            return creationMode === "Enter Amount Manually" ? Number(amount) : undefined;
        }
        return undefined;
    }, [isCreating, creationMode, amount, viewingNote]);

    // Bumped on every customer select so a slow get-customer-by-id response for a customer
    // that's since been changed can't overwrite the current selection.
    const customerDetailsRequestRef = useRef(0);

    // Select a customer, then enrich it with the full record from get-customer-by-id (VAT no,
    // assigned_taxes, address, etc.). The list row is shown immediately; the fetched fields are
    // merged over it once they arrive, keeping the list row as the fallback if the call fails.
    const selectCustomerWithDetails = async (customer) => {
        const requestId = ++customerDetailsRequestRef.current;
        setSelectedCustomer(customer || null);
        if (!customer?.customer_id) return;

        try {
            const response = await getCustomerById({
                user_id: localStorage.getItem("userId") || "",
                customer_id: customer.customer_id,
                // Corporate customers are stored with this (misspelled) type across the codebase.
                customer_type: "Cooperate",
            });
            if (requestId !== customerDetailsRequestRef.current) return;
            const apiCustomer = response?.data?.customer ?? response?.data?.data ?? null;
            if (apiCustomer && typeof apiCustomer === "object") {
                setSelectedCustomer({ ...customer, ...apiCustomer, customer_id: customer.customer_id });
            }
        } catch (err) {
            console.error("Failed to fetch customer details, using list data instead", err);
        }
    };

    // Bumped on every invoice select/clear so a slow getInvoicePreviewDetails response for an
    // invoice that's since been cleared or replaced can't repopulate the form.
    const invoiceSelectRequestRef = useRef(0);

    // The linked invoice's Amount exactly as the Daily/Period invoice lists show it (and as its
    // bill totals it, incl. Urgent surcharges). Neither the stored total_amount (overwritten by the
    // backend's own tax recalculation) nor the invoice-preview's order items (aggregated across
    // every delivery note, one invoice-wide delivery type, no customer service types) reproduce
    // it — so this reuses the lists' own source: the customer's invoicing history row + corporate
    // customer profile, priced by the same computeInvoiceAmountFromItems. null = not resolved.
    const [linkedInvoiceListAmount, setLinkedInvoiceListAmount] = useState(null);

    // Priced from the invoice-preview's own stored invoice fields — sub_total (laundry charges,
    // already incl. Urgent surcharge), discount, transport_charge — with SSCL/VAT added for a
    // customer with a VAT number, exactly as the Daily/Period invoice lists do. items: [] makes
    // computeInvoiceAmountFromItems use sub_total rather than re-pricing the invoice-preview's
    // order items (aggregated across every delivery note, so they'd give the wrong figure).
    // The customer profile (VAT no., locations) comes from get-corporate-customer-by-id, same as
    // the lists. (The invoicing-history endpoint isn't keyed by customer_auto_id and returns no
    // rows here, so it isn't used.)
    const fetchLinkedInvoiceListAmount = async (invoiceData, customerAutoId, requestId) => {
        const LOG = "[LinkedInvoiceAmount]"; // TEMP DEBUG — remove once confirmed
        if (!invoiceData || customerAutoId == null || customerAutoId === "") {
            console.warn(LOG, "skipped: missing invoice or customer_auto_id — using stored amount", { customerAutoId });
            return;
        }
        try {
            const profileRes = await getCorporateCustomerById({
                user_id: localStorage.getItem("userId") || "",
                customer_auto_id: customerAutoId,
            });
            if (requestId !== invoiceSelectRequestRef.current) return;
            const profile = unwrapCorporateCustomerGetByIdResponse(profileRes);
            const isPeriod = /period/i.test(String(invoiceData.invoicing_type || ""));
            const amount = computeInvoiceAmountFromItems({ ...invoiceData, items: [] }, profile, { isPeriod });
            console.log(LOG, "computed", amount, {
                isPeriod,
                sub_total: invoiceData.sub_total,
                discount: invoiceData.discount,
                transport_charge: invoiceData.transport_charge,
                customer_vat_number: profile?.customer_vat_number,
                stored_total_amount: invoiceData.total_amount,
            });
            if (Number.isFinite(amount) && amount > 0) setLinkedInvoiceListAmount(amount);
        } catch (err) {
            console.error(LOG, "failed — using stored amount:", err);
        }
    };

    // Undo a wrongly picked Linked Invoice — keeps the selected customer, drops everything loaded
    // for that invoice. "Change Invoice Items" needs an invoice, so fall back to manual entry.
    const handleClearSelectedInvoice = () => {
        invoiceSelectRequestRef.current += 1;
        setSelectedInvoice(null);
        setLinkedInvoiceListAmount(null);
        setInvoicePreviewData(null);
        setIsInvoicePreviewLoading(false);
        setAdjustedQuantities({});
        setPreviouslyReturnedQty({});
        setNotePriceList([]);
        setNoteItemTypes([]);
        setInvoiceSearch("");
        setIsInvoiceDropdownOpen(false);
        setCreationMode("Enter Amount Manually");
    };

    // Fetch details for adjustment table
    // excludeNoteId: the note being edited — its own returns mustn't count as "already returned"
    // against itself (passed explicitly since editingNote state isn't committed yet when
    // handleEditNoteClick calls this).
    const handleSelectInvoice = async (inv, { excludeNoteId = editingNote?.id } = {}) => {
        const requestId = ++invoiceSelectRequestRef.current;
        setSelectedInvoice(inv);
        setLinkedInvoiceListAmount(null);
        // Keep "Select Customer" in sync when an invoice is picked directly (e.g. under "All Customers")
        const matchedCustomer = corporateCustomers.find((c) => String(c.customer_id) === String(inv.customer_id));
        // Skip the refetch when it's already the selected customer (keeps its fetched details).
        if (matchedCustomer && String(selectedCustomer?.customer_id) !== String(matchedCustomer.customer_id)) {
            selectCustomerWithDetails(matchedCustomer);
        }
        setIsInvoicePreviewLoading(true);
        setInvoicePreviewData(null);
        setAdjustedQuantities({});
        setNotePriceList([]);
        setNoteItemTypes([]);
        setPreviouslyReturnedQty({});
        try {
            const res = await getInvoicePreviewDetails(inv.invoice_id);
            if (requestId !== invoiceSelectRequestRef.current) return;
            if (res?.success) {
                setInvoicePreviewData(res);
                // Amount as the Daily/Period invoice list shows it (see linkedInvoiceListAmount).
                const customerAutoIdForAmount =
                    res.customer?.customer_auto_id ??
                    corporateCustomers.find((c) => String(c.customer_id) === String(res.invoice?.customer_id ?? inv.customer_id))?.customer_auto_id;
                fetchLinkedInvoiceListAmount(res.invoice, customerAutoIdForAmount, requestId);
                const items = res.items || [];
                const initialAdjusted = {};

                // Rate for each item comes from matching the customer's price list, same as
                // CorporatePeriodInvoicePreview.jsx / invoice generation — the invoice-preview
                // items themselves only carry ids/quantities, not a usable priced rate.
                const userId = localStorage.getItem("userId");
                const customerIdForPricing = res.invoice?.customer_id ?? res.customer?.customer_id ?? inv.customer_id;
                Promise.all([
                    getCorporatePriceListByCustomer({ user_id: userId, customer_id: customerIdForPricing }),
                    getAllCorporateItems(userId),
                ]).then(([priceRes, itemsRes]) => {
                    if (requestId !== invoiceSelectRequestRef.current) return;
                    const list =
                        priceRes?.data?.price_list ??
                        priceRes?.data?.corporate_price_lists ??
                        priceRes?.data ??
                        [];
                    setNotePriceList(Array.isArray(list) ? list : []);
                    const rawItems = itemsRes?.data?.corporate_items ?? [];
                    setNoteItemTypes(normalizeCorporateItemsForPricing(rawItems));
                }).catch((err) => {
                    console.error("Failed to load price list / item types for note pricing:", err);
                });

                // Sum the quantity already returned against this invoice across every
                // non-cancelled note that already exists for it (not just the most recent one),
                // matched per delivery line (not just order_item_auto_id, which an item split
                // across multiple Delivery Orders would share). This ONLY feeds the displayed
                // QTY/BALANCE QTY in pricedLinesForCreation above — it never touches the pricing
                // builder's own qty input, so UNIT PRICE is unaffected.
                const priorNotesForInvoice = notes.filter(
                    (n) => n.linked_invoice_id === inv.invoice_id && n.status !== "Deactive" && n.adjusted_items && n.adjusted_items !== "null" &&
                        (excludeNoteId == null || String(n.id) !== String(excludeNoteId))
                );
                const returnedByLineKey = {};
                priorNotesForInvoice.forEach((n) => {
                    let savedItems = null;
                    try {
                        savedItems = typeof n.adjusted_items === 'string' ? JSON.parse(n.adjusted_items) : n.adjusted_items;
                    } catch (_) {
                        savedItems = null;
                    }
                    if (!Array.isArray(savedItems)) return;
                    savedItems.forEach((s) => {
                        const key = buildHistoricalMatchKey(s);
                        if (key == null) return;
                        const orgQty = Number(s.quantity || 0);
                        const keptQty = s.adjusted_qty !== undefined ? Number(s.adjusted_qty) : (s.adjusted_quantity !== undefined ? Number(s.adjusted_quantity) : orgQty);
                        const returned = Math.max(0, orgQty - keptQty);
                        returnedByLineKey[key] = (returnedByLineKey[key] || 0) + returned;
                    });
                });
                setPreviouslyReturnedQty(returnedByLineKey);

                // A fresh RETURN QTY always starts at 0 — QTY above already reflects the
                // remaining balance, so there's no old amount to replay here.
                items.forEach((item, idx) => {
                    const id = buildLineKey(item, idx);
                    initialAdjusted[id] = 0;
                });
                setAdjustedQuantities(initialAdjusted);
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: res?.message || "Failed to fetch invoice preview details.",
                    confirmButtonColor: "#1470F9"
                });
            }
        } catch (err) {
            console.error("Error fetching invoice details:", err);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "An error occurred while loading invoice details.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            if (requestId === invoiceSelectRequestRef.current) setIsInvoicePreviewLoading(false);
        }
    };

    // Reuses the same Create wizard (Step 1 -> Step 2) to edit an existing note, pre-filled with
    // its current values. handleCreateNote branches on `editingNote` to PUT an update instead of
    // POSTing a new note.
    const handleEditNoteClick = (note) => {
        setEditingNote(note);
        setNoteType(note.type);
        setCreationMode("Enter Amount Manually");
        setAmount(note.amount !== null && note.amount !== undefined ? String(note.amount) : "");
        setTransportCharge(getNoteTransportCharge(note) > 0 ? String(getNoteTransportCharge(note)) : "");
        setDueDate(toDateInputValue(note.due_date));
        setReason(note.reason || "");
        setDescription(note.description || "");
        setSelectedLedgerAccount(note.ledger_account || "");

        if (note.linked_invoice_id) {
            const matchedInvoice = invoices.find((inv) => inv.invoice_id === note.linked_invoice_id) ||
                { invoice_id: note.linked_invoice_id, customer_id: null };
            handleSelectInvoice(matchedInvoice, { excludeNoteId: note.id });
        } else {
            // Standalone Debit Note (no linked invoice) — just restore the customer it was raised against.
            setSelectedInvoice(null);
            setInvoicePreviewData(null);
            const matchedCustomer = corporateCustomers.find((c) => String(c.customer_id) === String(note.customer_id));
            selectCustomerWithDetails(matchedCustomer || null);
        }

        setViewingNote(null);
        setIsCreating(true);
        setCurrentStep(1);
    };


    const handleNextStep = () => {
        // A Debit Note can be raised straight against a customer, with no invoice attached —
        // Credit Notes still require a linked invoice since they credit money already invoiced.
        const invoiceOptional = noteType === "Debit Note";

        if (!selectedInvoice && !invoiceOptional) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please select a linked invoice.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }

        if (!selectedInvoice && invoiceOptional && !selectedCustomer) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please select a customer.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }

        if (!selectedLedgerAccount) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please select a ledger account.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }

        if (!reason.trim()) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please enter a reason.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }

        if (creationMode === "Enter Amount Manually") {
            if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
                Swal.fire({
                    icon: "warning",
                    title: "Validation Error",
                    text: "Please enter a valid manual amount.",
                    confirmButtonColor: "#1470F9"
                });
                return;
            }
        }

        // Initialize Step 2 states
        setEnterNote(description);
        // Editing an existing note: keep its own saved terms. Otherwise default to Settings >
        // Receipt > Terms & Conditions — deliberately NOT inherited from the linked invoice's own
        // terms_and_conditions, which is often filled with unrelated test/custom text that
        // shouldn't leak into a new Credit/Debit Note.
        setEnterTerms(editingNote?.terms_and_conditions || resolveDefaultTerms(corporateSettings?.receipt_terms));
        // Editing keeps the note's own saved bank/discount (they're re-sent on update).
        setSelectedBank(editingNote?.bank || "BOC");
        // The customer's invoice discount is never carried onto a Debit Note — it's an extra
        // charge on top of the invoice, not part of the discounted invoice total.
        const savedDiscount = editingNote && editingNote.discount != null && editingNote.discount !== ""
            ? Number(editingNote.discount)
            : null;
        setDiscount(
            noteType === "Debit Note"
                ? ""
                : savedDiscount != null
                    ? `${savedDiscount}%`
                    : invoicePreviewData?.invoice?.discount
                        ? `${invoicePreviewData.invoice.discount}%`
                        : ""
        );
        setCurrentStep(2);
    };

    const handleCreateNote = async () => {
        if (!selectedInvoice && !(noteType === "Debit Note" && selectedCustomer)) return;

        let hasChanges = false;
        let noteAmount = 0;
        let stashedItems = null;

        if (creationMode === "Enter Amount Manually") {
            noteAmount = Number(amount);
        } else {
            // Change Invoice Items Mode — adjustedQuantities holds the RETURN qty typed
            // directly; stored/kept-qty fields are derived from it (see adjustedItemsForPreview
            // above for why the stored contract stays "kept quantity").
            const originalTotal = pricedLinesForCreation.reduce((sum, item) => {
                const orgQty = item.current_display_qty;
                return sum + (orgQty * (item.rate || 0));
            }, 0);
            const adjustedTotal = pricedLinesForCreation.reduce((sum, item, idx) => {
                const uniqueId = item.lineKey;
                const orgQty = item.current_display_qty;
                const returnQtyVal = adjustedQuantities[uniqueId];
                const returnQty = returnQtyVal !== undefined ? (returnQtyVal === "" ? 0 : Number(returnQtyVal)) : 0;
                const keptQty = orgQty - returnQty;
                return sum + (keptQty * (item.rate || 0));
            }, 0);
            noteAmount = adjustedTotal - originalTotal;

              // Check if any quantity was actually returned
              pricedLinesForCreation.forEach((item, idx) => {
                  const uniqueId = item.lineKey;
                  const returnQtyVal = adjustedQuantities[uniqueId];
                  if (returnQtyVal !== undefined && returnQtyVal !== "" && Number(returnQtyVal) !== 0) {
                      hasChanges = true;
                  }
              });

              stashedItems = pricedLinesForCreation.map((item, idx) => {
                  const orgQty = item.current_display_qty;
                  const uniqueId = item.lineKey;
                  const returnQtyVal = adjustedQuantities[uniqueId];
                  const returnQty = returnQtyVal !== undefined ? (returnQtyVal === "" ? 0 : Number(returnQtyVal)) : 0;
                  const keptQty = orgQty - returnQty;
                  const diffVal = keptQty - orgQty;
                  return {
                      corp_item_id: item.corp_item_id,
                      item_name: item.item_name,
                      item_category_name: item.item_category_name || "ROOM LINEN",
                      quantity: orgQty,
                      original_qty: orgQty,
                      adjusted_quantity: keptQty,
                      adjusted_qty: keptQty,
                      unit_price: item.rate || 0,
                      org_amount: orgQty * (item.rate || 0),
                      adj_amount: keptQty * (item.rate || 0),
                      difference: diffVal,
                      diff: diffVal,
                      service_type: item.service_type || "Washing",
                      order_item_auto_id: item.order_item_auto_id,
                      // Same day / Delivery Order metadata as adjustedItemsForPreview, so viewing
                      // this saved note later renders the same DAYS-grid layout for Period customers.
                      pickup_date: item.pickup_date,
                      delivery_type: item.delivery_type,
                      delivery_id: item.delivery_id,
                      pickup_entry_id: item.pickup_entry_id,
                      room_no: item.room_no,
                      gate_pass_no: item.gate_pass_no,
                  };
              });
        }

        // A Debit Note never carries the customer's invoice discount (see handleNextStep).
        const finalDiscountPct = noteType === "Debit Note"
            ? 0
            : (discount !== "" ? parseDiscountInput(discount) : (invoicePreviewData?.invoice?.discount || 0));

        const isEditMode = !!editingNote;

        // Everything that determines a note's amounts/content — sent identically on create and
        // edit, so an edited note's saved SSCL/VAT/transport are recomputed exactly like a new
        // note's instead of keeping whatever was stored when it was first created.
        const commonFields = {
            type: noteType,
            linked_invoice_id: selectedInvoice?.invoice_id || null,
            customer_id: selectedInvoice?.customer_id || selectedCustomer?.customer_id || null,
            amount: Math.abs(noteAmount),
            reason: reason.trim(),
            description: enterNote.trim(),
            user_id: localStorage.getItem("userId") || "",
            due_date: noteType === "Debit Note" && dueDate ? dueDate : null,
            adjusted_items: hasChanges ? stashedItems : null,
            adjustedItems: hasChanges ? stashedItems : null,
            bank: selectedBank,
            discount: finalDiscountPct,
            ledger_account: selectedLedgerAccount,
            terms_and_conditions: enterTerms.trim(),
            ...buildCreateNoteChargeFields(noteAmount, transportCharge)
        };

        const payload = isEditMode
            ? {
                ...commonFields,
                id: editingNote.id,
                approval_status: editingNote.approval_status,
                // Kept alongside linked_invoice_id for the existing update endpoint.
                invoice_id: selectedInvoice?.invoice_id || null,
                // buildCreateNoteChargeFields omits transport when it's 0 — on an edit that must
                // be sent explicitly, or clearing the Transport Charge would never reach the DB.
                ...(toMoneyNumber(Math.abs(Number(transportCharge) || 0)) > 0
                    ? {}
                    : {
                        transport_amount: 0,
                        transport_charge: 0,
                        travelling_charge: 0,
                        traveling_charge: 0,
                        manual_transport_charge: 0,
                    })
            }
            : commonFields;

        try {
            setIsLoading(true);
            const result = isEditMode
                ? await updateCreditDebitNoteStatus(payload)
                : await createCreditDebitNote(payload);
            if (result?.success) {
                // Set before the success alert is awaited, so the preview has re-rendered with
                // the real number by the time handlePrint runs below.
                setSavedNoteHeader({
                    note_no: result.note_no || editingNote?.note_no || null,
                    note_date: result.note_date || editingNote?.date || null,
                });
                await Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: result.message || (isEditMode ? "Note updated successfully." : "Note created successfully."),
                    confirmButtonColor: "#1470F9",
                    timer: 1500
                });

                // Reset states — deferred until after the print dialog opens (onAfterPrint
                // above) so the printable preview is still mounted when handlePrint runs.
                resetCreationWizardRef.current = () => {
                    setAmount("");
                    setTransportCharge("");
                    setDueDate("");
                    setReason("");
                    setDescription("");
                    setEnterNote("");
                    setEnterTerms("");
                    setSelectedInvoice(null);
                    setInvoiceSearch("");
                    setNoteType("Credit Note");
                    setSelectedBank("BOC");
                    setDiscount("");
                    setSelectedLedgerAccount("");
                    setEditingNote(null);
                    setSavedNoteHeader(null);
                    setIsCreating(false);
                    setCurrentStep(1);

                    fetchData();
                };
                resetWizardAfterPrintRef.current = true;
                requestAnimationFrame(() => {
                    handlePrint();
                });
            } else {
                throw new Error(result?.message || (isEditMode ? "Failed to update note" : "Failed to create note"));
            }
        } catch (err) {
            console.error("Submission failed:", err);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: err.response?.data?.message || err.message || "An unexpected error occurred while saving the note.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            setIsLoading(false);
        }
    };


    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Fetch initial data
    // Ledgers are deliberately NOT fetched here — getAvailableFinanceLedgers() calls a
    // third-party service (a free-tier Render deployment) that can take 20-50s to respond
    // after being idle, and the notes list never needs the ledger list. Bundling it into this
    // Promise.all made the whole page's loading spinner wait on that external call even though
    // notes/invoices/customers were ready instantly. Ledgers load lazily instead, only once the
    // create wizard (the one place that needs them) is actually opened — see fetchLedgersIfNeeded.
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const userId = localStorage.getItem("userId");
            const [notesRes, invoicesRes, customersRes] = await Promise.all([
                getAllCreditDebitNotes(),
                getApprovedInvoices(),
                getAllCorporateCustomers(userId).catch(err => {
                    console.error("Corporate customers fetch failed, falling back to empty list", err);
                    return null;
                })
            ]);
            if (notesRes?.success) setNotes(notesRes.notes || []);
            if (invoicesRes?.success) setInvoices(invoicesRes.invoices || []);
            const customerList =
                customersRes?.data?.allCustomers ??
                customersRes?.data?.customers ??
                customersRes?.data?.corporate_customers ??
                customersRes?.data?.data ??
                [];
            setCorporateCustomers(Array.isArray(customerList) ? customerList : []);
        } catch (error) {
            console.error("Failed to fetch data:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to load credit/debit notes or invoices.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        getAllCorporateSettings(localStorage.getItem("userId"))
            .then((res) => {
                setCorporateSettings(res?.data?.settings?.[0] || {});
            })
            .catch((err) => {
                console.error("Failed to fetch corporate settings, falling back to default terms", err);
            });
    }, []);

    const handleViewNote = async (note) => {
        setViewingNote(note);
        setIsPreviewLoading(true);
        setPreviewData(null);
        setNotePriceList([]);
        setNoteItemTypes([]);
        setEnterNote(note.description || "");
        setReason(note.reason || "");
        setAmount(note.amount !== null && note.amount !== undefined ? String(note.amount) : "");
        setTransportCharge(getNoteTransportCharge(note) > 0 ? String(getNoteTransportCharge(note)) : "");
        setPreviewBank(note.bank || "BOC");
        setPreviewDiscount(note.discount !== null && note.discount !== undefined ? `${note.discount}%` : "");

        if (!note.linked_invoice_id) {
            // Standalone Debit Note — nothing to fetch, build the preview straight from the
            // customer it was raised against (same list already loaded for the Select Customer dropdown).
            const matchedCustomer = corporateCustomers.find((c) => String(c.customer_id) === String(note.customer_id));
            setPreviewData({ success: true, invoice: null, customer: matchedCustomer || null, items: [] });
            setEnterTerms(note.terms_and_conditions || resolveDefaultTerms(corporateSettings?.receipt_terms));
            setIsPreviewLoading(false);
            return;
        }

        try {
            const res = await getInvoicePreviewDetails(note.linked_invoice_id);
            if (res?.success) {
                setPreviewData(res);
                // Use this note's own saved terms if it has one; otherwise Settings > Receipt's
                // default — never the linked invoice's own terms_and_conditions (see handleNextStep).
                setEnterTerms(note.terms_and_conditions || resolveDefaultTerms(corporateSettings?.receipt_terms));

                // Same price-list-based rate resolution as handleSelectInvoice.
                const userId = localStorage.getItem("userId");
                const customerIdForPricing = res.invoice?.customer_id ?? res.customer?.customer_id ?? note.customer_id;
                Promise.all([
                    getCorporatePriceListByCustomer({ user_id: userId, customer_id: customerIdForPricing }),
                    getAllCorporateItems(userId),
                ]).then(([priceRes, itemsRes]) => {
                    const list =
                        priceRes?.data?.price_list ??
                        priceRes?.data?.corporate_price_lists ??
                        priceRes?.data ??
                        [];
                    setNotePriceList(Array.isArray(list) ? list : []);
                    const rawItems = itemsRes?.data?.corporate_items ?? [];
                    setNoteItemTypes(normalizeCorporateItemsForPricing(rawItems));
                }).catch((err) => {
                    console.error("Failed to load price list / item types for note pricing:", err);
                });
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: res?.message || "Failed to fetch invoice details for preview.",
                    confirmButtonColor: "#1470F9"
                });
                setViewingNote(null);
            }
        } catch (err) {
            console.error("Error fetching preview details:", err);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "An error occurred while loading preview details.",
                confirmButtonColor: "#1470F9"
            });
            setViewingNote(null);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    // Auto-open the View for ?viewNoteId=<id> once notes have loaded — lets other pages (e.g.
    // the invoice preview's "Credit & Debit Notes" panel) deep-link straight to a note's print
    // view instead of the user having to find it in this list manually.
    useEffect(() => {
        if (hasAutoOpenedNoteRef.current) return;
        const viewNoteId = searchParams.get("viewNoteId");
        if (!viewNoteId || !notes.length) return;
        const matched = notes.find((n) => String(n.id) === String(viewNoteId));
        if (matched) {
            hasAutoOpenedNoteRef.current = true;
            handleViewNote(matched);
        }
    }, [searchParams, notes]);

    const handleUpdateNoteStatus = async (newStatus, signature = null) => {
        if (!viewingNote || pendingStatusUpdate) return;
        setPendingStatusUpdate(newStatus);
        try {
            const res = await updateCreditDebitNoteStatus({
                id: viewingNote.id,
                approval_status: newStatus,
                user_id: localStorage.getItem("userId") || "",
                signature: signature
            });
            if (res?.success) {
                Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: `Note status updated to ${newStatus} successfully.`,
                    confirmButtonColor: "#1470F9"
                });
                // Back to the Credit & Debit Notes list after Check/Approve.
                setViewingNote(null);
                fetchData();
            } else {
                throw new Error(res?.message || "Failed to update status");
            }
        } catch (err) {
            console.error("Status update failed:", err);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to update note status.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            setPendingStatusUpdate(null);
        }
    };

    const handleCancelNote = async () => {
        const userId = localStorage.getItem("userId");
        if (!userId || !viewingNote?.id) return;

        const result = await Swal.fire({
            title: "Are you sure?",
            text: "You won't be able to revert this!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Yes, cancel it!"
        });
        if (!result.isConfirmed) return;

        try {
            setIsCancellingNote(true);
            const res = await cancelCreditDebitNote({ id: viewingNote.id, user_id: userId });
            if (res?.success) {
                Swal.fire({
                    icon: "success",
                    title: "Cancelled!",
                    text: "The note has been cancelled.",
                    confirmButtonColor: "#1470F9"
                });
                setViewingNote(prev => ({
                    ...prev,
                    status: "Deactive",
                    activity_log: res.activity_log || prev.activity_log
                }));
                fetchData();
            } else {
                throw new Error(res?.message || "Failed to cancel note");
            }
        } catch (err) {
            console.error("Error cancelling note:", err);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: err?.response?.data?.message ?? "Failed to cancel note.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            setIsCancellingNote(false);
        }
    };

    const pricedLines = useMemo(() => {
        if (!previewData || !previewData.items || !previewData.items.length) return [];

        const invoiceData = previewData.invoice;
        const customerProfile = previewData.customer;
        const taxes = previewData.taxes || [];

        const taxRates = {
            sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
            vat: pickCorporateTaxRatePercent(taxes, "VAT"),
        };

        const itemsWithPickup = previewData.items.map((it) => ({
            ...it,
            corp_item_quantity: resolveInvoicedQty(it),
            pickup_date: it.pickup_date || invoiceData.printed_at,
        }));

        // Same service-type % source/fallback as pricedLinesForCreation.
        const invoiceCustomerId = invoiceData?.customer_id ?? customerProfile?.customer_id;
        const fetchedCustomer =
            selectedCustomer && String(selectedCustomer.customer_id) === String(invoiceCustomerId)
                ? selectedCustomer
                : null;
        const customerServiceTypes = resolveCustomerServiceTypes(customerProfile, fetchedCustomer);

        const taxType = customerProfile?.tax_type ?? invoiceData.vat_status ?? "";
        const vatNumber = customerProfile?.customer_vat_number ?? customerProfile?.vat_number ?? customerProfile?.vat_no;

        const built = buildCollectionNoteLinesFromApiOrderItems({
            items: itemsWithPickup,
            customerPriceList: notePriceList,
            itemTypes: noteItemTypes,
            deliveryTypeRaw: resolveInvoiceDeliveryType(invoiceData),
            customerServiceTypes,
            corporateTaxRates: taxRates,
            taxType,
            vatNumber,
            customer: customerProfile,
            deliveryPercentageFallback: 0,
        });

        const formatPickupDateLabel = (raw) => {
            if (!raw) return "";
            const d = new Date(raw);
            if (Number.isFinite(d.getTime())) {
                return d.toISOString().split("T")[0].replace(/-/g, "/");
            }
            return String(raw).replace(/-/g, "/");
        };

        return built.map((row, idx) => {
            const src = itemsWithPickup[idx];
            const pd = src?.pickup_date;
            const label = formatPickupDateLabel(pd) || "—";
            const ms = pd ? Date.parse(pd) : 0;
            return {
                ...row,
                pickup_date: pd,
                pickup_label: label,
                pickup_sort: Number.isFinite(ms) ? ms : 0,
            };
        });
    }, [previewData, notePriceList, noteItemTypes, selectedCustomer]);

    // Close invoice / customer dropdowns when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsInvoiceDropdownOpen(false);
            }
            if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
                setIsCustomerDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Form Submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedInvoice) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please select a linked invoice.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please enter a valid amount.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }
        if (!reason.trim()) {
            Swal.fire({
                icon: "warning",
                title: "Validation Error",
                text: "Please enter a reason.",
                confirmButtonColor: "#1470F9"
            });
            return;
        }

        const payload = {
            type: noteType,
            linked_invoice_id: selectedInvoice.invoice_id,
            amount: Number(amount),
            reason: reason.trim(),
            description: description.trim(),
            user_id: localStorage.getItem("userId") || "",
            adjusted_items: null,
            adjustedItems: null,
            ledger_account: selectedLedgerAccount,
            ...buildCreateNoteChargeFields(amount)
        };

        try {
            const result = await createCreditDebitNote(payload);
            if (result?.success) {
                Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: result.message || "Note created successfully.",
                    confirmButtonColor: "#1470F9"
                });
                setShowCreateModal(false);
                // Reset states
                setAmount("");
                setReason("");
                setDescription("");
                setSelectedInvoice(null);
                setInvoiceSearch("");
                setNoteType("Credit Note");
                setSelectedLedgerAccount("");
                // Refresh list
                fetchData();
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Failed",
                    text: result?.message || "Failed to create note.",
                    confirmButtonColor: "#1470F9"
                });
            }
        } catch (error) {
            console.error("Submission failed:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "An unexpected error occurred while creating the note.",
                confirmButtonColor: "#1470F9"
            });
        }
    };

    // Filter notes
    const filteredNotes = notes.filter((note) => {
        // Search Filter
        const query = searchQuery.toLowerCase();
        const matchesSearch =
            (note.note_no || "").toLowerCase().includes(query) ||
            (note.type || "").toLowerCase().includes(query) ||
            (note.linked_invoice_id || "").toLowerCase().includes(query) ||
            (note.reason || "").toLowerCase().includes(query) ||
            (note.description && note.description.toLowerCase().includes(query));

        // Date Filter (Date Range)
        const matchesDateRange = (!startDate || note.date >= startDate) &&
                                 (!endDate || note.date <= endDate);

        // Tab Filter
        const matchesTab = note.type === activeTab;

        return matchesTab && matchesSearch && matchesDateRange;
    });

    // Pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentNotes = filteredNotes.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredNotes.length / itemsPerPage);
    const blankRows = itemsPerPage - currentNotes.length;

    // Filter customers for the searchable "Select Customer" dropdown
    const filteredCustomerOptions = corporateCustomers.filter((c) => {
        const label = String(c.company_name || c.customer_name || c.customer_id || "").toLowerCase();
        return label.includes(customerSearch.toLowerCase());
    });

    // Filter invoices for searchable dropdown — scoped to the selected customer, if any
    const filteredInvoiceOptions = invoices.filter((inv) => {
        const matchesCustomer = !selectedCustomer || String(inv.customer_id) === String(selectedCustomer.customer_id);
        const matchesSearch = inv.invoice_id.toLowerCase().includes(invoiceSearch.toLowerCase());
        return matchesCustomer && matchesSearch;
    });

    if (viewingNote) {
        const isApproved = viewingNote.isInvoiceOnly
            ? previewData?.invoice?.approval_status === "Approved"
            : viewingNote.approval_status === "Approved";
        const isCancelled = !viewingNote.isInvoiceOnly && viewingNote.status === "Deactive";
        return (
            <div className="flex flex-col gap-y-5 animate-fade-in">
                {/* Header with Back Navigation */}
                <div className="flex flex-row gap-x-3 items-center">
                    <HiOutlineArrowCircleLeft
                        className="size-6 text-primary cursor-pointer"
                        onClick={() => setViewingNote(null)}
                    />
                    <div className="flex flex-col">
                        <h1 className="text-3xl text-primary font-bold">
                            Credit & Debit Notes / {viewingNote.note_no}
                        </h1>
                        <p className="text-base text-black/50">
                            Record new laundry pickup with item counts by category
                        </p>
                    </div>
                </div>

                {/* Sub-Header Tabs placeholder */}
                <div className="flex flex-row border-b border-gray-300 text-xl font-semibold gap-x-2 items-center pb-2">
                    <Icon icon="material-symbols:refresh" className="bg-primary/20 text-primary rounded-full p-1 size-7" />
                    <span className="text-black">{viewingNote.isInvoiceOnly ? "Invoice" : viewingNote.type} Preview</span>
                </div>

                {isPreviewLoading ? (
                    <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <BeatLoader color="#1470F9" size={20} />
                    </div>
                ) : !previewData ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm gap-y-4">
                        <span className="text-red-500 font-semibold text-lg">Failed to load invoice preview details.</span>
                        <button
                            type="button"
                            onClick={() => setViewingNote(null)}
                            className="bg-primary text-white font-semibold px-6 py-2 rounded-full cursor-pointer hover:bg-blue-600 transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-x-6 mt-2">
                        {/* Printable Document Preview (Left) */}
                        <div className="col-span-3">
                            <CorporateInvoicePreview
                                ref={printRef}
                                order={{
                                    ...previewData.invoice,
                                    notes: enterNote,
                                    terms_and_conditions: enterTerms
                                }}
                                customerProfile={previewData.customer}
                                pricedLines={pricedLines}
                                supplierLegal={supplierLegal}
                                ssclRatePct={taxRates.sscl}
                                vatRatePct={taxRates.vat}
                                effectiveDiscountPercent={effectiveDiscountPercent}
                                isCreditNote={!viewingNote.isInvoiceOnly && viewingNote.type === "Credit Note"}
                                isDebitNote={!viewingNote.isInvoiceOnly && viewingNote.type === "Debit Note"}
                                noteNo={viewingNote.note_no}
                                noteDate={viewingNote.date}
                                noteReason={viewingNote.isInvoiceOnly ? "" : viewingNote.reason}
                                adjustedItems={viewingNote.adjusted_items}
                                manualLaundryCharges={manualLaundryChargesForPreview}
                                additionalTransportCharge={(!viewingNote.isInvoiceOnly && viewingNote.type === "Debit Note") ? (Number(transportCharge) || 0) : 0}
                                realInvoiceId={viewingNote.isInvoiceOnly ? viewingNote.linked_invoice_id : null}
                                checkedBySignature={viewingNote.isInvoiceOnly ? previewData?.invoice?.checked_by_signature : viewingNote.checked_by_signature}
                                checkedByUser={viewingNote.isInvoiceOnly ? previewData?.invoice?.checked_by_user : viewingNote.checked_by_user}
                                approvedByUser={viewingNote.isInvoiceOnly ? previewData?.invoice?.approved_by_user : viewingNote.approved_by_user}
                                approvedBySignature={viewingNote.isInvoiceOnly ? previewData?.invoice?.approved_by_signature : null}
                                preparedByName={viewingNote.isInvoiceOnly ? (previewData?.invoice?.printed_by || null) : (viewingNote.created_by_name || null)}
                                noteCreatedAt={viewingNote.isInvoiceOnly ? null : viewingNote.created_at}
                                noteActivityLog={viewingNote.isInvoiceOnly ? null : viewingNote.activity_log}
                                isCancelled={isCancelled}
                            />

                            {/* Bottom action buttons */}
                            <div className="flex flex-row text-xl my-5 justify-between gap-x-5">
                                <button
                                    type="button"
                                    className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer flex justify-center items-center"
                                    onClick={() => setViewingNote(null)}
                                >
                                    Back
                                </button>
                                {!viewingNote.isInvoiceOnly && !isCancelled ? (
                                    <button
                                        type="button"
                                        disabled={isCancellingNote}
                                        onClick={handleCancelNote}
                                        className="font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-full py-2 w-1/3 cursor-pointer transition-colors flex justify-center items-center disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isCancellingNote ? <BeatLoader size={8} color="#dc2626" /> : "Cancel Note"}
                                    </button>
                                ) : (
                                    <div className="w-1/3"></div>
                                )}
                                <button
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer flex justify-center items-center"
                                    onClick={handlePrint}
                                >
                                    Print Note
                                </button>
                            </div>
                        </div>

                        {/* Sidebar Column (Right) */}
                        <div className="col-span-1 flex flex-col gap-y-6 px-6 h-fit">
                            {viewingNote.isInvoiceOnly ? (
                                <>
                                    {/* This is the original, already-approved invoice — read-only, same as the Invoicing module */}
                                    <div className="font-bold py-2 rounded-full text-base shadow-sm transition-colors w-full bg-black/10 text-black/40 cursor-not-allowed flex justify-center items-center">
                                        🔒 Locked
                                    </div>

                                    {/* Created By */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Created By :</p>
                                        <div className="flex flex-row items-center gap-x-2">
                                            <Icon
                                                icon="mdi:check-circle"
                                                className="text-[#00E676] text-xl"
                                            />
                                            <span className="text-black/70 text-sm truncate">
                                                {previewData?.invoice?.printed_by || "—"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Checked By */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Checked By :</p>
                                        {previewData?.invoice?.checked_by_user ? (
                                            <div className="flex flex-row items-center gap-x-2">
                                                <Icon
                                                    icon="mdi:check-circle"
                                                    className="text-[#1470F9] text-xl"
                                                />
                                                <span className="text-black/70 text-sm truncate">
                                                    {previewData.invoice.checked_by_user}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-black/40 text-sm">Pending</span>
                                        )}
                                    </div>

                                    {/* Approved By */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Approved By :</p>
                                        {previewData?.invoice?.approved_by_user ? (
                                            <div className="flex flex-row items-center gap-x-2">
                                                <Icon
                                                    icon="mdi:check-circle"
                                                    className="text-[#00E676] text-xl"
                                                />
                                                <span className="text-black/70 text-sm truncate">
                                                    {previewData.invoice.approved_by_user}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-black/40 text-sm">Pending</span>
                                        )}
                                    </div>

                                    {/* Activity Log (from the original invoice) */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">
                                            Activity Log :
                                        </p>
                                        <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                                            {(() => {
                                                const raw = previewData?.invoice?.activity_log;
                                                let logList = [];
                                                if (Array.isArray(raw)) {
                                                    logList = raw;
                                                } else if (typeof raw === 'string') {
                                                    try {
                                                        logList = JSON.parse(raw);
                                                    } catch (e) {
                                                        logList = [];
                                                    }
                                                }
                                                if (!Array.isArray(logList) || logList.length === 0) {
                                                    return <div className="px-4 py-3 text-black/40 text-sm">No activity logged</div>;
                                                }
                                                return logList.map((log, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`px-4 py-2 text-sm text-black/70 ${
                                                            idx > 0
                                                                ? "border-t border-black/20"
                                                                : ""
                                                        }`}
                                                    >
                                                        <span className="font-semibold text-[13px]">
                                                            {formatLogDateTime(log.timestamp)}
                                                        </span>
                                                        {": "}
                                                        {log.user}{" "}
                                                        {log.description || log.type || log.action || ""}
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Edit Note Button — reopens the Create wizard, pre-filled, in edit mode */}
                                    <button
                                        type="button"
                                        disabled={isApproved || isCancelled}
                                        onClick={() => handleEditNoteClick(viewingNote)}
                                        className={`font-bold py-2 rounded-full text-base shadow-sm transition-colors w-full ${
                                            isApproved || isCancelled
                                                ? 'bg-black/10 text-black/40 cursor-not-allowed'
                                                : 'bg-[#E5EFFE] text-[#000000] hover:bg-[#d4e4fd] cursor-pointer flex justify-center items-center'
                                        }`}
                                    >
                                        {isCancelled ? '🔒 Cancelled' : isApproved ? '🔒 Locked' : 'Edit Note'}
                                    </button>

                                    {/* Ledger Account Info */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Ledger Account :</p>
                                        <div className="flex flex-row items-start gap-x-2">
                                            <Icon
                                                icon="material-symbols:account-balance-wallet"
                                                className="text-primary text-xl shrink-0"
                                            />
                                            <span className="text-black/70 text-sm font-semibold break-words">
                                                {viewingNote.ledger_account || "—"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Created By Tracker */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Created By :</p>
                                        <div className="flex flex-row items-center gap-x-2">
                                            <Icon
                                                icon="mdi:check-circle"
                                                className="text-[#00E676] text-xl"
                                            />
                                            <span className="text-black/70 text-sm truncate">
                                                {viewingNote.created_by_name || "—"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Checked By Tracker */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Checked By :</p>
                                        {viewingNote.checked_by_user || viewingNote.approval_status === "Checked" || viewingNote.approval_status === "Approved" ? (
                                            <div className="flex flex-row items-center gap-x-2">
                                                <Icon
                                                    icon="mdi:check-circle"
                                                    className="text-[#1470F9] text-xl"
                                                />
                                                <span className="text-black/70 text-sm truncate">
                                                    {viewingNote.checked_by_user || "—"}
                                                </span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={isCancelled || !!pendingStatusUpdate}
                                                onClick={() => handleUpdateNoteStatus("Checked")}
                                                className={`border font-medium py-2 rounded-full shadow-sm transition-colors w-full text-base flex justify-center items-center ${
                                                    isCancelled || !!pendingStatusUpdate
                                                        ? "border-black/20 text-black/30 bg-white cursor-not-allowed"
                                                        : "border-[#1470F9] text-[#1470F9] hover:bg-blue-50 bg-white cursor-pointer"
                                                }`}
                                            >
                                                {pendingStatusUpdate === "Checked" ? <BeatLoader size={8} color="#1470F9" /> : "Confirm Checked"}
                                            </button>
                                        )}
                                    </div>

                                    {/* Approved By Tracker */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">Approved By :</p>
                                        {viewingNote.approved_by_user || viewingNote.approval_status === "Approved" ? (
                                            <div className="flex flex-row items-center gap-x-2">
                                                <Icon
                                                    icon="mdi:check-circle"
                                                    className="text-[#00E676] text-xl"
                                                />
                                                <span className="text-black/70 text-sm truncate">
                                                    {viewingNote.approved_by_user || "—"}
                                                </span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={viewingNote.approval_status !== "Checked" || isCancelled || !!pendingStatusUpdate}
                                                onClick={() => handleUpdateNoteStatus("Approved")}
                                                className={`border font-medium py-2 rounded-full shadow-sm transition-colors w-full text-base flex justify-center items-center ${
                                                    viewingNote.approval_status === "Checked" && !isCancelled && (pendingStatusUpdate === "Approved" || !pendingStatusUpdate)
                                                        ? "bg-primary text-white hover:bg-blue-600 cursor-pointer"
                                                        : "border-black/20 text-black/30 bg-white cursor-not-allowed"
                                                }`}
                                            >
                                                {pendingStatusUpdate === "Approved" ? <BeatLoader size={8} color="#fff" /> : "Approved"}
                                            </button>
                                        )}
                                    </div>

                                    {/* Activity Log */}
                                    <div className="flex flex-col gap-y-2 text-[15px]">
                                        <p className="font-semibold text-black">
                                            Activity Log :
                                        </p>
                                        <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                                            {(() => {
                                                let logList = [];
                                                if (viewingNote.activity_log) {
                                                    try {
                                                        logList = typeof viewingNote.activity_log === 'string'
                                                            ? JSON.parse(viewingNote.activity_log)
                                                            : viewingNote.activity_log;
                                                    } catch (e) {
                                                        logList = [];
                                                    }
                                                }
                                                if (!logList || logList.length === 0) {
                                                    return <div className="px-4 py-3 text-black/40 text-sm">No activity logged</div>;
                                                }
                                                return logList.map((log, idx) => {
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`px-4 py-2 text-sm text-black/70 ${
                                                                idx > 0
                                                                    ? "border-t border-black/20"
                                                                    : ""
                                                            }`}
                                                        >
                                                            <span className="font-semibold text-[13px]">
                                                                {formatLogDateTime(log.timestamp)}
                                                            </span>
                                                            {": "}
                                                            {log.user}{" "}
                                                            {log.type === "Created"
                                                                ? `created the ${viewingNote.type.toLowerCase()}`
                                                                : log.type === "Checked"
                                                                ? `checked the ${viewingNote.type.toLowerCase()}`
                                                                : log.type === "Approved"
                                                                ? `approved the ${viewingNote.type.toLowerCase()}`
                                                                : log.type === "Cancelled"
                                                                ? `cancelled the ${viewingNote.type.toLowerCase()}`
                                                                : log.description || log.type}
                                                            {Array.isArray(log.changes) && log.changes.length > 0 && (
                                                                <ul className="mt-1 ml-1 list-disc list-inside text-black/60">
                                                                    {log.changes.map((change, changeIdx) => (
                                                                        <li key={changeIdx} className="break-words">
                                                                            <span className="font-medium">{change.field}</span>
                                                                            {": "}
                                                                            {change.old || "—"} → {change.new || "—"}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>

                                    {/* Note Details (read-only) */}
                                    <div className="flex flex-col gap-y-3 pt-2 border-t border-gray-100 text-[15px]">
                                        <div>
                                            <p className="font-semibold text-black">Reason :</p>
                                            <p className="text-black/70 mt-1 break-words">{viewingNote.reason || "—"}</p>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-black">Description :</p>
                                            <p className="text-black/70 mt-1 whitespace-pre-wrap break-words">{viewingNote.description || "—"}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (isCreating) {
        return (
            <div className="flex flex-col gap-y-5 animate-fade-in">
                {/* Header with Back Navigation */}
                <div className="flex flex-row gap-x-3 items-center">
                    <HiOutlineArrowCircleLeft
                        className="size-6 text-primary cursor-pointer"
                        onClick={() => {
                            if (currentStep === 2) {
                                setCurrentStep(1);
                            } else {
                                setIsCreating(false);
                                setCurrentStep(1);
                                setStashedNoteData(null);
                                setEditingNote(null);
                            }
                        }}
                    />
                    <div className="flex flex-col">
                        <h1 className="text-3xl text-primary font-bold">
                            Credit & Debit Notes / {editingNote ? "Edit" : "Create"} {noteType}
                        </h1>
                        <p className="text-base text-black/50">
                            Record new laundry pickup with item counts by category
                        </p>
                    </div>
                </div>

                {/* Stepper (Steps 1 & 2) */}
                <div className="flex justify-center items-center my-6">
                    <div className="flex items-center gap-x-4">
                        <div className={`rounded-full size-10 flex items-center justify-center font-bold text-base border-2 transition-all ${
                            currentStep >= 1 ? "bg-primary border-primary text-white shadow-md" : "border-gray-300 text-gray-400 bg-white"
                        }`}>
                            1
                        </div>
                        <div className={`h-1 w-24 rounded-full transition-all ${currentStep >= 2 ? "bg-primary" : "bg-gray-200"}`} />
                        <div className={`rounded-full size-10 flex items-center justify-center font-bold text-base border-2 transition-all ${
                            currentStep >= 2 ? "bg-primary border-primary text-white shadow-md" : "border-gray-300 text-gray-400 bg-white"
                        }`}>
                            2
                        </div>
                    </div>
                </div>

                {currentStep === 1 ? (
                    <div className="flex flex-col gap-y-6">
                        {/* Box 1: Selection Dropdowns */}
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm grid grid-cols-3 gap-x-6">
                            {/* Select Customer — filters the linked invoice dropdown below to this customer's invoices */}
                            <div className="flex flex-col gap-y-1 relative" ref={customerDropdownRef}>
                                <label className="text-black/70 font-semibold text-base">Select Customer <span className="text-red-500 font-normal text-xs">(Required)</span></label>
                                <div
                                    onClick={() => setIsCustomerDropdownOpen(true)}
                                    className="flex flex-row border border-gray-300 rounded-xl px-4 py-2.5 items-center justify-between cursor-pointer bg-white"
                                >
                                    <span className="text-base text-black font-medium truncate">
                                        {selectedCustomer ? (selectedCustomer.company_name || selectedCustomer.customer_name || selectedCustomer.customer_id) : "All Customers"}
                                    </span>
                                    <Icon icon="mdi:chevron-down" className="text-gray-500 size-5 shrink-0" />
                                </div>

                                {isCustomerDropdownOpen && (
                                    <div className="absolute top-[80px] left-0 w-full bg-white border border-gray-200 rounded-2xl shadow-xl z-50 flex flex-col p-2">
                                        <input
                                            type="text"
                                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-base focus:outline-none mb-2 focus:border-primary shrink-0"
                                            placeholder="Type to search customer..."
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                        />
                                        <div className="overflow-y-auto max-h-48 flex flex-col gap-y-1">
                                            <div
                                                onClick={() => {
                                                    selectCustomerWithDetails(null);
                                                    setIsCustomerDropdownOpen(false);
                                                    setCustomerSearch("");
                                                    setSelectedInvoice(null);
                                                    setInvoicePreviewData(null);
                                                    setAdjustedQuantities({});
                                                }}
                                                className="px-3 py-2 text-base hover:bg-primary/5 rounded-lg cursor-pointer font-medium text-black/60"
                                            >
                                                All Customers
                                            </div>
                                            {filteredCustomerOptions.length === 0 ? (
                                                <span className="text-black/40 text-center py-2">No customers found</span>
                                            ) : (
                                                filteredCustomerOptions.map((c, idx) => (
                                                    <div
                                                        key={c.customer_id || c.customer_auto_id || idx}
                                                        onClick={() => {
                                                            selectCustomerWithDetails(c);
                                                            setIsCustomerDropdownOpen(false);
                                                            setCustomerSearch("");
                                                            setSelectedInvoice(null);
                                                            setInvoicePreviewData(null);
                                                            setAdjustedQuantities({});
                                                        }}
                                                        className="px-3 py-2 text-base hover:bg-primary/5 rounded-lg cursor-pointer flex justify-between font-medium"
                                                    >
                                                        <span className="truncate">{c.company_name || c.customer_name || c.customer_id}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Linked Invoice search dropdown */}
                            <div className="flex flex-col gap-y-1 relative" ref={dropdownRef}>
                                <label className="text-black/70 font-semibold text-base">
                                    Select Linked Invoice{" "}
                                    {noteType === "Debit Note" ? (
                                        <span className="text-black/40 font-normal text-xs">(Optional)</span>
                                    ) : (
                                        <span className="text-red-500 font-normal text-xs">(Required)</span>
                                    )}
                                </label>
                                <div
                                    onClick={() => setIsInvoiceDropdownOpen(true)}
                                    className="flex flex-row border border-gray-300 rounded-xl px-4 py-2.5 items-center justify-between cursor-pointer bg-white"
                                >
                                    <span className="text-base text-black font-medium">
                                        {selectedInvoice ? selectedInvoice.invoice_id : "Select Linked Invoice..."}
                                    </span>
                                    <div className="flex flex-row items-center gap-x-1 shrink-0">
                                        {selectedInvoice && (
                                            <button
                                                type="button"
                                                title="Clear selected invoice"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleClearSelectedInvoice();
                                                }}
                                                className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors flex items-center"
                                            >
                                                <Icon icon="material-symbols:close-rounded" className="size-5" />
                                            </button>
                                        )}
                                        <Icon icon="mdi:chevron-down" className="text-gray-500 size-5" />
                                    </div>
                                </div>

                                {isInvoiceDropdownOpen && (
                                    <div className="absolute top-[80px] left-0 w-full bg-white border border-gray-200 rounded-2xl shadow-xl z-50 flex flex-col p-2">
                                        <input
                                            type="text"
                                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-base focus:outline-none mb-2 focus:border-primary shrink-0"
                                            placeholder="Type to search invoice..."
                                            value={invoiceSearch}
                                            onChange={(e) => setInvoiceSearch(e.target.value)}
                                        />
                                        <div className="overflow-y-auto max-h-48 flex flex-col gap-y-1">
                                            {filteredInvoiceOptions.length === 0 ? (
                                                <span className="text-black/40 text-center py-2">No invoices found</span>
                                            ) : (
                                                filteredInvoiceOptions.map((inv) => (
                                                    <div
                                                        key={inv.invoice_id}
                                                        onClick={() => {
                                                            handleSelectInvoice(inv);
                                                            setIsInvoiceDropdownOpen(false);
                                                            setInvoiceSearch("");
                                                        }}
                                                        className="px-3 py-2 text-base hover:bg-primary/5 rounded-lg cursor-pointer flex justify-between font-medium"
                                                    >
                                                        <span>{inv.invoice_id}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Select Ledger Account */}
                            <div className="flex flex-col gap-y-1">
                                <label className="text-black/70 font-semibold text-base">Select Ledger Account <span className="text-red-500 font-normal text-xs">(Required)</span></label>
                                <select
                                    value={selectedLedgerAccount}
                                    onChange={(e) => setSelectedLedgerAccount(e.target.value)}
                                    className="border border-gray-300 rounded-xl px-4 py-2.5 text-base bg-white text-black font-medium focus:outline-none focus:border-primary cursor-pointer"
                                >
                                    <option value="">Select Ledger Account...</option>
                                    {ledgers.map((l) => (
                                        <option key={l.ledg_id} value={`${l.ledg_number} - ${l.ledg_name}`}>
                                            {l.ledg_number} - {l.ledg_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Box 2: Linked Invoice info table (rendered only when invoice selected) */}
                        {selectedInvoice && (() => {
                            const linkedInvoice = invoicePreviewData?.invoice;
                            // Same source as the invoice's own Bill Preview "Date of Invoice"
                            // (see CorporateDailyInvoiceGenerate's invoiceDate memo): printed_at
                            // is the true creation date, falling back to legacy `date`.
                            // invoicing_date is NOT it — that column is creation date + the
                            // customer's payment period (a due date), not the invoice date.
                            const invoiceDateDisplay = formatInvoiceDatePlain(
                                linkedInvoice?.printed_at ||
                                linkedInvoice?.date ||
                                linkedInvoice?.invoice_date ||
                                linkedInvoice?.invoicing_date ||
                                linkedInvoice?.created_at
                            ) || "—";
                            // Active (non-cancelled) Credit Notes already issued against this
                            // invoice — netted out of its balance below so Balance reflects what's
                            // actually still owed, same logic Receive Payment's Invoice List uses.
                            // On a Debit Note, only APPROVED Credit Notes count — a pending
                            // (Created/Checked) one hasn't actually reduced what the customer owes
                            // yet. A Credit Note still counts pending ones so the same amount can't
                            // be credited twice while the first is awaiting approval.
                            const totalCreditAmount = (invoicePreviewData?.creditNotes || [])
                                .filter((n) => n?.status !== "Deactive")
                                .filter((n) => noteType !== "Debit Note" || n?.approval_status === "Approved")
                                .reduce((sum, n) => sum + getNoteDisplayAmount(n), 0);
                            const totalDebitAmount = (
                                invoicePreviewData?.debitNotes ||
                                notes.filter((n) =>
                                    n?.type === "Debit Note" &&
                                    n?.status !== "Deactive" &&
                                    String(n?.linked_invoice_id) === String(selectedInvoice.invoice_id)
                                )
                            )
                                .filter((n) => n?.status !== "Deactive")
                                // Same rule as Credit Notes above: on a Debit Note, only APPROVED
                                // Debit Notes count toward the total.
                                .filter((n) => noteType !== "Debit Note" || n?.approval_status === "Approved")
                                .reduce((sum, n) => sum + getNoteDisplayAmount(n), 0);
                            // Paid comes straight off the invoice's own paid_amount column — not
                            // derived from total_amount - balance_due, which can disagree with it
                            // (balance_due gets adjusted by things paid_amount doesn't reflect).
                            const paidAmount = Number(linkedInvoice?.paid_amount || 0);
                            // The invoice's real bill total. cash_amount holds the grand total exactly
                            // as the invoice bill computed it; total_amount does NOT — the backend
                            // overwrites it at generation with its own recalculation, which re-adds
                            // SSCL/VAT on top of tax-inclusive (e.g. Urgent) line rates. Same field
                            // priority as Customer Payment's getInvoiceGrossTotal.
                            // Preferred: the amount exactly as the Daily/Period invoice list shows it
                            // (linkedInvoiceListAmount); the stored fields below are only a fallback
                            // while it loads or if it can't be resolved.
                            const invoiceAmount = linkedInvoiceListAmount ?? (Number(
                                linkedInvoice?.grand_total ??
                                linkedInvoice?.final_grand_total ??
                                linkedInvoice?.total_amount_including_vat ??
                                linkedInvoice?.amount_including_vat ??
                                linkedInvoice?.cash_amount ??
                                linkedInvoice?.total_amount ??
                                linkedInvoice?.sub_total ??
                                0
                            ) || 0);
                            const balanceAfterCredit = Math.max(0, invoiceAmount - paidAmount - totalCreditAmount);
                            // The backend's own invoice_status can lag behind (e.g. still says
                            // "Paid" from before a Debit Note added to what's owed) — go by the
                            // balance actually left here instead of trusting that column blindly.
                            const displayPaymentStatus = balanceAfterCredit > 0
                                ? (paidAmount > 0 ? "Partially Paid" : (linkedInvoice?.invoice_status || "Pending"))
                                : "Paid";
                            return (
                            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col gap-y-4 animate-fade-in">
                                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                                    <div className="grid grid-cols-9 gap-x-2 text-white bg-primary font-semibold py-3 px-4 text-base items-center">
                                        <p>INVOICE ID</p>
                                        <p>DATE</p>
                                        <p>AMOUNT</p>
                                        <p>PAID</p>
                                        <p>TOTAL CREDIT AMOUNT</p>
                                        <p>TOTAL DEBIT AMOUNT</p>
                                        <p>BALANCE</p>
                                        <p>PAYMENT STATUS</p>
                                        <p className="text-center">ACTION</p>
                                    </div>
                                    <div className="grid grid-cols-9 gap-x-2 text-base py-3.5 px-4 bg-white items-center">
                                        <div className="font-semibold text-black/80">{selectedInvoice.invoice_id}</div>
                                        <div className="text-black/70">{invoiceDateDisplay}</div>
                                        <div className="text-black font-bold">Rs {invoiceAmount.toFixed(2)}</div>
                                        <div className="text-black/70">Rs {paidAmount.toFixed(2)}</div>
                                        <div className="text-red-500 font-medium">
                                            {totalCreditAmount > 0 ? `- Rs ${totalCreditAmount.toFixed(2)}` : "-"}
                                        </div>
                                        <div className="text-primary font-medium">
                                            {totalDebitAmount > 0 ? `+ Rs ${totalDebitAmount.toFixed(2)}` : "-"}
                                        </div>
                                        <div className="text-black font-bold">Rs {balanceAfterCredit.toFixed(2)}</div>
                                        <div>
                                            <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                                displayPaymentStatus === "Paid"
                                                    ? "text-green-600 bg-green-50"
                                                    : displayPaymentStatus === "Partially Paid"
                                                        ? "text-amber-600 bg-amber-50"
                                                        : "text-red-500 bg-red-50"
                                            }`}>
                                                {displayPaymentStatus}
                                            </span>
                                        </div>
                                        <div className="flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // View the original linked invoice exactly as shown in the Invoicing module —
                                                    // not a Credit/Debit Note (no note has been created yet at this step).
                                                    setViewingNote({
                                                        note_no: "Invoice Preview",
                                                        type: noteType,
                                                        linked_invoice_id: selectedInvoice.invoice_id,
                                                        date: invoiceDateDisplay,
                                                        isInvoiceOnly: true
                                                    });
                                                    setPreviewData(invoicePreviewData);
                                                    setEnterNote(linkedInvoice?.notes || "");
                                                    setEnterTerms(linkedInvoice?.terms_and_conditions || "");
                                                }}
                                                className="cursor-pointer text-primary hover:text-blue-600"
                                            >
                                                <Icon icon="mdi:eye" className="text-2xl" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            );
                        })()}

                        {/* Manual / Itemized Adjustment Switch */}
                        <div className="flex border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                            <button
                                type="button"
                                onClick={() => setCreationMode("Enter Amount Manually")}
                                className={`w-1/2 py-2.5 text-base font-bold transition-all cursor-pointer ${
                                    creationMode === "Enter Amount Manually"
                                        ? "bg-primary text-white"
                                        : "bg-gray-100 text-black/60 hover:bg-gray-200"
                                }`}
                            >
                                Enter Amount Manually
                            </button>
                            <button
                                type="button"
                                disabled={noteType === "Debit Note" || !!editingNote}
                                onClick={() => {
                                    if (!selectedInvoice) {
                                        Swal.fire({
                                            icon: "warning",
                                            title: "Validation Error",
                                            text: "Please select a linked invoice first to adjust items.",
                                            confirmButtonColor: "#1470F9"
                                        });
                                        return;
                                    }
                                    setCreationMode("Change Invoice Items");
                                }}
                                className={`w-1/2 py-2.5 text-base font-bold transition-all ${
                                    noteType === "Debit Note" || editingNote
                                        ? "bg-gray-100 text-black/30 cursor-not-allowed"
                                        : creationMode === "Change Invoice Items"
                                        ? "bg-primary text-white cursor-pointer"
                                        : "bg-gray-100 text-black/60 hover:bg-gray-200 cursor-pointer"
                                }`}
                                title={noteType === "Debit Note" ? "Disabled for Debit Notes" : editingNote ? "Item adjustments can't be edited after creation" : ""}
                            >
                                Change Invoice Items
                            </button>
                        </div>

                        {/* Mode content panel */}
                        {creationMode === "Enter Amount Manually" ? (
                            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col gap-y-4 animate-fade-in">
                                <div className="flex flex-col gap-y-1">
                                    <label className="text-black/70 font-semibold text-base">Amount <span className="text-red-500 font-normal text-xs">(Required)</span></label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                        placeholder="Enter amount"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                {noteType === "Debit Note" && (
                                    <div className="grid grid-cols-2 gap-x-6">
                                        <div className="flex flex-col gap-y-1">
                                            <label className="text-black/70 font-semibold text-base">Transport Charge <span className="text-black/40 font-normal text-xs">(Optional)</span></label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                                placeholder="Enter transport charge"
                                                value={transportCharge}
                                                onChange={(e) => setTransportCharge(e.target.value)}
                                                onWheel={(e) => e.target.blur()}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-y-1">
                                            <label className="text-black/70 font-semibold text-base">Due Date <span className="text-black/40 font-normal text-xs">(Optional)</span></label>
                                            <input
                                                type="date"
                                                className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary cursor-pointer"
                                                value={dueDate}
                                                onChange={(e) => setDueDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-x-6">
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-black/70 font-semibold text-base">Reason <span className="text-red-500 font-normal text-xs">(Required)</span></label>
                                        <input
                                            type="text"
                                            className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                            placeholder="Enter reason"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-black/70 font-semibold text-base">Description <span className="text-black/40 font-normal text-xs">(Optional)</span></label>
                                        <textarea
                                            rows={1}
                                            className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary resize-none"
                                            placeholder="Enter description"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Change Invoice Items Mode
                            <div className="flex flex-col gap-y-6 animate-fade-in">
                                {isInvoicePreviewLoading ? (
                                    <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-gray-200">
                                        <BeatLoader color="#1470F9" size={20} />
                                    </div>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col gap-y-6">
                                        {/* Adjustment Table */}
                                        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                                            <div className="grid grid-cols-12 gap-x-2 text-white bg-primary font-semibold py-2 px-3 text-sm items-center">
                                                <p className="col-span-2">ITEM TYPE</p>
                                                <p className="col-span-2">CATEGORY</p>
                                                <p className="col-span-1 text-center">QTY</p>
                                                <p className="col-span-2 text-center">RETURN QTY</p>
                                                <p className="col-span-1 text-right">UNIT PRICE</p>
                                                <p className="col-span-1.5 text-right">ORG. AMOUNT</p>
                                                <p className="col-span-1.5 text-right">RETURN AMOUNT</p>
                                                <p className="col-span-1 text-right">BALANCE QTY</p>
                                            </div>
                                            {itemsByDeliveryOrder.length === 0 ? (
                                                <div className="text-center text-black/40 py-10 text-lg font-medium bg-white">
                                                    No items found in this invoice.
                                                </div>
                                            ) : (
                                                itemsByDeliveryOrder.map((group) => {
                                                    let groupOrgAmount = 0;
                                                    let groupReturnAmount = 0;

                                                    const itemRows = group.items.map((record, idx) => {
                                                        const orgQty = record.current_display_qty;
                                                        record.qty = orgQty;
                                                        const uniqueId = record.lineKey;
                                                        const returnQtyVal = adjustedQuantities[uniqueId];
                                                        const returnQty = returnQtyVal !== undefined
                                                            ? (returnQtyVal === "" ? 0 : Number(returnQtyVal))
                                                            : 0;
                                                        const unitPrice = record.rate || 0;
                                                        const orgAmount = orgQty * unitPrice;
                                                        const returnAmount = returnQty * unitPrice;
                                                        const balanceQty = orgQty - returnQty;
                                                        groupOrgAmount += orgAmount;
                                                        groupReturnAmount += returnAmount;

                                                        return (
                                                            <div
                                                                key={uniqueId}
                                                                className="grid grid-cols-12 gap-x-2 text-sm py-2 px-3 border-b border-gray-100 last:border-0 items-center bg-white"
                                                            >
                                                                <div className="col-span-2 font-medium text-black/80">{record.item_name}</div>
                                                                <div className="col-span-2 text-black/60">{record.item_category_name || "—"}</div>
                                                                <div className="col-span-1 text-center text-black/70 font-semibold">{orgQty}</div>
                                                                <div className="col-span-2 flex justify-center">
                                                                    <input
                                                                        type="number"
                                                                        max={record.qty}
                                                                        min={0}
                                                                        className="border border-gray-300 rounded-lg px-2 py-0.5 text-center w-24 focus:outline-none focus:border-primary text-sm font-semibold"
                                                                        value={adjustedQuantities[uniqueId] ?? 0}
                                                                        placeholder="0"
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            let numVal = val === "" ? "" : Number(val);
                                                                            if (numVal !== "" && numVal > orgQty) {
                                                                                numVal = orgQty;
                                                                            }
                                                                            if (numVal !== "" && numVal < 0) {
                                                                                numVal = 0;
                                                                            }
                                                                            setAdjustedQuantities((prev) => ({
                                                                                ...prev,
                                                                                [uniqueId]: numVal
                                                                            }));
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div className="col-span-1 text-right text-black/70 font-medium">Rs {unitPrice.toFixed(2)}</div>
                                                                <div className="col-span-1.5 text-right text-black/70 font-medium">Rs {orgAmount.toFixed(2)}</div>
                                                                <div className="col-span-1.5 text-right text-black font-bold">Rs {returnAmount.toFixed(2)}</div>
                                                                <div className="col-span-1 text-right font-bold text-black/70">
                                                                    {balanceQty}
                                                                </div>
                                                            </div>
                                                        );
                                                    });

                                                    return (
                                                        <div key={group.deliveryOrderId}>
                                                            <div className="bg-[#E8F1FF] text-left py-1.5 px-3 border-b border-gray-200">
                                                                <span className="text-xs font-bold text-black">Delivery Order Number : {group.deliveryOrderId}</span>
                                                            </div>
                                                            {itemRows}
                                                            <div className="grid grid-cols-12 gap-x-2 text-xs font-bold py-1.5 px-3 border-b border-gray-200 bg-[#F5F5F5] text-black">
                                                                <div className="col-span-8 text-left pl-1">Sub Total ({group.deliveryOrderId})</div>
                                                                <div className="col-span-1.5 text-right">Rs {groupOrgAmount.toFixed(2)}</div>
                                                                <div className="col-span-1.5 text-right">Rs {groupReturnAmount.toFixed(2)}</div>
                                                                <div className="col-span-1"></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Bottom Summaries */}
                                        <div className="grid grid-cols-3 gap-x-6 mt-4">
                                            {/* Original Total */}
                                            <div className="border border-gray-200 bg-gray-50/50 rounded-2xl p-4 shadow-sm flex flex-col gap-y-1">
                                                <span className="text-black/50 text-xs font-semibold">Original Total</span>
                                                <span className="text-black font-extrabold text-lg">
                                                    Rs {pricedLinesForCreation.reduce((sum, item) => sum + (item.current_display_qty * (item.rate || 0)), 0).toFixed(2)}
                                                </span>
                                            </div>
                                            {/* Adjusted Total */}
                                            <div className="border border-gray-200 bg-gray-50/50 rounded-2xl p-4 shadow-sm flex flex-col gap-y-1">
                                                <span className="text-black/50 text-xs font-semibold">Adjusted Total</span>
                                                <span className="text-black font-extrabold text-lg">
                                                    Rs {pricedLinesForCreation.reduce((sum, item, idx) => {
                                                        const uniqueId = item.lineKey;
                                                        const returnQtyVal = adjustedQuantities[uniqueId];
                                                        const returnQty = returnQtyVal !== undefined ? (returnQtyVal === "" ? 0 : Number(returnQtyVal)) : 0;
                                                        const keptQty = item.current_display_qty - returnQty;
                                                        return sum + (keptQty * (item.rate || 0));
                                                    }, 0).toFixed(2)}
                                                </span>
                                            </div>
                                            {/* Note Amount */}
                                            <div className="border border-gray-200 bg-gray-50/50 rounded-2xl p-4 shadow-sm flex flex-col gap-y-1">
                                                <span className="text-black/50 text-xs font-semibold">Note Amount</span>
                                                <span className="text-primary font-extrabold text-lg">
                                                    Rs {pricedLinesForCreation.reduce((sum, item, idx) => {
                                                        const uniqueId = item.lineKey;
                                                        const returnQtyVal = adjustedQuantities[uniqueId];
                                                        const returnQty = returnQtyVal !== undefined ? (returnQtyVal === "" ? 0 : Number(returnQtyVal)) : 0;
                                                        return sum + (returnQty * (item.rate || 0));
                                                    }, 0).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Reason and Description inputs below summaries */}
                                        <div className="grid grid-cols-2 gap-x-6">
                                            <div className="flex flex-col gap-y-1">
                                                <label className="text-black/70 font-semibold text-base">Reason <span className="text-red-500 font-normal text-xs">(Required)</span></label>
                                                <input
                                                    type="text"
                                                    className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                                    placeholder="Enter reason"
                                                    value={reason}
                                                    onChange={(e) => setReason(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-y-1">
                                                <label className="text-black/70 font-semibold text-base">Description <span className="text-black/40 font-normal text-xs">(Optional)</span></label>
                                                <textarea
                                                    rows={1}
                                                    className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary resize-none"
                                                    placeholder="Enter description"
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-row justify-between items-center mt-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCreating(false);
                                    setStashedNoteData(null);
                                    setCurrentStep(1);
                                }}
                                className="cursor-pointer border-2 border-primary hover:bg-blue-50 text-primary text-base font-bold py-2 px-8 rounded-full transition-colors shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleNextStep}
                                className="cursor-pointer bg-primary hover:bg-blue-600 text-white text-base font-bold py-2 px-10 rounded-full transition-colors shadow-md"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                ) : (
                    // Step 2 Preview & Finalize View
                    <div className="flex flex-col gap-y-6">
                        <div className="grid grid-cols-4 gap-x-6 mt-2">
                            {/* Printable Document Preview (Left) */}
                            <div className="col-span-3 border-r border-black/20 pe-3">
                                <CorporateInvoicePreview
                                    ref={printRef}
                                    order={{
                                        ...invoicePreviewData?.invoice,
                                        customer_id: invoicePreviewData?.invoice?.customer_id || selectedCustomer?.customer_id,
                                        customer_name: invoicePreviewData?.invoice?.customer_name || selectedCustomer?.company_name || selectedCustomer?.customer_name,
                                        notes: enterNote,
                                        terms_and_conditions: enterTerms
                                    }}
                                    customerProfile={invoicePreviewData?.customer || selectedCustomer}
                                    pricedLines={pricedLinesForCreation}
                                    supplierLegal={supplierLegal}
                                    ssclRatePct={taxRates.sscl}
                                    vatRatePct={taxRates.vat}
                                    effectiveDiscountPercent={effectiveDiscountPercent}
                                    isCreditNote={noteType === "Credit Note"}
                                    isDebitNote={noteType === "Debit Note"}
                                    noteNo={savedNoteHeader?.note_no || editingNote?.note_no || ""}
                                    noteDate={savedNoteHeader?.note_date || editingNote?.date || new Date().toISOString().split("T")[0]}
                                    noteReason={reason}
                                    adjustedItems={isAdjusted ? adjustedItemsForPreview : null}
                                    manualLaundryCharges={manualLaundryChargesForPreview}
                                    additionalTransportCharge={noteType === "Debit Note" ? (Number(transportCharge) || 0) : 0}
                                    hideInvoiceNumberInSummary={creationMode === "Change Invoice Items"}
                                />

                                {/* Bottom Buttons */}
                                <div className="flex flex-row text-xl mt-5 mb-2 justify-between gap-x-5">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentStep(1)}
                                        className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/2 cursor-pointer transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateNote}
                                        disabled={isLoading}
                                        className="font-semibold text-white bg-primary rounded-full py-2 w-1/2 cursor-pointer transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? <BeatLoader color="#fff" size={10} /> : `${editingNote ? "Update" : "Create"} & Print`}
                                    </button>
                                </div>
                            </div>

                            {/* Sidebar Column (Right) */}
                            <div className="col-span-1 flex flex-col gap-y-6 px-6 h-fit">
                                {/* Edit Note Button (locked/disabled during creation preview) */}
                                <button
                                    disabled={true}
                                    className="font-bold py-2 rounded-full text-base shadow-sm w-full bg-black/10 text-black/40 cursor-not-allowed flex justify-center items-center"
                                >
                                    🔒 Locked (Pre-creation)
                                </button>

                                {/* Selected Ledger Account */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Ledger Account :</p>
                                    <div className="flex flex-row items-start gap-x-2">
                                        <Icon
                                            icon="material-symbols:account-balance-wallet"
                                            className="text-primary text-xl shrink-0"
                                        />
                                        <span className="text-black/70 text-sm font-semibold break-words">
                                            {selectedLedgerAccount || "—"}
                                        </span>
                                    </div>
                                </div>

                                {/* Created By Tracker */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Created By :</p>
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon
                                            icon="mdi:check-circle"
                                            className="text-[#00E676] text-xl"
                                        />
                                        <span className="text-black/70 text-sm truncate">
                                            {localStorage.getItem("userName") || "System"}
                                        </span>
                                    </div>
                                </div>

                                {/* Checked By Tracker */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Checked By :</p>
                                    <button
                                        type="button"
                                        disabled={true}
                                        className="border border-black/20 text-black/30 font-medium py-2 rounded-full shadow-sm bg-white w-full text-base cursor-not-allowed flex justify-center items-center"
                                    >
                                        Confirm Checked
                                    </button>
                                </div>

                                {/* Approved By Tracker */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Approved By :</p>
                                    <button
                                        type="button"
                                        disabled={true}
                                        className="border border-black/20 text-black/30 bg-white font-medium py-2 rounded-full shadow-sm w-full text-base cursor-not-allowed flex justify-center items-center"
                                    >
                                        Approved
                                    </button>
                                </div>

                                {/* Activity Log */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">
                                        Activity Log :
                                    </p>
                                    <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                                        <div className="px-4 py-2 text-sm text-black/70">
                                            <span className="font-semibold text-[13px]">
                                                {formatLogDateTime(new Date().toISOString())}
                                            </span>
                                            {": "}
                                            {localStorage.getItem("userName") || "System"}{" "}
                                            drafting the note
                                        </div>
                                    </div>
                                </div>

                                {/* Inputs Block (Bank, Discount, Note) */}
                                <div className="flex flex-col gap-y-4 pt-2 border-t border-gray-100">
                                    {/* Select Bank / Discount — commented out for now, not needed yet. Re-enable by
                                    uncommenting this block when these are needed again.
                                    {noteType !== "Credit Note" && (
                                        <>
                                            <div className="flex flex-col gap-y-1.5">
                                                <label className="text-base font-bold text-black" htmlFor="creation-bank-select">
                                                    Select Bank :
                                                </label>
                                                <select
                                                    id="creation-bank-select"
                                                    value={selectedBank}
                                                    onChange={(e) => setSelectedBank(e.target.value)}
                                                    className="border border-black/20 bg-white px-4 py-2.5 rounded-2xl text-base outline-none focus:border-primary cursor-pointer font-semibold"
                                                >
                                                    <option value="BOC">BOC</option>
                                                    <option value="Commercial Bank">Commercial Bank</option>
                                                    <option value="Peoples Bank">Peoples Bank</option>
                                                    <option value="Sampath Bank">Sampath Bank</option>
                                                </select>
                                            </div>

                                            <div className="flex flex-col gap-y-1.5">
                                                <label className="text-base font-bold text-black" htmlFor="creation-discount-input">
                                                    Discount :
                                                </label>
                                                <input
                                                    id="creation-discount-input"
                                                    type="text"
                                                    value={discount}
                                                    onChange={(e) => setDiscount(e.target.value)}
                                                    className="border border-black/20 bg-white px-4 py-2.5 rounded-2xl text-base outline-none focus:border-primary font-semibold"
                                                    placeholder="Value or Percentage (%)"
                                                />
                                            </div>
                                        </>
                                    )}
                                    */}

                                    {/* Enter Terms & Conditions Textarea */}
                                    <div className="flex flex-col gap-y-1.5">
                                        <label className="text-base font-bold text-black" htmlFor="creation-terms-textarea">
                                            Enter Terms & Conditions :
                                        </label>
                                        <textarea
                                            id="creation-terms-textarea"
                                            rows={4}
                                            value={enterTerms}
                                            onChange={(e) => setEnterTerms(e.target.value)}
                                            className="border border-black/20 bg-white px-4 py-2.5 rounded-2xl text-base outline-none resize-none focus:border-primary transition-colors"
                                            placeholder="Enter terms & conditions"
                                        />
                                    </div>

                                    {/* Description Textarea */}
                                    <div className="flex flex-col gap-y-1.5">
                                        <label className="text-base font-bold text-black" htmlFor="creation-note-textarea">
                                            Description :
                                        </label>
                                        <textarea
                                            id="creation-note-textarea"
                                            rows={4}
                                            value={enterNote}
                                            onChange={(e) => setEnterNote(e.target.value)}
                                            className="border border-black/20 bg-white px-4 py-2.5 rounded-2xl text-base outline-none resize-none focus:border-primary transition-colors"
                                            placeholder="Enter description here"
                                        />
                                    </div>

                                    {/* Apply Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            Swal.fire({
                                                icon: "success",
                                                title: "Draft Updated",
                                                text: "Changes applied to draft successfully.",
                                                toast: true,
                                                position: "top-end",
                                                showConfirmButton: false,
                                                timer: 2000
                                            });
                                        }}
                                        className="w-full py-2.5 text-base font-bold rounded-full transition-colors shadow-md bg-primary hover:bg-blue-600 text-white cursor-pointer"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header */}
            <div className="flex flex-row justify-between items-center">
                <div className="flex flex-col">
                    <h1 className="text-4xl font-bold text-primary">Credit & Debit Notes</h1>
                    <p className="text-2xl text-black/50">All the credit and debit notes for invoices</p>
                </div>
                <div className="flex flex-row gap-x-4">
                    {activeTab === "Credit Note" && (
                        <button
                            type="button"
                            onClick={() => {
                                setNoteType("Credit Note");
                                setIsCreating(true);
                                setSelectedInvoice(null);
                                setInvoicePreviewData(null);
                                setAdjustedQuantities({});
                                setAmount("");
                                setTransportCharge("");
                                setDueDate("");
                                setReason("");
                                setDescription("");
                                setSelectedLedgerAccount("");
                                setCreationMode("Enter Amount Manually");
                                setCurrentStep(1);
                            }}
                            className="flex flex-row items-center gap-x-2 bg-primary hover:bg-blue-600 text-white font-semibold text-lg py-2.5 px-6 rounded-full cursor-pointer transition-colors shadow-md animate-fade-in"
                        >
                            <Icon icon="material-symbols:add" className="size-5" />
                            <span>Add Credit Note</span>
                        </button>
                    )}
                    {activeTab === "Debit Note" && (
                        <button
                            type="button"
                            onClick={() => {
                                setNoteType("Debit Note");
                                setIsCreating(true);
                                setSelectedInvoice(null);
                                setInvoicePreviewData(null);
                                setAdjustedQuantities({});
                                setAmount("");
                                setTransportCharge("");
                                setDueDate("");
                                setReason("");
                                setDescription("");
                                setSelectedLedgerAccount("");
                                setCreationMode("Enter Amount Manually");
                                setCurrentStep(1);
                            }}
                            className="flex flex-row items-center gap-x-2 bg-primary hover:bg-blue-600 text-white font-semibold text-lg py-2.5 px-6 rounded-full cursor-pointer transition-colors shadow-md animate-fade-in"
                        >
                            <Icon icon="material-symbols:add" className="size-5" />
                            <span>Add Debit Note</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Sub-Header Tabs */}
            <div className="flex flex-row border-b border-gray-300 text-xl font-semibold gap-x-6">
                <button
                    type="button"
                    onClick={() => {
                        setActiveTab("Credit Note");
                        setCurrentPage(1);
                    }}
                    className={`pb-2 cursor-pointer transition-colors ${
                        activeTab === "Credit Note"
                            ? "border-b-2 border-primary text-primary font-bold animate-fade-in"
                            : "text-black/50 hover:text-black"
                    }`}
                >
                    Credit Notes
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setActiveTab("Debit Note");
                        setCurrentPage(1);
                    }}
                    className={`pb-2 cursor-pointer transition-colors ${
                        activeTab === "Debit Note"
                            ? "border-b-2 border-primary text-primary font-bold animate-fade-in"
                            : "text-black/50 hover:text-black"
                    }`}
                >
                    Debit Notes
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-row gap-x-3 items-center">
                {/* Search */}
                <div className="flex flex-row border border-gray-300 rounded-full h-fit w-1/3 bg-white items-center px-4 py-1.5 gap-x-2 shadow-sm">
                    <MdSearch className="size-5 text-gray-400" />
                    <input
                        className="grow text-base focus:outline-none bg-transparent"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        placeholder="Search..."
                    />
                </div>

                <div className="flex flex-row items-center gap-x-3">
                    <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-1 bg-white text-base">
                        <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                        <input
                            type="date"
                            className="focus:outline-none text-black/70 font-medium cursor-pointer"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                    <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-1 bg-white text-base">
                        <span className="text-black/50 font-semibold mr-2">End Date:</span>
                        <input
                            type="date"
                            className="focus:outline-none text-black/70 font-medium cursor-pointer"
                            value={endDate}
                            onChange={(e) => {
                                setEndDate(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                    {(startDate || endDate) && (
                        <button
                            type="button"
                            onClick={() => {
                                setStartDate("");
                                setEndDate("");
                                setCurrentPage(1);
                            }}
                            className="flex flex-row items-center gap-x-1 text-sm text-red-500 font-semibold cursor-pointer hover:underline"
                        >
                            <Icon icon="material-symbols:close-rounded" className="size-4" />
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            ) : (
                <div className="rounded-xl bg-white overflow-hidden border border-gray-200 shadow-sm">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-x-3 text-white bg-primary font-semibold py-3 px-4 text-lg items-center">
                        <p className="col-span-1">NOTE NO</p>
                        <p className="col-span-2">TYPE</p>
                        <p className="col-span-1">DATE</p>
                        <p className="col-span-2">LINKED INVOICE</p>
                        <p className="col-span-1">AMOUNT</p>
                        <p className="col-span-2">REASON</p>
                        <p className="col-span-2">STATUS</p>
                        <p className="col-span-1 text-center">ACTION</p>
                    </div>

                    {/* Content Rows */}
                    {currentNotes.length === 0 ? (
                        <div className="text-center text-black/40 py-10 text-xl font-medium bg-white">
                            No credit/debit notes found.
                        </div>
                    ) : (
                        currentNotes.map((note, index) => {
                            const status = note.status === "Deactive" ? "Cancelled" : (note.approval_status || "Created");
                            // Debit Notes list the same Total Amount Including VAT as their printed note.
                            const displayAmount = note.type === "Debit Note"
                                ? getDebitNoteGrandTotal(
                                    note,
                                    corporateCustomers.find((c) => String(c.customer_id) === String(note.customer_id))
                                )
                                : getNoteDisplayAmount(note);
                            return (
                                <div
                                    key={note.id}
                                    className={`grid grid-cols-12 gap-x-3 text-lg py-3.5 px-4 border-b border-gray-100 last:border-0 ${
                                        index % 2 === 0 ? "bg-white" : "bg-primary/5"
                                    } items-center`}
                                >
                                    <div className="col-span-1 font-semibold text-black/80">{note.note_no}</div>
                                    <div className="col-span-2">
                                        <span
                                            className={`font-bold px-2 py-0.5 rounded-md text-sm ${
                                                note.type === "Credit Note"
                                                    ? "text-red-500 bg-red-50"
                                                    : "text-primary bg-primary/5"
                                            }`}
                                        >
                                            {note.type === "Credit Note" ? "-Credit Note" : "+Debit Note"}
                                        </span>
                                    </div>
                                    <div className="col-span-1 text-black/70">{note.date}</div>
                                    <div className="col-span-2 text-black/70">{note.linked_invoice_id || "—"}</div>
                                    <div
                                        className={`col-span-1 font-bold ${
                                            note.type === "Credit Note" ? "text-red-500" : "text-primary"
                                        }`}
                                    >
                                        {note.type === "Credit Note" ? "-" : "+"}Rs {displayAmount.toFixed(2)}
                                    </div>
                                    <div className="col-span-2 text-black/70 truncate">{note.reason}</div>
                                    <div className="col-span-2">
                                        <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium text-center border ${
                                            status === "Cancelled"
                                                ? "bg-red-100 text-red-700 border-red-300"
                                                : status === "Approved"
                                                ? "bg-green-100 text-green-700 border-green-300"
                                                : status === "Checked"
                                                ? "bg-blue-100 text-blue-700 border-blue-300"
                                                : "bg-yellow-50 text-yellow-700 border-yellow-300"
                                        }`}>
                                            {status}
                                        </span>
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <button
                                            type="button"
                                            onClick={() => handleViewNote(note)}
                                            className="flex flex-col items-center gap-y-0.5 cursor-pointer group"
                                        >
                                            <Icon
                                                icon="mdi:eye"
                                                className="text-primary group-hover:text-blue-600 text-2xl transition-colors"
                                            />
                                            <p className="text-xs font-semibold text-black/50 group-hover:text-primary transition-colors">
                                                View
                                            </p>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Blank rows to keep table size consistent */}
                    {blankRows > 0 && currentNotes.length > 0 && (
                        Array.from({ length: blankRows }).map((_, idx) => (
                            <div
                                key={`blank-${idx}`}
                                className={`h-14 border-b border-gray-100 last:border-0 ${
                                    (currentNotes.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/5"
                                }`}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Pagination */}
            {!isLoading && filteredNotes.length > 0 && (
                <div className="flex flex-row justify-between items-center mt-2">
                    <p className="text-sm text-black/50">
                        Show {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredNotes.length)} of{" "}
                        {filteredNotes.length} entries
                    </p>

                    <div className="flex justify-end gap-2 flex-wrap">
                        <button
                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 text-sm font-medium cursor-pointer"
                        >
                            Previous
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer border ${
                                    i === currentPage
                                        ? "bg-primary text-white border-primary"
                                        : "bg-white text-black/60 border-gray-200"
                                }`}
                            >
                                {i}
                            </button>
                        ))}

                        <button
                            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 text-sm font-medium cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Create Credit/Debit Note Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-[900px] border border-gray-100 shadow-2xl p-8 flex flex-col relative animate-fade-in">
                        {/* Close button top right */}
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="absolute top-6 right-6 rounded-full bg-blue-50 hover:bg-red-50 text-primary hover:text-red-500 p-2 cursor-pointer transition-colors"
                        >
                            <Icon icon="material-symbols:close" className="size-6" />
                        </button>

                        {/* Title */}
                        <div className="text-center mb-6">
                            <h2 className="text-3xl font-bold text-primary">Create Credit/Debit Note</h2>
                            <p className="text-black/50 text-base mt-1">Allow user to create, credit and debit note.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6">
                            {/* Note Type Selectable Cards */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-black/70 font-semibold text-lg">Note Type</label>
                                <div className="grid grid-cols-2 gap-x-5">
                                    {/* Credit Note Card */}
                                    <div
                                        onClick={() => setNoteType("Credit Note")}
                                        className={`flex flex-row items-center border p-4 rounded-2xl cursor-pointer transition-all ${
                                            noteType === "Credit Note"
                                                ? "border-red-500 bg-red-50/50 shadow-sm"
                                                : "border-gray-200 bg-white hover:border-gray-300"
                                        }`}
                                    >
                                        <div
                                            className={`rounded-full size-10 flex items-center justify-center text-white mr-4 shadow-sm ${
                                                noteType === "Credit Note" ? "bg-red-500" : "bg-gray-300"
                                            }`}
                                        >
                                            <Icon icon="ic:baseline-minus" className="size-6" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-lg text-black">Credit Note</span>
                                            <span className="text-xs text-black/50">Reduces invoice amount</span>
                                        </div>
                                    </div>

                                    {/* Debit Note Card */}
                                    <div
                                        onClick={() => setNoteType("Debit Note")}
                                        className={`flex flex-row items-center border p-4 rounded-2xl cursor-pointer transition-all ${
                                            noteType === "Debit Note"
                                                ? "border-primary bg-primary/5 shadow-sm"
                                                : "border-gray-200 bg-white hover:border-gray-300"
                                        }`}
                                    >
                                        <div
                                            className={`rounded-full size-10 flex items-center justify-center text-white mr-4 shadow-sm ${
                                                noteType === "Debit Note" ? "bg-primary" : "bg-gray-300"
                                            }`}
                                        >
                                            <Icon icon="ic:baseline-plus" className="size-6" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-lg text-black">Debit Note</span>
                                            <span className="text-xs text-black/50">Adds to invoice amount</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dual Fields: Linked Invoice & Amount */}
                            <div className="grid grid-cols-2 gap-x-6">
                                {/* Linked Invoice Searchable Dropdown */}
                                <div className="flex flex-col gap-y-1 relative" ref={dropdownRef}>
                                    <label className="text-black/70 font-semibold text-lg">Linked Invoice</label>
                                    <div
                                        onClick={() => setIsInvoiceDropdownOpen(true)}
                                        className="flex flex-row border border-gray-300 rounded-xl px-4 py-2.5 items-center justify-between cursor-pointer bg-white"
                                    >
                                        <span className="text-base text-black font-medium">
                                            {selectedInvoice
                                                ? selectedInvoice.invoice_id
                                                : "Select Invoice..."}
                                        </span>
                                        <Icon icon="mdi:chevron-down" className="text-gray-500 size-5" />
                                    </div>

                                    {isInvoiceDropdownOpen && (
                                        <div className="absolute top-[80px] left-0 w-full bg-white border border-gray-200 rounded-2xl shadow-xl z-50 flex flex-col p-2">
                                            {/* Search input in dropdown - remains sticky at top */}
                                            <input
                                                type="text"
                                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-base focus:outline-none mb-2 focus:border-primary shrink-0"
                                                placeholder="Type to search invoice..."
                                                value={invoiceSearch}
                                                onChange={(e) => setInvoiceSearch(e.target.value)}
                                            />
                                            {/* Scrollable list container */}
                                            <div className="overflow-y-auto max-h-48 flex flex-col gap-y-1">
                                                {filteredInvoiceOptions.length === 0 ? (
                                                    <span className="text-black/40 text-center py-2">No invoices found</span>
                                                ) : (
                                                    filteredInvoiceOptions.map((inv) => (
                                                        <div
                                                            key={inv.invoice_id}
                                                            onClick={() => {
                                                                setSelectedInvoice(inv);
                                                                setIsInvoiceDropdownOpen(false);
                                                                setInvoiceSearch("");
                                                            }}
                                                            className="px-3 py-2 text-base hover:bg-primary/5 rounded-lg cursor-pointer flex justify-between font-medium"
                                                        >
                                                            <span>{inv.invoice_id}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Amount */}
                                <div className="flex flex-col gap-y-1">
                                    <label className="text-black/70 font-semibold text-lg">Amount</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                        placeholder="Enter amount"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                            </div>

                            {/* Dual Fields: Reason & Description */}
                            <div className="grid grid-cols-2 gap-x-6">
                                {/* Reason */}
                                <div className="flex flex-col gap-y-1">
                                    <label className="text-black/70 font-semibold text-lg">Reason</label>
                                    <input
                                        type="text"
                                        required
                                        className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                        placeholder="Enter reason"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                    />
                                </div>

                                {/* Description */}
                                <div className="flex flex-col gap-y-1">
                                    <label className="text-black/70 font-semibold text-lg">Description</label>
                                    <textarea
                                        rows={1}
                                        className="border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary resize-none"
                                        placeholder="Enter description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-row justify-end gap-x-5 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="cursor-pointer border-2 border-primary hover:bg-blue-50 text-primary text-lg font-bold py-2.5 px-10 rounded-full transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="cursor-pointer bg-primary hover:bg-blue-600 text-white text-lg font-bold py-2.5 px-10 rounded-full transition-colors shadow-md"
                                >
                                    Create {noteType === "Credit Note" ? "Credit Note" : "Debit Note"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Read-Only View Detail Modal */}
            {showViewModal && selectedNote && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-[600px] border border-gray-100 shadow-2xl p-8 flex flex-col relative animate-fade-in">
                        {/* Close button top right */}
                        <button
                            type="button"
                            onClick={() => setShowViewModal(false)}
                            className="absolute top-6 right-6 rounded-full bg-blue-50 hover:bg-red-50 text-primary hover:text-red-500 p-2 cursor-pointer transition-colors"
                        >
                            <Icon icon="material-symbols:close" className="size-6" />
                        </button>

                        <h2 className="text-3xl font-bold text-primary text-center mb-6">Note Details</h2>

                        <div className="flex flex-col gap-y-4 text-lg">
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Note No:</span>
                                <span className="font-bold text-black">{selectedNote.note_no}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Type:</span>
                                <span
                                    className={`font-bold px-2 py-0.5 rounded-md text-sm ${
                                        selectedNote.type === "Credit Note"
                                            ? "text-red-500 bg-red-50"
                                            : "text-primary bg-primary/5"
                                    }`}
                                >
                                    {selectedNote.type}
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Ledger Account:</span>
                                <span className="text-black font-semibold">{selectedNote.ledger_account || "—"}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Date:</span>
                                <span className="text-black font-medium">{selectedNote.date}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Linked Invoice:</span>
                                <span className="text-black font-medium">{selectedNote.linked_invoice_id}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Amount:</span>
                                <span
                                    className={`font-extrabold ${
                                        selectedNote.type === "Credit Note" ? "text-red-500" : "text-primary"
                                    }`}
                                >
                                    Rs {getNoteDisplayAmount(selectedNote).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="font-semibold text-black/50">Reason:</span>
                                <span className="text-black font-medium">{selectedNote.reason}</span>
                            </div>
                            <div className="flex flex-col border-b border-gray-100 pb-2 gap-y-1">
                                <span className="font-semibold text-black/50">Description:</span>
                                <span className="text-black/80 font-medium whitespace-pre-wrap">
                                    {selectedNote.description || "No description provided."}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-center mt-6">
                            <button
                                type="button"
                                onClick={() => setShowViewModal(false)}
                                className="cursor-pointer bg-primary hover:bg-blue-600 text-white text-lg font-bold py-2.5 px-10 rounded-full transition-colors shadow-md"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Signature Modal */}
            {showSignatureModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
                    <div className="bg-white rounded-[24px] w-full max-w-[450px] shadow-2xl flex flex-col p-8 transition-all relative">
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                            Confirm Checked
                        </h2>
                        <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                            Please draw your signature in the box below to confirm checking this note:
                        </p>

                        <div className="w-full h-[180px] border border-dashed border-gray-300 rounded-xl overflow-hidden bg-white mb-3">
                            <SignatureCanvas
                                ref={sigCanvasRef}
                                penColor="black"
                                canvasProps={{
                                    className: "w-full h-full cursor-crosshair bg-white"
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => sigCanvasRef.current?.clear()}
                            className="text-gray-400 hover:text-gray-600 text-sm underline underline-offset-4 self-start cursor-pointer transition-colors mb-6"
                        >
                            Clear Signature
                        </button>

                        <div className="flex flex-row gap-x-4 w-full">
                            <button
                                type="button"
                                onClick={() => setShowSignatureModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (sigCanvasRef.current?.isEmpty()) {
                                        Swal.fire({
                                            icon: "warning",
                                            title: "Validation Error",
                                            text: "Please provide a signature.",
                                            confirmButtonColor: "#1470F9"
                                        });
                                        return;
                                    }
                                    const signature = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
                                    handleUpdateNoteStatus("Checked", signature);
                                    setShowSignatureModal(false);
                                }}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
