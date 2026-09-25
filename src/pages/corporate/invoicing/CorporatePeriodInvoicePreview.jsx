import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import SignatureCanvas from "react-signature-canvas";
import Swal from "sweetalert2";
import { BeatLoader } from "react-spinners";
import logo from "../../../assets/logo.png";
import { computePeriodWindow, calendarDayLabel } from "../../../utils/periodInvoiceWindow";
import {
    trackPickupEntriesByIds,
    trackPickupEntryById,
    getCorporateDeliveryNoteForInvoice,
    updateCorporateTaxInvoicePreviewApproval,
    normalizePreviewApprovalStatus,
    pickTaxInvoicePreviewActorFields,
    pickTaxInvoicePreviewActivityLog,
    pickTaxInvoicePreviewApprovalRaw,
    isCorporateInvoiceAlreadyGenerated,
    generateCorporateInvoice,
    getCorporateInvoiceById,
    getCorporateInvoiceByInvoiceId,
    pickCorporateSalesInvoiceIdFromGetByPickupResponse,
    cancelInvoice,
} from "../../../services/corporate/CorporateInvoicingServices";
import {
    getAllCorporateSettings,
    getCorporateTaxes,
    getCorporatePriceListByCustomer,
    getAllCorporateItems,
} from "../../../services/corporate/CorporateSettingsServices";
import {
    getAllCorporateCustomers,
    getCorporateCustomerById,
    unwrapCorporateCustomerGetByIdResponse,
} from "../../../services/CustomerServices";
import { getCreditDebitNotesByInvoice } from "../../../services/corporate/CreditDebitNoteServices";
import { pickCorporateTaxRatePercent, buildCollectionNoteLinesFromApiOrderItems } from "../../../utils/corporateCollectionNotePricing";
import {
    computeCorporateTaxInvoiceSummary,
    grandTotalToAmountInWords,
    taxSummaryToGenerateInvoiceAmounts,
    invoiceBindNumber,
} from "../../../utils/corporateTaxInvoiceMath";
import { normalizePickupTrackResponse } from "../../../utils/normalizeCorporatePickupTrackResponse";

function unwrapTrackPayload(res) {
    const raw = res?.data;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const cdn = raw.delivery_note;
    const nested = raw.data;
    let merged = { ...raw };
    if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
        merged = { ...merged, ...nested };
    }
    if (cdn != null && typeof cdn === "object" && !Array.isArray(cdn)) {
        merged = {
            ...merged,
            ...cdn,
            ...(cdn.pickup_entry || {}),
            room_no: cdn.room_no || cdn.pickup_entry?.room_no || merged.room_no,
            gate_pass_no: cdn.gate_pass_no || cdn.pickup_entry?.gate_pass_no || merged.gate_pass_no,
        };
    }
    try {
        const normalized = normalizePickupTrackResponse(merged);
        return normalized && typeof normalized === "object" ? normalized : merged;
    } catch {
        return merged;
    }
}

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

function pickFirstString(obj, keys) {
    if (!obj) return "";
    for (const k of keys) {
        const v = obj[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
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

function startOfLocalDay(d) {
    const x = new Date(d);
    if (!Number.isFinite(x.getTime())) return null;
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function orderAnchorDate(order) {
    const candidates = [
        order?.delivery_date,
        order?.last_deliver_date,
        order?.lastDate,
        order?.created_at,
        order?.pickup_date,
        order?.created,
    ];
    for (const c of candidates) {
        if (c == null || c === "") continue;
        const t = new Date(c);
        if (Number.isFinite(t.getTime())) return t;
    }
    return null;
}

function dayIndexForOrder(anchorMs, periodStartDay, numDays) {
    if (periodStartDay == null || !Number.isFinite(anchorMs)) return 1;
    const anchorDay = startOfLocalDay(anchorMs);
    if (!anchorDay) return 1;
    const diffDays = Math.round((anchorDay - periodStartDay) / 86400000) + 1;
    return Math.min(numDays, Math.max(1, diffDays));
}

function formatHeaderDateSlash(raw) {
    if (raw == null || raw === "") return "";
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) return d.toLocaleDateString('en-CA').replace(/-/g, "/");
    return String(raw).replace(/-/g, "/").trim();
}

function monthName(m0) {
    const names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    return names[m0] ?? "";
}

function ordinal(n) {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return `${n}st`;
    if (j === 2 && k !== 12) return `${n}nd`;
    if (j === 3 && k !== 13) return `${n}rd`;
    return `${n}th`;
}

function formatPeriodRangeLabel(periodStartDay, numDays) {
    if (!periodStartDay || !Number.isFinite(numDays) || numDays < 1) return "";
    const end = new Date(periodStartDay);
    end.setDate(end.getDate() + numDays - 1);
    const d1 = periodStartDay.getDate();
    const m1 = monthName(periodStartDay.getMonth());
    const y1 = periodStartDay.getFullYear();
    const d2 = end.getDate();
    const m2 = monthName(end.getMonth());
    const y2 = end.getFullYear();
    if (m1 === m2 && y1 === y2) return `${ordinal(d1)}-${ordinal(d2)} ${m1} ${y1}`;
    return `${ordinal(d1)} ${m1} ${y1} - ${ordinal(d2)} ${m2} ${y2}`;
}

/** e.g. "7th - 21st June 2026" for supplier / tax invoice header */
function formatDeliveryDateRangeLong(periodStartDay, numDays) {
    if (!periodStartDay || !Number.isFinite(numDays) || numDays < 1) return "";
    const end = new Date(periodStartDay);
    end.setDate(end.getDate() + numDays - 1);
    const d1 = periodStartDay.getDate();
    const m1 = monthName(periodStartDay.getMonth());
    const y1 = periodStartDay.getFullYear();
    const d2 = end.getDate();
    const m2 = monthName(end.getMonth());
    const y2 = end.getFullYear();
    if (m1 === m2 && y1 === y2) return `${ordinal(d1)} - ${ordinal(d2)} ${m1} ${y1}`;
    return `${ordinal(d1)} ${m1} ${y1} - ${ordinal(d2)} ${m2} ${y2}`;
}

function formatPercentForLabel(p) {
    const v = Number(p ?? 0);
    if (!Number.isFinite(v)) return "0";
    if (Number.isInteger(v)) return String(v);
    const fixed = v.toFixed(2);
    return fixed.replace(/\.?0+$/, "") || "0";
}

function formatMoney(n) {
    const num = Number(n || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRsPlain(n) {
    const num = Number(n || 0);
    return `RS ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function normalizeServiceType(raw) {
    const st = String(raw || "Washing").trim();
    const lower = st.toLowerCase();
    if (lower.includes("dry")) return "Dry Clean";
    if (lower.includes("press")) return "Pressing";
    return st.charAt(0).toUpperCase() + st.slice(1).toLowerCase();
}

function serviceTypeHeading(serviceType) {
    const s = String(serviceType || "").trim();
    if (!s) return "WASHING";
    return s.toUpperCase();
}

function formatDeliveryType(val) {
    if (!val) return "Normal";
    const str = String(val).replace(/_/g, " ").trim().toLowerCase();
    return str.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** Supplier (left) header: bold ALL CAPS labels with " LABEL :" and value right-aligned */
function SupplierInfoRow({ label, value, valueClassName = "" }) {
    const upper = String(label || "").trim().toUpperCase();
    const labelText = /\s*:\s*$/.test(upper) ? upper : `${upper} :`;
    const show = value != null && String(value).trim() !== "";
    return (
        <div className="flex w-full min-w-0 items-baseline justify-between gap-x-2">
            <span className="shrink-0 text-left text-[11px] font-bold uppercase tracking-tight text-black print:text-[10px]">
                {labelText}
            </span>
            <span
                className={`min-w-0 max-w-[62%] text-right text-[11px] font-normal normal-case leading-snug break-words print:max-w-[58%] print:text-[10px] ${valueClassName}`.trim()}
            >
                {show ? value : "—"}
            </span>
        </div>
    );
}

const DEFAULT_TAX_INVOICE_SUPPLIER = {
    companyName: "C L SOLUTIONS ( PVT ) LTD",
    vatNo: "108812540-7000",
    address: "NO:583/71, AUGUSTINE PREMATHIRATHNA ROAD",
    operationAddress: "NO 391, AVISSAWELLA ROAD, WELLAMPITIYA",
    hotline: "011-4701566/ 076-4660661",
};

const FALLBACK_SUPPLIER_EMAIL = "info@sparklelaundry.lk";

function parseOrderIdsParam(raw) {
    return String(raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

const formatLogTimestamp = (isoString) => {
    try {
        const date = new Date(isoString);
        if (!Number.isFinite(date.getTime())) return String(isoString ?? "");
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${yyyy}-${mm}-${dd} ${hours}:${minutes} ${ampm}`;
    } catch (_) {
        return String(isoString ?? "");
    }
};

function readPeriodInvoicePreviewDraftKey(userId, cus, pickupEntryIdsKey) {
    if (!userId || !cus || !pickupEntryIdsKey || String(pickupEntryIdsKey).trim() === "") return null;
    return `corporatePeriodInvoiceDraft:v1:${userId}:${cus}:${String(pickupEntryIdsKey).trim()}`;
}

export default function CorporatePeriodInvoicePreview({ cus: propCus, ids: propIds, onClose } = {}) {
    const { cus: routeCus } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const printRef = useRef(null);

    const cus = propCus || routeCus;
    const idsQuery = propIds || searchParams.get("ids") || "";
    const orderIds = useMemo(() => parseOrderIdsParam(idsQuery), [idsQuery]);

    const [loadError, setLoadError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [customerProfile, setCustomerProfile] = useState(null);
    const [corporateSettings, setCorporateSettings] = useState(null);
    const [priceList, setPriceList] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [taxRates, setTaxRates] = useState({ sscl: 0, vat: 0 });

    const [placeOfSupplyInput, setPlaceOfSupplyInput] = useState("");
    const [itemNote, setItemNote] = useState("");
    const [termsText, setTermsText] = useState('Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only');
    const [manualInvoiceId, setManualInvoiceId] = useState("");

    const [approvalStatus, setApprovalStatus] = useState("Created");
    const [createdByName, setCreatedByName] = useState("");
    const [checkedByUser, setCheckedByUser] = useState(null);
    const [checkedBySignature, setCheckedBySignature] = useState(null);
    const [approvedByUser, setApprovedByUser] = useState(null);
    const [approvedBySignature, setApprovedBySignature] = useState(null);
    const [signingForStatus, setSigningForStatus] = useState(null);
    const [activityLog, setActivityLog] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [isApprovalLoading, setIsApprovalLoading] = useState(false);
    const [realInvoiceId, setRealInvoiceId] = useState(null);
    const [invoiceDateStr, setInvoiceDateStr] = useState("");
    const [transportRateOverride, setTransportRateOverride] = useState("");
    const [fetchedInvoiceRow, setFetchedInvoiceRow] = useState(null);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    // Credit/Debit Notes already raised against this invoice — shown in the side panel so a
    // checker/approver can see at a glance whether this invoice has already been adjusted.
    const [linkedCreditDebitNotes, setLinkedCreditDebitNotes] = useState([]);
    const [isLoadingLinkedNotes, setIsLoadingLinkedNotes] = useState(false);

    const [manualTripCount, setManualTripCount] = useState(null);
    const [isTripCountEdited, setIsTripCountEdited] = useState(false);
    const [tempTripCount, setTempTripCount] = useState("");
    const [showTripCountModal, setShowTripCountModal] = useState(false);

    const [isTransportChargeEdited, setIsTransportChargeEdited] = useState(false);
    const [lastEditedTransportField, setLastEditedTransportField] = useState(null);

    const [isTransportEditing, setIsTransportEditing] = useState(false);
    const [tempTransportCharge, setTempTransportCharge] = useState("");
    const [tempTripCountVal, setTempTripCountVal] = useState("");

    // Fetch any Credit/Debit Notes already raised against this invoice, once it's been generated
    // and its invoice_id is known — shown alongside the Activity Log in the side panel.
    useEffect(() => {
        const targetInvoiceId = fetchedInvoiceRow?.invoice_id;
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
    }, [fetchedInvoiceRow?.invoice_id]);

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

        const savedRate = getSavedRatePerTrip(fetchedInvoiceRow);
        const initialRate = transportRateOverride !== ""
            ? transportRateOverride
            : (savedRate !== null ? savedRate : (locationRate ? String(locationRate) : ""));
        const initialTripCount = manualTripCount !== null && manualTripCount !== undefined
            ? String(manualTripCount)
            : (fetchedInvoiceRow?.trip_count !== undefined && fetchedInvoiceRow?.trip_count !== null ? String(fetchedInvoiceRow.trip_count) : "");

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

        const targetInvoiceId = realInvoiceId || invoiceIdForTaxPreviewApproval;
        if (targetInvoiceId) {
            try {
                setIsLoadingSubmit(true);

                await updateCorporateTaxInvoicePreviewApproval({
                    user_id: localStorage.getItem("userId") || "",
                    invoice_id: targetInvoiceId,
                    pickup_entry_ids: pickupEntryIdsForApproval || [],
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
                    total_amount: invoiceSummary?.grandTotal || 0,
                    balance_due: invoiceSummary?.grandTotal || 0,
                    cash_amount: invoiceSummary?.grandTotal || 0,
                    place_of_supply: placeOfSupplyInput,
                    notes: itemNote,
                    terms_and_conditions: termsText,
                });

                setFetchedInvoiceRow((prev) => prev ? {
                    ...prev,
                    trip_count: newTripCount,
                    transport_charge: computedTotalTransport,
                    transport_rate_per_trip: rawRateInput,
                    isupdated_transport_rate: 1,
                } : prev);

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
                setIsLoadingSubmit(false);
            }
        }
    };

    const sigCanvasRef = useRef(null);
    const appliedSnapshotRef = useRef({ place: "", note: "", terms: "", transport: "", trip_count: null });
    const [preparationSignature, setPreparationSignature] = useState(null);
    const [preparedByName, setPreparedByName] = useState("");

    useEffect(() => {
        setPreparationSignature(sessionStorage.getItem("preparationSignature"));
        setPreparedByName(sessionStorage.getItem("preparedByName") || "");
    }, []);

    const invoiceLocked = approvalStatus === "Approved" || fetchedInvoiceRow?.status === "Deactive";

    const [allCorporateCustomers, setAllCorporateCustomers] = useState([]);
    const [corporateCustomerListLoading, setCorporateCustomerListLoading] = useState(true);

    const navigateAfterPrintRef = useRef(false);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: "",
        onAfterPrint: () => {
            if (navigateAfterPrintRef.current) {
                navigateAfterPrintRef.current = false;
                navigate(`/salesCorporate/corporate/invoicing/period/${cus}`);
            }
        }
    });

    const idsKey = orderIds.join(",");

    const fetchSelectedOrders = useCallback(async () => {
        const userId = localStorage.getItem("userId");
        if (!userId || !cus) {
            setLoadError("Missing user or customer.");
            setOrders([]);
            setIsLoading(false);
            return;
        }
        if (orderIds.length === 0) {
            setLoadError("No orders selected. Go back, select pending orders, and click Invoicing Selected Orders.");
            setOrders([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setLoadError(null);
        try {
            const isInvoiceIdMode = orderIds.some((idStr) => /^INV/i.test(idStr.trim()));
            let fetchedInvoiceRow = null;
            let resolvedDbInvoiceId = "";
            let loadedOrders = [];

            if (isInvoiceIdMode) {
                const invoiceId = orderIds[0];
                resolvedDbInvoiceId = invoiceId;
                try {
                    const invRes = await getCorporateInvoiceByInvoiceId(invoiceId);
                    fetchedInvoiceRow = invRes?.data?.invoice ?? invRes?.data?.data?.invoice ?? invRes?.data?.data ?? null;
                } catch (e) {
                    console.warn("getCorporateInvoiceByInvoiceId failed:", e?.message);
                }
            } else {
                const batchSettled = await Promise.allSettled(
                    orderIds.map(async (idStr) => {
                        const isNumeric = /^\d+$/.test(idStr);
                        if (isNumeric) {
                            try {
                                const cdnRes = await getCorporateDeliveryNoteForInvoice(userId, idStr);
                                const cdnData = cdnRes?.data?.delivery_note;
                                if (cdnData) {
                                    const pe = cdnData.pickup_entry ?? {};
                                    return {
                                        ...pe,
                                        ...cdnData,
                                        pickup_entry_id: cdnData.pickup_entry_id || pe.pickup_entry_id || cdnData.delivery_id,
                                        delivery_id: cdnData.delivery_id,
                                        delivery_note_no: cdnData.delivery_id,
                                        room_no: cdnData.room_no || pe.room_no,
                                        gate_pass_no: cdnData.gate_pass_no || pe.gate_pass_no,
                                        items: cdnData.items ?? [],
                                        pickup_entry: pe,
                                    };
                                }
                            } catch (e) {
                                console.warn("getCorporateDeliveryNoteForInvoice failed for:", idStr, e?.message);
                            }
                        }
                        const trackRes = await trackPickupEntryById(userId, idStr);
                        return unwrapTrackPayload(trackRes);
                    })
                );

                loadedOrders = batchSettled
                    .filter((b) => b.status === "fulfilled" && b.value)
                    .map((b) => b.value)
                    .filter((o) => o && typeof o === "object");
            }

            // Resolve invoice row if not loaded yet
            if (!isInvoiceIdMode && loadedOrders.length > 0) {
                const firstData = loadedOrders[0] || {};
                const TRACK_INVOICE_ID_KEYS = [
                    "invoice_id",
                    "corporate_invoice_no",
                    "generated_invoice_no",
                    "tax_invoice_no",
                    "tax_invoice_number",
                    "invoice_no",
                    "invoice_ref_no",
                ];
                const isPickupStyleInvoiceRef = (s) => {
                    const t = String(s || "").trim();
                    return /^PE_ORDER/i.test(t) || /^PE_/i.test(t);
                };
                const pickFirstString = (obj, keys) => {
                    if (!obj) return "";
                    for (const k of keys) {
                        const v = obj[k];
                        if (v != null && String(v).trim() !== "") return String(v).trim();
                    }
                    return "";
                };

                resolvedDbInvoiceId = pickFirstString(firstData, TRACK_INVOICE_ID_KEYS);
                if (resolvedDbInvoiceId && isPickupStyleInvoiceRef(resolvedDbInvoiceId)) {
                    resolvedDbInvoiceId = "";
                }

                if (!resolvedDbInvoiceId) {
                    for (const peId of orderIds) {
                        try {
                            const invRes = await getCorporateInvoiceById({
                                user_id: userId,
                                pickup_entry_id: peId,
                            });
                            resolvedDbInvoiceId = pickCorporateSalesInvoiceIdFromGetByPickupResponse(invRes);
                            if (resolvedDbInvoiceId) {
                                fetchedInvoiceRow = invRes?.data?.invoice ?? invRes?.data?.data?.invoice ?? invRes?.data?.data ?? null;
                                break;
                            }
                        } catch (e) {
                            console.warn("getCorporateInvoiceById failed for pickup_entry_id:", peId, e?.message);
                        }
                    }
                } else {
                    try {
                        const invRes = await getCorporateInvoiceByInvoiceId(resolvedDbInvoiceId);
                        fetchedInvoiceRow = invRes?.data?.invoice ?? invRes?.data?.data?.invoice ?? invRes?.data?.data ?? null;
                    } catch (e) {
                        console.warn("getCorporateInvoiceByInvoiceId failed:", e?.message);
                    }
                }
            }

            setRealInvoiceId(resolvedDbInvoiceId ? String(resolvedDbInvoiceId).trim() : null);
            setFetchedInvoiceRow(fetchedInvoiceRow);

            if (fetchedInvoiceRow) {
                setPreparationSignature(fetchedInvoiceRow.prepared_by_signature || null);
                setPreparedByName(fetchedInvoiceRow.printed_by || fetchedInvoiceRow.signed_by || "");
                setManualTripCount(fetchedInvoiceRow.trip_count);
                setIsTripCountEdited(false);

                const dbItems = fetchedInvoiceRow.items || [];
                if (dbItems.length > 0) {
                    const itemsByPickup = new Map();
                    dbItems.forEach((it) => {
                        const key = String(it.delivery_id || it.pickup_entry_id || "default").trim();
                        if (!itemsByPickup.has(key)) {
                            itemsByPickup.set(key, []);
                        }
                        itemsByPickup.get(key).push({
                            ...it,
                            corp_item_id: it.corp_item_id ?? it.item_id,
                            corp_item_quantity: Number(it.delivered_qty || it.corp_item_quantity || 0),
                            delivered_qty: Number(it.delivered_qty || 0),
                            pickup_date: it.pickup_date || it.created_at,
                            room_no: it.room_no || fetchedInvoiceRow.room_no,
                            gate_pass_no: it.gate_pass_no || fetchedInvoiceRow.gate_pass_no,
                        });
                    });

                    const cdnList = Array.from(itemsByPickup.entries());
                    const datesSet = new Set();
                    cdnList.forEach(([, itemsList]) => {
                        itemsList.forEach((it) => {
                            if (it.pickup_date) datesSet.add(it.pickup_date);
                        });
                    });

                    const baseStartDate = fetchedInvoiceRow.created_at || fetchedInvoiceRow.date || fetchedInvoiceRow.invoicing_date || new Date().toISOString();
                    const startMs = new Date(baseStartDate).getTime();

                    const synthesizedOrders = cdnList.map(([key, itemsList], idx) => {
                        const firstIt = itemsList[0] || {};
                        let dateVal = firstIt.pickup_date;
                        if (!dateVal || datesSet.size <= 1) {
                            const d = new Date(Number.isFinite(startMs) ? startMs : Date.now());
                            d.setDate(d.getDate() + idx);
                            dateVal = d.toISOString().split("T")[0];
                        }

                        const itemsWithDate = itemsList.map((it) => ({
                            ...it,
                            pickup_date: it.pickup_date || dateVal,
                        }));

                        return {
                            ...fetchedInvoiceRow,
                            pickup_entry_id: firstIt.pickup_entry_id || key,
                            delivery_id: firstIt.delivery_id || key,
                            delivery_note_no: firstIt.delivery_id || key,
                            room_no: firstIt.room_no || fetchedInvoiceRow.room_no,
                            gate_pass_no: firstIt.gate_pass_no || fetchedInvoiceRow.gate_pass_no,
                            created_at: dateVal,
                            pickup_date: dateVal,
                            items: itemsWithDate,
                        };
                    });

                    if (synthesizedOrders.length > 0) {
                        loadedOrders = synthesizedOrders;
                    }
                }
            }

            if (!loadedOrders.length) {
                throw new Error("No order data returned from the server.");
            }

            setOrders(loadedOrders);

            const [settingsRes, custRes, itemsRes, priceRes, taxRes] = await Promise.allSettled([
                getAllCorporateSettings(userId),
                getCorporateCustomerById({ user_id: userId, customer_auto_id: cus }),
                getAllCorporateItems(userId),
                getCorporatePriceListByCustomer({
                    user_id: userId,
                    customer_id: loadedOrders[0]?.customer_id || cus,
                }),
                getCorporateTaxes(userId, { activeOnly: true }),
            ]);

            if (settingsRes.status === "fulfilled") {
                setCorporateSettings(settingsRes.value?.data?.settings?.[0] ?? null);
            } else setCorporateSettings(null);

            if (custRes.status === "fulfilled") {
                const row = unwrapCorporateCustomerGetByIdResponse(custRes.value);
                setCustomerProfile(row && typeof row === "object" ? row : null);
            } else setCustomerProfile(null);

            if (itemsRes.status === "fulfilled") {
                const raw = itemsRes.value?.data?.corporate_items ?? [];
                setItemTypes(normalizeCorporateItemsForPricing(raw));
            } else setItemTypes([]);

            if (priceRes.status === "fulfilled") {
                const list =
                    priceRes.value?.data?.price_list ??
                    priceRes.value?.data?.corporate_price_lists ??
                    priceRes.value?.data ??
                    [];
                setPriceList(Array.isArray(list) ? list : []);
            } else setPriceList([]);

            if (taxRes.status === "fulfilled") {
                const taxes = taxRes.value?.taxes ?? [];
                setTaxRates({
                    sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
                    vat: pickCorporateTaxRatePercent(taxes, "VAT"),
                });
            } else setTaxRates({ sscl: 2.5, vat: 18 }); // fallback to defaults if taxes fetch fails
        } catch (e) {
            console.error(e);
            setLoadError(e?.message || "Failed to load period preview.");
            setOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, [cus, idsKey]);

    useEffect(() => {
        fetchSelectedOrders();
    }, [fetchSelectedOrders]);

    /** Full corporate customer list (get-all-corporate-customers) — same pattern as CorporateDailyInvoiceGenerate. */
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
                console.error("Failed to load corporate customer list for period invoice header:", e);
                if (!cancelled) setAllCorporateCustomers([]);
            } finally {
                if (!cancelled) setCorporateCustomerListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const pickupEntryIdsForApproval = useMemo(() => orderIds.join(","), [orderIds]);

    /** Must match sales_corporate_invoices row key expected by update-corporate-tax-invoice-preview-approval. */
    const invoiceIdForTaxPreviewApproval = useMemo(() => {
        if (realInvoiceId) return realInvoiceId;
        if (!orders.length) return "";
        const first = orders[0] || {};
        const fromOrder = pickFirstString(first, [
            "invoice_id",
            "corporate_invoice_id",
            "sales_corporate_invoice_id",
            "pickup_entry_id",
            "order_id",
        ]);
        return String(fromOrder || pickupEntryIdsForApproval || "").trim();
    }, [realInvoiceId, orders, pickupEntryIdsForApproval]);

    useEffect(() => {
        if (isLoading || loadError || !orders.length || !cus) return;
        const userId = localStorage.getItem("userId");
        if (!userId) return;

        const firstData = orders[0] || {};
        const pickupEntryIdsKey = pickupEntryIdsForApproval;

        const c = customerProfile || {};
        const posDefault = pickFirstString(c, ["place_of_supply", "customer_place_of_supply"]) || "";
        const sl = corporateSettings || {};
        const termsDefault = resolveTerms(firstData?.terms_and_conditions, sl.receipt_terms);
        let noteDefault = "";
        for (const o of orders) {
            const n = pickFirstString(o, ["notes", "note", "order_notes"]);
            if (n) {
                noteDefault = n;
                break;
            }
        }

        const draftKey = readPeriodInvoicePreviewDraftKey(userId, cus, pickupEntryIdsKey);
        let localDraft = null;
        if (draftKey) {
            try {
                localDraft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
            } catch (_) {
                localDraft = null;
            }
        }

        const apiLog = pickTaxInvoicePreviewActivityLog(firstData);
        let mergedLog = [...apiLog];
        const serverPreviewStatus = normalizePreviewApprovalStatus(
            pickTaxInvoicePreviewApprovalRaw(firstData)
        );
        const serverFinal = serverPreviewStatus === "Checked" || serverPreviewStatus === "Approved";
        const serverActors = pickTaxInvoicePreviewActorFields(firstData);

        if (
            localDraft &&
            localDraft.pickup_entry_key === pickupEntryIdsKey &&
            Array.isArray(localDraft.activity_log) &&
            !serverFinal
        ) {
            mergedLog =
                localDraft.activity_log.length >= apiLog.length ? [...localDraft.activity_log] : [...apiLog];
        }

        const hasPreviewCreated = mergedLog.some(
            (l) =>
                l &&
                l.type === "Created" &&
                /tax invoice preview|invoice preview/i.test(String(l.description || ""))
        );
        if (!hasPreviewCreated) {
            mergedLog = [
                {
                    type: "Created",
                    user: localStorage.getItem("userName") || "System",
                    timestamp: new Date().toISOString(),
                    description: "created the period tax invoice preview",
                    changes: [],
                },
                ...mergedLog,
            ];
        }

        let mergedStatus = serverPreviewStatus;
        let mergedCheckedUser = serverActors.checkedByUser;
        let mergedCheckedSig = serverActors.checkedBySignature;
        let mergedApprovedUser = serverActors.approvedByUser;

        if (!serverFinal && localDraft && localDraft.pickup_entry_key === pickupEntryIdsKey) {
            mergedStatus = normalizePreviewApprovalStatus(localDraft.approval_status || mergedStatus);
            mergedCheckedUser = localDraft.checked_by_user ?? mergedCheckedUser;
            mergedCheckedSig = localDraft.checked_by_signature ?? mergedCheckedSig;
            mergedApprovedUser = localDraft.approved_by_user ?? mergedApprovedUser;
        }

        if (fetchedInvoiceRow) {
            mergedStatus = fetchedInvoiceRow.approval_status || mergedStatus || "Created";
            mergedCheckedUser = fetchedInvoiceRow.checked_by_user || mergedCheckedUser;
            mergedCheckedSig = fetchedInvoiceRow.checked_by_signature || mergedCheckedSig;
            mergedApprovedUser = fetchedInvoiceRow.approved_by_user || mergedApprovedUser;
            const invDate = fetchedInvoiceRow.invoice_date || fetchedInvoiceRow.created_at;
            if (invDate) setInvoiceDateStr(formatHeaderDateSlash(invDate));
            if (fetchedInvoiceRow.activity_log) {
                let parsedLog = [];
                try {
                    parsedLog = typeof fetchedInvoiceRow.activity_log === 'string'
                        ? JSON.parse(fetchedInvoiceRow.activity_log)
                        : fetchedInvoiceRow.activity_log;
                } catch (_) {}
                if (Array.isArray(parsedLog) && parsedLog.length > 0) {
                    mergedLog = parsedLog;
                }
            }
        }

        setActivityLog(mergedLog);
        setApprovalStatus(mergedStatus || "Created");
        setCheckedByUser(mergedCheckedUser);
        setCheckedBySignature(mergedCheckedSig);
        setApprovedByUser(mergedApprovedUser);

        const createdEntry = mergedLog.find((l) => l.type === "Created");
        const createdFromApi = pickFirstString(firstData, ["created_by_user", "created_by_name", "created_by"]);
        setCreatedByName(
            createdFromApi ||
                createdEntry?.user ||
                pickFirstString(firstData, ["signed_by", "created_by_user"]) ||
                localStorage.getItem("userName") ||
                ""
        );

        let mergedPlace = posDefault;
        let mergedNote = noteDefault;
        let mergedTerms = termsDefault;
        if (serverFinal) {
            mergedPlace =
                pickFirstString(firstData, ["place_of_supply", "preview_place_of_supply"]) || mergedPlace;
            mergedNote = pickFirstString(firstData, ["notes", "preview_notes"]) || mergedNote;
            mergedTerms =
                resolveTerms(
                    pickFirstString(firstData, ["terms_and_conditions", "preview_terms"]),
                    sl.receipt_terms
                );
        } else if (localDraft && localDraft.pickup_entry_key === pickupEntryIdsKey) {
            if (localDraft.place_of_supply != null) mergedPlace = String(localDraft.place_of_supply);
            if (localDraft.item_note != null) mergedNote = String(localDraft.item_note);
            if (localDraft.terms_text != null) mergedTerms = String(localDraft.terms_text);
            setTransportRateOverride(localDraft.transport ?? "");
        }

        setPlaceOfSupplyInput(mergedPlace || "");
        setItemNote(mergedNote || "");
        setTermsText(mergedTerms || DEFAULT_TERMS);
        appliedSnapshotRef.current = {
            place: mergedPlace || "",
            note: mergedNote || "",
            terms: mergedTerms || DEFAULT_TERMS,
            transport: localDraft ? (localDraft.transport ?? "") : "",
            trip_count: fetchedInvoiceRow ? fetchedInvoiceRow.trip_count : null,
        };
    }, [
        isLoading,
        loadError,
        orders,
        idsKey,
        cus,
        customerProfile,
        corporateSettings,
        pickupEntryIdsForApproval,
        fetchedInvoiceRow,
    ]);

    useEffect(() => {
        const fetchInvoiceApprovalData = async () => {
            const userId = localStorage.getItem("userId");
            if (!userId || !realInvoiceId || !cus) return;
            try {
                const peId = orderIds[0];
                if (!peId) return;
                const invRes = await getCorporateInvoiceById({
                    user_id: userId,
                    pickup_entry_id: peId,
                });
                const fetched = invRes?.data?.invoice ?? invRes?.data?.data?.invoice ?? invRes?.data?.data ?? null;
                if (fetched) {
                    setFetchedInvoiceRow(fetched);
                    setManualTripCount(fetched.trip_count);
                    setIsTripCountEdited(false);
                    const dbTransport = parseFloat(fetched.transport_charge) || 0;
                    const dbTripCount = parseInt(fetched.trip_count, 10) || 1;
                    setTransportRateOverride(String(dbTransport / dbTripCount));
                    const apiStatus = fetched.approval_status || "Created";
                    setApprovalStatus(apiStatus);
                    setCheckedByUser(fetched.checked_by_user || null);
                    setCheckedBySignature(fetched.checked_by_signature || null);
                    setApprovedByUser(fetched.approved_by_user || null);
                    setApprovedBySignature(fetched.approved_by_signature || null);
                    const invDate = fetched.invoice_date || fetched.created_at;
                    if (invDate) setInvoiceDateStr(formatHeaderDateSlash(invDate));
                    if (fetched.activity_log) {
                        let parsedLog = [];
                        try {
                            parsedLog = typeof fetched.activity_log === 'string'
                                ? JSON.parse(fetched.activity_log)
                                : fetched.activity_log;
                        } catch (_) {}
                        if (Array.isArray(parsedLog) && parsedLog.length > 0) {
                            setActivityLog(parsedLog);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch invoice approval details:", err);
            }
        };
        fetchInvoiceApprovalData();
    }, [realInvoiceId, cus]);

    const writeLocalDraft = (partial) => {
        const uid = localStorage.getItem("userId");
        const key = readPeriodInvoicePreviewDraftKey(uid, cus, pickupEntryIdsForApproval);
        if (!key) return;
        try {
            const prev = JSON.parse(sessionStorage.getItem(key) || "{}");
            sessionStorage.setItem(
                key,
                JSON.stringify({
                    ...prev,
                    ...partial,
                    pickup_entry_key: pickupEntryIdsForApproval,
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
        if (!userId || !cus || !pickupEntryIdsForApproval) return;
        if (approvalStatus === "Checked" || approvalStatus === "Approved") return;
        const tentativeUser = localStorage.getItem("userName") || "";
        const checkedRow = {
            type: "Checked",
            user: tentativeUser,
            timestamp: new Date().toISOString(),
            description: "checked the period tax invoice preview",
            changes: [],
        };
        const nextLog = [...activityLog, checkedRow];
        try {
            setIsApprovalLoading(true);
            const response = await updateCorporateTaxInvoicePreviewApproval({
                user_id: userId,
                invoice_id: invoiceIdForTaxPreviewApproval,
                pickup_entry_ids: pickupEntryIdsForApproval,
                customer_auto_id: cus,
                approval_status: "Checked",
                checked_by_user: tentativeUser,
                checked_by_signature: signature,
                approved_by_user: approvedByUser,
                approved_by_signature: approvedBySignature,
                activity_log: nextLog,
            });
            const actor = response?.actor ?? response?.data?.actor ?? tentativeUser;
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
                pickup_entry_ids: pickupEntryIdsForApproval,
                place_of_supply: placeOfSupplyInput,
                item_note: itemNote,
                terms_text: termsText,
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
                    navigate(`/salesCorporate/corporate/invoicing/period/${cus || ""}`);
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
                pickup_entry_ids: pickupEntryIdsForApproval,
                place_of_supply: placeOfSupplyInput,
                item_note: itemNote,
                terms_text: termsText,
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
                    navigate(`/salesCorporate/corporate/invoicing/period/${cus || ""}`);
                }
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleApproved = async (signature) => {
        const userId = localStorage.getItem("userId");
        if (!userId || !cus || !pickupEntryIdsForApproval) return;
        if (approvalStatus !== "Checked") return;
        const tentativeUser = localStorage.getItem("userName") || "";
        const approvedRow = {
            type: "Approved",
            user: tentativeUser,
            timestamp: new Date().toISOString(),
            description: "approved the period tax invoice preview",
            changes: [],
        };
        const nextLog = [...activityLog, approvedRow];
        try {
            setIsApprovalLoading(true);
            const response = await updateCorporateTaxInvoicePreviewApproval({
                user_id: userId,
                invoice_id: invoiceIdForTaxPreviewApproval,
                pickup_entry_ids: pickupEntryIdsForApproval,
                customer_auto_id: cus,
                approval_status: "Approved",
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: tentativeUser,
                approved_by_signature: signature,
                activity_log: nextLog,
            });
            const actor = response?.actor ?? response?.data?.actor ?? tentativeUser;
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
                pickup_entry_ids: pickupEntryIdsForApproval,
                place_of_supply: placeOfSupplyInput,
                item_note: itemNote,
                terms_text: termsText,
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
                    navigate(`/salesCorporate/corporate/invoicing/period/${cus || ""}`);
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
                pickup_entry_ids: pickupEntryIdsForApproval,
                place_of_supply: placeOfSupplyInput,
                item_note: itemNote,
                terms_text: termsText,
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
                    navigate(`/salesCorporate/corporate/invoicing/period/${cus || ""}`);
                }
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleApplyPreviewFields = async () => {
        if (approvalStatus === "Approved") return;
        const snap = appliedSnapshotRef.current;
        const changes = [];
        if ((placeOfSupplyInput || "") !== (snap.place || "")) {
            changes.push({ field: "Place of Supply", from: snap.place || "  ", to: placeOfSupplyInput || "  " });
        }
        if ((itemNote || "") !== (snap.note || "")) {
            changes.push({ field: "Notes", from: snap.note || "  ", to: itemNote || "  " });
        }
        if ((termsText || "") !== (snap.terms || "")) {
            changes.push({
                field: "Terms & Conditions",
                from: snap.terms || "  ",
                to: termsText || "  ",
            });
        }
        if ((transportRateOverride || "") !== (snap.transport || "")) {
            changes.push({
                field: "Transport Charge",
                from: snap.transport || "  ",
                to: transportRateOverride || "  ",
            });
        }
        const hasTripCountChange = isTripCountEdited && String(manualTripCount) !== String(snap.trip_count || "");
        if (hasTripCountChange) {
            changes.push({
                field: "Transport Trip Count",
                from: snap.trip_count !== undefined && snap.trip_count !== null ? String(snap.trip_count) : "—",
                to: String(manualTripCount),
            });
        }
        if (changes.length === 0) {
            Swal.fire({
                icon: "info",
                title: "No changes",
                text: "Change place of supply, notes, terms, transport, or trip count before applying.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const actor = localStorage.getItem("userName") || "User";
        const updatedEntry = {
            type: "Updated",
            user: actor,
            timestamp: new Date().toISOString(),
            description: "updated period invoice preview fields",
            changes,
        };
        const nextLog = [...activityLog, updatedEntry];
        try {
            const appliedTransportRate = transportRateOverride !== ""
                ? parseFloat(transportRateOverride)
                : (parseFloat(getSavedRatePerTrip(fetchedInvoiceRow)) || locationRate);

            await updateCorporateTaxInvoicePreviewApproval({
                user_id: localStorage.getItem("userId") || "",
                invoice_id: invoiceIdForTaxPreviewApproval,
                pickup_entry_ids: pickupEntryIdsForApproval,
                customer_auto_id: cus,
                approval_status: approvalStatus,
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: approvedByUser,
                activity_log: nextLog,
                trip_count: isTripCountEdited ? manualTripCount : (fetchedInvoiceRow?.trip_count !== undefined ? fetchedInvoiceRow.trip_count : null),
                transport_charge: invoiceSummary.transportCharge,
                transport_rate_per_trip: appliedTransportRate,
                total_amount: invoiceSummary.grandTotal,
                balance_due: invoiceSummary.grandTotal,
                cash_amount: invoiceSummary.grandTotal,
                place_of_supply: placeOfSupplyInput,
                notes: itemNote,
                terms_and_conditions: termsText,
            });
            setActivityLog(nextLog);
            appliedSnapshotRef.current = {
                place: placeOfSupplyInput,
                note: itemNote,
                terms: termsText,
                transport: transportRateOverride,
                trip_count: isTripCountEdited ? manualTripCount : (fetchedInvoiceRow?.trip_count ?? null),
            };
            await fetchSelectedOrders();
            Swal.fire({
                icon: "success",
                title: "Changes Applied",
                text: "Invoice preview details have been updated successfully.",
                confirmButtonColor: "#1470F9",
            });
            writeLocalDraft({
                approval_status: approvalStatus,
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: approvedByUser,
                activity_log: nextLog,
                pickup_entry_ids: pickupEntryIdsForApproval,
                place_of_supply: placeOfSupplyInput,
                item_note: itemNote,
                terms_text: termsText,
                transport: transportRateOverride,
            });
        } catch (error) {
            setActivityLog(nextLog);
            appliedSnapshotRef.current = {
                place: placeOfSupplyInput,
                note: itemNote,
                terms: termsText,
            };
            writeLocalDraft({
                approval_status: approvalStatus,
                checked_by_user: checkedByUser,
                checked_by_signature: checkedBySignature,
                approved_by_user: approvedByUser,
                activity_log: nextLog,
                pickup_entry_ids: pickupEntryIdsForApproval,
                place_of_supply: placeOfSupplyInput,
                item_note: itemNote,
                terms_text: termsText,
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

    const displayUser = useMemo(() => {
        return (
            localStorage.getItem("userName") ||
            pickFirstString(orders[0], ["signed_by", "created_by_user", "created_by"]) ||
            " "
        );
    }, [orders]);

    const configuredPeriodDays = useMemo(() => {
        const p = Math.floor(Number(customerProfile?.customer_invoicing_period));
        const n = Number.isFinite(p) && p > 0 ? p : 15;
        return Math.min(30, Math.max(1, n));
    }, [customerProfile?.customer_invoicing_period]);

    const { periodStartDay, numDays } = useMemo(() => {
        let min = null;
        for (const o of orders) {
            const t = orderAnchorDate(o);
            if (!t) continue;
            const sod = startOfLocalDay(t);
            if (!sod) continue;
            if (!min || sod < min) min = sod;
        }
        return computePeriodWindow(min, configuredPeriodDays);
    }, [orders, configuredPeriodDays]);

    const periodRangeLabel = useMemo(
        () => formatPeriodRangeLabel(periodStartDay, numDays),
        [periodStartDay, numDays]
    );

    const dayNumbers = useMemo(() => Array.from({ length: numDays }, (_, i) => i + 1), [numDays]);

    const supplierLegal = useMemo(() => {
        const sl = corporateSettings || {};
        const companyName =
            pickFirstString(sl, [
                "supplier_company_name",
                "company_legal_name",
                "laundry_company_name",
                "registered_company_name",
            ]) || DEFAULT_TAX_INVOICE_SUPPLIER.companyName;
        const vatNo =
            pickFirstString(sl, ["supplier_vat_no", "company_vat_no", "company_vat_number"]) ||
            DEFAULT_TAX_INVOICE_SUPPLIER.vatNo;
        const address =
            pickFirstString(sl, ["supplier_address", "registered_address", "company_address"]) ||
            DEFAULT_TAX_INVOICE_SUPPLIER.address;
        const operationAddress =
            pickFirstString(sl, ["operation_address", "supplier_operation_address", "laundry_address"]) ||
            DEFAULT_TAX_INVOICE_SUPPLIER.operationAddress;
        const hotlineRaw = pickFirstString(sl, ["hotline", "company_phone", "supplier_phone"]);
        const hotline = hotlineRaw
            ? hotlineRaw.includes("/")
                ? hotlineRaw
                : `${hotlineRaw.trim()} / ${hotlineRaw.trim()}`
            : DEFAULT_TAX_INVOICE_SUPPLIER.hotline;
        const email =
            pickFirstString(sl, ["company_email", "supplier_email", "info_email"]) || FALLBACK_SUPPLIER_EMAIL;
        return {
            companyName,
            vatNo,
            address,
            operationAddress,
            hotline,
            email,
        };
    }, [corporateSettings]);

    const matchedCustomer = useMemo(() => {
        const order0 = orders[0];
        const fromOrder = pickFirstString(order0, ["customer_id", "customerId"]);
        const fromRoute = cus != null && String(cus).trim() !== "" ? String(cus).trim() : "";
        const trackingId = fromOrder || fromRoute;
        if (!trackingId) return null;
        if (!Array.isArray(allCorporateCustomers) || allCorporateCustomers.length === 0) return null;
        const tid = String(trackingId).trim();
        return (
            allCorporateCustomers.find((row) => {
                const cid = row?.customer_id != null ? String(row.customer_id).trim() : "";
                const caid = row?.customer_auto_id != null ? String(row.customer_auto_id).trim() : "";
                return cid === tid || caid === tid;
            }) ?? null
        );
    }, [orders, allCorporateCustomers, cus]);

    const isNoTaxCustomer = useMemo(() => {
        const order0 = orders[0];
        const raw =
            matchedCustomer?.tax_type ??
            customerProfile?.tax_type ??
            (customerProfile?.customer && typeof customerProfile.customer === "object"
                ? customerProfile.customer.tax_type
                : null) ??
            order0?.tax_type ??
            "";
        return String(raw).trim().toLowerCase() === "no tax";
    }, [matchedCustomer?.tax_type, customerProfile?.tax_type, customerProfile?.customer, orders]);

    /** Fallback header strings from get-by-id profile + first order (when list match not used). */
    const customerHeaderFallback = useMemo(() => {
        const raw = customerProfile || {};
        const c =
            raw && typeof raw === "object" && raw.customer && typeof raw.customer === "object"
                ? raw.customer
                : raw || {};
        const order0 = orders[0] || {};
        const pick = (...parts) => {
            for (const p of parts) {
                if (p == null) continue;
                const s = String(p).trim();
                if (s !== "") return s;
            }
            return "---";
        };
        const idRaw = c.customer_auto_id ?? order0.customer_id ?? c.customer_id ?? cus;
        const idStr = idRaw != null && String(idRaw).trim() !== "" ? String(idRaw).trim() : "";
        return {
            companyName: pick(
                c.customer_company_name,
                c.company_name,
                order0.customer_company_name,
                order0.company_name
            ),
            vatNo: pick(c.customer_vat_number, order0.customer_vat_number, order0.vat_no),
            customerId: idStr || "---",
            address: pick(c.customer_address, order0.customer_address, c.address),
            phone: pick(c.customer_phone, c.phone_number, order0.customer_phone, order0.phone_number),
            email: pick(c.customer_email, c.email, order0.customer_email, order0.email),
            placeOfSupply: pick(
                order0.place_of_supply,
                c.place_of_supply,
                c.customer_place_of_supply
            ),
        };
    }, [customerProfile, orders, cus]);

    const trackingCustomerIdStr = useMemo(() => {
        const order0 = orders[0];
        return (
            pickFirstString(order0, ["customer_id", "customerId"]) ||
            (cus != null && String(cus).trim() !== "" ? String(cus).trim() : "")
        );
    }, [orders, cus]);

    const showListMatchLoading =
        Boolean(corporateCustomerListLoading) && trackingCustomerIdStr !== "" && matchedCustomer == null;

    const listFetchSettled = corporateCustomerListLoading === false;
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
        customerHeaderFallback.companyName
    );
    const vatNoCustomerDisplay = listOrFallback(
        matchedCustomer?.customer_vat_number,
        customerHeaderFallback.vatNo
    );
    const hasVatNo = useMemo(() => {
        const cleaned = String(vatNoCustomerDisplay || "").trim();
        return cleaned !== "" && cleaned !== "---" && cleaned !== "-" && cleaned !== "0000" && cleaned !== "00000";
    }, [vatNoCustomerDisplay]);

    const shouldShowAsTaxInvoice = useMemo(() => {
        return Boolean(hasVatNo);
    }, [hasVatNo]);
    const addressCustomerDisplay = listOrFallback(
        matchedCustomer?.customer_address,
        customerHeaderFallback.address
    );
    const phoneCustomerDisplay = listOrFallback(
        matchedCustomer?.customer_phone,
        customerHeaderFallback.phone
    );
    const emailCustomerDisplay = listOrFallback(
        matchedCustomer?.customer_email,
        customerHeaderFallback.email
    );
    const customerIdDisplay = listOrFallback(
        pickFirstString(matchedCustomer || {}, ["customer_id", "customer_auto_id"]),
        customerHeaderFallback.customerId
    );

    const placeOfSupplyCustomerDisplay = useMemo(() => {
        const fromInput = placeOfSupplyInput != null ? String(placeOfSupplyInput).trim() : "";
        if (fromInput) return fromInput;
        return orders[0]?.delivered_location || orders[0]?.deliveredLocation || orders[0]?.place_of_supply || "";
    }, [placeOfSupplyInput, orders]);

    const taxInvoiceReferenceDisplay = useMemo(() => {
        if (realInvoiceId) return realInvoiceId;
        for (const o of orders) {
            const ref = pickFirstString(o, [
                "tax_invoice_no",
                "tax_invoice_number",
                "invoice_reference",
                "invoice_ref_no",
                "corporate_invoice_no",
                "generated_invoice_no",
                "invoice_no",
            ]);
            if (ref) return ref;
        }
        if (orderIds.length && cus) {
            return "-";
        }
        return "—";
    }, [realInvoiceId, orders, orderIds, cus]);

    const headerByDay = useMemo(() => {
        const empty = () => ({
            orderIds: new Set(),
            deliveryNoteIds: new Set(),
            roomNos: new Set(),
            gatePasses: new Set(),
        });
        const byDay = Array.from({ length: numDays }, () => empty());
        for (const order of orders) {
            const rmTop = pickFirstString(order, ["room_no", "roomNo", "room_number", "room"]) || pickFirstString(order?.pickup_entry, ["room_no", "roomNo", "room_number", "room"]);
            const gpTop = pickFirstString(order, ["gate_pass_no", "gatePassNo", "gate_pass", "gate_pass_number"]) || pickFirstString(order?.pickup_entry, ["gate_pass_no", "gatePassNo", "gate_pass", "gate_pass_number"]);

            const itemsList = order.items ?? [];
            if (itemsList.length === 0) {
                const anchor = orderAnchorDate(order);
                if (!anchor || !periodStartDay) continue;
                const di = dayIndexForOrder(anchor.getTime(), periodStartDay, numDays);
                const cell = byDay[di - 1];
                if (!cell) continue;
                
                const oid = pickFirstString(order, ["order_no", "order_id", "pickup_entry_id", "invoice_id"]);
                if (oid) cell.orderIds.add(String(oid));
                const dn = pickFirstString(order, ["delivery_note_no", "delivery_note_id", "delivery_id"]);
                if (dn) cell.deliveryNoteIds.add(String(dn));
                if (rmTop && rmTop !== "—" && rmTop !== "---") cell.roomNos.add(String(rmTop));
                if (gpTop && gpTop !== "—" && gpTop !== "---") cell.gatePasses.add(String(gpTop));
            } else {
                for (const item of itemsList) {
                    const itemDate = item.pickup_date || orderAnchorDate(order);
                    if (!itemDate || !periodStartDay) continue;
                    const di = dayIndexForOrder(new Date(itemDate).getTime(), periodStartDay, numDays);
                    const cell = byDay[di - 1];
                    if (!cell) continue;
                    
                    const oid = item.pickup_entry_id || pickFirstString(order, ["order_no", "order_id", "pickup_entry_id", "invoice_id"]);
                    if (oid) cell.orderIds.add(String(oid));
                    const dn = item.delivery_id || pickFirstString(order, ["delivery_note_no", "delivery_note_id", "delivery_id"]);
                    if (dn) cell.deliveryNoteIds.add(String(dn));
                    const rm = item.room_no || item.roomNo || rmTop;
                    if (rm && rm !== "—" && rm !== "---") cell.roomNos.add(String(rm));
                    const gp = item.gate_pass_no || item.gatePassNo || gpTop;
                    if (gp && gp !== "—" && gp !== "---") cell.gatePasses.add(String(gp));
                }
            }
        }
        return byDay.map((c) => ({
            orderIds: [...c.orderIds].join("\n"),
            deliveryNoteIds: [...c.deliveryNoteIds].join("\n"),
            roomNos: [...c.roomNos].join("\n"),
            gatePasses: [...c.gatePasses].join("\n"),
        }));
    }, [orders, periodStartDay, numDays]);

    const aggregatedHeaders = useMemo(() => {
        const orderIds = new Set();
        const deliveryNoteIds = new Set();
        const roomNos = new Set();
        const gatePasses = new Set();
        for (const order of orders) {
            const rmTop = pickFirstString(order, ["room_no", "roomNo", "room_number", "room"]) || pickFirstString(order?.pickup_entry, ["room_no", "roomNo", "room_number", "room"]);
            if (rmTop && rmTop !== "—" && rmTop !== "---") roomNos.add(String(rmTop));

            const gpTop = pickFirstString(order, ["gate_pass_no", "gatePassNo", "gate_pass", "gate_pass_number"]) || pickFirstString(order?.pickup_entry, ["gate_pass_no", "gatePassNo", "gate_pass", "gate_pass_number"]);
            if (gpTop && gpTop !== "—" && gpTop !== "---") gatePasses.add(String(gpTop));

            const itemsList = order.items ?? [];
            if (itemsList.length === 0) {
                const oid = pickFirstString(order, ["order_no", "order_id", "pickup_entry_id", "invoice_id"]);
                if (oid) orderIds.add(String(oid));
                const dn = pickFirstString(order, ["delivery_note_no", "delivery_note_id", "delivery_id"]);
                if (dn) deliveryNoteIds.add(String(dn));
            } else {
                for (const item of itemsList) {
                    const oid = item.pickup_entry_id || pickFirstString(order, ["order_no", "order_id", "pickup_entry_id", "invoice_id"]);
                    if (oid && !oid.startsWith("INV-")) orderIds.add(String(oid));
                    
                    const dn = item.delivery_id || pickFirstString(order, ["delivery_note_no", "delivery_note_id", "delivery_id"]);
                    if (dn) deliveryNoteIds.add(String(dn));

                    const rm = item.room_no || item.roomNo || rmTop;
                    if (rm && rm !== "—" && rm !== "---") roomNos.add(String(rm));

                    const gp = item.gate_pass_no || item.gatePassNo || gpTop;
                    if (gp && gp !== "—" && gp !== "---") gatePasses.add(String(gp));
                }
                if (orderIds.size === 0) {
                    const oid = pickFirstString(order, ["order_no", "order_id", "pickup_entry_id", "invoice_id"]);
                    if (oid) orderIds.add(String(oid));
                }
            }
        }
        return {
            orderIds: [...orderIds].join(", "),
            deliveryNoteIds: [...deliveryNoteIds].join(", "),
            roomNos: [...roomNos].join(", "),
            gatePasses: [...gatePasses].join(", "),
        };
    }, [orders]);

    /**
     * Line amounts use the same rules as daily invoice / collection note:
     * {@link buildCollectionNoteLinesFromApiOrderItems} → {@link computeLineFinalRateWithDelivery}
     * (tax-inclusive price via SSCL 0.975 + VAT, then delivery surcharge on that amount).
     * Pivot `rate` is value-weighted: sum(orderValue) / sum(qty) across days and pickups.
     */
    const pivotAndSummary = useMemo(() => {
        const profile = customerProfile && typeof customerProfile === "object" ? customerProfile : null;
        const listForPricing = Array.isArray(priceList) ? priceList : [];
        const typesForPricing = Array.isArray(itemTypes) ? itemTypes : [];
        // Use the same priority order as isNoTaxCustomer: matchedCustomer first, then customerProfile, then fetched invoice row, then order
        const taxType =
            matchedCustomer?.tax_type ??
            profile?.tax_type ??
            (profile?.customer && typeof profile.customer === "object" ? profile.customer.tax_type : null) ??
            fetchedInvoiceRow?.vat_status ??
            orders[0]?.tax_type ??
            "";

        const mergeKey = (serviceType, deliveryType, corpId) => 
            `${normalizeServiceType(serviceType)}::${String(deliveryType).trim().toUpperCase()}::${String(corpId)}`;
        const rowMap = new Map();

        for (const order of orders) {
            const anchor = orderAnchorDate(order);
            const dayIdx =
                anchor && periodStartDay ? dayIndexForOrder(anchor.getTime(), periodStartDay, numDays) : 1;

            const rawItems = (order.items ?? [])
                .filter((item) => {
                    const rawQty = item.delivered_qty !== undefined && item.delivered_qty !== null
                        ? Number(item.delivered_qty)
                        : item.final_packed_qty !== undefined && item.final_packed_qty !== null
                        ? Number(item.final_packed_qty)
                        : Number(item.corp_item_quantity || item.quantity || 0);
                    return rawQty > 0;
                })
                .map((item) => ({
                    ...item,
                    delivery_type: item.delivery_type || item.deliveryType || order.delivery_type || order.deliveryType || "NORMAL",
                    delivery_percentage: item.delivery_percentage || item.deliveryPercentage || order.delivery_percentage || order.deliveryPercentage || 0,
                    delivery_id: item.delivery_id || order.delivery_id,
                    delivery_note_id: item.delivery_note_id || item.delivery_note_auto_id || order.delivery_note_auto_id || order.delivery_note_id,
                    delivery_note_auto_id: item.delivery_note_id || item.delivery_note_auto_id || order.delivery_note_auto_id || order.delivery_note_id,
                    room_no: item.room_no || order.room_no,
                    gate_pass_no: item.gate_pass_no || order.gate_pass_no,
                    pickup_entry_id: item.pickup_entry_id || order.pickup_entry_id,
                    pickup_date: item.pickup_date || order.created_at || order.pickup_date,
                }));
            if (!rawItems.length) continue;

            let built = [];
            try {
                const vatNumber =
                    profile?.customer_vat_number ??
                    profile?.vat_number ??
                    profile?.vat_no ??
                    (profile?.customer && typeof profile.customer === "object" ? profile.customer.customer_vat_number ?? profile.customer.vat_number : null) ??
                    matchedCustomer?.customer_vat_number ??
                    matchedCustomer?.vat_number ??
                    matchedCustomer?.vat_no ??
                    order.customer_vat_number ??
                    order.vat_no;
                built = buildCollectionNoteLinesFromApiOrderItems({
                    items: rawItems,
                    customerPriceList: listForPricing,
                    deliveryTypeRaw: order.delivery_type ?? order.deliveryType,
                    customerServiceTypes: profile?.service_types ?? [],
                    corporateTaxRates: { sscl: taxRates.sscl || 2.5, vat: taxRates.vat || 18 },
                    itemTypes: typesForPricing,
                    taxType,
                    vatNumber,
                    customer: profile?.customer ?? profile ?? matchedCustomer,
                    deliveryPercentageFallback: order.delivery_percentage ?? order.deliveryPercentage,
                    isInvoicing: true,
                });
            } catch (err) {
                console.error("Period line pricing failed for order", order?.pickup_entry_id, err);
                continue;
            }

            built.forEach((line) => {
                const corpId = String(line.corp_item_id ?? line.item_id ?? "").trim();
                if (!corpId) return;
                const qty = Number(line.quantity || 0);
                const rawRate = Number(line.rate || 0);

                let taxExclRate = rawRate;
                let taxInclRate = rawRate;

                if (hasVatNo) {
                    taxExclRate = rawRate;
                    taxInclRate = Number((rawRate * 1.18 / 0.975).toFixed(2));
                } else {
                    taxInclRate = rawRate;
                    taxExclRate = Number((rawRate * 0.975 / 1.18).toFixed(2));
                }

                const taxExclVal = Number((qty * taxExclRate).toFixed(2));
                const taxInclVal = Number((qty * taxInclRate).toFixed(2));

                const itemDelivType = String(line.delivery_type || line.deliveryType || "NORMAL").trim().toUpperCase();
                const key = mergeKey(line.service_type, itemDelivType, corpId);
                let row = rowMap.get(key);
                if (!row) {
                    row = {
                        corp_item_id: corpId,
                        item_name: line.item_name || "-",
                        item_category_name: String(line.item_category_name || "ROOM LINEN").trim() || "ROOM LINEN",
                        service_type: normalizeServiceType(line.service_type),
                        delivery_type: itemDelivType,
                        uom: "Pcs",
                        dayQty: {},
                        valueSum: 0,
                        taxExclValueSum: 0,
                        taxInclValueSum: 0,
                    };
                    rowMap.set(key, row);
                }
                const itemDate = line.pickup_date || orderAnchorDate(order);
                const itemDayIdx = (itemDate && periodStartDay) 
                    ? dayIndexForOrder(new Date(itemDate).getTime(), periodStartDay, numDays) 
                    : dayIdx;
                row.dayQty[itemDayIdx] = (row.dayQty[itemDayIdx] || 0) + qty;
                row.valueSum += shouldShowAsTaxInvoice ? taxExclVal : (line.orderValue || (qty * rawRate));
                row.taxExclValueSum += taxExclVal;
                row.taxInclValueSum += taxInclVal;
            });
        }

        const rows = [...rowMap.values()].map((r) => {
            const totalQty = dayNumbers.reduce((s, d) => s + (r.dayQty[d] || 0), 0);
            const rate = totalQty > 0 ? parseFloat((r.valueSum / totalQty).toFixed(2)) : 0;
            const amount = parseFloat(r.valueSum.toFixed(2));

            const taxExclRate = totalQty > 0 ? parseFloat((r.taxExclValueSum / totalQty).toFixed(2)) : 0;
            const taxExclAmount = parseFloat(r.taxExclValueSum.toFixed(2));

            const taxInclRate = totalQty > 0 ? parseFloat((r.taxInclValueSum / totalQty).toFixed(2)) : 0;
            const taxInclAmount = parseFloat(r.taxInclValueSum.toFixed(2));

            return { ...r, totalQty, rate, amount, taxExclRate, taxExclAmount, taxInclRate, taxInclAmount };
        });

        const laundryCharges = parseFloat(rows.reduce((s, r) => s + r.amount, 0).toFixed(2));

        const byGroup = {};
        rows.forEach((r) => {
            const key = `${r.service_type}::${r.delivery_type}`;
            if (!byGroup[key]) {
                byGroup[key] = {
                    serviceType: r.service_type,
                    deliveryType: r.delivery_type,
                    items: [],
                };
            }
            byGroup[key].items.push(r);
        });

        const priority = { Washing: 1, Pressing: 2, "Dry Clean": 3 };
        const groupsList = Object.values(byGroup);
        groupsList.sort((a, b) => {
            const pA = priority[a.serviceType] || 99;
            const pB = priority[b.serviceType] || 99;
            if (pA !== pB) return pA - pB;
            return a.deliveryType.localeCompare(b.deliveryType);
        });

        const serviceBlocks = groupsList.map((g) => {
            const categories = {};
            g.items.forEach((row) => {
                const cat = row.item_category_name || "ROOM LINEN";
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(row);
            });
            const sortedCats = Object.keys(categories).sort();
            let subTotal = 0;
            sortedCats.forEach((c) => {
                categories[c].forEach((row) => {
                    subTotal += row.amount;
                });
            });
            return {
                serviceType: g.serviceType,
                deliveryType: g.deliveryType,
                categories,
                sortedCats,
                subTotal
            };
        });

        return { rows, serviceBlocks, laundryCharges };
    }, [orders, customerProfile, matchedCustomer, priceList, itemTypes, taxRates, periodStartDay, numDays, dayNumbers, fetchedInvoiceRow]);

    const effectiveDiscountPercent = useMemo(() => {
        const disc = matchedCustomer?.discount ?? customerProfile?.discount ?? 0;
        return parseFloat(Number(disc).toFixed(2)) || 0;
    }, [matchedCustomer?.discount, customerProfile?.discount]);

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

    const resolvedDefaultRate = useMemo(() => {
        const locations = activeLocations;
        const firstOrder = Array.isArray(orders) && orders.length ? orders[0] : null;
        if (!firstOrder) return 0;
        
        const orderLoc = String(placeOfSupplyInput || firstOrder.place_of_supply || firstOrder.placeOfSupply || firstOrder.delivered_location || firstOrder.deliveredLocation || "").trim().toLowerCase();
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
        
        return parseFloat(firstOrder.entry_transport_rate) || 0;
    }, [orders, activeLocations, placeOfSupplyInput]);

    const locationRate = useMemo(() => {
        if (transportRateOverride !== "" && !Number.isNaN(Number(transportRateOverride))) {
            return Number(transportRateOverride);
        }
        return resolvedDefaultRate;
    }, [transportRateOverride, resolvedDefaultRate]);

    const distinctDaysCount = useMemo(() => {
        if (!Array.isArray(orders) || orders.length === 0) return 0;
        const dayStrings = orders.map((o) => {
            const d = orderAnchorDate(o);
            if (!d) return null;
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        }).filter(Boolean);
        return new Set(dayStrings).size;
    }, [orders]);

    useEffect(() => {
        if (distinctDaysCount > 0 && manualTripCount === null) {
            setManualTripCount(distinctDaysCount);
        }
    }, [distinctDaysCount, manualTripCount]);

    useEffect(() => {
        const savedRate = getSavedRatePerTrip(fetchedInvoiceRow);
        if (savedRate !== null) {
            // User has explicitly saved a custom rate — always show it
            setTransportRateOverride(savedRate);
        } else if (resolvedDefaultRate > 0 && transportRateOverride === "") {
            // No saved custom rate — fall back to default location rate
            setTransportRateOverride(String(resolvedDefaultRate));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchedInvoiceRow, resolvedDefaultRate]);

    const dropdownPlaces = useMemo(() => {
        const list = [];
        const seen = new Set();
        activeLocations.forEach((loc) => {
            if (loc && loc.location_name) {
                const name = String(loc.location_name).trim();
                if (!seen.has(name.toLowerCase())) {
                    seen.add(name.toLowerCase());
                    list.push({ name, rate: loc.transport_rate });
                }
            }
        });
        if (placeOfSupplyInput && !seen.has(String(placeOfSupplyInput).trim().toLowerCase())) {
            list.push({ name: String(placeOfSupplyInput).trim(), rate: null });
        }
        return list;
    }, [activeLocations, placeOfSupplyInput]);

    const invoiceType = useMemo(() => {
        if (matchedCustomer) {
            if (matchedCustomer.customer_invoice_type != null) return matchedCustomer.customer_invoice_type;
            if (matchedCustomer.customer?.customer_invoice_type != null) return matchedCustomer.customer.customer_invoice_type;
        }
        if (customerProfile) {
            if (customerProfile.customer_invoice_type != null) return customerProfile.customer_invoice_type;
            if (customerProfile.customer?.customer_invoice_type != null) return customerProfile.customer.customer_invoice_type;
        }
        return "Period Invoice";
    }, [matchedCustomer, customerProfile]);

    const invoicingPeriodVal = useMemo(() => {
        if (matchedCustomer) {
            if (matchedCustomer.customer_invoicing_period != null) return matchedCustomer.customer_invoicing_period;
            if (matchedCustomer.customer?.customer_invoicing_period != null) return matchedCustomer.customer.customer_invoicing_period;
        }
        if (customerProfile) {
            if (customerProfile.customer_invoicing_period != null) return customerProfile.customer_invoicing_period;
            if (customerProfile.customer?.customer_invoicing_period != null) return customerProfile.customer.customer_invoicing_period;
        }
        return configuredPeriodDays;
    }, [matchedCustomer, customerProfile, configuredPeriodDays]);

    const damageDeduction = useMemo(() => {
        let totalDamage = 0;
        orders.forEach((ord) => {
            const items = ord.items || [];
            items.forEach((it) => {
                const itemDamageQty = Number(it.damaged_qty || it.damage_quantity || 0);
                if (itemDamageQty <= 0) return;

                const corpItemId = it.corp_item_id ?? it.item_id;
                const matchedType = (itemTypes || []).find(
                    (t) => String(t.item_id) === String(corpItemId) || String(t.corp_item_id) === String(corpItemId)
                );
                const matchedName = (matchedType?.item_name || it.item_name || "").trim().toLowerCase();

                const line = (priceList || []).find(
                    (p) => String(p.item_name || "").trim().toLowerCase() === matchedName
                );
                if (!line) return;

                totalDamage += (itemDamageQty * Number(line.rate || 0));
            });
        });
        return parseFloat(totalDamage.toFixed(2));
    }, [orders, priceList, customerProfile, matchedCustomer, taxRates, itemTypes, fetchedInvoiceRow]);

    const invoiceSummary = useMemo(() => {
        const laundry = pivotAndSummary.laundryCharges - damageDeduction;
        const isDaily = String(invoiceType || "").toLowerCase().includes("daily");

        const effectiveTripCount = manualTripCount !== null && manualTripCount !== undefined
            ? Number(manualTripCount)
            : (fetchedInvoiceRow?.trip_count !== undefined && fetchedInvoiceRow?.trip_count !== null ? Number(fetchedInvoiceRow.trip_count) : distinctDaysCount);

        const calculatedDiscPct = (fetchedInvoiceRow && fetchedInvoiceRow.display_discount_percent !== undefined && fetchedInvoiceRow.display_discount_percent !== null)
            ? parseFloat(fetchedInvoiceRow.display_discount_percent)
            : (fetchedInvoiceRow ? (parseFloat(fetchedInvoiceRow.discount) || 0) : effectiveDiscountPercent);

        return computeCorporateTaxInvoiceSummary({
            laundryCharges: laundry,
            customerDiscountPct: calculatedDiscPct,
            transportRate: locationRate,
            customerInvoiceType: isDaily ? "Daily Invoice" : "Period Invoice",
            invoicingPeriod: 1,
            ssclRatePct: shouldShowAsTaxInvoice ? (taxRates.sscl || 2.5) : 0,
            vatRatePct: shouldShowAsTaxInvoice ? (taxRates.vat || 18) : 0,
            transportMultiplierOverride: effectiveTripCount || 1,
        });
    }, [
        pivotAndSummary.laundryCharges,
        damageDeduction,
        effectiveDiscountPercent,
        locationRate,
        invoiceType,
        taxRates.sscl,
        taxRates.vat,
        fetchedInvoiceRow,
        manualTripCount,
        shouldShowAsTaxInvoice,
        distinctDaysCount,
    ]);

    const amountInWordsDisplay = useMemo(() => {
        if (!hasVatNo) {
            return grandTotalToAmountInWords(invoiceSummary.totalBeforeSscl);
        }
        return invoiceSummary.amountInWords || "";
    }, [hasVatNo, invoiceSummary.amountInWords, invoiceSummary.totalBeforeSscl]);

    const invoicedDateDisplay = useMemo(() => {
        if (invoiceDateStr) return invoiceDateStr;
        return formatHeaderDateSlash(new Date());
    }, [invoiceDateStr]);

    const dateOfDeliveryDisplay = useMemo(() => {
        if (periodRangeLabel) return periodRangeLabel.replace(/-/g, " - ");
        const dates = orders.map((o) => formatHeaderDateSlash(orderAnchorDate(o))).filter(Boolean);
        if (!dates.length) return "";
        const u = [...new Set(dates)].sort();
        if (u.length === 1) return u[0];
        return `${u[0]} - ${u[u.length - 1]}`;
    }, [orders, periodRangeLabel]);

    const deliveryDateRangeForSupplier = useMemo(() => {
        const long = formatDeliveryDateRangeLong(periodStartDay, numDays);
        if (long) return long;
        const dates = orders.map((o) => formatHeaderDateSlash(orderAnchorDate(o))).filter(Boolean);
        const u = [...new Set(dates)].sort();
        if (u.length >= 2) return `${u[0]} - ${u[u.length - 1]}`;
        if (u.length === 1) return u[0];
        return dateOfDeliveryDisplay || "—";
    }, [periodStartDay, numDays, orders, dateOfDeliveryDisplay]);

    const deliveryTypeDisplay = useMemo(() => {
        const unique = new Set();
        (orders || []).forEach((o) => {
            const dt = o.delivery_type || o.deliveryType;
            if (dt) unique.add(String(dt).trim());
        });

        if (unique.size === 0 && fetchedInvoiceRow) {
            const items = fetchedInvoiceRow.items || [];
            items.forEach((it) => {
                const dt = it.delivery_type || it.deliveryType;
                if (dt) unique.add(String(dt).trim());
            });
        }

        if (unique.size === 0) return "Normal";
        return Array.from(unique).map(formatDeliveryType).join(", ");
    }, [orders, fetchedInvoiceRow]);

    const renderInvoiceHeader = (isPrint = false) => {
        return (
            <div className={isPrint ? "flex flex-col w-full text-left" : "print:hidden flex flex-col w-full text-left"}>
                {/* Top Header (logo and printed date/time) */}
                <div className="tax-inv-print-top-header flex items-start justify-between print:pt-0">
                    <img src={logo} alt="Sparkle" className="w-32 md:w-44 object-contain print:w-44" />
                    <div className="text-[11px] md:text-[12px] print:text-[9px] flex flex-wrap gap-x-4 gap-y-1 justify-end text-right print:gap-x-2 text-black/70">
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
                </div>

                {/* Document Title (Tax Invoice, etc.) */}
                <div className="w-full flex -mt-10 md:-mt-14 print:-mt-10">
                    {/* Heading aligns perfectly with customer details (both relative to page w-full, w-[38%] ms-auto) */}
                    <div className="text-left w-[38%] md:w-[38%] print:w-[38%] ms-auto px-3 print:px-2.5">
                        <div className="text-xl md:text-2xl font-bold tracking-wide uppercase print:text-[1.2rem] print:leading-tight text-neutral-900">
                            {shouldShowAsTaxInvoice ? "TAX INVOICE" : "INVOICE"}
                        </div>
                    </div>
                </div>

                {/* Supplier / Purchaser Details Row */}
                <div className="tax-inv-supplier-customer-row flex flex-row justify-between mt-10 md:mt-14 print:mt-10 text-[11px] md:text-[12px] leading-snug print:mt-1 print:text-[9px] print:leading-tight w-full items-start">
                    <div className="tax-inv-info-grid flex flex-col px-3 pt-0 pb-1 w-[52%] md:w-[52%] print:w-[52%] min-w-0 text-neutral-900 text-left -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                        <div className="font-bold text-[12px] print:text-[10px]">
                            {shouldShowAsTaxInvoice ? "Tax Invoice No" : "Invoice No"} : {taxInvoiceReferenceDisplay ? String(taxInvoiceReferenceDisplay) : "---"}
                        </div>
                        <div className="mt-1.5 font-bold text-[12px] print:text-[10px]">Supplier's Details</div>
                        <div className="text-[11px] print:text-[9px] mt-0.5">VAT NO  : {supplierLegal.vatNo || "108812540-7000"}</div>
                        <div className="font-bold text-[11px] print:text-[9px] uppercase">{supplierLegal.companyName || "C L SOLUTIONS ( PVT ) LTD"}</div>
                        <div className="text-[11px] print:text-[9px]">Registered Address : {supplierLegal.address || "No:583/71, Augustine Premathirathna Road"}</div>
                        <div className="text-[11px] print:text-[9px]">Operational Address : {supplierLegal.operationAddress || "No 391 , Avissawella Road , Wellampitiya"}</div>
                        <div className="text-[11px] print:text-[9px]">Hot Line : {supplierLegal.hotline || "011-4701566 / 076-4660661"}</div>
                        <div className="text-[11px] print:text-[9px]">Email : {supplierLegal.email || "info@sparklelaundry.lk"}  WEB : www.sparklelaundry.lk</div>
                        <div className="mt-1.5 text-[11px] print:text-[9px] font-semibold">
                            Date of Delivery : {invoicedDateDisplay} 
                        </div>
                    </div>
                    <div className="tax-inv-info-grid flex flex-col px-3 pt-0 pb-1 w-[38%] md:w-[38%] print:w-[38%] min-w-0 text-neutral-900 text-left ms-auto -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                        <div className="font-bold text-[12px] print:text-[10px]">
                            Date of Invoice : {invoicedDateDisplay || "---"}
                        </div>
                        <div className="mt-1.5 font-bold text-[12px] print:text-[10px]">Purchaser's Details</div>
                        <div className="text-[11px] print:text-[9px] mt-0.5">VAT NO  : {vatNoCustomerDisplay}</div>
                        <div className="font-bold text-[11px] print:text-[9px] uppercase">
                            {companyNameDisplay}
                            {(() => {
                                const firstOrder = orders[0];
                                const brand = String(
                                    firstOrder?.customer_name || 
                                    firstOrder?.customer_contact_person || 
                                    (customerProfile?.customer && (customerProfile.customer.customer_name || customerProfile.customer.customer_contact_person)) ||
                                    customerProfile?.customer_name || 
                                    customerProfile?.customer_contact_person || 
                                    ""
                                ).trim();
                                return brand ? ` (${brand})` : "";
                            })()}
                        </div>
                        <div className="text-[11px] print:text-[9px]">Registered Address : {addressCustomerDisplay}</div>
                        <div className="text-[11px] print:text-[9px]">Tel : {phoneCustomerDisplay}</div>
                        <div className="text-[11px] print:text-[9px]">Email : {emailCustomerDisplay}  WEB :</div>
                        <div className="text-[11px] print:text-[9px]">Customer ID : {customerIdDisplay}</div>
                    </div>
                </div>
                {isPrint && <div className="hidden print:block print:h-4 w-full" />}
            </div>
        );
    };


    const verticalCellClass =
        "max-h-[80px] min-h-[44px] w-[13px] max-w-[15px] mx-auto py-0.5 px-0 text-[5.5px] leading-tight print:max-h-[65px] print:min-h-[28px] print:w-[12px] print:max-w-[14px] print:text-[4.5px] text-center align-middle break-all whitespace-pre-wrap [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180";

    const canPrint = !isLoading && !loadError && pivotAndSummary.rows.length > 0;
    const totalsReady = Number.isFinite(Number(invoiceSummary.grandTotal));
    const canCreateInvoiceAndPrint = canPrint && totalsReady;
    const createInvoicePrintDisabledReason = !canPrint
        ? isLoading
            ? "Loading invoice data."
            : loadError
              ? "Fix load errors before printing."
              : "No line items to print."
        : !totalsReady
          ? "Totals are not ready yet."
          : "";

    const invoiceAlreadyGenerated = useMemo(
        () => orders.length > 0 && orders.every((o) => isCorporateInvoiceAlreadyGenerated(o)),
        [orders]
    );
    const isInvoiceGenerated = !!realInvoiceId || invoiceAlreadyGenerated;

    /** First delivery note assigned to this invoice (for the Edit Delivery Note link). */
    const firstAssignedDeliveryNote = useMemo(() => {
        const first = orders[0];
        const pickup_entry_id = String(first?.pickup_entry_id || "").trim();
        const delivery_id = String(first?.delivery_id || "").trim();
        if (!pickup_entry_id || !delivery_id) return null;
        return { pickup_entry_id, delivery_id };
    }, [orders]);

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
                    navigate(`/salesCorporate/corporate/invoicing/period/${cus || ""}`);
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

    const handleCreateInvoice = async () => {
        if (!canCreateInvoiceAndPrint) {
            Swal.fire({
                icon: "info",
                title: "Cannot print",
                text: createInvoicePrintDisabledReason || "Cannot print right now.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        if (!printRef.current) {
            Swal.fire({
                icon: "warning",
                title: "Preview not ready",
                text: "Invoice preview is not mounted (print ref missing).",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        if (isInvoiceGenerated) {
            try {
                handlePrint();
            } catch (err) {
                console.error("Print failed:", err);
                Swal.fire({
                    icon: "error",
                    title: "Print failed",
                    text: err?.message ? String(err.message) : String(err),
                    confirmButtonColor: "#1470F9",
                });
            }
            return;
        }

        try {
            setIsLoadingSubmit(true);

            const amounts = taxSummaryToGenerateInvoiceAmounts(invoiceSummary);

            const invoicePayload = {
                user_id: localStorage.getItem("userId") || "",
                company_name: String(
                    matchedCustomer?.company_name ??
                    matchedCustomer?.customer_company_name ??
                    customerProfile?.customer_company_name ??
                    customerProfile?.company_name ??
                    orders[0]?.customer_company_name ??
                    orders[0]?.company_name ??
                    ""
                ),
                customer_id: String(
                    matchedCustomer?.customer_id ??
                    customerProfile?.customer_id ??
                    orders[0]?.customer_id ??
                    ""
                ),
                phone_number: String(
                    matchedCustomer?.customer_phone ??
                    customerProfile?.customer_phone ??
                    customerProfile?.phone_number ??
                    orders[0]?.customer_phone ??
                    orders[0]?.phone_number ??
                    ""
                ),
                invoicing_type: "Period Invoice",
                payment_method: "CASH",
                card_type: "",
                bank: "",
                discount: invoiceBindNumber(effectiveDiscountPercent),
                vat_status: isNoTaxCustomer ? "No Tax" : (customerProfile?.tax_type ?? orders[0]?.tax_type ?? "VAT"),
                terms_and_conditions: String(termsText || ""),
                notes: String(itemNote || ""),
                signed_by: String(preparedByName || localStorage.getItem("userName") || "System"),
                prepared_by_signature: preparationSignature,
                trip_count: isTripCountEdited ? manualTripCount : (fetchedInvoiceRow?.trip_count !== undefined ? fetchedInvoiceRow.trip_count : null),
                ...amounts,
                advanced_amount: 0,
                cash_amount: amounts.grand_total,
                card_amount: 0,
                delivery_note_ids: orderIds.map(id => parseInt(id, 10)),
                pickup_entries: orders.map((o) => ({
                    pickup_entry_id: o.pickup_entry_id,
                    items: (o.items ?? []).map((item) => ({
                        corp_item_id: item.corp_item_id ?? item.item_id ?? "",
                        quantity_invoicing: invoiceBindNumber(item.delivered_qty ?? item.final_packed_qty ?? item.corp_item_quantity ?? item.quantity ?? 0),
                    })),
                })),
                ...(manualInvoiceId && manualInvoiceId.trim() !== ""
                    ? { manual_invoice_id: manualInvoiceId.trim() }
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
            setInvoiceDateStr(formatHeaderDateSlash(new Date()));

            await Swal.fire({
                icon: "success",
                title: "Invoice Created",
                text: "Invoice generated successfully.",
                confirmButtonColor: "#1470F9",
            });

            requestAnimationFrame(() => {
                navigateAfterPrintRef.current = true;
                handlePrint();
            });
        } catch (error) {
            console.error("Error creating invoice: ", error);
            Swal.fire({
                icon: "error",
                title: "Invoice generation failed",
                text: error?.message || "Failed to create invoice. Please check the console for details.",
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    return (
        <div className="relative">
            <div className="flex flex-col">
                <div className="flex flex-row gap-x-3 items-center print:hidden">
                    <HiOutlineArrowCircleLeft
                        className="size-6 text-primary cursor-pointer"
                        onClick={() => {
                            if (onClose) {
                                onClose();
                            } else if (location.state?.from) {
                                navigate(location.state.from, { state: { selectedTab: location.state.selectedTab } });
                            } else {
                                navigate(`/salesCorporate/corporate/invoicing/period/${cus}`);
                            }
                        }}
                    />
                    <h1 className="text-3xl text-primary font-bold">
                        Period Invoicing Customers
                        {orders.length > 0
                            ? ` / ${
                                  matchedCustomer?.company_name ??
                                  matchedCustomer?.customer_company_name ??
                                  companyNameDisplay ??
                                  "---"
                              } / Preview`
                            : ""}
                    </h1>
                </div>
                <p className="text-xl text-black/50 mb-5 print:hidden">
                    Generate invoice for corporate orders.
                </p>

                <div>
                    <div className="flex flex-row gap-x-3 items-center print:hidden">
                        <Icon icon={"material-symbols:refresh"} className="bg-primary/20 text-primary rounded-full p-1 size-6" />
                        <h2 className="text-2xl font-semibold">Bill Preview</h2>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-20 bg-white print:hidden">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    ) : loadError ? (
                        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-red-800 print:bg-white">
                            <p className="font-semibold text-lg">Could not load preview</p>
                            <p className="mt-2">{loadError}</p>
                            <button
                                type="button"
                                className="mt-4 rounded-full border border-primary bg-white px-4 py-2 text-primary font-medium"
                                onClick={() => navigate(`/salesCorporate/corporate/invoicing/period/${cus || ""}`)}
                            >
                                Back to list
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 mt-5 print:block print:mt-0">
                            <main className="col-span-3 border-r border-black/20 pe-3 print:border-0 print:pe-0 print:col-span-4">
                                <div ref={printRef} className="corporate-period-invoice-root text-black">
                                    <style>
                                        {`
                      /* Screen: soft grey canvas behind framed bill; print: white full bleed */
                      .corporate-period-invoice-shell {
                        background-color: #eef1f6;
                      }
                      .corporate-period-invoice-root {
                        background-color: transparent;
                      }
                      .corporate-period-invoice-bill-frame {
                        background-color: #ffffff;
                      }
                      @media print {
                        .tax-inv-handover-panel {
                          break-before: auto !important;
                          page-break-before: auto !important;
                        }
                        .corporate-period-invoice-shell {
                          background-color: #ffffff !important;
                        }
                        .corporate-period-invoice-bill-frame {
                          box-shadow: none !important;
                          border: none !important;
                          border-radius: 0 !important;
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
                        .corporate-period-invoice-root table.print-main-table > tbody > tr {
                          page-break-inside: auto !important;
                          break-inside: auto !important;
                        }
                        tr.print-block-row {
                          page-break-inside: avoid !important;
                          break-inside: avoid !important;
                        }
                        .corporate-period-invoice-root table:not(.print-main-table) tr {
                          page-break-inside: avoid !important;
                          break-inside: avoid !important;
                        }
                        .corporate-period-invoice-root table:not(.print-main-table) thead {
                          display: table-row-group !important;
                        }
                        .corporate-period-invoice-root {
                          -webkit-print-color-adjust: exact;
                          print-color-adjust: exact;
                          background: #ffffff !important;
                        }
                        .tax-inv-supplier-customer-row {
                          margin-top: 16px !important;
                        }
                        .tax-inv-info-grid {
                          margin-top: 0px !important;
                        }
                        .tax-inv-summary-wrap {
                          margin-top: 4px !important;
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
                      }
                    `}
                                    </style>

                                    <div className="corporate-period-invoice-bill-frame mx-auto box-border flex w-full max-w-[297mm] flex-col rounded-xl border border-black/10 bg-white p-4 pb-3 text-[12px] leading-snug shadow-[0_8px_30px_rgba(15,23,42,0.08)] md:p-6 md:pb-4 print:max-w-none print:rounded-none print:border-0 print:p-[10mm] print:text-[10px] print:shadow-none">
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
                                        {pivotAndSummary.serviceBlocks.length === 0 ? (
                                            <p className="text-black/60">No line items with quantity for the selected orders.</p>
                                        ) : (
                                            <div className="mb-3 print:mb-1.5">
                                                 <table className="w-full border-collapse border border-black/20 text-[9px] text-black" style={{ tableLayout: "fixed" }}>
                                                     <colgroup>
                                                         <col style={{ width: '65px' }} /> {/* ITEM CODE */}
                                                         <col style={{ width: '120px' }} /> {/* ITEM NAME & DESCRIPTION */}
                                                         {dayNumbers.map((d) => (
                                                             <col key={`col-day-${d}`} style={{ width: numDays > 25 ? '13.5px' : '16px' }} />
                                                         ))}
                                                         <col style={{ width: '25px' }} /> {/* UOM */}
                                                         <col style={{ width: '25px' }} /> {/* QTY */}
                                                         <col style={{ width: '40px' }} /> {/* RATE */}
                                                         <col style={{ width: '55px' }} /> {/* AMOUNT */}
                                                     </colgroup>
                                                     <thead>
                                                         <tr className="border-b border-black/20">
                                                             <th rowSpan={2} className="border-r border-black/20 p-1 text-left font-bold bg-white text-black">Item Code</th>
                                                             <th rowSpan={2} className="border-r border-black/20 p-1 text-left font-bold bg-white text-black">Item Name &amp; Description</th>
                                                             <th colSpan={numDays} className="border-r border-black/20 p-1 text-center font-bold bg-white text-black">Days</th>
                                                             <th rowSpan={6} className="border-r border-black/20 p-1 text-center font-bold bg-white text-black align-middle">Uom</th>
                                                             <th rowSpan={6} className="border-r border-black/20 p-1 text-center font-bold bg-white text-black align-middle">Qty</th>
                                                             <th rowSpan={6} className="border-r border-black/20 p-1 text-center font-bold bg-white text-black align-middle">Rate</th>
                                                             <th rowSpan={6} className="p-1 text-center font-bold bg-white text-black align-middle">Amount</th>
                                                         </tr>
                                                         <tr className="border-b border-black/20">
                                                             {dayNumbers.map((d) => (
                                                                 <th key={d} className="border-r border-black/20 p-0.5 text-center font-bold text-[7px] print:text-[6.5px] tabular-nums bg-white text-black leading-tight overflow-hidden whitespace-nowrap">
                                                                     {calendarDayLabel(periodStartDay, d)}
                                                                 </th>
                                                             ))}
                                                         </tr>
                                                         <tr className="border-b border-black/20 text-left">
                                                             <td className="border-r border-black/20 p-1 font-bold text-[9px] bg-white text-black">Order No</td>
                                                             <td className="border-r border-black/20 p-1 text-[9px] font-semibold bg-white text-black whitespace-normal break-words"></td>
                                                             {dayNumbers.map((d) => (
                                                                 <td key={`order-${d}`} className="border-r border-black/20 align-middle text-center text-[8px] font-semibold bg-white text-black p-0 overflow-hidden">
                                                                     <div className={verticalCellClass}>{headerByDay[d - 1]?.orderIds || ""}</div>
                                                                 </td>
                                                             ))}
                                                         </tr>
                                                         <tr className="border-b border-black/20 text-left">
                                                             <td className="border-r border-black/20 p-1 font-bold text-[9px] bg-white text-black">Delivery Note No</td>
                                                             <td className="border-r border-black/20 p-1 text-[9px] font-semibold bg-white text-black whitespace-normal break-words"></td>
                                                             {dayNumbers.map((d) => (
                                                                 <td key={`delivery-${d}`} className="border-r border-black/20 align-middle text-center text-[8px] font-semibold bg-white text-black p-0 overflow-hidden">
                                                                     <div className={verticalCellClass}>{headerByDay[d - 1]?.deliveryNoteIds || ""}</div>
                                                                 </td>
                                                             ))}
                                                         </tr>
                                                         <tr className="border-b border-black/20 text-left">
                                                             <td className="border-r border-black/20 p-1 font-bold text-[9px] bg-white text-black">Room No</td>
                                                             <td className="border-r border-black/20 p-1 text-[9px] font-semibold bg-white text-black whitespace-normal break-words"></td>
                                                             {dayNumbers.map((d) => (
                                                                 <td key={`room-${d}`} className="border-r border-black/20 align-middle text-center text-[8px] font-semibold bg-white text-black p-0 overflow-hidden">
                                                                     <div className={verticalCellClass}>{headerByDay[d - 1]?.roomNos || ""}</div>
                                                                 </td>
                                                             ))}
                                                         </tr>
                                                         <tr className="border-b border-black/20 text-left">
                                                             <td className="border-r border-black/20 p-1 font-bold text-[9px] bg-white text-black">Gate Pass No</td>
                                                             <td className="border-r border-black/20 p-1 text-[9px] font-semibold bg-white text-black whitespace-normal break-words"></td>
                                                             {dayNumbers.map((d) => (
                                                                 <td key={`gatepass-${d}`} className="border-r border-black/20 align-middle text-center text-[8px] font-semibold bg-white text-black p-0 overflow-hidden">
                                                                     <div className={verticalCellClass}>{headerByDay[d - 1]?.gatePasses || ""}</div>
                                                                 </td>
                                                             ))}
                                                         </tr>
                                                     </thead>
                                                     <tbody>
                                                         {pivotAndSummary.serviceBlocks.map((block, blockIdx) => {
                                                             const blockRows = [];
                                                             blockRows.push(
                                                                 <tr key={`service-type-${blockIdx}`} className="border-b border-black/20 text-left">
                                                                     <td className="border-r border-black/20 p-1 font-bold text-[9px] bg-white text-black">Service Type</td>
                                                                     <td colSpan={numDays + 5} className="p-1 text-[9px] font-semibold bg-white text-black">{block.serviceType}</td>
                                                                 </tr>
                                                             );
                                                             blockRows.push(
                                                                 <tr key={`delivery-type-${blockIdx}`} className="border-b border-black/20 text-left">
                                                                     <td className="border-r border-black/20 p-1 font-bold text-[9px] bg-white text-black">Delivery Type</td>
                                                                     <td colSpan={numDays + 5} className="p-1 text-[9px] font-semibold bg-white text-black">{formatDeliveryType(block.deliveryType)}</td>
                                                                 </tr>
                                                             );

                                                             const showCategorySubtotal = block.sortedCats.length > 1;
                                                             block.sortedCats.forEach((catName) => {
                                                                 const catRows = block.categories[catName];
                                                                 blockRows.push(
                                                                     <tr key={`cat-${blockIdx}-${catName}`} className="bg-white text-left border-b border-black/20">
                                                                         <td colSpan={numDays + 6} className="p-1 font-bold text-[9px] text-black">{catName}</td>
                                                                     </tr>
                                                                 );
                                                                 catRows.forEach((row, idx) => {
                                                                     blockRows.push(
                                                                         <tr key={`row-${blockIdx}-${row.corp_item_id}-${idx}`} className="border-b border-black/20 last:border-b-0 text-center text-[9px] bg-white">
                                                                             <td className="border-r border-black/20 px-1 py-1 align-middle text-left font-mono">{row.corp_item_id || "—"}</td>
                                                                             <td className="border-r border-black/20 px-1 py-1 align-middle text-left whitespace-normal break-words">{row.item_name || "—"}</td>
                                                                             {dayNumbers.map((d) => (
                                                                                 <td key={d} className="border-r border-black/20 px-0 py-0.5 text-center tabular-nums text-black text-[5.5px] print:text-[5px] leading-tight tracking-tighter align-middle font-medium overflow-hidden whitespace-nowrap">
                                                                                     {row.dayQty[d] || ""}
                                                                                 </td>
                                                                             ))}
                                                                             <td className="border-r border-black/20 px-1 py-1 align-middle text-center">{row.uom}</td>
                                                                             <td className="border-r border-black/20 px-1 py-1 align-middle text-center">{row.totalQty}</td>
                                                                             <td className="border-r border-black/20 px-1 py-1 align-middle text-right text-[8px]">
                                                                                 {shouldShowAsTaxInvoice ? (
                                                                                     <span className="font-semibold text-neutral-900">{formatMoney(row.taxExclRate)}</span>
                                                                                 ) : (
                                                                                     formatMoney(row.taxInclRate ?? row.rate)
                                                                                 )}
                                                                             </td>
                                                                             <td className="px-1 py-1 align-middle text-right">
                                                                                 {shouldShowAsTaxInvoice ? formatMoney(row.taxExclAmount) : formatMoney(row.taxInclAmount ?? row.amount)}
                                                                             </td>
                                                                         </tr>
                                                                     );
                                                                 });
                                                                 const catQtySum = catRows.reduce((s, row) => s + Number(row.totalQty || 0), 0);
                                                                 const catAmountSum = catRows.reduce((s, row) => s + Number(row.amount || 0), 0);
                                                                 blockRows.push(
                                                                     <tr key={`cat-subtotal-${blockIdx}-${catName}`} className="bg-white text-black font-normal text-[9px] border-b border-black/20 text-center">
                                                                         <td colSpan={2} className="p-1 text-left pl-2 border-r border-black/20">Sub Total ({catName})</td>
                                                                         {dayNumbers.map((d) => {
                                                                             const catDaySum = catRows.reduce((s, row) => s + Number(row.dayQty[d] || 0), 0);
                                                                             return (
                                                                                 <td key={d} className="border-r border-black/20 px-0 py-0.5 text-center tabular-nums text-black text-[5.5px] print:text-[5px] leading-tight tracking-tighter align-middle font-medium overflow-hidden whitespace-nowrap">
                                                                                     {catDaySum > 0 ? catDaySum : ""}
                                                                                 </td>
                                                                             );
                                                                         })}
                                                                         <td className="p-1 align-middle text-center border-r border-black/20"></td>
                                                                         <td className="p-1 align-middle text-center border-r border-black/20">{catQtySum}</td>
                                                                         <td className="p-1 align-middle text-right border-r border-black/20"></td>
                                                                         <td className="p-1 align-middle text-right">{formatRsPlain(catAmountSum)}</td>
                                                                     </tr>
                                                                 );
                                                             });

                                                             return blockRows;
                                                         })}
                                                         {(() => {
                                                             const totalQty = pivotAndSummary.serviceBlocks.reduce((sum, block) => sum + block.sortedCats.reduce((sCat, catName) => sCat + block.categories[catName].reduce((sRow, row) => sRow + Number(row.totalQty || 0), 0), 0), 0);
                                                             const totalRate = pivotAndSummary.serviceBlocks.reduce((sum, block) => sum + block.sortedCats.reduce((sCat, catName) => sCat + block.categories[catName].reduce((sRow, row) => sRow + Number(row.rate || 0), 0), 0), 0);
                                                             return (
                                                                 pivotAndSummary.serviceBlocks.length >= 1 && (
                                                                     <tr className="bg-white text-black font-normal text-[9px] text-center">
                                                                         <td colSpan={2} className="p-1 text-left pl-2 border-r border-black/20">Total</td>
                                                                         {dayNumbers.map((d) => {
                                                                             const totalDaySum = pivotAndSummary.serviceBlocks.reduce((sum, block) => {
                                                                                 return sum + block.sortedCats.reduce((sCat, catName) => 
                                                                                     sCat + block.categories[catName].reduce((sRow, row) => sRow + Number(row.dayQty[d] || 0), 0)
                                                                                 , 0);
                                                                             }, 0);
                                                                             return (
                                                                                 <td key={d} className="border-r border-black/20 px-0 py-0.5 text-center tabular-nums text-black text-[5.5px] print:text-[5px] leading-tight tracking-tighter align-middle font-medium overflow-hidden whitespace-nowrap">
                                                                                     {totalDaySum > 0 ? totalDaySum : ""}
                                                                                 </td>
                                                                             );
                                                                         })}
                                                                        <td className="p-1 align-middle text-center border-r border-black/20"></td>
                                                                        <td className="p-1 align-middle text-center border-r border-black/20">{totalQty}</td>
                                                                        <td className="p-1 align-middle text-right border-r border-black/20"></td>
                                                                        <td className="p-1 align-middle text-right">{formatRsPlain(pivotAndSummary.laundryCharges)}</td>
                                                                    </tr>
                                                                )
                                                            );
                                                        })()}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                                    </td>
                                                </tr>

                                                <tr className="print-block-row">
                                                    <td className="border-none p-0">
                                        <div className="tax-inv-summary-wrap mt-3 border border-black/20 text-[9px] font-normal text-black bg-white divide-y divide-black/20 rounded-sm">
                                            <div className="px-2 py-1 flex justify-between">
                                                <span>Laundry Charge</span>
                                                <span>{formatMoney(pivotAndSummary.laundryCharges)}</span>
                                            </div>
                                            {damageDeduction > 0 && (
                                                <div className="px-2 py-1 flex justify-between text-black bg-white">
                                                    <span>Damaged Deduction</span>
                                                    <span>- {formatMoney(damageDeduction)}</span>
                                                </div>
                                            )}
                                            {damageDeduction > 0 && (
                                                <div className="px-2 py-1 flex justify-between bg-white text-black">
                                                    <span>Net Laundry Charge</span>
                                                    <span>{formatMoney(pivotAndSummary.laundryCharges - damageDeduction)}</span>
                                                </div>
                                            )}
                                            <div className="px-2 py-1 flex justify-between">
                                                <span>Discount &nbsp; ( {Number(fetchedInvoiceRow?.display_discount_percent ?? invoiceSummary.discountPercent).toFixed(2)}% )</span>
                                                <span>{formatMoney(invoiceSummary.discountAmount)}</span>
                                            </div>
                                            <div className="px-2 py-1 flex justify-between items-center">
                                                <span>Transport Rate</span>
                                                <span>{formatMoney(invoiceSummary.transportCharge)}</span>
                                            </div>
                                            <div className="px-2 py-1 flex justify-between font-normal bg-white">
                                                <span>Total</span>
                                                <span>{formatMoney(invoiceSummary.totalBeforeSscl)}</span>
                                            </div>
                                            {shouldShowAsTaxInvoice && (
                                                <>
                                                    <div className="px-2 py-1 flex justify-between">
                                                        <span>SSCL TAX {formatPercentForLabel(invoiceSummary.ssclRatePct)}%</span>
                                                        <span>{formatMoney(invoiceSummary.ssclAmount)}</span>
                                                    </div>
                                                    <div className="px-2 py-1 flex justify-between">
                                                        <span>Total Value of Supply</span>
                                                        <span>{formatMoney(invoiceSummary.totalValueOfSupply)}</span>
                                                    </div>
                                                    <div className="px-2 py-1 flex justify-between">
                                                        <span>VAT Amount &nbsp; @ {formatPercentForLabel(invoiceSummary.vatRatePct)}%</span>
                                                        <span>{formatMoney(invoiceSummary.vatAmount)}</span>
                                                    </div>
                                                    <div className="px-2 py-1 flex justify-between font-normal bg-white text-[9px]">
                                                        <span>Total Amount Including VAT</span>
                                                        <span>{formatMoney(invoiceSummary.grandTotal)}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                                    </td>
                                                </tr>

                                                <tr className="print-block-row">
                                                    <td className="border-none p-0">
                                        <div className="tax-inv-amount-words border border-black/20 mt-1.5 text-[9px] font-normal text-black bg-white px-2 py-1 flex justify-between items-center rounded-sm">
                                             <span>Amount In Words</span>
                                             <div className="text-right font-normal">
                                                 <span>Rupees </span>
                                                 <span className="font-normal">{String(amountInWordsDisplay || "").replace(/\s+Only\s*$/i, "").trim()}</span>
                                                 <span className="font-normal"> Only</span>
                                             </div>
                                         </div>
                                                    </td>
                                                </tr>

                                         {(() => {
                                             const finalTerms = termsText || (orders && orders[0]?.terms_and_conditions) || "";
                                             if (!finalTerms) return null;
                                             const isDefaultTerms = !finalTerms || finalTerms === DEFAULT_TERMS || finalTerms === "Test 02";

                                             return (
                                                 <tr className="print-block-row">
                                                     <td className="border-none p-0">
                                                 <div className="flex flex-col w-full gap-2 text-[9px] print:text-[9px] text-black normal-case leading-relaxed">
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
                                                 </div>
                                                     </td>
                                                 </tr>
                                             );
                                         })()}

                                         <tr className="print-block-row">
                                             <td className="border-none p-0">
                                         <div className="mt-4 grid grid-cols-3 gap-x-4 w-full normal-case print:mt-1 mb-3 print:mb-2 text-center text-black">
                                              {/* Prepared by */}
                                              <div className="mt-2 print:mt-0 flex w-full flex-col text-[9px] print:text-[9px] items-center">
                                                   {(() => {
                                                       const name = preparedByName ||
                                                           localStorage.getItem("userName") ||
                                                           pickFirstString(orders[0], ["signed_by", "customer_name"]) ||
                                                           displayUser ||
                                                           "";
                                                       const rawDate = fetchedInvoiceRow?.printed_at || fetchedInvoiceRow?.created_at || orders[0]?.created_at || orders[0]?.invoice_date || new Date();
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
                                                   <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mt-10 mb-1.5" />
                                                   <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                                                       Prepared By
                                                   </span>
                                              </div>

                                              {/* Checked by */}
                                              <div className="mt-2 print:mt-0 flex w-full flex-col text-[9px] print:text-[9px] items-center">
                                                   {(() => {
                                                       const name = checkedByUser || "";
                                                       let rawDate = null;
                                                       if (checkedByUser) {
                                                           rawDate = fetchedInvoiceRow?.checked_at || fetchedInvoiceRow?.updated_at;
                                                           if (!rawDate && fetchedInvoiceRow?.activity_log) {
                                                               const parseActivityLog = (log) => {
                                                                   if (!log) return [];
                                                                   if (typeof log === "string") {
                                                                       try { return JSON.parse(log); } catch (_) { return []; }
                                                                   }
                                                                   return Array.isArray(log) ? log : [];
                                                               };
                                                               const logs = parseActivityLog(fetchedInvoiceRow.activity_log);
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
                                                   <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mt-10 mb-1.5" />
                                                   <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                                                       Checked By
                                                   </span>
                                              </div>

                                              {/* Approved by */}
                                              <div className="mt-2 print:mt-0 flex w-full flex-col text-[9px] print:text-[9px] items-center">
                                                   {(() => {
                                                       const name = approvedByUser || "";
                                                       let rawDate = null;
                                                       if (approvedByUser) {
                                                           rawDate = fetchedInvoiceRow?.approved_at || fetchedInvoiceRow?.updated_at;
                                                           if (!rawDate && fetchedInvoiceRow?.activity_log) {
                                                               const parseActivityLog = (log) => {
                                                                   if (!log) return [];
                                                                   if (typeof log === "string") {
                                                                       try { return JSON.parse(log); } catch (_) { return []; }
                                                                   }
                                                                   return Array.isArray(log) ? log : [];
                                                               };
                                                               const logs = parseActivityLog(fetchedInvoiceRow.activity_log);
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
                                                   <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mt-10 mb-1.5" />
                                                   <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                                                       Approved By
                                                   </span>
                                              </div>
                                          </div>
                                          </td>
                                          </tr>

                                          <tr className="print-block-row">
                                              <td className="border-none p-0">
                                                 <div className="border-t-2 border-[#002A74] w-full mt-4 print:mt-2" />
                                                  <div className="tax-inv-handover-panel mt-3 print:mt-1.5 flex flex-col text-black normal-case">
                                              {/* Handover header is automatically printed via the main repeated print thead header */}
                                              <h2 className="font-normal text-[9px] print:text-[9px] text-left tracking-tight mb-1.5 print:mb-1">
                                                  Hand Over Details &mdash; Goods Received Confirmation
                                              </h2>

                                              <div className="flex flex-col gap-y-2 print:gap-y-1">
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

                                                  {/* Section B */}
                                                  <div className="flex flex-col">
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
                                              </div>

                                              <p className="pt-2 text-center text-[9px] print:text-[9px] font-normal italic text-neutral-500">
                                                  This is a system-generated document. Hence no manual signature is required.
                                              </p>
                                          </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                     </div>
                                 </div>

                                 <div className="flex flex-row text-xl my-5 justify-between gap-x-5 print:hidden">
                                    <button
                                        type="button"
                                        className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                                        onClick={() => navigate(`/salesCorporate/corporate/invoicing/period/${cus}`)}
                                    >
                                        Back
                                    </button>
                                    {isInvoiceGenerated && fetchedInvoiceRow?.status !== "Deactive" && approvalStatus !== "Approved" && (approvalStatus === "Created" || approvalStatus === "Checked") ? (
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
                                        className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 flex justify-center items-center cursor-pointer"
                                        onClick={handleCreateInvoice}
                                        disabled={!canCreateInvoiceAndPrint || isLoadingSubmit}
                                    >
                                        {isLoadingSubmit ? (
                                            <BeatLoader size={8} color="#ffffff" />
                                        ) : isInvoiceGenerated ? (
                                            "Print"
                                        ) : (
                                            "Create Invoice & Print"
                                        )}
                                    </button>
                                </div>
                            </main>

                            <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px] print:hidden">
                                <button
                                    type="button"
                                    // Not yet generated (first-time creation) already has a Back button for
                                    // editing — nothing to edit here yet, so lock it, same as Locked below.
                                    disabled={invoiceLocked || !isInvoiceGenerated || !firstAssignedDeliveryNote}
                                    onClick={() =>
                                        navigate(
                                            `/salesCorporate/corporate/delivery/entry/${firstAssignedDeliveryNote.pickup_entry_id}`,
                                            { state: { edit_note_id: firstAssignedDeliveryNote.delivery_id } }
                                        )
                                    }
                                    className={`font-bold py-3 rounded-full text-lg shadow-sm transition-colors w-full ${
                                        invoiceLocked || !isInvoiceGenerated || !firstAssignedDeliveryNote
                                            ? "bg-black/10 text-black/40 cursor-not-allowed"
                                            : "bg-[#E5EFFE] text-[#000000] hover:bg-[#d4e4fd] cursor-pointer"
                                    }`}
                                >
                                    {fetchedInvoiceRow?.status === "Deactive"
                                        ? "🔒 Cancelled"
                                        : invoiceLocked || !isInvoiceGenerated
                                          ? "🔒 Locked"
                                          : "Edit Delivery Note"}
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
                                            disabled={approvalStatus !== "Created" || isApprovalLoading || !isInvoiceGenerated || fetchedInvoiceRow?.status === "Deactive"}
                                            onClick={() => {
                                                handleChecked(null);
                                            }}
                                            className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors bg-white w-full text-lg ${
                                                approvalStatus === "Created" && !isApprovalLoading && isInvoiceGenerated && fetchedInvoiceRow?.status !== "Deactive"
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
                                            disabled={approvalStatus !== "Checked" || isApprovalLoading || !isInvoiceGenerated || fetchedInvoiceRow?.status === "Deactive"}
                                            onClick={() => {
                                                handleApproved(null);
                                            }}
                                            className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors w-full text-lg ${
                                                approvalStatus === "Checked" && !isApprovalLoading && isInvoiceGenerated && fetchedInvoiceRow?.status !== "Deactive"
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
                                                                    ? "created the period tax invoice preview"
                                                                    : log.type === "Checked"
                                                                      ? "checked the period tax invoice preview"
                                                                      : log.type === "Approved"
                                                                        ? "approved the period tax invoice preview"
                                                                        : log.type === "Updated"
                                                                          ? "updated the period tax invoice preview"
                                                                          : "edited the period tax invoice preview"}
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

                                <div className="flex flex-col gap-y-1">
                                    <label
                                        className="text-black font-semibold text-[15px]"
                                        htmlFor="period-preview-place"
                                    >
                                        Place of Supply :
                                    </label>
                                    <select
                                        id="period-preview-place"
                                        disabled={invoiceLocked}
                                        value={placeOfSupplyInput}
                                        onChange={(e) => {
                                            const selectedPlace = e.target.value;
                                            setPlaceOfSupplyInput(selectedPlace);
                                            
                                            const matchedLoc = activeLocations.find(
                                                (loc) => String(loc.location_name).trim().toLowerCase() === selectedPlace.trim().toLowerCase()
                                            );
                                            if (matchedLoc) {
                                                const rate = String(matchedLoc.transport_rate || 0);
                                                setTransportRateOverride(rate);
                                                if (isTransportEditing) {
                                                    setTempTransportCharge(rate);
                                                }
                                            }
                                        }}
                                        className={
                                            invoiceLocked
                                                ? "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed appearance-none"
                                                : "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black shadow-sm text-sm bg-white cursor-pointer"
                                        }
                                    >
                                        <option value="">Select place of supply</option>
                                        {dropdownPlaces.map((item, idx) => (
                                            <option key={`${idx}-${item.name}`} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

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
                                            <label className="text-xs text-neutral-500 font-medium" htmlFor="period-preview-transport">
                                                Transport Rate
                                            </label>
                                            <input
                                                id="period-preview-transport"
                                                type="text"
                                                disabled={invoiceLocked || !isTransportEditing}
                                                readOnly={invoiceLocked || !isTransportEditing}
                                                value={isTransportEditing ? tempTransportCharge : (transportRateOverride !== "" ? transportRateOverride : (getSavedRatePerTrip(fetchedInvoiceRow) || (locationRate ? String(locationRate) : "")))}
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
                                            <label className="text-xs text-neutral-500 font-medium" htmlFor="period-preview-trip-count">
                                                Trip Count
                                            </label>
                                            <input
                                                id="period-preview-trip-count"
                                                type="text"
                                                disabled={invoiceLocked || !isTransportEditing}
                                                readOnly={invoiceLocked || !isTransportEditing}
                                                value={isTransportEditing ? tempTripCountVal : (manualTripCount !== null && manualTripCount !== undefined ? String(manualTripCount) : (fetchedInvoiceRow?.trip_count !== undefined && fetchedInvoiceRow?.trip_count !== null ? String(fetchedInvoiceRow.trip_count) : ""))}
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
                                        htmlFor="period-preview-terms"
                                    >
                                        Enter Terms & Conditions :
                                    </label>
                                    <textarea
                                        id="period-preview-terms"
                                        rows={4}
                                        disabled={invoiceLocked}
                                        readOnly={invoiceLocked}
                                        value={termsText}
                                        onChange={(e) => setTermsText(e.target.value)}
                                        className={
                                            invoiceLocked
                                                ? "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm resize-none bg-black/5 cursor-not-allowed"
                                                : "border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black shadow-sm text-sm resize-none"
                                        }
                                        placeholder="Enter terms & conditions"
                                    />
                                </div>

                                {/* Manual Invoice ID */}
                                {/* <div className="flex flex-col gap-y-1">
                                    <label className="text-black font-semibold text-[15px]" htmlFor="manual-invoice-id-period">
                                        Manual Invoice ID :
                                        <span className="ml-1 font-normal text-black/40 text-xs">(Optional)</span>
                                    </label>
                                    <input
                                        id="manual-invoice-id-period"
                                        type="text"
                                        disabled={invoiceLocked}
                                        placeholder="e.g., 26JUL_H1OW_7"
                                        value={manualInvoiceId}
                                        onChange={(e) => setManualInvoiceId(e.target.value)}
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
                                onClick={handleConfirmSignature}
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
