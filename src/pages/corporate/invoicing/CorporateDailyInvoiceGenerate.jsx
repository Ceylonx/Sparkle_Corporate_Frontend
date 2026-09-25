import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import SignatureCanvas from "react-signature-canvas";
import Swal from "sweetalert2";
import { BeatLoader } from "react-spinners";
import {
    generateCorporateInvoice,
    getCorporateInvoiceById,
    getCorporateInvoiceByInvoiceId,
    pickCorporateSalesInvoiceIdFromGetByPickupResponse,
    trackPickupEntryById,
    updateCorporateTaxInvoicePreviewApproval,
    normalizePreviewApprovalStatus,
    pickTaxInvoicePreviewActorFields,
    pickTaxInvoicePreviewActivityLog,
    pickTaxInvoicePreviewApprovalRaw,
    isCorporateInvoiceAlreadyGenerated,
    cancelInvoice,
    getCorporateDeliveryNoteForInvoice,
} from "../../../services/corporate/CorporateInvoicingServices";
import {
    getAllCorporateSettings,
    getCorporatePriceListByCustomer,
    getAllCorporateItems,
} from "../../../services/corporate/CorporateSettingsServices";
import {
    getCorporateCustomerById,
    getAllCorporateCustomers,
    unwrapCorporateCustomerGetByIdResponse,
} from "../../../services/CustomerServices";
import { getCreditDebitNotesByInvoice } from "../../../services/corporate/CreditDebitNoteServices";
import { buildCollectionNoteLinesFromApiOrderItems, computeLineFinalRateWithDelivery, resolveDeliverySurchargePercent, isNoTaxCustomerType, hasCustomerVatNumber } from "../../../utils/corporateCollectionNotePricing";
import { computeCorporateTaxInvoiceSummary, taxSummaryToGenerateInvoiceAmounts, invoiceBindNumber } from "../../../utils/corporateTaxInvoiceMath";
import { normalizePickupTrackResponse } from "../../../utils/normalizeCorporatePickupTrackResponse";
import CorporateInvoicePreview from "./CorporateInvoicePreview";

function unwrapTrackPayload(res) {
    const raw = res?.data;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const nested = raw.data;
    const merged =
        nested != null && typeof nested === "object" && !Array.isArray(nested) ? { ...raw, ...nested } : raw;
    try {
        const normalized = normalizePickupTrackResponse(merged);
        return normalized && typeof normalized === "object" ? normalized : merged;
    } catch {
        return merged;
    }
}

/** Daily invoice tax summary uses 2.5% SSCL and 18% VAT per business rules. */
const DAILY_INVOICE_SSCL_PCT = 2.5;
const DAILY_INVOICE_VAT_PCT = 18;

const DEFAULT_TERMS = 'Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only';

const resolveTerms = (termsVal, settingsTerms) => {
    const cleanTerms = (val) => {
        if (!val || String(val).trim() === "" || String(val).trim() === "Test 02" || String(val).trim().toLowerCase() === "null") {
            return null;
        }
        return String(val).trim();
    };
    return cleanTerms(termsVal) || cleanTerms(settingsTerms) || DEFAULT_TERMS;
};

const CORPORATE_INVOICE_BANK_OPTIONS = [
    { value: "BOC", label: "BOC" },
    { value: "Commercial Bank", label: "Commercial Bank" },
    { value: "Peoples Bank", label: "Peoples Bank" },
    { value: "Sampath Bank", label: "Sampath Bank" },
    { value: "HNB", label: "HNB" },
];

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

function formatPickupDateLabel(raw) {
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) {
        return d.toLocaleDateString('en-CA').replace(/-/g, "/");
    }
    return String(raw).replace(/-/g, "/");
}

function pickFirstString(obj, keys) {
    if (!obj) return "";
    for (const k of keys) {
        const v = obj[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

/** True if the string looks like a pickup order id (not INV… / DB invoice_id). */
function isPickupStyleInvoiceRef(s) {
    const t = String(s || "").trim();
    return /^PE_ORDER/i.test(t) || /^PE_/i.test(t);
}

const TRACK_INVOICE_ID_KEYS = [
    "invoice_id",
    "corporate_invoice_no",
    "generated_invoice_no",
    "tax_invoice_no",
    "tax_invoice_number",
    "invoice_no",
    "invoice_ref_no",
];

/** Same formatting as CorporateViewPickupEntry for activity log timestamps. */
const formatLogTimestamp = (isoString) => {
    try {
        const date = new Date(isoString);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${yyyy}-${mm}-${dd} ${hours}:${minutes} ${ampm}`;
    } catch (_) {
        return isoString;
    }
};

function readInvoicePreviewDraftKey(userId, cus, routeId) {
    if (!userId || !cus || routeId == null || String(routeId).trim() === "") return null;
    return `corporateDailyInvoiceDraft:v1:${userId}:${cus}:${String(routeId).trim()}`;
}

/** A Credit/Debit Note's full gross total (base amount + SSCL + VAT + Transport Charge) — matches
 *  what the note's own print preview shows as its final total, rather than just the base amount
 *  entered when it was created. */
function getNoteGrossAmount(note) {
    const base = Number(note?.amount || 0);
    const sscl = Number(note?.sscl_amount ?? note?.sscl_tax_amount ?? 0);
    const vat = Number(note?.vat_amount || 0);
    const transport = Number(
        note?.transport_amount ?? note?.transport_charge ?? note?.travelling_charge ?? note?.traveling_charge ?? 0
    );
    return base + sscl + vat + transport;
}

const CorporateDailyInvoiceGenerate = ({ cus: propCus, id: propId, onClose } = {}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { cus: routeCus, id: routeId } = useParams();
    const cus = propCus || routeCus;
    const id = propId || routeId;
    const invoiceRef = useRef(null);

    const [invoice, setInvoice] = useState(null);
    const [customerProfile, setCustomerProfile] = useState(null);
    const [corporateSettings, setCorporateSettings] = useState(null);
    const [priceList, setPriceList] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [pricedLines, setPricedLines] = useState([]);
    const [previewOrder, setPreviewOrder] = useState(null);
    const [originalResponses, setOriginalResponses] = useState([]);

    const [allCorporateCustomers, setAllCorporateCustomers] = useState([]);
    const [corporateCustomerListLoading, setCorporateCustomerListLoading] = useState(true);

    const [isLoadingInvoice, setIsLoadingInvoice] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [discount, setDiscount] = useState("");

    const sigCanvasRef = useRef(null);
    const appliedSnapshotRef = useRef({ bank: "", discount: "", notes: "", terms: "", trip_count: 0 });

    const [approvalStatus, setApprovalStatus] = useState("Created");
    const [createdByName, setCreatedByName] = useState("");
    const [checkedByUser, setCheckedByUser] = useState(null);
    const [checkedBySignature, setCheckedBySignature] = useState(null);
    const [approvedByUser, setApprovedByUser] = useState(null);
    const [approvedBySignature, setApprovedBySignature] = useState(null);
    const [signingForStatus, setSigningForStatus] = useState(null);
    const [activityLog, setActivityLog] = useState([]);
    // Credit/Debit Notes already raised against this invoice — shown in the side panel so a
    // checker/approver can see at a glance whether this invoice has already been adjusted.
    const [linkedCreditDebitNotes, setLinkedCreditDebitNotes] = useState([]);
    const [isLoadingLinkedNotes, setIsLoadingLinkedNotes] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [isApprovalLoading, setIsApprovalLoading] = useState(false);
    const [realInvoiceId, setRealInvoiceId] = useState(null);
    const [transportRateOverride, setTransportRateOverride] = useState("");
    const [manualTripCount, setManualTripCount] = useState(null);
    const [isTripCountEdited, setIsTripCountEdited] = useState(false);
    const [isTransportChargeEdited, setIsTransportChargeEdited] = useState(false);
    const [lastEditedTransportField, setLastEditedTransportField] = useState(null); // 'transport' | 'tripCount' | null
    const [showTripCountModal, setShowTripCountModal] = useState(false);
    const [tempTripCount, setTempTripCount] = useState("");
    const [preparationSignature, setPreparationSignature] = useState(null);
    const [preparedByName, setPreparedByName] = useState("");
    const [isTransportEditing, setIsTransportEditing] = useState(false);
    const [tempTransportCharge, setTempTransportCharge] = useState("");
    const [tempTripCountVal, setTempTripCountVal] = useState("");

    const getSavedRatePerTrip = (invObj) => {
        if (!invObj) return null;
        // Only return the saved rate if the user explicitly edited it
        if (Number(invObj.isupdated_transport_rate) === 1) {
            const rateCol = parseFloat(invObj.transport_rate_per_trip);
            if (rateCol && !Number.isNaN(rateCol) && rateCol > 0) {
                return String(rateCol);
            }
        }
        return null;
    };

    const handleStartTransportEdit = () => {
        if (!isInvoiceGenerated) {
            Swal.fire({
                icon: "warning",
                title: "Create Invoice First",
                text: "Create the invoice first",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        const savedRate = getSavedRatePerTrip(invoice);
        const initialRate = transportRateOverride !== ""
            ? transportRateOverride
            : (savedRate !== null ? savedRate : (locationRate ? String(locationRate) : ""));
        const initialTripCount = manualTripCount !== null && manualTripCount !== undefined
            ? String(manualTripCount)
            : (invoice?.trip_count !== undefined && invoice?.trip_count !== null ? String(invoice.trip_count) : "");

        setTempTransportCharge(initialRate);
        setTempTripCountVal(initialTripCount);
        setLastEditedTransportField(null);
        setIsTransportEditing(true);
    };

    const handleCancelTransportEdit = () => {
        setIsTransportEditing(false);
    };

    const handleSaveTransportEdit = async () => {
        const rawRateInput = parseFloat(tempTransportCharge) || 0;
        const newTripCount = tempTripCountVal === "" ? null : (parseInt(tempTripCountVal, 10) || 0);

        const countForTotal = newTripCount !== null ? newTripCount : 1;
        const computedTotalTransport = rawRateInput * countForTotal;

        setTransportRateOverride(String(rawRateInput));
        setManualTripCount(newTripCount);
        setIsTransportChargeEdited(true);
        if (lastEditedTransportField === "tripCount") {
            setIsTripCountEdited(true);
        }
        setIsTransportEditing(false);

        const targetInvoiceId = realInvoiceId || invForApproval || (invoice && invoice.id ? invoice.id : null);
        if (targetInvoiceId) {
            try {
                setIsLoadingSubmit?.(true);
                const amounts = taxSummaryToGenerateInvoiceAmounts ? taxSummaryToGenerateInvoiceAmounts(invoiceSummary) : { grand_total: invoiceSummary?.grandTotal || 0 };

                await updateCorporateTaxInvoicePreviewApproval({
                    user_id: localStorage.getItem("userId") || "",
                    invoice_id: targetInvoiceId,
                    pickup_entry_ids: formData?.pickup_entry_id || [],
                    customer_auto_id: cus,
                    approval_status: approvalStatus || "Pending",
                    checked_by_user: checkedByUser,
                    checked_by_signature: checkedBySignature,
                    approved_by_user: approvedByUser,
                    activity_log: activityLog,
                    trip_count: newTripCount,
                    transport_charge: computedTotalTransport,
                    transport_rate_per_trip: rawRateInput,
                    isupdated_transport_rate: 1,
                    total_amount: amounts.grand_total,
                    balance_due: amounts.grand_total,
                    cash_amount: amounts.grand_total,
                    notes: formData?.notes || "",
                    terms_and_conditions: formData?.terms_and_conditions || "",
                });

                if (setInvoice) {
                    setInvoice((prev) => prev ? {
                        ...prev,
                        trip_count: newTripCount,
                        transport_charge: computedTotalTransport,
                        transport_rate_per_trip: rawRateInput,
                        isupdated_transport_rate: 1,
                    } : prev);
                }

                appliedSnapshotRef.current = {
                    ...appliedSnapshotRef.current,
                    transport: String(rawRateInput),
                    trip_count: newTripCount,
                };

                Swal.fire({
                    icon: "success",
                    title: "Transport Details Saved",
                    text: "Transport charge and trip count updated in database successfully.",
                    confirmButtonColor: "#1470F9",
                    timer: 1800,
                });
            } catch (err) {
                console.error("Failed to update transport details:", err);
                Swal.fire({
                    icon: "error",
                    title: "Save Failed",
                    text: err.response?.data?.message || err.message || "Could not save transport details.",
                    confirmButtonColor: "#1470F9",
                });
            } finally {
                setIsLoadingSubmit?.(false);
            }
        }
    };

    const invoiceAlreadyGenerated = useMemo(() => {
        const rows =
            Array.isArray(originalResponses) && originalResponses.length > 0
                ? originalResponses
                : invoice
                  ? [invoice]
                  : [];
        return rows.length > 0 && rows.every((r) => isCorporateInvoiceAlreadyGenerated(r));
    }, [invoice, originalResponses]);

    const isInvoiceGenerated = !!realInvoiceId || invoiceAlreadyGenerated;

    useEffect(() => {
        setPreparationSignature(sessionStorage.getItem("preparationSignature"));
        setPreparedByName(sessionStorage.getItem("preparedByName") || "");
    }, []);

    // Fetch any Credit/Debit Notes already raised against this invoice, once it's been generated
    // and its invoice_id is known — shown alongside the Activity Log in the side panel.
    useEffect(() => {
        const targetInvoiceId = invoice?.invoice_id;
        if (!targetInvoiceId) {
            setLinkedCreditDebitNotes([]);
            return;
        }
        let cancelled = false;
        setIsLoadingLinkedNotes(true);
        getCreditDebitNotesByInvoice(targetInvoiceId)
            .then((res) => {
                if (cancelled) return;
                const notes = res?.creditDebitNotes ?? res?.notes ?? res?.data ?? (Array.isArray(res) ? res : []);
                setLinkedCreditDebitNotes(Array.isArray(notes) ? notes : []);
            })
            .catch((err) => {
                console.error("Failed to fetch credit/debit notes for invoice:", err);
                if (!cancelled) setLinkedCreditDebitNotes([]);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingLinkedNotes(false);
            });
        return () => { cancelled = true; };
    }, [invoice?.invoice_id]);

    const [formData, setFormData] = useState({
        user_id: localStorage.getItem("userId"),
        invoice_id: "",
        pickup_entry_id: "",
        company_name: "",
        customer_id: "",
        customer_name: "",
        phone_number: "",
        notes: "",
        terms_and_conditions: 'Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only',
        payment_method: "",
        cash_amount: 0,
        card_amount: 0,
        card_type: "",
        bank: "",
        vat_status: "",
        status: "Generated",
        manual_invoice_id: "",
    });

    const supplierLegal = useMemo(
        () => ({
            companyName: pickFirstString(corporateSettings, [
                "supplier_company_name",
                "company_legal_name",
                "laundry_company_name",
                "registered_company_name",
            ]),
            vatNo: pickFirstString(corporateSettings, ["supplier_vat_no", "company_vat_no", "company_vat_number"]),
            address: pickFirstString(corporateSettings, ["supplier_address", "registered_address", "company_address"]),
            operationAddress: pickFirstString(corporateSettings, [
                "operation_address",
                "supplier_operation_address",
                "laundry_address",
            ]),
            hotline: pickFirstString(corporateSettings, ["hotline", "company_phone", "supplier_phone"]),
            email: pickFirstString(corporateSettings, ["company_email", "supplier_email", "info_email"]),
        }),
        [corporateSettings]
    );

    /** Full corporate customer list (get-all-corporate-customers) for header match by tracking customer_id. */
    useEffect(() => {
        const userId = localStorage.getItem("userId");
        if (!userId) {
            setCorporateCustomerListLoading(false);
            setAllCorporateCustomers([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setCorporateCustomerListLoading(true);
            try {
                const response = await getAllCorporateCustomers(userId);
                if (cancelled) return;
                const list =
                    response?.data?.allCustomers ??
                    response?.data?.customers ??
                    response?.data?.corporate_customers ??
                    response?.data?.data ??
                    [];
                setAllCorporateCustomers(Array.isArray(list) ? list : []);
            } catch (e) {
                console.error("Failed to load corporate customer list for invoice header:", e);
                if (!cancelled) setAllCorporateCustomers([]);
            } finally {
                if (!cancelled) setCorporateCustomerListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const matchedCustomer = useMemo(() => {
        const trackingData = invoice ?? previewOrder;
        const trackingId = trackingData?.customer_id;
        if (trackingId == null || String(trackingId).trim() === "") return null;
        if (!Array.isArray(allCorporateCustomers) || allCorporateCustomers.length === 0) return null;
        const tid = String(trackingId).trim();
        return (
            allCorporateCustomers.find((c) => {
                const cid = c?.customer_id != null ? String(c.customer_id).trim() : "";
                const caid = c?.customer_auto_id != null ? String(c.customer_auto_id).trim() : "";
                return cid === tid || caid === tid;
            }) ?? null
        );
    }, [invoice, previewOrder, allCorporateCustomers]);

    const placeOfSupply = useMemo(() => {
        if (Array.isArray(originalResponses) && originalResponses.length > 0) {
            return originalResponses
                .map((o) => o?.delivered_location || o?.deliveredLocation || o?.place_of_supply || o?.placeOfSupply || "")
                .filter(Boolean)
                .join(", ");
        }
        const orderData = invoice ?? previewOrder;
        return orderData?.delivered_location || orderData?.deliveredLocation || orderData?.place_of_supply || orderData?.placeOfSupply || "";
    }, [originalResponses, invoice, previewOrder]);

    const combinedDeliveryType = useMemo(() => {
        const unique = new Set();
        if (Array.isArray(originalResponses) && originalResponses.length > 0) {
            originalResponses.forEach((o) => {
                const dt = o?.delivery_type || o?.deliveryType;
                if (dt) unique.add(String(dt).trim());
            });
        } else {
            const orderData = invoice ?? previewOrder;
            const dt = orderData?.delivery_type || orderData?.deliveryType;
            if (dt) unique.add(String(dt).trim());

            if (unique.size === 0) {
                const items = orderData?.items || [];
                items.forEach((it) => {
                    const dtItem = it.delivery_type || it.deliveryType;
                    if (dtItem) unique.add(String(dtItem).trim());
                });
            }
        }
        if (unique.size === 0) return "Normal";
        return Array.from(unique).join(", ");
    }, [originalResponses, invoice, previewOrder]);
    const locationRate = useMemo(() => {
        if (transportRateOverride !== "" && !Number.isNaN(Number(transportRateOverride))) {
            return Number(transportRateOverride);
        }
        const savedRate = getSavedRatePerTrip(invoice);
        if (savedRate !== null && !Number.isNaN(Number(savedRate))) {
            return Number(savedRate);
        }
        
        const locations = matchedCustomer?.locations ?? customerProfile?.locations ?? [];
        
        if (!Array.isArray(originalResponses) || originalResponses.length === 0) {
            const orderData = invoice ?? previewOrder;
            let rate = parseFloat(orderData?.entry_transport_rate) || 0;
            if (rate === 0 && locations.length === 1) {
                rate = parseFloat(locations[0].transport_rate) || 0;
            }
            return rate;
        }
        
        let sum = 0;
        const normalizeLocName = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        
        originalResponses.forEach((o) => {
            const orderLoc = String(o?.delivered_location || o?.deliveredLocation || o?.place_of_supply || o?.placeOfSupply || "").trim().toLowerCase();
            const matchedLoc = locations.find(loc => 
                normalizeLocName(loc?.location_name) === normalizeLocName(orderLoc)
            );
            if (matchedLoc) {
                sum += parseFloat(matchedLoc.transport_rate) || 0;
            } else if (locations.length === 1) {
                sum += parseFloat(locations[0].transport_rate) || 0;
            } else {
                sum += parseFloat(o?.entry_transport_rate) || 0;
            }
        });
        
        if (sum === 0 && locations.length === 1) {
            sum = parseFloat(locations[0].transport_rate) || 0;
        }
        return sum;
    }, [transportRateOverride, invoice, originalResponses, matchedCustomer, customerProfile, previewOrder]);

    /** First delivery note assigned to this invoice (for the Edit Delivery Note link). */
    const firstAssignedDeliveryNote = useMemo(() => {
        const pickupRaw = previewOrder?.pickup_entry_id || invoice?.pickup_entry_id || "";
        const deliveryRaw = previewOrder?.delivery_id || invoice?.delivery_id || "";
        const pickup_entry_id = String(pickupRaw).split(",")[0]?.trim() || "";
        const delivery_id = String(deliveryRaw).split(",")[0]?.trim() || "";
        if (!pickup_entry_id || !delivery_id || delivery_id === "—") return null;
        return { pickup_entry_id, delivery_id };
    }, [previewOrder, invoice]);

    const damageDeduction = useMemo(() => {
        // damaged_qty is stored once per order item, not per delivery note — when an item is
        // split across multiple Delivery Orders, every resulting pricedLines row carries the
        // SAME damaged_qty, so summing it per-row would deduct it once per DO instead of once
        // per item. Dedupe by the underlying order item before summing.
        const seenOrderItems = new Set();
        return parseFloat(
            (pricedLines || []).reduce((sum, it) => {
                const key = it.order_item_auto_id ?? `${it.pickup_entry_id || ""}::${it.corp_item_id || it.item_id || ""}`;
                if (seenOrderItems.has(key)) return sum;
                seenOrderItems.add(key);
                const itemDamageQty = Number(it.damaged_qty || it.damage_quantity || 0);
                return sum + (itemDamageQty * Number(it.rate || 0));
            }, 0).toFixed(2)
        );
    }, [pricedLines]);

    /** Same base the discount is actually applied against inside computeCorporateTaxInvoiceSummary. */
    const discountableSubtotal = useMemo(() => {
        const laundry = parseFloat(
            (pricedLines || []).reduce((s, it) => s + (Number(it.orderValue) || 0), 0).toFixed(2)
        );
        return laundry - damageDeduction;
    }, [pricedLines, damageDeduction]);

    /**
     * The Discount field accepts either a percent ("10%") or a flat Rs. amount ("500") —
     * same "%"-suffix convention as SalesRetailGenerateInvoice.jsx. Flat amounts are converted
     * to their equivalent percent of the discountable subtotal here so every downstream
     * consumer (invoiceSummary, CorporateInvoicePreview, the saved `discount` DB column) keeps
     * working purely in percent-space without any other changes.
     */
    const effectiveDiscountPercent = useMemo(() => {
        const raw = String(discount ?? "").trim();
        if (raw === "") {
            return parseFloat(matchedCustomer?.discount ?? customerProfile?.discount ?? 0) || 0;
        }
        if (raw.endsWith("%")) {
            return parseFloat(raw.replace("%", "")) || 0;
        }
        const amount = parseFloat(raw) || 0;
        if (discountableSubtotal <= 0) return 0;
        return parseFloat(((amount / discountableSubtotal) * 100).toFixed(4));
    }, [discount, matchedCustomer?.discount, customerProfile?.discount, discountableSubtotal]);

    const invoiceSummary = useMemo(() => {
        const laundry = parseFloat(
            (pricedLines || []).reduce((s, it) => s + (Number(it.orderValue) || 0), 0).toFixed(2)
        );
        const activeCustomer = matchedCustomer || customerProfile;
        const invoicingPeriod = parseFloat(activeCustomer?.customer_invoicing_period) || 1;

        const effectiveTripCount = manualTripCount !== null && manualTripCount !== undefined
            ? Number(manualTripCount)
            : (invoice?.trip_count !== undefined && invoice?.trip_count !== null ? Number(invoice.trip_count) : 1);

        const vatNo = activeCustomer?.customer_vat_number ?? activeCustomer?.vat_number ?? activeCustomer?.vat_no ?? (activeCustomer?.customer && (activeCustomer.customer.customer_vat_number ?? activeCustomer.customer.vat_number)) ?? invoice?.customer_vat_number ?? invoice?.vat_no;
        const hasVat = hasCustomerVatNumber(vatNo);

        return computeCorporateTaxInvoiceSummary({
            laundryCharges: laundry - damageDeduction,
            customerDiscountPct: effectiveDiscountPercent,
            transportRate: locationRate,
            customerInvoiceType: activeCustomer?.customer_invoice_type ?? "Daily Invoice",
            invoicingPeriod: invoicingPeriod,
            ssclRatePct: hasVat ? DAILY_INVOICE_SSCL_PCT : 0,
            vatRatePct: hasVat ? DAILY_INVOICE_VAT_PCT : 0,
            transportMultiplierOverride: effectiveTripCount || 1,
        });
    }, [
        pricedLines,
        damageDeduction,
        effectiveDiscountPercent,
        locationRate,
        matchedCustomer,
        customerProfile,
        manualTripCount,
        invoice,
    ]);
    const invoiceDate = useMemo(() => {
        const formatDate = (dateInput) => {
            if (!dateInput) return "";
            try {
                const d = new Date(dateInput);
                if (Number.isFinite(d.getTime())) {
                    return d.toLocaleDateString('en-CA').replace(/-/g, '/');
                }
                return String(dateInput).replace(/-/g, '/');
            } catch {
                return String(dateInput).replace(/-/g, '/');
            }
        };

        if (realInvoiceId) {
            const targetDate = (invoice?.printed_at && String(invoice.printed_at).trim() !== "")
                ? invoice.printed_at
                : invoice?.date;
            return formatDate(targetDate);
        }
        return formatDate(new Date());
    }, [realInvoiceId, invoice]);

    // const fetchInvoiceById = async () => {
    //     try {
    //         setLoadError(null);
    //         setIsLoadingInvoice(true);
    //         const userId = localStorage.getItem("userId");
    //         const safeId = id != null ? String(id) : "";
    //         // IDs in the URL are now delivery_note_auto_id integers (CDN IDs)
    //         const cdnAutoIds = safeId.split(",").map((s) => s.trim()).filter(Boolean);

    //         if (!userId || !cus || cdnAutoIds.length === 0) {
    //             setLoadError("Missing customer, delivery note id, or session. Go back and try again.");
    //             setInvoice(null);
    //             setPreviewOrder(null);
    //             setPricedLines([]);
    //             setOriginalResponses([]);
    //             setRealInvoiceId(null);
    //             return;
    //         }

    //         setRealInvoiceId(null);

    //         // Detect if we're in view mode (URL ID is an invoice_id, not a CDN auto_id)
    //         // Invoice IDs look like "26JUN_H1OW_5" (contains letters), CDN auto_ids are pure numbers
    //         const isInvoiceIdMode = cdnAutoIds.some(id => !/^\d+$/.test(id));

    //         let cdnResponses = [];
    //         let firstData = null;

    //         if (isInvoiceIdMode) {
    //             // VIEW mode: URL has pickup_entry_id or invoice_id — use old trackPickupEntryById flow
    //             const fetchPromises = cdnAutoIds.map((orderId) => trackPickupEntryById(userId, orderId));
    //             const responses = await Promise.all(fetchPromises);
    //             firstData = unwrapTrackPayload(responses[0]);
    //             if (!firstData) {
    //                 setLoadError("Could not load order data.");
    //                 setInvoice(null); setPreviewOrder(null); setPricedLines([]); setOriginalResponses([]); setRealInvoiceId(null);
    //                 return;
    //             }
    //             setInvoice(firstData);
    //             setOriginalResponses(responses.map((r) => unwrapTrackPayload(r)).filter(Boolean));

    //             // Invoice ID detection: pickup_entry lookup
    //             let resolvedDbInvoiceId = pickFirstString(firstData, TRACK_INVOICE_ID_KEYS);
    //             if (resolvedDbInvoiceId && isPickupStyleInvoiceRef(resolvedDbInvoiceId)) resolvedDbInvoiceId = "";
    //             if (!resolvedDbInvoiceId) {
    //                 for (const peId of cdnAutoIds) {
    //                     try {
    //                         const invRes = await getCorporateInvoiceById({ user_id: userId, pickup_entry_id: peId });
    //                         resolvedDbInvoiceId = pickCorporateSalesInvoiceIdFromGetByPickupResponse(invRes);
    //                         if (resolvedDbInvoiceId) break;
    //                     } catch (e) { console.warn("getCorporateInvoiceById failed:", peId, e?.message); }
    //                 }
    //             }
    //             setRealInvoiceId(resolvedDbInvoiceId ? String(resolvedDbInvoiceId).trim() : null);

    //             // Build combined items from pickup responses
    //             const combinedRawItemsOld = [];
    //             responses.forEach((res) => {
    //                 const data = unwrapTrackPayload(res);
    //                 if (!data) return;
    //                 (data.items ?? []).filter((item) => {
    //                     const rawQty = item.delivered_qty !== undefined && item.delivered_qty !== null
    //                         ? Number(item.delivered_qty)
    //                         : item.final_packed_qty !== undefined && item.final_packed_qty !== null
    //                         ? Number(item.final_packed_qty)
    //                         : Number(item.corp_item_quantity || 0);
    //                     return rawQty > 0;
    //                 }).forEach((item) => {
    //                     combinedRawItemsOld.push({ ...item, pickup_date: data.created_at || data.pickup_date || data.created });
    //                 });
    //             });

    //             // Load settings + customer + items + pricing
    //             const settingsResponse = await getAllCorporateSettings(userId);
    //             const settings = settingsResponse?.data?.settings?.[0] || {};
    //             setCorporateSettings(settings);
    //             const [custRes, itemsRes, priceRes] = await Promise.allSettled([
    //                 getCorporateCustomerById({ user_id: userId, customer_auto_id: cus }),
    //                 getAllCorporateItems(userId),
    //                 getCorporatePriceListByCustomer({ user_id: userId, customer_id: firstData.customer_id || cus }),
    //             ]);
    //             let profile = null;
    //             if (custRes.status === "fulfilled") {
    //                 profile = unwrapCorporateCustomerGetByIdResponse(custRes.value);
    //                 setCustomerProfile(profile && typeof profile === "object" ? profile : null);
    //                 const d = Number(profile?.discount || 0);
    //                 if (d > 0) setDiscount((prev) => (prev === "" ? `${d}%` : prev));
    //             } else { setCustomerProfile(null); }
    //             if (itemsRes.status === "fulfilled") {
    //                 setItemTypes(normalizeCorporateItemsForPricing(itemsRes.value?.data?.corporate_items ?? []));
    //             } else { setItemTypes([]); }
    //             let listOld = [];
    //             if (priceRes.status === "fulfilled") {
    //                 listOld = priceRes.value?.data?.price_list ?? priceRes.value?.data?.corporate_price_lists ?? priceRes.value?.data ?? [];
    //             }
    //             setPriceList(Array.isArray(listOld) ? listOld : []);

    //             const profileForPricingOld = profile && typeof profile === "object" ? profile : null;
    //             const typesOld = itemsRes.status === "fulfilled" ? normalizeCorporateItemsForPricing(itemsRes.value?.data?.corporate_items ?? []) : [];
    //             let builtOld = [];
    //             try {
    //                 builtOld = buildCollectionNoteLinesFromApiOrderItems({
    //                     items: combinedRawItemsOld,
    //                     customerPriceList: Array.isArray(listOld) ? listOld : [],
    //                     deliveryTypeRaw: firstData.delivery_type ?? firstData.deliveryType,
    //                     customerServiceTypes: profileForPricingOld?.service_types ?? [],
    //                     corporateTaxRates: { sscl: DAILY_INVOICE_SSCL_PCT, vat: DAILY_INVOICE_VAT_PCT },
    //                     itemTypes: typesOld,
    //                     taxType: profileForPricingOld?.tax_type ?? firstData.tax_type ?? "",
    //                     deliveryPercentageFallback: firstData.delivery_percentage ?? firstData.deliveryPercentage,
    //                     isInvoicing: true,
    //                 });
    //             } catch (pricingErr) { console.error("Invoice line pricing failed:", pricingErr); builtOld = []; }

    //             setPricedLines(builtOld.map((row, idx) => {
    //                 const src = combinedRawItemsOld[idx];
    //                 const pd = src?.pickup_date;
    //                 return { ...row, pickup_date: pd, pickup_label: formatPickupDateLabel(pd) || "—", pickup_sort: pd ? (Date.parse(pd) || 0) : 0 };
    //             }));
    //             setPreviewOrder({ ...firstData, pickup_entry_id: cdnAutoIds.join(", "), invoice_id: firstData.invoice_id || firstData.pickup_entry_id, customer_company_name: firstData.customer_company_name || firstData.company_name });
    //             setFormData((prev) => ({
    //                 ...prev, user_id: userId,
    //                 invoice_id: firstData.invoice_id || firstData.pickup_entry_id,
    //                 pickup_entry_id: cdnAutoIds.join(", "),
    //                 company_name: firstData.customer_company_name || firstData.company_name || "",
    //                 customer_id: firstData.customer_id || "",
    //                 customer_name: firstData.signed_by || firstData.customer_name || "",
    //                 phone_number: firstData.customer_phone || firstData.phone_number || "",
    //                 notes: firstData.notes || settings.receipt_notes || "",
    //                 terms_and_conditions: firstData.terms_and_conditions || settings.receipt_terms || DEFAULT_TERMS,
    //             }));
    //             setApprovalStatus("Created");
    //             setActivityLog([{ type: "Created", user: localStorage.getItem("userName") || "System", timestamp: new Date().toISOString(), description: "created the tax invoice preview", changes: [] }]);
    //             setCreatedByName(pickFirstString(firstData, ["created_by_user", "created_by_name", "created_by"]) || firstData.signed_by || localStorage.getItem("userName") || "");
    //             return;
    //         }

    //         // === NEW CDN-based flow: cdnAutoIds are delivery_note_auto_id integers ===
    //         const cdnFetchPromises = cdnAutoIds.map((autoId) => getCorporateDeliveryNoteForInvoice(userId, autoId));
    //         const cdnRawResponses = await Promise.all(cdnFetchPromises);
    //         cdnResponses = cdnRawResponses.map(r => r?.data?.delivery_note).filter(Boolean);

    //         if (cdnResponses.length === 0) {
    //             setLoadError("Could not load delivery note data.");
    //             setInvoice(null); setPreviewOrder(null); setPricedLines([]); setOriginalResponses([]); setRealInvoiceId(null);
    //             return;
    //         }

    //         const firstCdn = cdnResponses[0];
    //         const firstPickupEntry = firstCdn.pickup_entry ?? {};

    //         // Use the CDN's invoice_id directly — no need to call getCorporateInvoiceById
    //         const cdnInvoiceId = firstCdn.invoice_id && String(firstCdn.invoice_id).trim() !== '' ? String(firstCdn.invoice_id).trim() : null;
    //         setRealInvoiceId(cdnInvoiceId);

    //         // Build combined raw items from CDN items (using delivered_qty as the authoritative quantity)
    //         const combinedRawItems = [];
    //         cdnResponses.forEach((cdn) => {
    //             (cdn.items ?? [])
    //                 .filter((item) => Number(item.delivered_qty || 0) > 0)
    //                 .forEach((item) => {
    //                     combinedRawItems.push({
    //                         ...item,
    //                         corp_item_id: item.corp_item_id ?? item.item_id,
    //                         corp_item_quantity: Number(item.delivered_qty),
    //                         delivered_qty: Number(item.delivered_qty),
    //                         pickup_date: cdn.created_at,
    //                     });
    //                 });
    //         });

    //         // Synthesize a firstData-like object for downstream use (pricing, customer display)
    //         firstData = {
    //             ...firstPickupEntry,
    //             customer_id: firstCdn.customer_id,
    //             customer_company_name: firstCdn.customer_company_name,
    //             customer_phone: firstCdn.customer_phone,
    //             delivered_location: firstCdn.delivered_location,
    //             place_of_supply: firstCdn.delivered_location,
    //             invoice_id: cdnInvoiceId,
    //             invoice_generated: firstCdn.invoice_generated,
    //             items: combinedRawItems,
    //             delivery_type: firstPickupEntry.delivery_type,
    //             delivery_percentage: firstPickupEntry.delivery_percentage,
    //         };

    //         setInvoice(firstData);
    //         // Store CDN responses as originalResponses so downstream useMemos work
    //         setOriginalResponses(cdnResponses.map(cdn => ({
    //             ...cdn.pickup_entry ?? {},
    //             delivery_note_auto_id: cdn.delivery_note_auto_id,
    //             delivered_location: cdn.delivered_location,
    //             customer_id: cdn.customer_id,
    //             customer_company_name: cdn.customer_company_name,
    //             items: cdn.items ?? [],
    //             delivery_type: cdn.pickup_entry?.delivery_type,
    //             delivery_percentage: cdn.pickup_entry?.delivery_percentage,
    //             entry_transport_rate: cdn.pickup_entry?.entry_transport_rate,
    //             invoice_id: cdn.invoice_id,
    //             invoice_generated: cdn.invoice_generated,
    //         })));

    //         const settingsResponse = await getAllCorporateSettings(userId);
    //         const settings = settingsResponse?.data?.settings?.[0] || {};
    //         setCorporateSettings(settings);

    //         const [custRes, itemsRes, priceRes] = await Promise.allSettled([
    //             getCorporateCustomerById({ user_id: userId, customer_auto_id: cus }),
    //             getAllCorporateItems(userId),
    //             getCorporatePriceListByCustomer({ user_id: userId, customer_id: firstCdn.customer_id || cus }),
    //         ]);

    //         let profile = null;
    //         if (custRes.status === "fulfilled") {
    //             profile = unwrapCorporateCustomerGetByIdResponse(custRes.value);
    //             setCustomerProfile(profile && typeof profile === "object" ? profile : null);
    //             const d = Number(profile?.discount || 0);
    //             if (d > 0) setDiscount((prev) => (prev === "" ? `${d}%` : prev));
    //         } else { setCustomerProfile(null); }

    //         if (itemsRes.status === "fulfilled") {
    //             setItemTypes(normalizeCorporateItemsForPricing(itemsRes.value?.data?.corporate_items ?? []));
    //         } else { setItemTypes([]); }

    //         let list = [];
    //         if (priceRes.status === "fulfilled") {
    //             list = priceRes.value?.data?.price_list ?? priceRes.value?.data?.corporate_price_lists ?? priceRes.value?.data ?? [];
    //         }
    //         setPriceList(Array.isArray(list) ? list : []);

    //         const profileForPricing = profile && typeof profile === "object" ? profile : null;
    //         const typesForPricing = itemsRes.status === "fulfilled" ? normalizeCorporateItemsForPricing(itemsRes.value?.data?.corporate_items ?? []) : [];
    //         const taxType = profileForPricing?.tax_type ?? firstData.tax_type ?? "";

    //         let built = [];
    //         try {
    //             built = buildCollectionNoteLinesFromApiOrderItems({
    //                 items: combinedRawItems,
    //                 customerPriceList: Array.isArray(list) ? list : [],
    //                 deliveryTypeRaw: firstData.delivery_type ?? firstData.deliveryType,
    //                 customerServiceTypes: profileForPricing?.service_types ?? [],
    //                 corporateTaxRates: { sscl: DAILY_INVOICE_SSCL_PCT, vat: DAILY_INVOICE_VAT_PCT },
    //                 itemTypes: typesForPricing,
    //                 taxType,
    //                 deliveryPercentageFallback: firstData.delivery_percentage ?? firstData.deliveryPercentage,
    //                 isInvoicing: true,
    //             });
    //         } catch (pricingErr) {
    //             console.error("Invoice line pricing failed:", pricingErr);
    //             setLoadError("Could not calculate line prices. Check price list and items.");
    //             built = [];
    //         }

    //         const linesWithPickup = built.map((row, idx) => {
    //             const src = combinedRawItems[idx];
    //             const pd = src?.pickup_date;
    //             const label = formatPickupDateLabel(pd) || "—";
    //             const ms = pd ? Date.parse(pd) : 0;
    //             return { ...row, pickup_date: pd, pickup_label: label, pickup_sort: Number.isFinite(ms) ? ms : 0 };
    //         });
    //         setPricedLines(linesWithPickup);

    //         setPreviewOrder({
    //             ...firstData,
    //             pickup_entry_id: cdnAutoIds.join(", "),
    //             invoice_id: cdnInvoiceId,
    //             customer_company_name: firstCdn.customer_company_name,
    //         });

    //         setFormData((prev) => ({
    //             ...prev,
    //             user_id: userId,
    //             invoice_id: cdnInvoiceId || "",
    //             pickup_entry_id: cdnAutoIds.join(", "),
    //             delivery_note_ids: cdnAutoIds.map(id => parseInt(id, 10)),
    //             company_name: firstCdn.customer_company_name || "",
    //             customer_id: firstCdn.customer_id || "",
    //             customer_name: firstCdn.received_by || "",
    //             phone_number: firstCdn.customer_phone || "",
    //             notes: settings.receipt_notes || "",
    //             terms_and_conditions: settings.receipt_terms || DEFAULT_TERMS,
    //         }));

    //         const draftKey = readInvoicePreviewDraftKey(userId, cus, safeId);
    //         let localDraft = null;
    //         if (draftKey) {
    //             try { localDraft = JSON.parse(sessionStorage.getItem(draftKey) || "null"); } catch (_) { localDraft = null; }
    //         }

    //         // For CDN invoices: approval status comes from the actual invoice row (fetched by invoice_id)
    //         let mergedStatus = "Created";
    //         let mergedCheckedUser = null;
    //         let mergedCheckedSig = null;
    //         let mergedApprovedUser = null;

    //         if (cdnInvoiceId) {
    //             try {
    //                 const invRes = await getCorporateInvoiceById({ user_id: userId, pickup_entry_id: firstCdn.pickup_entry_id });
    //                 const fetchedRow = invRes?.data?.invoice ?? invRes?.data?.data?.invoice ?? invRes?.data?.data ?? null;
    //                 if (fetchedRow) {
    //                     mergedStatus = fetchedRow.approval_status || "Created";
    //                     mergedCheckedUser = fetchedRow.checked_by_user || null;
    //                     mergedCheckedSig = fetchedRow.checked_by_signature || null;
    //                     mergedApprovedUser = fetchedRow.approved_by_user || null;
    //                 }
    //             } catch (e) { console.warn("getCorporateInvoiceById failed:", e?.message); }
    //         }

    //         setApprovalStatus(mergedStatus);
    //         setCheckedByUser(mergedCheckedUser);
    //         setCheckedBySignature(mergedCheckedSig);
    //         setApprovedByUser(mergedApprovedUser);
    //         setActivityLog([{ type: "Created", user: localStorage.getItem("userName") || "System", timestamp: new Date().toISOString(), description: "created the tax invoice preview", changes: [] }]);
    //         setCreatedByName(localStorage.getItem("userName") || "");

    //         const dDisc = profile && typeof profile === "object" ? Number(profile.discount || 0) : 0;
    //         const discountInit = dDisc > 0 ? `${dDisc}%` : "";
    //         appliedSnapshotRef.current = {
    //             bank: "",
    //             discount: discountInit,
    //             notes: settings.receipt_notes || "",
    //             terms: settings.receipt_terms || DEFAULT_TERMS,
    //             transport: localDraft ? (localDraft.transport ?? "") : "",
    //         };

    //     } catch (error) {
    //         console.error("Error fetching invoice by id: ", error);
    //         setLoadError(error?.message || "Failed to load invoice preview.");
    //         setInvoice(null); setPreviewOrder(null); setPricedLines([]); setOriginalResponses([]); setRealInvoiceId(null);
    //     } finally {
    //         setIsLoadingInvoice(false);
    //     }
    // };
    const fetchInvoiceById = async () => {
        try {
            setLoadError(null);
            setIsLoadingInvoice(true);
            const userId = localStorage.getItem("userId");
            const safeId = id != null ? String(id) : "";
            const cdnAutoIds = safeId.split(",").map((s) => s.trim()).filter(Boolean);

            if (!userId || !cus || cdnAutoIds.length === 0) {
                setLoadError("Missing customer, delivery note id, or session. Go back and try again.");
                return;
            }

            // Check if this ID is an existing Invoice ID or CDN Auto IDs
            let fetchedRow = null;
            let isInvoiceIdMode = false;
            let invoiceId = cdnAutoIds[0];

            try {
                const invRes = await getCorporateInvoiceByInvoiceId(invoiceId);
                if (invRes?.data?.invoice) {
                    fetchedRow = invRes.data.invoice;
                    isInvoiceIdMode = true;
                }
            } catch (e) {}

            if (!isInvoiceIdMode && safeId !== invoiceId) {
                try {
                    const invRes = await getCorporateInvoiceByInvoiceId(safeId);
                    if (invRes?.data?.invoice) {
                        fetchedRow = invRes.data.invoice;
                        isInvoiceIdMode = true;
                        invoiceId = safeId;
                    }
                } catch (e) {}
            }

            if (!isInvoiceIdMode && cdnAutoIds.some(id => !/^\d+$/.test(id))) {
                setLoadError("Could not find the invoice record in database.");
                return;
            }

            if (isInvoiceIdMode) {
                // === VIEW MODE: Fetch an already-generated invoice by its invoice_id ===
                setRealInvoiceId(invoiceId);

                if (!fetchedRow) {
                    setLoadError("Could not find the invoice record in database.");
                    return;
                }

                setManualTripCount(fetchedRow.trip_count);
                setIsTripCountEdited(false);

                const items = fetchedRow.items || [];
                setInvoice(fetchedRow);

                // Reconstruct originalResponses from fetchedRow items by grouping by Delivery Note
                const cdnMap = new Map();
                items.forEach((it) => {
                    const key = String(it.delivery_id || it.delivery_note_id || it.pickup_entry_id || "default").trim();
                    if (!cdnMap.has(key)) {
                        cdnMap.set(key, {
                            delivery_id: it.delivery_id || key,
                            delivery_note_no: it.delivery_id || key,
                            delivery_note_id: it.delivery_id || key,
                            pickup_entry_id: it.pickup_entry_id || fetchedRow.pickup_entry_id,
                            order_no: it.pickup_entry_id || fetchedRow.pickup_entry_id,
                            order_id: it.pickup_entry_id || fetchedRow.pickup_entry_id,
                            room_no: it.room_no || fetchedRow.room_no,
                            gate_pass_no: it.gate_pass_no || fetchedRow.gate_pass_no,
                            delivered_location: it.delivered_location || fetchedRow.delivered_location || fetchedRow.place_of_supply,
                            place_of_supply: it.delivered_location || fetchedRow.delivered_location || fetchedRow.place_of_supply,
                            pickup_date: it.pickup_date || fetchedRow.created_at || fetchedRow.date,
                            created_at: it.pickup_date || fetchedRow.created_at || fetchedRow.date,
                            delivery_type: it.delivery_type || fetchedRow.delivery_type || "NORMAL",
                            delivery_percentage: it.delivery_percentage ?? fetchedRow.delivery_percentage ?? 0,
                            entry_transport_rate: it.entry_transport_rate ?? fetchedRow.entry_transport_rate ?? 0,
                            customer_id: fetchedRow.customer_id,
                            customer_company_name: fetchedRow.company_name,
                            invoice_id: invoiceId,
                            items: [],
                        });
                    }
                    cdnMap.get(key).items.push(it);
                });

                const reconstructedCdns = Array.from(cdnMap.values()).sort((a, b) => {
                    const dateA = a.pickup_date ? new Date(a.pickup_date).getTime() : 0;
                    const dateB = b.pickup_date ? new Date(b.pickup_date).getTime() : 0;
                    if (dateA !== dateB) return dateA - dateB;
                    return String(a.delivery_id).localeCompare(String(b.delivery_id), undefined, { numeric: true });
                });

                setOriginalResponses(reconstructedCdns);

                appliedSnapshotRef.current = {
                    bank: fetchedRow.bank || "",
                    discount: String(fetchedRow.discount || 0),
                    notes: fetchedRow.notes || "",
                    terms: fetchedRow.terms_and_conditions || "",
                    transport: String(fetchedRow.entry_transport_rate || fetchedRow.transport_charge || 0),
                    trip_count: fetchedRow.trip_count || 0,
                };
                const uniqueDeliveryIds = Array.from(new Set(items.map(it => it.delivery_id).filter(Boolean))).join(", ");
                const uniqueRoomNos = Array.from(new Set(items.map(it => it.room_no).filter(Boolean))).join(", ");
                const uniqueGatePassNos = Array.from(new Set(items.map(it => it.gate_pass_no).filter(Boolean))).join(", ");
                const uniqueLocations = Array.from(new Set(items.map(it => it.delivered_location || it.place_of_supply).filter(Boolean))).join(", ");
                const uniquePickupEntryIds = Array.from(new Set(items.map(it => it.pickup_entry_id).filter(Boolean))).join(", ");

                setPreviewOrder({
                    ...fetchedRow,
                    customer_company_name: fetchedRow.company_name,
                    pickup_entry_id: uniquePickupEntryIds || fetchedRow.pickup_entry_id || invoiceId,
                    invoice_id: invoiceId,
                    delivery_id: uniqueDeliveryIds || "—",
                    delivery_note_no: uniqueDeliveryIds || "—",
                    room_no: uniqueRoomNos || "—",
                    gate_pass_no: uniqueGatePassNos || "—",
                    delivered_location: uniqueLocations || "—",
                    place_of_supply: uniqueLocations || "—",
                });
                setApprovalStatus(fetchedRow.approval_status || "Created");
                setCheckedByUser(fetchedRow.checked_by_user || null);
                setCheckedBySignature(fetchedRow.checked_by_signature || null);
                setApprovedByUser(fetchedRow.approved_by_user || null);
                setApprovedBySignature(fetchedRow.approved_by_signature || null);
                setCreatedByName(fetchedRow.printed_by || localStorage.getItem("userName") || "");
                setPreparationSignature(fetchedRow.prepared_by_signature || null);
                setPreparedByName(fetchedRow.printed_by || fetchedRow.signed_by || "");

                let settings = {};
                try {
                    const settingsResponse = await getAllCorporateSettings(userId);
                    settings = settingsResponse?.data?.settings?.[0] || {};
                    setCorporateSettings(settings);
                } catch (e) {
                    console.error(e);
                }

                let profile = null;
                try {
                    const custRes = await getCorporateCustomerById({ user_id: userId, customer_auto_id: cus });
                    profile = unwrapCorporateCustomerGetByIdResponse(custRes);
                    setCustomerProfile(profile && typeof profile === "object" ? profile : null);
                    const d = Number(profile?.discount || 0);
                    if (d > 0) setDiscount((prev) => (prev === "" ? `${d}%` : prev));
                } catch (e) {
                    setCustomerProfile(null);
                }

                const hasVat = hasCustomerVatNumber(
                    profile?.customer_vat_number ??
                    profile?.vat_number ??
                    profile?.vat_no ??
                    (profile?.customer && typeof profile.customer === "object" ? profile.customer.customer_vat_number ?? profile.customer.vat_number : null) ??
                    fetchedRow.customer_vat_number ??
                    fetchedRow.vat_no
                );
                const ssclRate = hasVat ? 0 : (settings.sscl || 2.5);
                const vatRate = hasVat ? 0 : (settings.vat || 18);

                // Build pricedLines from the invoice's delivery note items
                // The preview component (buildPickupGroupedTables) reads:
                //   item.quantity, item.rate, item.item_name, item.corp_item_id
                // But DB items return: delivered_qty, corp_item_price, corp_item_name
                setPricedLines(items.map(it => {
                    const qty = Number(it.delivered_qty || 0);
                    const basePrice = Number(it.corp_item_price || 0);
                    const itemSurchargePercent = resolveDeliverySurchargePercent(
                        it.delivery_type || it.deliveryType || fetchedRow.delivery_type || fetchedRow.deliveryType || "NORMAL",
                        profile?.service_types ?? [],
                        it.delivery_percentage !== undefined && it.delivery_percentage !== null ? it.delivery_percentage : fetchedRow.delivery_percentage
                    );
                    const itemSsclRate = hasVat ? 0 : (settings.sscl || 2.5);
                    const itemVatRate = hasVat ? 0 : (settings.vat || 18);
                    const rate = computeLineFinalRateWithDelivery(
                        basePrice,
                        itemSsclRate,
                        itemVatRate,
                        itemSurchargePercent
                    );
                    return {
                        ...it,
                        delivery_type: it.delivery_type || it.deliveryType || fetchedRow.delivery_type || fetchedRow.deliveryType || "NORMAL",
                        delivery_percentage: it.delivery_percentage !== undefined && it.delivery_percentage !== null ? it.delivery_percentage : fetchedRow.delivery_percentage,
                        // aliases required by CorporateInvoicePreview
                        quantity: qty,
                        rate: rate,
                        item_name: it.corp_item_name || it.item_name || "—",
                        corp_item_quantity: qty,
                        pickup_label: formatPickupDateLabel(it.pickup_date) || "—",
                        pickup_sort: it.pickup_date ? (Date.parse(it.pickup_date) || 0) : 0,
                        orderValue: parseFloat((qty * rate).toFixed(2)),
                    };
                }));

                setFormData((prev) => ({
                    ...prev,
                    user_id: userId,
                    invoice_id: fetchedRow.invoice_id,
                    company_name: fetchedRow.company_name || "",
                    customer_id: fetchedRow.customer_id || "",
                    phone_number: fetchedRow.phone_number || "",
                    notes: fetchedRow.notes || settings.receipt_notes || "",
                    terms_and_conditions: resolveTerms(fetchedRow.terms_and_conditions, settings.receipt_terms),
                }));
                const dbLog = Array.isArray(fetchedRow.activity_log)
                    ? fetchedRow.activity_log
                    : typeof fetchedRow.activity_log === 'string'
                        ? (() => { try { return JSON.parse(fetchedRow.activity_log); } catch(_) { return []; } })()
                        : [];
                setActivityLog(dbLog.length > 0 ? dbLog : [{ type: "Created", user: fetchedRow.printed_by || localStorage.getItem("userName") || "System", timestamp: new Date().toISOString(), description: "loaded tax invoice", changes: [] }]);

            } else {
                // === GENERATION MODE: Build invoice preview from CDN auto IDs ===
                const cdnFetchPromises = cdnAutoIds.map((autoId) => getCorporateDeliveryNoteForInvoice(userId, autoId));
                const cdnRawResponses = await Promise.all(cdnFetchPromises);
                const cdnResponses = cdnRawResponses.map(r => r?.data?.delivery_note).filter(Boolean);

                if (cdnResponses.length === 0) {
                    setLoadError("Could not load delivery note data.");
                    setInvoice(null); setPreviewOrder(null); setPricedLines([]); setOriginalResponses([]); setRealInvoiceId(null);
                    return;
                }

                const firstCdn = cdnResponses[0];
                const firstPickupEntry = firstCdn.pickup_entry ?? {};

                const cdnInvoiceId = firstCdn.invoice_id && String(firstCdn.invoice_id).trim() !== '' ? String(firstCdn.invoice_id).trim() : null;
                setRealInvoiceId(cdnInvoiceId);

                const combinedRawItems = [];
                cdnResponses.forEach((cdn) => {
                    (cdn.items ?? [])
                        .filter((item) => Number(item.delivered_qty || 0) > 0)
                        .forEach((item) => {
                            combinedRawItems.push({
                                ...item,
                                corp_item_id: item.corp_item_id ?? item.item_id,
                                corp_item_quantity: Number(item.delivered_qty),
                                delivered_qty: Number(item.delivered_qty),
                                pickup_date: cdn.created_at,
                                delivery_type: cdn.pickup_entry?.delivery_type || "NORMAL",
                                delivery_percentage: cdn.pickup_entry?.delivery_percentage || 0,
                                delivery_id: cdn.delivery_id,
                                delivery_note_id: cdn.delivery_note_auto_id,
                                delivery_note_auto_id: cdn.delivery_note_auto_id,
                                room_no: cdn.room_no,
                                gate_pass_no: cdn.gate_pass_no,
                                pickup_entry_id: cdn.pickup_entry_id,
                            });
                        });
                });

                const pickupEntryIdVal = Array.from(new Set(cdnResponses.map(cdn => cdn.pickup_entry_id || cdn.pickup_entry?.pickup_entry_id).filter(Boolean))).join(", ");
                const deliveryIdVal = Array.from(new Set(cdnResponses.map(cdn => cdn.delivery_id).filter(Boolean))).join(", ");

                const firstData = {
                    ...firstPickupEntry,
                    pickup_entry_id: pickupEntryIdVal || firstPickupEntry.pickup_entry_id,
                    delivery_id: deliveryIdVal || firstCdn.delivery_id || "—",
                    delivery_note_no: deliveryIdVal || firstCdn.delivery_id || "—",
                    customer_id: firstCdn.customer_id,
                    customer_company_name: firstCdn.customer_company_name,
                    customer_phone: firstCdn.customer_phone,
                    delivered_location: firstCdn.delivered_location,
                    place_of_supply: firstCdn.delivered_location,
                    invoice_id: cdnInvoiceId,
                    invoice_generated: firstCdn.invoice_generated,
                    items: combinedRawItems,
                    delivery_type: firstPickupEntry.delivery_type,
                    delivery_percentage: firstPickupEntry.delivery_percentage,
                };

                setInvoice(firstData);
                setOriginalResponses(cdnResponses.map(cdn => ({
                    ...cdn.pickup_entry ?? {},
                    delivery_note_auto_id: cdn.delivery_note_auto_id,
                    delivered_location: cdn.delivered_location,
                    customer_id: cdn.customer_id,
                    customer_company_name: cdn.customer_company_name,
                    items: cdn.items ?? [],
                    delivery_type: cdn.pickup_entry?.delivery_type,
                    delivery_percentage: cdn.pickup_entry?.delivery_percentage,
                    entry_transport_rate: cdn.pickup_entry?.entry_transport_rate,
                    invoice_id: cdn.invoice_id,
                    invoice_generated: cdn.invoice_generated,
                })));

                const settingsResponse = await getAllCorporateSettings(userId);
                const settings = settingsResponse?.data?.settings?.[0] || {};
                setCorporateSettings(settings);

                const [custRes, itemsRes, priceRes] = await Promise.allSettled([
                    getCorporateCustomerById({ user_id: userId, customer_auto_id: cus }),
                    getAllCorporateItems(userId),
                    getCorporatePriceListByCustomer({ user_id: userId, customer_id: firstCdn.customer_id || cus }),
                ]);

                let profile = null;
                if (custRes.status === "fulfilled") {
                    profile = unwrapCorporateCustomerGetByIdResponse(custRes.value);
                    setCustomerProfile(profile && typeof profile === "object" ? profile : null);
                    const d = Number(profile?.discount || 0);
                    if (d > 0) setDiscount((prev) => (prev === "" ? `${d}%` : prev));
                } else { setCustomerProfile(null); }

                if (itemsRes.status === "fulfilled") {
                    setItemTypes(normalizeCorporateItemsForPricing(itemsRes.value?.data?.corporate_items ?? []));
                } else { setItemTypes([]); }

                let list = [];
                if (priceRes.status === "fulfilled") {
                    list = priceRes.value?.data?.price_list ?? priceRes.value?.data?.corporate_price_lists ?? priceRes.value?.data ?? [];
                }
                setPriceList(Array.isArray(list) ? list : []);

                const profileForPricing = profile && typeof profile === "object" ? profile : null;
                const typesForPricing = itemsRes.status === "fulfilled" ? normalizeCorporateItemsForPricing(itemsRes.value?.data?.corporate_items ?? []) : [];
                const taxType =
                    profileForPricing?.tax_type ??
                    (profileForPricing?.customer && typeof profileForPricing.customer === "object" ? profileForPricing.customer.tax_type : null) ??
                    firstData.tax_type ??
                    "";

                let built = [];
                try {
                    const vatNumber =
                        profileForPricing?.customer_vat_number ??
                        profileForPricing?.vat_number ??
                        profileForPricing?.vat_no ??
                        (profileForPricing?.customer && typeof profileForPricing.customer === "object" ? profileForPricing.customer.customer_vat_number ?? profileForPricing.customer.vat_number : null) ??
                        firstData.customer_vat_number ??
                        firstData.vat_no;
                    built = buildCollectionNoteLinesFromApiOrderItems({
                        items: combinedRawItems,
                        customerPriceList: Array.isArray(list) ? list : [],
                        deliveryTypeRaw: firstData.delivery_type ?? firstData.deliveryType,
                        customerServiceTypes: profileForPricing?.service_types ?? [],
                        corporateTaxRates: { sscl: DAILY_INVOICE_SSCL_PCT, vat: DAILY_INVOICE_VAT_PCT },
                        itemTypes: typesForPricing,
                        taxType,
                        vatNumber,
                        customer: profileForPricing?.customer ?? profileForPricing,
                        deliveryPercentageFallback: firstData.delivery_percentage ?? firstData.deliveryPercentage,
                        isInvoicing: true,
                    });
                } catch (pricingErr) {
                    console.error("Invoice line pricing failed:", pricingErr);
                    setLoadError("Could not calculate line prices. Check price list and items.");
                    built = [];
                }

                const linesWithPickup = built.map((row, idx) => {
                    const src = combinedRawItems[idx];
                    const pd = src?.pickup_date;
                    const label = formatPickupDateLabel(pd) || "—";
                    const ms = pd ? Date.parse(pd) : 0;
                    return { ...row, pickup_date: pd, pickup_label: label, pickup_sort: Number.isFinite(ms) ? ms : 0 };
                });
                setPricedLines(linesWithPickup);

                setPreviewOrder({
                    ...firstData,
                    pickup_entry_id: pickupEntryIdVal || firstData.pickup_entry_id || cdnAutoIds.join(", "),
                    delivery_id: deliveryIdVal || firstData.delivery_id || "—",
                    delivery_note_no: deliveryIdVal || firstData.delivery_id || "—",
                    invoice_id: cdnInvoiceId,
                    customer_company_name: firstCdn.customer_company_name,
                });

                // Resuming an "Edit Invoice": reuse the original invoice_id on submit instead
                // of letting the backend auto-generate a new one (see handleCreateInvoice).
                const editingInvoiceId = location.state?.editingInvoiceId
                    ? String(location.state.editingInvoiceId).trim()
                    : "";

                setFormData((prev) => ({
                    ...prev,
                    user_id: userId,
                    invoice_id: cdnInvoiceId || editingInvoiceId || "",
                    pickup_entry_id: pickupEntryIdVal || cdnAutoIds.join(", "),
                    delivery_note_ids: cdnAutoIds.map(id => parseInt(id, 10)),
                    company_name: firstCdn.customer_company_name || "",
                    customer_id: firstCdn.customer_id || "",
                    customer_name: firstCdn.received_by || "",
                    phone_number: firstCdn.customer_phone || "",
                    notes: settings.receipt_notes || "",
                    terms_and_conditions: resolveTerms(firstData?.terms_and_conditions, settings.receipt_terms),
                    manual_invoice_id: editingInvoiceId || prev.manual_invoice_id || "",
                }));

                setApprovalStatus("Created");
                setActivityLog([{ type: "Created", user: localStorage.getItem("userName") || "System", timestamp: new Date().toISOString(), description: "created the tax invoice preview", changes: [] }]);
                setCreatedByName(localStorage.getItem("userName") || "");

                const dDisc = profile && typeof profile === "object" ? Number(profile.discount || 0) : 0;
                const discountInit = dDisc > 0 ? `${dDisc}%` : "";
                appliedSnapshotRef.current = {
                    bank: "",
                    discount: discountInit,
                    notes: settings.receipt_notes || "",
                    terms: resolveTerms(null, settings.receipt_terms),
                    transport: "",
                };
            }

        } catch (error) {
            console.error("Error fetching invoice by id: ", error);
            setLoadError(error?.message || "Failed to load invoice preview.");
        } finally {
            setIsLoadingInvoice(false);
        }
    };

    useEffect(() => {
        fetchInvoiceById();
    }, [cus, id]);

    const navigateAfterPrintRef = useRef(false);

    const handlePrint = useReactToPrint({
        contentRef: invoiceRef,
        documentTitle: "",
        onAfterPrint: () => {
            if (navigateAfterPrintRef.current) {
                navigateAfterPrintRef.current = false;
                navigate(`/salesCorporate/corporate/invoicing/daily/${cus}`);
            }
        }
    });

    // Discount: lets the user enter either a flat Rs. amount or a 0-100% cut, stored on
    // `discount` as a plain number ("500") or a percent string ("10%") — same convention as
    // SalesRetailGenerateInvoice.jsx's "Other" discount.
    const isPercentageDiscount = String(discount ?? "").trim().endsWith("%");
    const discountNumericValue = String(discount ?? "").replace("%", "").trim();
    const setDiscountMode = (mode) => {
        if (discountNumericValue === "") {
            // Keep the "%" marker even with no number yet, so the toggle itself can switch to
            // percent mode before the user has typed anything.
            setDiscount(mode === "PERCENT" ? "%" : "");
            return;
        }
        const num = mode === "PERCENT" ? Math.min(100, Number(discountNumericValue) || 0) : Number(discountNumericValue) || 0;
        setDiscount(mode === "PERCENT" ? `${num}%` : `${num}`);
    };
    const handleInputChangeDiscount = (e) => {
        let raw = e.target.value;
        if (!/^\d*\.?\d*$/.test(raw)) return;
        if (isPercentageDiscount && raw !== "" && Number(raw) > 100) raw = "100";
        setDiscount(raw === "" ? "" : `${raw}${isPercentageDiscount ? "%" : ""}`);
    };

    const writeLocalDraft = (partial) => {
        const uid = localStorage.getItem("userId");
        const key = readInvoicePreviewDraftKey(uid, cus, id);
        if (!key) return;
        try {
            const prev = JSON.parse(sessionStorage.getItem(key) || "{}");
            sessionStorage.setItem(
                key,
                JSON.stringify({
                    ...prev,
                    ...partial,
                    pickup_entry_key: id != null ? String(id).trim() : "",
                    customer_auto_id: cus,
                    updated_at: new Date().toISOString(),
                })
            );
        } catch (e) {
            console.error("writeLocalDraft failed:", e);
        }
    };

    const handleConfirmSignature = () => {
        if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
            Swal.fire({
                icon: "warning",
                title: "Signature Required",
                text: "Please draw your signature first.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const signatureBase64 = sigCanvasRef.current.getCanvas().toDataURL("image/png");
        setShowSignatureModal(false);
        if (signingForStatus === "Checked") {
            setCheckedBySignature(signatureBase64);
            handleChecked(signatureBase64);
        } else if (signingForStatus === "Approved") {
            setApprovedBySignature(signatureBase64);
            handleApproved(signatureBase64);
        }
    };

    const handleChecked = async (signature) => {
        const userId = localStorage.getItem("userId");
        if (!userId || !cus || !id) return;
        if (approvalStatus === "Checked" || approvalStatus === "Approved") return;
        const invForApproval = (realInvoiceId || "").trim();
        if (!invForApproval) {
            Swal.fire({
                icon: "warning",
                title: "Invoice not ready",
                text: "No corporate invoice record (INV…) was found for this pickup. Create the invoice first, then refresh this page.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const tentativeUser = localStorage.getItem("userName") || "";
        const checkedRow = {
            type: "Checked",
            user: tentativeUser,
            timestamp: new Date().toISOString(),
            description: "checked the tax invoice preview",
            changes: [],
        };
        const nextLog = [...activityLog, checkedRow];
        try {
            setIsApprovalLoading(true);
            const response = await updateCorporateTaxInvoicePreviewApproval({
                user_id: userId,
                invoice_id: invForApproval,
                pickup_entry_ids: formData.pickup_entry_id,
                customer_auto_id: cus,
                approval_status: "Checked",
                checked_by_user: tentativeUser,
                checked_by_signature: signature,
                approved_by_user: approvedByUser,
                approved_by_signature: approvedBySignature,
                activity_log: nextLog,
            });
            const actor =
                response?.actor ??
                response?.data?.actor ??
                tentativeUser;
            const finalLog = nextLog.map((row, i) =>
                i === nextLog.length - 1 && row.type === "Checked" ? { ...row, user: actor } : row
            );
            setApprovalStatus("Checked");
            setCheckedByUser(actor);
            setCheckedBySignature(signature);
            setActivityLog(finalLog);
            writeLocalDraft({
                approval_status: "Checked",
                checked_by_user: actor,
                checked_by_signature: signature,
                approved_by_user: approvedByUser,
                approved_by_signature: approvedBySignature,
                activity_log: finalLog,
                pickup_entry_ids: formData.pickup_entry_id,
            });
            Swal.fire({
                icon: "success",
                title: "Tax Invoice Checked Successfully!",
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9",
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then((res) => {
                if (res.isConfirmed) {
                    navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`);
                }
            });
        } catch (error) {
            setApprovalStatus("Checked");
            setCheckedByUser(tentativeUser);
            setCheckedBySignature(signature);
            setActivityLog(nextLog);
            writeLocalDraft({
                approval_status: "Checked",
                checked_by_user: tentativeUser,
                checked_by_signature: signature,
                approved_by_user: approvedByUser,
                approved_by_signature: approvedBySignature,
                activity_log: nextLog,
                pickup_entry_ids: formData.pickup_entry_id,
            });
            Swal.fire({
                icon: "warning",
                title: "Saved locally",
                text:
                    error?.response?.data?.message ??
                    "Could not reach the server. Approval is stored in this browser only until the API is available.",
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9",
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then((res) => {
                if (res.isConfirmed) {
                    navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`);
                }
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleApproved = async (signature) => {
        const userId = localStorage.getItem("userId");
        if (!userId || !cus || !id) return;
        if (approvalStatus !== "Checked") return;
        const invForApproval = (realInvoiceId || "").trim();
        if (!invForApproval) {
            Swal.fire({
                icon: "warning",
                title: "Invoice not ready",
                text: "No corporate invoice record (INV…) was found for this pickup. Create the invoice first, then refresh this page.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const tentativeUser = localStorage.getItem("userName") || "";
        const approvedRow = {
            type: "Approved",
            user: tentativeUser,
            timestamp: new Date().toISOString(),
            description: "approved the tax invoice preview",
            changes: [],
        };
        const nextLog = [...activityLog, approvedRow];
        try {
            setIsApprovalLoading(true);
            const response = await updateCorporateTaxInvoicePreviewApproval({
                user_id: userId,
                invoice_id: invForApproval,
                pickup_entry_ids: formData.pickup_entry_id,
                customer_auto_id: cus,
                approval_status: "Approved",
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: tentativeUser,
                approved_by_signature: signature,
                activity_log: nextLog,
            });
            const actor =
                response?.actor ??
                response?.data?.actor ??
                tentativeUser;
            const finalLog = nextLog.map((row, i) =>
                i === nextLog.length - 1 && row.type === "Approved" ? { ...row, user: actor } : row
            );
            setApprovalStatus("Approved");
            setApprovedByUser(actor);
            setApprovedBySignature(signature);
            setActivityLog(finalLog);
            writeLocalDraft({
                approval_status: "Approved",
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: actor,
                approved_by_signature: signature,
                activity_log: finalLog,
                pickup_entry_ids: formData.pickup_entry_id,
            });
            Swal.fire({
                icon: "success",
                title: "Tax Invoice Approved Successfully!",
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9",
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then((res) => {
                if (res.isConfirmed) {
                    navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`);
                }
            });
        } catch (error) {
            setApprovalStatus("Approved");
            setApprovedByUser(tentativeUser);
            setApprovedBySignature(signature);
            setActivityLog(nextLog);
            writeLocalDraft({
                approval_status: "Approved",
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: tentativeUser,
                approved_by_signature: signature,
                activity_log: nextLog,
                pickup_entry_ids: formData.pickup_entry_id,
            });
            Swal.fire({
                icon: "warning",
                title: "Saved locally",
                text:
                    error?.response?.data?.message ??
                    "Could not reach the server. Approval is stored in this browser only until the API is available.",
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9",
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then((res) => {
                if (res.isConfirmed) {
                    navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`);
                }
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleCancelInvoice = async () => {
        const userId = localStorage.getItem("userId");
        if (!userId || !realInvoiceId) return;

        const result = await Swal.fire({
            title: "Are you sure?",
            text: "You won't be able to revert this!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Yes, cancel it!"
        });

        if (result.isConfirmed) {
            try {
                setIsApprovalLoading(true);
                await cancelInvoice({
                    user_id: userId,
                    invoice_id: realInvoiceId,
                });

                Swal.fire({
                    icon: "success",
                    title: "Cancelled!",
                    text: "The invoice has been cancelled.",
                    confirmButtonColor: "#1470F9"
                }).then(() => {
                    navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`);
                });
            } catch (error) {
                console.error("Error cancelling invoice:", error);
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: error?.response?.data?.message ?? "Failed to cancel invoice",
                    confirmButtonColor: "#1470F9",
                });
            } finally {
                setIsApprovalLoading(false);
            }
        }
    };

    /**
     * "Edit Invoice" on a generated-but-unapproved (Created) invoice: releases the linked
     * delivery notes back to Pending (same revert-to-pending mechanics as Cancel, but logged
     * as "Edited" rather than "Cancelled") and sends the user to the Pending tab with those
     * same delivery notes pre-selected so they can adjust the selection and re-generate.
     */
    const handleEditInvoice = async () => {
        const userId = localStorage.getItem("userId");
        if (!userId || !realInvoiceId) return;

        const result = await Swal.fire({
            title: "Edit this invoice?",
            text: "This sends the linked orders back to Pending Invoices so you can adjust the selection and re-generate the invoice.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#1470F9",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Yes, edit it"
        });
        if (!result.isConfirmed) return;

        const editingInvoiceId = realInvoiceId;

        try {
            setIsApprovalLoading(true);
            await cancelInvoice({
                user_id: userId,
                invoice_id: editingInvoiceId,
                action: "Edit",
            });

            const preselectDeliveryNoteAutoIds = Array.from(
                new Set((invoice?.items || []).map((it) => it.delivery_note_id).filter((v) => v != null))
            );

            // Carry the original invoice_id forward so re-generating updates this SAME
            // invoice (see handleCreateInvoice's manual_invoice_id) instead of creating a new one.
            navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`, {
                state: { selectedTab: 1, preselectDeliveryNoteAutoIds, editingInvoiceId },
            });
        } catch (error) {
            console.error("Error sending invoice back for editing:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: error?.response?.data?.message ?? "Failed to send invoice back for editing",
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleApplyPreviewFields = async () => {
        if (approvalStatus === "Approved") return;
        const invForApproval = (realInvoiceId || "").trim();
        if (!invForApproval) {
            Swal.fire({
                icon: "warning",
                title: "Invoice not ready",
                text: "No corporate invoice record (INV…) was found for this pickup. Create the invoice first, then refresh this page.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const snap = appliedSnapshotRef.current;
        const changes = [];
        if ((formData.bank || "") !== (snap.bank || "")) {
            changes.push({ field: "Bank", from: snap.bank || "—", to: formData.bank || "—" });
        }
        if ((discount || "") !== (snap.discount || "")) {
            changes.push({ field: "Discount", from: snap.discount || "—", to: discount || "—" });
        }
        if ((transportRateOverride || "") !== (snap.transport || "")) {
            changes.push({ field: "Transport Charge", from: snap.transport || "—", to: transportRateOverride || "—" });
        }
        const currentTripCount = isTripCountEdited ? manualTripCount : (invoice?.trip_count || 0);
        const snapTripCount = snap.trip_count || 0;
        if (Number(currentTripCount) !== Number(snapTripCount)) {
            changes.push({ field: "Trip Count", from: snapTripCount || "—", to: currentTripCount || "—" });
        }
        if ((formData.notes || "") !== (snap.notes || "")) {
            changes.push({ field: "Notes", from: snap.notes || "—", to: formData.notes || "—" });
        }
        if ((formData.terms_and_conditions || "") !== (snap.terms || "")) {
            changes.push({
                field: "Terms & Conditions",
                from: snap.terms || "—",
                to: formData.terms_and_conditions || "—",
            });
        }
        if (changes.length === 0) {
            Swal.fire({
                icon: "info",
                title: "No changes",
                text: "Change bank, discount, notes, terms, transport or trip count before applying.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const actor = localStorage.getItem("userName") || "User";
        const updatedEntry = {
            type: "Updated",
            user: actor,
            timestamp: new Date().toISOString(),
            description: "updated invoice preview fields",
            changes,
        };
        const nextLog = [...activityLog, updatedEntry];
        try {
            const amounts = taxSummaryToGenerateInvoiceAmounts(invoiceSummary);
            const appliedTripCount = isTripCountEdited ? manualTripCount : (invoice?.trip_count || null);
            const appliedTransportRate = transportRateOverride !== ""
                ? parseFloat(transportRateOverride)
                : (parseFloat(getSavedRatePerTrip(invoice)) || locationRate);

            await updateCorporateTaxInvoicePreviewApproval({
                user_id: localStorage.getItem("userId") || "",
                invoice_id: invForApproval,
                pickup_entry_ids: formData.pickup_entry_id,
                customer_auto_id: cus,
                approval_status: approvalStatus,
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: approvedByUser,
                activity_log: nextLog,
                trip_count: appliedTripCount,
                transport_charge: invoiceSummary.transportCharge,
                transport_rate_per_trip: appliedTransportRate,
                total_amount: amounts.grand_total,
                balance_due: amounts.grand_total,
                cash_amount: amounts.grand_total,
            });
            setActivityLog(nextLog);
            appliedSnapshotRef.current = {
                bank: formData.bank,
                discount,
                notes: formData.notes,
                terms: formData.terms_and_conditions,
                transport: transportRateOverride,
                trip_count: appliedTripCount,
            };
            writeLocalDraft({
                approval_status: approvalStatus,
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: approvedByUser,
                activity_log: nextLog,
                pickup_entry_ids: formData.pickup_entry_id,
                transport: transportRateOverride,
            });

            await fetchInvoiceById();

            await Swal.fire({
                icon: "success",
                title: "Applied!",
                text: "Invoice fields updated successfully.",
                confirmButtonColor: "#1470F9",
            });
        } catch (error) {
            setActivityLog(nextLog);
            appliedSnapshotRef.current = {
                bank: formData.bank,
                discount,
                notes: formData.notes,
                terms: formData.terms_and_conditions,
            };
            writeLocalDraft({
                approval_status: approvalStatus,
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: approvedByUser,
                activity_log: nextLog,
                pickup_entry_ids: formData.pickup_entry_id,
            });
            Swal.fire({
                icon: "warning",
                title: "Saved locally",
                text:
                    error?.response?.data?.message ??
                    "Activity was recorded locally. Sync with the server when the API is ready.",
                confirmButtonColor: "#1470F9",
            });
        }
    };

    const invoiceLocked = approvalStatus === "Approved" || invoice?.status === "Deactive";



    const handleCreateInvoice = async () => {
        if (!invoice) return;
        try {
            setIsLoadingSubmit(true);

            const amounts = taxSummaryToGenerateInvoiceAmounts(invoiceSummary);

            const invoicePayload = {
                user_id: localStorage.getItem("userId") || "",
                company_name: String(invoice.customer_company_name || invoice.company_name || ""),
                customer_id: String(invoice.customer_id ?? ""),
                phone_number: String(invoice.customer_phone || invoice.phone_number || ""),
                invoicing_type: "Daily Invoice",
                payment_method: formData.payment_method || "CASH",
                card_type: String(formData.card_type || ""),
                bank: String(formData.bank || ""),
                discount: invoiceBindNumber(effectiveDiscountPercent),
                terms_and_conditions: String(formData.terms_and_conditions || ""),
                notes: String(formData.notes || ""),
                signed_by: String(invoice.signed_by || "System"),
                vat_status: String(formData.vat_status || ""),
                prepared_by_signature: preparationSignature,
                trip_count: isTripCountEdited ? manualTripCount : (invoice?.trip_count || null),
                ...amounts,
                advanced_amount: 0,
                cash_amount: amounts.grand_total,
                card_amount: invoiceBindNumber(formData.card_amount),
                // Send delivery_note_ids (CDN auto_ids) to the new CDN-anchored backend
                delivery_note_ids: (formData.delivery_note_ids && formData.delivery_note_ids.length > 0)
                    ? formData.delivery_note_ids
                    : cdnAutoIds.map(id => parseInt(id, 10)),
                ...(formData.manual_invoice_id && formData.manual_invoice_id.trim() !== ""
                    ? { manual_invoice_id: formData.manual_invoice_id.trim() }
                    : {}),
            };

            const response = await generateCorporateInvoice(invoicePayload);
            if (response?.data?.success === false) {
                throw new Error(response?.data?.message || "Invoice generation failed");
            }

            const newInvoiceId = response?.data?.invoice_id;
            if (newInvoiceId) {
                setRealInvoiceId(newInvoiceId);
            }

            await Swal.fire({
                title: "Success!",
                text: "Invoice created successfully.",
                icon: "success",
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9"
            });

            requestAnimationFrame(() => {
                navigateAfterPrintRef.current = true;
                handlePrint();
            });
        } catch (error) {
            console.error("Error creating invoice: ", error);
            alert(error?.message || "Failed to create invoice. Please check the console for details.");
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    return (
        <div className="relative">
            <div className="flex flex-col">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft
                    className="size-6 text-primary cursor-pointer"
                    onClick={() => {
                        if (onClose) {
                            onClose();
                        } else if (location.state?.from) {
                            navigate(location.state.from, { state: { selectedTab: location.state.selectedTab } });
                        } else {
                            navigate(`/salesCorporate/corporate/invoicing/daily/${cus}`);
                        }
                    }}
                />
                <h1 className="text-3xl text-primary font-bold">
                    Daily Invoicing Customers
                    {(() => {
                        const customerName =
                            matchedCustomer?.company_name ??
                            matchedCustomer?.customer_company_name ??
                            customerProfile?.company_name ??
                            customerProfile?.customer_company_name ??
                            invoice?.customer_company_name ??
                            invoice?.company_name ??
                            null;
                        if (!customerName) return "";
                        const invoiceIdPart = invoice
                            ? ` / ${invoice.invoice_id || invoice.pickup_entry_id || formData.pickup_entry_id || "-"}`
                            : "";
                        return ` / ${customerName}${invoiceIdPart}`;
                    })()}
                </h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Generate invoice for corporate orders.</p>

            <div>
                <div className="flex flex-row gap-x-3 items-center">
                    <Icon icon={"material-symbols:refresh"} className="bg-primary/20 text-primary rounded-full p-1 size-6" />
                    <h2 className="text-2xl font-semibold">Bill Preview</h2>
                </div>

                {isLoadingInvoice ? (
                    <div className="flex items-center justify-center py-20 bg-white">
                        <BeatLoader color="#1470F9" size={20} />
                    </div>
                ) : loadError ? (
                    <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-red-800">
                        <p className="font-semibold text-lg">Could not load preview</p>
                        <p className="mt-2">{loadError}</p>
                        <button
                            type="button"
                            className="mt-4 rounded-full border border-primary bg-white px-4 py-2 text-primary font-medium"
                            onClick={() => navigate(`/salesCorporate/corporate/invoicing/daily/${cus || ""}`)}
                        >
                            Back to list
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 mt-5">
                        <main className="col-span-3 border-r border-black/20 pe-3">
                            {/* Tax invoice print/readability (fonts, tables, summary): see CorporateInvoicePreview.jsx */}
                            {previewOrder && (
                                <CorporateInvoicePreview
                                    ref={invoiceRef}
                                    order={{
                                        ...previewOrder,
                                        place_of_supply: placeOfSupply,
                                        entry_transport_rate: isTripCountEdited ? locationRate : (realInvoiceId && invoice && invoice.transport_charge !== undefined ? (parseFloat(invoice.transport_charge) || 0) : locationRate),
                                        delivery_type: combinedDeliveryType,
                                        invoice_date: invoiceDate
                                    }}
                                    originalResponses={originalResponses}
                                    notes={formData.notes}
                                    terms_and_conditions={formData.terms_and_conditions}
                                    realInvoiceId={realInvoiceId}
                                    customerProfile={customerProfile}
                                    matchedCustomer={matchedCustomer}
                                    corporateCustomerListLoading={corporateCustomerListLoading}
                                    pricedLines={pricedLines}
                                    supplierLegal={supplierLegal}
                                    ssclRatePct={DAILY_INVOICE_SSCL_PCT}
                                    vatRatePct={DAILY_INVOICE_VAT_PCT}
                                    effectiveDiscountPercent={effectiveDiscountPercent}
                                    transportMultiplierOverride={isTripCountEdited ? manualTripCount : (realInvoiceId && invoice && invoice.transport_charge !== undefined ? 1 : (parseFloat(matchedCustomer?.customer_invoicing_period ?? customerProfile?.customer_invoicing_period ?? 1) || 1))}
                                    checkedBySignature={checkedBySignature}
                                    checkedByUser={checkedByUser}
                                    approvedByUser={approvedByUser}
                                    approvedBySignature={approvedBySignature}
                                    preparationSignature={preparationSignature}
                                    preparedByName={preparedByName}
                                    onEditTransport={invoiceLocked ? null : () => {
                                        setTempTripCount(manualTripCount !== null && manualTripCount !== undefined ? String(manualTripCount) : "");
                                        setShowTripCountModal(true);
                                    }}
                                    isTripCountEdited={isTripCountEdited}
                                    isTransportChargeEdited={isTransportChargeEdited}
                                />
                            )}

                            <div className="flex flex-row text-xl my-5 justify-between gap-x-5">
                                <button
                                    type="button"
                                    className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={() => navigate(`/salesCorporate/corporate/invoicing/daily/${cus}`)}
                                >
                                    Back
                                </button>
                                {isInvoiceGenerated && invoice?.status !== "Deactive" && approvalStatus !== "Approved" && (approvalStatus === "Created" || approvalStatus === "Checked") ? (
                                    <button
                                        type="button"
                                        className="font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-full py-2 w-1/3 cursor-pointer flex justify-center items-center"
                                        onClick={handleCancelInvoice}
                                        disabled={isApprovalLoading}
                                    >
                                        {isApprovalLoading ? (
                                            <BeatLoader size={8} color="#dc2626" />
                                        ) : (
                                            "Cancel Invoice"
                                        )}
                                    </button>
                                ) : (
                                    <div className="w-1/3"></div>
                                )}
                                <button
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={() => {
                                        if (isInvoiceGenerated) {
                                            handlePrint();
                                            return;
                                        }
                                        void handleCreateInvoice();
                                    }}
                                    disabled={
                                        isInvoiceGenerated
                                            ? !previewOrder
                                            : isLoadingSubmit || !invoice
                                    }
                                >
                                    {isInvoiceGenerated ? (
                                        "Print"
                                    ) : isLoadingSubmit ? (
                                        <BeatLoader color="#FFFFFF" size={10} />
                                    ) : (
                                        "Create Invoice & Print"
                                    )}
                                </button>
                            </div>
                        </main>

                        <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px]">
                            <button
                                type="button"
                                // Not yet generated (first-time creation) has nothing to edit yet — lock it,
                                // same as the Locked/Cancelled states below.
                                disabled={invoiceLocked || isApprovalLoading || !isInvoiceGenerated}
                                onClick={() => {
                                    // A generated invoice still in "Created" status hasn't been checked/approved
                                    // yet, so editing it means re-selecting its orders from Pending — not editing
                                    // the raw delivery note directly.
                                    if (isInvoiceGenerated && approvalStatus === "Created") {
                                        void handleEditInvoice();
                                        return;
                                    }
                                    if (!firstAssignedDeliveryNote) return;
                                    navigate(
                                        `/salesCorporate/corporate/delivery/entry/${firstAssignedDeliveryNote.pickup_entry_id}`,
                                        { state: { edit_note_id: firstAssignedDeliveryNote.delivery_id } }
                                    );
                                }}
                                className={`font-bold py-3 rounded-full text-lg shadow-sm transition-colors w-full ${
                                    invoiceLocked || isApprovalLoading || !isInvoiceGenerated
                                        ? "bg-black/10 text-black/40 cursor-not-allowed"
                                        : "bg-[#E5EFFE] text-[#000000] hover:bg-[#d4e4fd] cursor-pointer"
                                }`}
                            >
                                {invoice?.status === "Deactive"
                                    ? "🔒 Cancelled"
                                    : invoiceLocked || !isInvoiceGenerated
                                    ? "🔒 Locked"
                                    : "Edit Invoice"}
                            </button>

                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Created By :</p>
                                <div className="flex flex-row items-center gap-x-2">
                                    <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                                    <span className="text-black/70 text-sm truncate">
                                        {createdByName || "—"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Checked By :</p>
                                {checkedByUser ? (
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon icon="mdi:check-circle" className="text-[#1470F9] text-xl" />
                                        <span className="text-black/70 text-sm truncate">{checkedByUser}</span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={approvalStatus !== "Created" || isApprovalLoading || !isInvoiceGenerated || invoice?.status === "Deactive"}
                                        onClick={() => {
                                            handleChecked(null);
                                        }}
                                        className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors bg-white w-full text-lg ${
                                            approvalStatus === "Created" && !isApprovalLoading && isInvoiceGenerated && invoice?.status !== "Deactive"
                                                ? "border-[#1470F9] text-[#1470F9] hover:bg-blue-50 cursor-pointer"
                                                : "border-black/20 text-black/30 cursor-not-allowed opacity-50"
                                        }`}
                                    >
                                        {isApprovalLoading ? (
                                            <BeatLoader size={8} color="#1470F9" />
                                        ) : (
                                            "Checked"
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Approved By :</p>
                                {approvedByUser ? (
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                                        <span className="text-black/70 text-sm truncate">{approvedByUser}</span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={approvalStatus !== "Checked" || isApprovalLoading || !isInvoiceGenerated || invoice?.status === "Deactive"}
                                        onClick={() => {
                                            handleApproved(null);
                                        }}
                                        className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors w-full text-lg ${
                                            approvalStatus === "Checked" && !isApprovalLoading && isInvoiceGenerated && invoice?.status !== "Deactive"
                                                ? "bg-primary text-white hover:bg-blue-600 cursor-pointer"
                                                : "border-black/20 text-black/30 bg-white cursor-not-allowed opacity-50"
                                        }`}
                                    >
                                        {isApprovalLoading ? (
                                            <BeatLoader size={8} color="#ffffff" />
                                        ) : (
                                            "Approved"
                                        )}
                                    </button>
                                )}
                            </div>


                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Activity Log :</p>
                                <div className="max-h-52 overflow-y-auto overflow-x-hidden rounded-xl border border-black/70 bg-white shadow-sm">
                                    {activityLog.length === 0 ? (
                                        <div className="px-4 py-3 text-black/40 text-sm">No activity yet.</div>
                                    ) : (
                                        activityLog.map((log, idx) => {
                                            const formattedTime = formatLogTimestamp(log.timestamp);
                                            const isNewStyle = !!log.action;
                                            return (
                                                <div
                                                    key={`${idx}-${log.timestamp}-${log.type}`}
                                                    className={`px-4 py-2 text-sm text-black/70 ${
                                                        idx > 0 ? "border-t border-black/20" : ""
                                                    }`}
                                                >
                                                    {log.description ? (
                                                        <>
                                                            <span className="font-semibold text-[13px]">
                                                                {formattedTime}
                                                            </span>
                                                            : {log.user} — {log.description}
                                                            {log.changes && log.changes.length > 0 && (
                                                                <ul className="list-disc pl-5 mt-1 text-xs">
                                                                    {log.changes.map((change, ci) => (
                                                                        <li key={ci}>
                                                                            {typeof change === "string"
                                                                                ? change
                                                                                : change.field
                                                                                  ? `${change.field}: ${change.from ?? "—"} → ${change.to ?? "—"}`
                                                                                  : String(change)}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </>
                                                    ) : isNewStyle ? (
                                                        <>
                                                            <span className="font-semibold text-[13px]">
                                                                {formattedTime}
                                                            </span>
                                                            : {log.user} changed {log.field} from &quot;
                                                            {log.old ?? "—"}&quot; to &quot;{log.new ?? "—"}&quot;
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-semibold text-[13px]">
                                                                {formattedTime}
                                                            </span>
                                                            : {log.user}{" "}
                                                            {log.type === "Created"
                                                                ? "created the tax invoice preview"
                                                                : log.type === "Checked"
                                                                  ? "checked the tax invoice preview"
                                                                  : log.type === "Approved"
                                                                    ? "approved the tax invoice preview"
                                                                    : log.type === "Updated"
                                                                      ? "updated the tax invoice preview"
                                                                      : "edited the tax invoice preview"}
                                                            {log.changes && log.changes.length > 0 && (
                                                                <ul className="list-disc pl-5 mt-1 text-xs">
                                                                    {log.changes.map((change, ci) => (
                                                                        <li key={ci}>
                                                                            {typeof change === "string"
                                                                                ? change
                                                                                : change.field
                                                                                  ? `${change.field}: ${change.from ?? "—"} → ${change.to ?? "—"}`
                                                                                  : String(change)}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Credit &amp; Debit Notes :</p>
                                <div className="max-h-52 overflow-y-auto overflow-x-hidden rounded-xl border border-black/70 bg-white shadow-sm">
                                    {isLoadingLinkedNotes ? (
                                        <div className="px-4 py-3 flex justify-center">
                                            <BeatLoader size={8} color="#1470F9" />
                                        </div>
                                    ) : linkedCreditDebitNotes.length === 0 ? (
                                        <div className="px-4 py-3 text-black/40 text-sm">No credit/debit notes for this invoice.</div>
                                    ) : (
                                        linkedCreditDebitNotes.map((note, idx) => {
                                            // Latest status: cancelled notes keep their old approval_status (e.g. "Checked"), so
                                                // treat status "Deactive" OR a last activity-log entry of "Cancelled" as Cancelled.
                                                const noteLog = Array.isArray(note.activity_log)
                                                    ? note.activity_log
                                                    : (() => { try { return JSON.parse(note.activity_log || "[]"); } catch { return []; } })();
                                                const lastLogType = Array.isArray(noteLog) && noteLog.length > 0 ? noteLog[noteLog.length - 1]?.type : null;
                                                const status = note.status === "Deactive" || lastLogType === "Cancelled" ? "Cancelled" : (note.approval_status || "Created");
                                            return (
                                                <a
                                                    key={note.id ?? `${note.note_no}-${idx}`}
                                                    href={`/salesCorporate/corporate/credit-debit-notes?viewNoteId=${note.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Open this note's print view in a new tab"
                                                    className={`px-4 py-2 text-sm flex items-center justify-between gap-x-2 hover:bg-black/5 cursor-pointer ${
                                                        idx > 0 ? "border-t border-black/20" : ""
                                                    }`}
                                                >
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-semibold text-black truncate">{note.note_no}</span>
                                                        <span className={`text-xs font-medium ${note.type === "Credit Note" ? "text-red-500" : "text-primary"}`}>
                                                            {note.type} {note.type === "Credit Note" ? "-" : "+"}Rs {getNoteGrossAmount(note).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${
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
                                                </a>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Once an invoice has been generated, changing the discount/transport here
                                has nowhere to save to (the Apply button below is disabled) — real
                                edits go through "Edit Invoice" instead, so only show these while
                                still drafting a not-yet-generated invoice. */}
                            {!isInvoiceGenerated && (
                                <div className="flex flex-col gap-y-1">
                                    <label
                                        className="text-black font-semibold text-[15px]"
                                        htmlFor="discount-daily"
                                    >
                                        Discount :
                                    </label>
                                    <div className="flex flex-row gap-x-2">
                                        <div className="flex flex-row rounded-2xl border border-black/30 overflow-hidden shrink-0">
                                            <button
                                                type="button"
                                                disabled={invoiceLocked}
                                                className={`px-3 text-sm font-semibold cursor-pointer disabled:cursor-not-allowed ${!isPercentageDiscount ? "bg-primary text-white" : "bg-white text-black/60"}`}
                                                onClick={() => setDiscountMode("AMOUNT")}
                                            >
                                                Rs.
                                            </button>
                                            <button
                                                type="button"
                                                disabled={invoiceLocked}
                                                className={`px-3 text-sm font-semibold cursor-pointer disabled:cursor-not-allowed ${isPercentageDiscount ? "bg-primary text-white" : "bg-white text-black/60"}`}
                                                onClick={() => setDiscountMode("PERCENT")}
                                            >
                                                %
                                            </button>
                                        </div>
                                        <div className="relative grow">
                                            <input
                                                id="discount-daily"
                                                type="text"
                                                inputMode="decimal"
                                                disabled={invoiceLocked}
                                                onChange={handleInputChangeDiscount}
                                                value={discountNumericValue}
                                                placeholder={isPercentageDiscount ? "0 - 100" : "Enter amount"}
                                                className={
                                                    invoiceLocked
                                                        ? "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                                                        : "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black shadow-sm text-sm"
                                                }
                                            />
                                            {isPercentageDiscount && (
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-black/50 font-semibold pointer-events-none">
                                                    %
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {isPercentageDiscount && discountNumericValue !== "" && discountableSubtotal > 0 && (
                                        <p className="text-sm text-black/50">
                                            = Rs. {((Number(discountNumericValue) / 100) * discountableSubtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col gap-y-2">
                                <div className="flex flex-row justify-between items-center w-full">
                                    <p className="text-black font-semibold text-[15px]">Transport Details :</p>
                                    {!invoiceLocked && (
                                        isTransportEditing ? (
                                            <div className="flex flex-row gap-x-2.5">
                                                <button
                                                    type="button"
                                                    onClick={handleCancelTransportEdit}
                                                    className="text-gray-500 hover:text-gray-700 font-semibold text-sm cursor-pointer bg-transparent border-0"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveTransportEdit}
                                                    className="text-blue-600 hover:text-blue-800 font-semibold text-sm cursor-pointer bg-transparent border-0"
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleStartTransportEdit}
                                                className="text-blue-600 hover:text-blue-800 font-semibold text-sm flex items-center gap-x-1 cursor-pointer bg-transparent border-0"
                                            >
                                                <Icon icon="lucide:pencil" className="size-3.5" />
                                                <span>Edit</span>
                                            </button>
                                        )
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-4">
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-xs text-neutral-500 font-medium" htmlFor="transport-daily">
                                            Transport Rate
                                        </label>
                                        <input
                                            id="transport-daily"
                                            type="text"
                                            disabled={invoiceLocked || !isTransportEditing}
                                            readOnly={invoiceLocked || !isTransportEditing}
                                            value={isTransportEditing ? tempTransportCharge : (transportRateOverride !== "" ? transportRateOverride : (getSavedRatePerTrip(invoice) || (locationRate ? String(locationRate) : "")))}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (/^[0-9.]*$/.test(val)) {
                                                    setTempTransportCharge(val);
                                                    setLastEditedTransportField("transport");
                                                }
                                            }}
                                            className={
                                                (invoiceLocked || !isTransportEditing)
                                                    ? "border border-black/20 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                                                    : "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black shadow-sm text-sm"
                                            }
                                            placeholder="Rate per trip"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-xs text-neutral-500 font-medium" htmlFor="trip-count-daily">
                                            Trip Count
                                        </label>
                                        <input
                                            id="trip-count-daily"
                                            type="text"
                                            disabled={invoiceLocked || !isTransportEditing}
                                            readOnly={invoiceLocked || !isTransportEditing}
                                            value={isTransportEditing ? tempTripCountVal : (manualTripCount !== null && manualTripCount !== undefined ? String(manualTripCount) : (invoice?.trip_count !== undefined && invoice?.trip_count !== null ? String(invoice.trip_count) : ""))}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === "" || /^[0-9]*$/.test(val)) {
                                                    setTempTripCountVal(val);
                                                    setLastEditedTransportField("tripCount");
                                                }
                                            }}
                                            className={
                                                (invoiceLocked || !isTransportEditing)
                                                    ? "border border-black/20 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                                                    : "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black shadow-sm text-sm"
                                            }
                                            placeholder="No. of trips"
                                        />
                                    </div>
                                </div>
                            </div>



                            <div className="flex flex-col gap-y-1">
                                <label
                                    className="text-black font-semibold text-[15px]"
                                    htmlFor="tAndC-daily"
                                >
                                    Enter Terms & Conditions :
                                </label>
                                <textarea
                                    id="tAndC-daily"
                                    name="tAndC"
                                    rows={4}
                                    disabled={invoiceLocked}
                                    readOnly={invoiceLocked}
                                    placeholder="Enter terms & conditions"
                                    value={formData.terms_and_conditions}
                                    onChange={(e) => {
                                        setFormData((prev) => ({
                                            ...prev,
                                            terms_and_conditions: e.target.value,
                                        }));
                                    }}
                                    className={
                                        invoiceLocked
                                            ? "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm resize-none bg-black/5 cursor-not-allowed"
                                            : "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black shadow-sm text-sm resize-none"
                                    }
                                />
                            </div>

                            {/* Manual Invoice ID */}
                            {/* <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]" htmlFor="manual-invoice-id-daily">
                                    Manual Invoice ID :
                                    <span className="ml-1 font-normal text-black/40 text-xs">(Optional)</span>
                                </label>
                                <input
                                    id="manual-invoice-id-daily"
                                    type="text"
                                    disabled={invoiceLocked}
                                    placeholder="e.g., 26JUL_H1OW_7"
                                    value={formData.manual_invoice_id}
                                    onChange={(e) => {
                                        setFormData((prev) => ({ ...prev, manual_invoice_id: e.target.value }));
                                    }}
                                    className={
                                        invoiceLocked
                                            ? "border border-black/30 rounded-2xl px-4 py-2.5 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                                            : "border border-black/30 rounded-2xl px-4 py-2.5 w-full focus:outline-none text-black shadow-sm text-sm"
                                    }
                                />
                                <p className="text-xs text-black/40">Leave blank to auto-generate the next Invoice ID.</p>
                            </div> */}

                            {/* <button
                                type="button"
                                disabled={invoiceLocked}
                                onClick={handleApplyPreviewFields}
                                className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors w-full text-lg ${
                                    invoiceLocked
                                        ? "border-black/20 text-black/30 bg-white cursor-not-allowed"
                                        : "border-[#1470F9] text-[#1470F9] bg-white hover:bg-blue-50 cursor-pointer"
                                }`}
                            >
                                Apply
                            </button> */}
                        </aside>
                    </div>
                )}
            </div>
            </div>

            {showSignatureModal && (
                <div className="fixed inset-0 h-screen w-screen z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
                    <div className="bg-white rounded-[24px] w-full max-w-[450px] shadow-2xl flex flex-col p-8 transition-all relative">
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                            Checked By Signature
                        </h2>
                        <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                            Please draw your signature in the box below to confirm this request.
                        </p>

                        <div className="w-full h-[180px] border border-dashed border-gray-300 rounded-xl overflow-hidden bg-white mb-3">
                            <SignatureCanvas
                                ref={sigCanvasRef}
                                penColor="black"
                                canvasProps={{
                                    className: "w-full h-full cursor-crosshair"
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => sigCanvasRef.current.clear()}
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
                                onClick={handleConfirmSignature}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showTripCountModal && (
                <div className="fixed inset-0 h-screen w-screen z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
                    <div className="bg-white rounded-[24px] w-full max-w-[400px] shadow-2xl flex flex-col p-8 transition-all relative">
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                            Update Transport Trip Count
                        </h2>
                        <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                            Specify the trip count override for the transport charge calculation.
                        </p>

                        <div className="flex flex-col gap-y-2 mb-6">
                            <label className="text-sm font-semibold text-gray-700 text-left">Add the trip count</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:border-primary text-black bg-white"
                                placeholder="Enter trip count (e.g. 5)"
                                value={tempTripCount}
                                onChange={(e) => setTempTripCount(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-row gap-x-4 w-full">
                            <button
                                type="button"
                                onClick={() => setShowTripCountModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-full text-base cursor-pointer transition-colors text-center bg-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const val = parseInt(tempTripCount, 10);
                                    if (!isNaN(val) && val >= 0) {
                                        setManualTripCount(val);
                                        setIsTripCountEdited(true);
                                        setShowTripCountModal(false);
                                    } else {
                                        Swal.fire({
                                            icon: "error",
                                            title: "Invalid Input",
                                            text: "Please enter a valid trip count number.",
                                            confirmButtonColor: "#1470F9",
                                        });
                                    }
                                }}
                                className="flex-1 py-2.5 bg-primary hover:bg-[#005AE0] text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorporateDailyInvoiceGenerate;
