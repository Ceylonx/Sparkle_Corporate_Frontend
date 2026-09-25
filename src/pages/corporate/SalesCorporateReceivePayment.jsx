import { MdSearch } from "react-icons/md";
import { useEffect, useState } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import { getAllCorporatePaidInvoices, getAllPaymentReceipts, getCustomerPayment, getPendingPaymentInvoices } from "../../services/corporate/CorporateReceivePaymentServices";
import { getFinanceBankLedgers } from "../../services/corporate/CreditDebitNoteServices";
import { getAllCorporateCustomers } from "../../services/CustomerServices";
import { BeatLoader } from "react-spinners";
import { useNavigate, useLocation } from "react-router-dom";
import CorporateViewInvoice from "../../components/dialogs/corporate/CorporateViewInvoice";
import CorporateViewReceipt from "../../components/dialogs/corporate/CorporateViewReceipt";
import Swal from "sweetalert2";

// Matches the backend's default page size for get-pending-payment-invoices.
const PENDING_PAGE_LIMIT = 15;
// Matches the backend's default page size for get-paid-invoices.
const PAID_PAGE_LIMIT = 15;

/** Windowed page numbers with "..." gaps (e.g. 1 2 3 4 5 ... 25, or 1 ... 11 12 13 ... 25) —
 *  avoids rendering every page button when there are dozens of pages. */
function getPaginationRange(current, total, siblingCount = 1) {
    const totalPageNumbers = siblingCount * 2 + 5;

    if (totalPageNumbers >= total) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(current - siblingCount, 1);
    const rightSiblingIndex = Math.min(current + siblingCount, total);
    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < total - 2;

    if (!shouldShowLeftDots && shouldShowRightDots) {
        const leftItemCount = 3 + siblingCount * 2;
        const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
        return [...leftRange, "...", total];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
        const rightItemCount = 3 + siblingCount * 2;
        const rightRange = Array.from({ length: rightItemCount }, (_, i) => total - rightItemCount + i + 1);
        return [1, "...", ...rightRange];
    }

    const middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
    return [1, "...", ...middleRange, "...", total];
}

function toMoneyNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

/** YYYY/MM/DD for tables (matches design screenshots). */
function formatDateSlash(value) {
    if (value == null || value === "") return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
}

/** Sum of an invoice's non-cancelled Credit/Debit Notes (get-customer-payment embeds
 *  creditNotes/debitNotes per invoice) — a note counts unless it's been cancelled
 *  (status "Deactive"), regardless of its Created/Checked/Approved workflow stage. */
function getNoteGrossTotal(note) {
    if (!note || typeof note !== "object") return 0;
    const baseAmount = toMoneyNumber(note.amount);
    const ssclAmount = toMoneyNumber(note.sscl_amount ?? note.sscl_tax_amount);
    const vatAmount = toMoneyNumber(note.vat_amount);
    const transportAmount = toMoneyNumber(
        note.transport_amount ??
        note.transport_charge ??
        note.travelling_charge ??
        note.traveling_charge
    );
    return toMoneyNumber(baseAmount + ssclAmount + vatAmount + transportAmount);
}

function sumActiveNoteAmounts(notes) {
    if (!Array.isArray(notes)) return 0;
    return notes.reduce((sum, note) => {
        if (note?.status === "Deactive") return sum;
        return sum + getNoteGrossTotal(note);
    }, 0);
}

/**
 * Prefer the tax-inclusive invoice total used by the invoice preview.
 * Older rows may only have `total_amount`, so keep that as the fallback.
 */
function getInvoiceGrossTotal(invoice) {
    const value =
        invoice?.grand_total ??
        invoice?.final_grand_total ??
        invoice?.total_amount_including_vat ??
        invoice?.amount_including_vat ??
        invoice?.cash_amount ??
        invoice?.total_amount ??
        invoice?.sub_total ??
        0;
    return Number(value || 0);
}

/** Paid Invoices tab Amount: the invoice total less its Credit Notes (what was actually
 *  collectable), e.g. 51,420.77 − CN-52 1,210.26 = 50,210.51. Uses the row's credit_notes list
 *  (non-cancelled, full gross incl. SSCL/VAT/transport) when present, else its credit_amount. */
function getPaidInvoiceNetAmount(invoice) {
    const creditTotal = Array.isArray(invoice?.credit_notes) && invoice.credit_notes.length > 0
        ? sumActiveNoteAmounts(invoice.credit_notes)
        : toMoneyNumber(invoice?.credit_amount || 0);
    return toMoneyNumber(Math.max(0, getInvoiceGrossTotal(invoice) - creditTotal));
}

/** Net amount actually owed on an invoice: Amount − Paid − Credit Amount, computed straight off
 *  those three columns (not the backend's own balance_due field, which can be stale or computed
 *  differently) — never negative. Debit Notes are NOT netted in here — each active one is
 *  surfaced as its own payable row in the Invoice List (see buildPaymentLineItems), so folding
 *  its amount into the invoice's own Amount Due here would double-count it. */
function computeNetBalanceDue(invoice) {
    const totalAmount = getInvoiceGrossTotal(invoice);
    const paidAmount = Number(invoice?.paid_amount || 0);
    const creditNotesTotal = sumActiveNoteAmounts(invoice?.creditNotes);
    return toMoneyNumber(Math.max(0, totalAmount - paidAmount - creditNotesTotal));
}

/** The backend now drops any invoice whose own Amount Due is already 0 from invoice_list — but
 *  a Debit Note billed against that invoice can still be unpaid on its own, so get-customer-payment
 *  separately returns debit_note_list with every active Debit Note for the customer regardless of
 *  its parent invoice's due. Any note here whose invoice isn't already in invoiceList gets folded
 *  into a minimal invoice stub so it still surfaces as its own payable row in the Invoice List. */
/** debit_note_list's payment-state fields — the authoritative copy for a Debit Note's pending
 *  receipt / amount due, copied onto the same note when it also appears under its invoice. */
function pickDebitNotePaymentFields(note) {
    const fields = [
        "hasPendingApprovalPayment",
        "pending_approval_payment_amount",
        "pending_approval_payment_entries",
        "amount_due",
        "balance_due",
        "paid_amount",
        "paid_status",
        "payment_status",
    ];
    return fields.reduce((acc, key) => {
        if (note?.[key] !== undefined) acc[key] = note[key];
        return acc;
    }, {});
}

function mergeOrphanDebitNotes(invoiceList, debitNoteList) {
    const invoices = (invoiceList || []).map((inv) => ({ ...inv, debitNotes: [...(inv.debitNotes || [])] }));
    const knownNoteKeys = new Set(
        invoices.flatMap((inv) => inv.debitNotes.map((n) => n.id ?? n.note_no))
    );

    (debitNoteList || []).forEach((note) => {
        const noteKey = note.id ?? note.note_no;
        if (knownNoteKeys.has(noteKey)) {
            // Already present under its invoice — but that copy may lack the payment fields
            // (pending-approval receipt, amount due) that debit_note_list carries, which would
            // leave a Debit Note with a receipt awaiting approval payable again. Fill them in.
            invoices.forEach((inv) => {
                inv.debitNotes = inv.debitNotes.map((n) =>
                    (n.id ?? n.note_no) === noteKey ? { ...note, ...n, ...pickDebitNotePaymentFields(note) } : n
                );
            });
            return;
        }
        knownNoteKeys.add(noteKey);

        const invoiceId = note.linked_invoice_id || note.stored_invoice_id || note.linked_invoice_ids?.[0];
        const parentInvoice = invoices.find((inv) => inv.invoice_id === invoiceId);
        if (parentInvoice) {
            parentInvoice.debitNotes.push(note);
            return;
        }

        invoices.push({
            invoice_id: invoiceId,
            approval_status: note.approval_status,
            balance_due: 0,
            paid_amount: 0,
            creditNotes: [],
            debitNotes: [note],
            // Its own invoice row was intentionally excluded upstream (nothing left to collect on
            // the invoice itself) — buildPaymentLineItems skips generating one for this stub.
            _isOrphanDebitNoteStub: true,
        });
    });

    return invoices;
}

/** Flattens the customer's invoices into the rows the Invoice List actually renders: each
 *  invoice, followed by one row per active (non-cancelled) Debit Note linked to it — a Debit
 *  Note is billed like its own small invoice (it increases what the customer owes), so it gets
 *  its own checkbox/Pay Amount rather than being folded into its parent invoice's row. */
function buildPaymentLineItems(invoices) {
    const items = [];
    (invoices || []).forEach((invoice) => {
        if (!invoice._isOrphanDebitNoteStub) {
            items.push({ rowType: "invoice", key: invoice.invoice_id, invoice });
        }
        (invoice.debitNotes || []).forEach((note) => {
            if (note?.status === "Deactive") return;
            const item = { rowType: "debit", key: `debit-${note.id ?? note.note_no}`, note, invoice };
            // A fully-paid Debit Note (Amount Due = 0) has nothing left to collect, so it's
            // dropped from the Invoice List rather than shown as a Rs 0.00 payable row.
            if (getLineDueAmount(item) <= 0) return;
            items.push(item);
        });
    });
    return items;
}

/** Amount due for one Invoice List row, invoice or Debit Note alike. A Debit Note carries its
 *  own paid_amount once a receipt has been applied against it, so its due is net of that. */
function getLineDueAmount(item) {
    if (item.rowType === "debit") {
        const amount = getNoteGrossTotal(item.note);
        const paid = Number(item.note?.paid_amount || 0);
        return toMoneyNumber(Math.max(0, amount - paid));
    }
    return toMoneyNumber(computeNetBalanceDue(item.invoice));
}

/** Whether this invoice/Debit Note already has a payment receipt sitting at Created/Checked
 *  (not yet Approved) — get-customer-payment now flags this per invoice via
 *  hasPendingApprovalPayment/pending_approval_payment_amount/pending_approval_payment_entries.
 *  Its own Amount Due isn't reduced by that receipt until the receipt is actually Approved, so
 *  without this check staff could submit a second payment for the same balance before the first
 *  one clears approval. */
function getLinePendingApproval(item) {
    const source = item.rowType === "debit" ? item.note : item.invoice;
    const entries = Array.isArray(source?.pending_approval_payment_entries)
        ? source.pending_approval_payment_entries
        : [];
    return {
        hasPending: !!source?.hasPendingApprovalPayment,
        amount: toMoneyNumber(source?.pending_approval_payment_amount || 0),
        entries,
    };
}

function getLineAmount(item) {
    if (item.rowType === "debit") {
        return getNoteGrossTotal(item.note);
    }
    return toMoneyNumber(getInvoiceGrossTotal(item.invoice));
}

/** Rs total, or Rs paid/total when partially paid. */
function formatPendingAmountDisplay(invoice) {
    const paid = Number(invoice?.paid_amount ?? 0);
    const total = getInvoiceGrossTotal(invoice);
    const fmt = (n) =>
        n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (paid > 0 && paid < total) {
        return `Rs ${fmt(paid)}/${fmt(total)}`;
    }
    return `Rs ${fmt(total)}`;
}

function getPendingRowPaymentState(invoice) {
    const paidAmt = Number(invoice?.paid_amount ?? 0);
    const totalAmt = getInvoiceGrossTotal(invoice);
    const dueRaw = invoice?.invoicing_date;
    if (!dueRaw) {
        if (paidAmt > 0 && paidAmt < totalAmt) return "partial";
        return "unpaid";
    }
    const due = new Date(dueRaw);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (paidAmt > 0 && paidAmt < totalAmt) return "partial";
    if (due < today && paidAmt < totalAmt) return "overdue";
    return "unpaid";
}

function getInvoiceListPaymentStatus(invoice, dueAmount, creditNotesTotal) {
    const paidAmt = toMoneyNumber(invoice?.paid_amount || 0);
    const totalAmt = toMoneyNumber(getInvoiceGrossTotal(invoice));
    const normalizedDueAmount = toMoneyNumber(dueAmount);
    const normalizedCreditAmount = toMoneyNumber(creditNotesTotal);

    if (normalizedDueAmount <= 0) {
        if (paidAmt <= 0 && normalizedCreditAmount >= totalAmt && totalAmt > 0) {
            const dueRaw = invoice?.invoicing_date;
            if (dueRaw) {
                const due = new Date(dueRaw);
                due.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (due < today) return "overdue";
            }
            return "unpaid";
        }
        return "paid";
    }

    if (paidAmt > 0) {
        return "partial";
    }

    const dueRaw = invoice?.invoicing_date;
    if (dueRaw) {
        const due = new Date(dueRaw);
        due.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (due < today) {
            return "overdue";
        }
    }

    return "unpaid";
}

function PendingPaymentStatusPill({ state }) {
    const base =
        "inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap min-w-[7.5rem]";
    if (state === "overdue") {
        return <span className={`${base} bg-red-50 text-red-600 border border-red-100`}>Overdue</span>;
    }
    if (state === "partial") {
        return (
            <span className={`${base} bg-amber-50 text-amber-800 border border-amber-100`}>Partially Paid</span>
        );
    }
    return <span className={`${base} bg-sky-50 text-sky-700 border border-sky-100`}>Unpaid</span>;
}



function formatRsFromNumber(n) {
    const v = Number(n ?? 0);
    return `Rs. ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTimeSlash(value) {
    if (value == null || value === "") return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function getPendingPaymentRowDateValue(rowType, item) {
    const value = rowType === "debit"
        ? item?.date ?? item?.note_date ?? item?.created_at
        : item?.printed_at ?? item?.invoice_date ?? item?.created_at;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function getPaidPaymentRowPaidDateValue(rowType, item) {
    const value = rowType === "debit"
        ? item?.paid_date ?? item?.payment_date ?? item?.updated_at
        : item?.paid_date;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function getPaidInvoiceStatus(invoice) {
    if (!invoice) return "Paid (On Time)";
    
    const paidRaw = invoice.paid_date;
    const dueRaw = invoice.invoicing_date || invoice.due_date;
    
    if (!paidRaw || !dueRaw) {
        const backendStatus = invoice.payment_status || invoice.paid_status;
        if (backendStatus) {
            if (backendStatus.includes("Overdue") || backendStatus.includes("overdue")) {
                return "Overdue - Paid";
            }
            return "Paid (On Time)";
        }
        return "Paid (On Time)";
    }
    
    const parseDateSafe = (val) => {
        if (val instanceof Date) return val;
        const normalized = String(val).replace(' ', 'T');
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? null : d;
    };
    
    const paid = parseDateSafe(paidRaw);
    const due = parseDateSafe(dueRaw);
    
    if (!paid || !due) {
        const backendStatus = invoice.payment_status || invoice.paid_status;
        if (backendStatus) {
            if (backendStatus.includes("Overdue") || backendStatus.includes("overdue")) {
                return "Overdue - Paid";
            }
            return "Paid (On Time)";
        }
        return "Paid (On Time)";
    }
    
    paid.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    
    if (paid <= due) {
        return "Paid (On Time)";
    } else {
        return "Overdue - Paid";
    }
}

const SalesCorporateReceivePayment = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedTab, setSelectedTab] = useState(location.state?.selectedTab ?? 0);
    const [showPrintInvoice, setShowPrintInvoice] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [paymentEntryReceipts, setPaymentEntryReceipts] = useState([]);
    const [isLoadingPaymentEntry, setIsLoadingPaymentEntry] = useState(false);
    const [paymentEntryCurrentPage, setPaymentEntryCurrentPage] = useState(1);
    const [paymentEntryTotalCount, setPaymentEntryTotalCount] = useState(0);
    const [paymentEntrySearchQuery, setPaymentEntrySearchQuery] = useState("");
    const [paymentEntryStartDate, setPaymentEntryStartDate] = useState("");
    const [paymentEntryEndDate, setPaymentEntryEndDate] = useState("");
    const paymentEntryLimit = 15;
    const [selectedCustomer, setSelectedCustomer] = useState("");
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("Cash");
    const [referenceNumber, setReferenceNumber] = useState("");
    const [paymentDate, setPaymentDate] = useState("");
    const [paymentNote, setPaymentNote] = useState("");
    const [receiptType, setReceiptType] = useState("");
    const [collector, setCollector] = useState("");
    const [paymentBank, setPaymentBank] = useState("");
    const [paymentBankLedgerCode, setPaymentBankLedgerCode] = useState("");
    const [financeBankLedgers, setFinanceBankLedgers] = useState([]);
    const [payAmounts, setPayAmounts] = useState({});
    const [customerInfo, setCustomerInfo] = useState(null);
    const [customerInvoices, setCustomerInvoices] = useState([]);
    // get-customer-payment's total_paid_this_month: sum of this customer's Approved payment
    // receipts dated in the current month — drives the "Total Paid This Month" card.
    const [totalPaidThisMonth, setTotalPaidThisMonth] = useState(0);
    const [allCorporateCustomers, setAllCorporateCustomers] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoadingCustomerInvoices, setIsLoadingCustomerInvoices] = useState(false);
    const [pendingSearchQuery, setPendingSearchQuery] = useState("");
    const [showPendingSuggestions, setShowPendingSuggestions] = useState(false);
    const [pendingPaymentInvoices, setPendingPaymentInvoices] = useState([]);
    const [pendingDebitNotes, setPendingDebitNotes] = useState([]);
    const [isLoadingPendingPayment, setIsLoadingPendingPayment] = useState(false);
    const [pendingStatusFilter, setPendingStatusFilter] = useState("");
    const [pendingCurrentPage, setPendingCurrentPage] = useState(1);
    const [pendingTotalCount, setPendingTotalCount] = useState(0);
    const [pendingStartDate, setPendingStartDate] = useState("");
    const [pendingEndDate, setPendingEndDate] = useState("");
    const [paidSearchQuery, setPaidSearchQuery] = useState("");
    const [showPaidSuggestions, setShowPaidSuggestions] = useState(false);
    const [paidInvoices, setPaidInvoices] = useState([]);
    const [paidDebitNotes, setPaidDebitNotes] = useState([]);
    const [isLoadingPaidInvoices, setIsLoadingPaidInvoices] = useState(false);
    const [paidStatusFilter, setPaidStatusFilter] = useState("");
    const [paidCurrentPage, setPaidCurrentPage] = useState(1);
    const [paidTotalCount, setPaidTotalCount] = useState(0);
    const [paidStartDate, setPaidStartDate] = useState("");
    const [paidEndDate, setPaidEndDate] = useState("");

    const statusPaidOptions = [
        { value: 'Paid (On Time)', label: 'On Time' },
        { value: 'Paid (Overdue)', label: 'Overdue' },
    ];

    useEffect(() => {
        const fetchCorporateCustomers = async () => {
            try {
                const response = await getAllCorporateCustomers(localStorage.getItem("userId"));
                const list = response?.data?.customers
                    || response?.data?.corporate_customers
                    || response?.data?.allCustomers
                    || response?.data?.data
                    || [];
                // Filter out deactive/inactive customers at the source
                const activeList = Array.isArray(list) ? list.filter(c => {
                    const status = String(c.status || "").toLowerCase().trim();
                    const accountStatus = String(c.account_status || "").toLowerCase().trim();
                    const isDeactive = status === "deactive" || status === "inactive" || accountStatus === "deactive" || accountStatus === "inactive";
                    return !isDeactive;
                }) : [];
                setAllCorporateCustomers(activeList);
            } catch (error) {
                console.error("Error fetching corporate customers:", error);
            }
        };
        fetchCorporateCustomers();
    }, []);

    // Bank dropdown for Payment Entry — sourced from the finance service's bank-access ledgers.
    useEffect(() => {
        getFinanceBankLedgers()
            .then((res) => {
                if (res?.success) setFinanceBankLedgers(res.data || []);
            })
            .catch((err) => {
                console.error("Failed to fetch finance bank ledgers:", err);
            });
    }, []);

    useEffect(() => {
        if (location.state?.selectedTab !== undefined) {
            setSelectedTab(location.state.selectedTab);
        }
        if (location.state?.customerId && allCorporateCustomers.length > 0) {
            const target = allCorporateCustomers.find(c => c.customer_id === location.state.customerId);
            if (target) {
                if (location.state.selectedTab === 3) {
                    setPaidSearchQuery(target.company_name || target.customer_name || "");
                } else if (location.state.selectedTab === 0) {
                    handleLoadCustomer(target);
                }
            }
        }
    }, [location.state, allCorporateCustomers]);

    // Pending Invoices and Debit Notes tab — server-side paginated + searched (the backend now
    // takes offset/limit/search and returns total_invoice_count, instead of fetching every
    // pending invoice up front and filtering/paging through it in the browser). The search box
    // is debounced so each keystroke doesn't fire its own request.
    useEffect(() => {
        if (selectedTab !== 2) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setIsLoadingPendingPayment(true);
                const response = await getPendingPaymentInvoices({
                    user_id: localStorage.getItem("userId"),
                    customer_id: null,
                    offset: (pendingCurrentPage - 1) * PENDING_PAGE_LIMIT,
                    limit: PENDING_PAGE_LIMIT,
                    search: pendingSearchQuery.trim(),
                    start_date: pendingStartDate || undefined,
                    end_date: pendingEndDate || undefined
                });
                if (cancelled) return;
                const data = response?.data || response || {};
                setPendingPaymentInvoices(data.pending_payment_invoices || []);
                setPendingDebitNotes(data.debit_note_list || []);
                setPendingTotalCount(Number(data.total_invoice_count) || 0);
            } catch (error) {
                console.error("Error fetching pending payment invoices:", error);
                if (!cancelled) {
                    setPendingPaymentInvoices([]);
                    setPendingDebitNotes([]);
                    setPendingTotalCount(0);
                }
            } finally {
                if (!cancelled) setIsLoadingPendingPayment(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [selectedTab, pendingCurrentPage, pendingSearchQuery, pendingStartDate, pendingEndDate]);

    // Paid Invoices and Debit Notes tab — same server-side paginated + searched + date-filtered
    // pattern as the Pending tab above (get-paid-invoices now takes offset/limit/search/
    // start_date/end_date and returns total_invoice_count). Debounced so typing doesn't fire a
    // request per keystroke.
    useEffect(() => {
        if (selectedTab !== 3) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setIsLoadingPaidInvoices(true);
                const response = await getAllCorporatePaidInvoices({
                    customer_id: null,
                    offset: (paidCurrentPage - 1) * PAID_PAGE_LIMIT,
                    limit: PAID_PAGE_LIMIT,
                    search: paidSearchQuery.trim(),
                    start_date: paidStartDate || undefined,
                    end_date: paidEndDate || undefined
                });
                if (cancelled) return;
                const data = response?.data || response || {};
                setPaidInvoices(data.paid_invoices || []);
                setPaidDebitNotes(data.debit_note_list || []);
                setPaidTotalCount(Number(data.total_invoice_count) || 0);
            } catch (error) {
                console.error("Error fetching paid invoices:", error);
                if (!cancelled) {
                    setPaidInvoices([]);
                    setPaidDebitNotes([]);
                    setPaidTotalCount(0);
                }
            } finally {
                if (!cancelled) setIsLoadingPaidInvoices(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [selectedTab, paidCurrentPage, paidSearchQuery, paidStartDate, paidEndDate]);

    // Payment Entry tab — server-side paginated + searched + date-filtered, same pattern as the
    // Pending/Paid tabs (get-all-payment-receipts takes limit/offset/search/start_date/end_date
    // and returns total_count). Debounced so typing doesn't fire a request per keystroke.
    useEffect(() => {
        if (selectedTab !== 1) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setIsLoadingPaymentEntry(true);
                const offset = Math.max(0, (paymentEntryCurrentPage - 1) * paymentEntryLimit);
                const response = await getAllPaymentReceipts({
                    limit: paymentEntryLimit,
                    offset,
                    search: paymentEntrySearchQuery.trim(),
                    start_date: paymentEntryStartDate || undefined,
                    end_date: paymentEntryEndDate || undefined,
                });
                if (cancelled) return;
                const data = response?.data ?? {};
                setPaymentEntryReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
                setPaymentEntryTotalCount(Number(data?.total_count ?? 0));
            } catch (error) {
                console.error("Error fetching payment entry receipts:", error);
                if (!cancelled) {
                    setPaymentEntryReceipts([]);
                    setPaymentEntryTotalCount(0);
                }
            } finally {
                if (!cancelled) setIsLoadingPaymentEntry(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [selectedTab, paymentEntryCurrentPage, paymentEntrySearchQuery, paymentEntryStartDate, paymentEntryEndDate]);

    /** Every row the Invoice List renders — invoices plus one row per active Debit Note. */
    const paymentLineItems = buildPaymentLineItems(customerInvoices);
    /** Rows that can actually be paid right now — excludes any invoice/Debit Note that already
     *  has a payment receipt awaiting approval, so "Select All" can't submit a duplicate payment. */
    const selectablePaymentLineItems = paymentLineItems.filter((it) => !getLinePendingApproval(it).hasPending);

    /** Checking a box is just a quick-fill: prefills that row's Pay Amount with its full amount
     *  due (still editable afterward); unchecking clears it back to empty. `key` is either an
     *  invoice_id or a synthetic "debit-{id}" key from paymentLineItems. */
    const handleSelectInvoice = (key) => {
        const newSelected = new Set(selectedInvoiceIds);
        if (newSelected.has(key)) {
            newSelected.delete(key);
            setPayAmounts((prev) => ({ ...prev, [key]: "" }));
        } else {
            const item = paymentLineItems.find((it) => it.key === key);
            if (item && getLinePendingApproval(item).hasPending) {
                Swal.fire({
                    icon: "warning",
                    title: "Payment Already Submitted",
                    text: "This already has a payment receipt awaiting approval. Wait for it to be approved (or rejected) before submitting another payment for it.",
                    confirmButtonColor: "#1470F9",
                });
                return;
            }
            newSelected.add(key);
            const due = item ? getLineDueAmount(item) : 0;
            setPayAmounts((prev) => ({ ...prev, [key]: due.toString() }));
        }
        setSelectedInvoiceIds(newSelected);
    };

    // Empty search text still shows a dropdown — every customer, so clicking straight into the
    // field (no typing yet) already lists options to pick from instead of showing nothing. No cap
    // on the count either — the dropdown itself scrolls (max-h-52 overflow-y-auto).
    const customerSuggestions = selectedCustomer.trim()
        ? allCorporateCustomers.filter(c =>
            c.company_name?.toLowerCase().includes(selectedCustomer.toLowerCase()) ||
            c.customer_name?.toLowerCase().includes(selectedCustomer.toLowerCase())
        )
        : allCorporateCustomers;

    const handleLoadCustomer = async (customerData) => {
        const target = customerData || allCorporateCustomers.find(
            c => c.company_name?.toLowerCase().includes(selectedCustomer.toLowerCase()) ||
                 c.customer_name?.toLowerCase().includes(selectedCustomer.toLowerCase())
        );
        setShowSuggestions(false);
        if (!target) {
            setCustomerInfo(null);
            setCustomerInvoices([]);
            return;
        }
        setSelectedCustomer(target.company_name || target.customer_name || selectedCustomer);
        setCustomerInfo({
            customer_id: target.customer_id || "",
            company_name: target.company_name || "",
            customer_name: target.customer_name || "",
            phone_number: target.customer_phone || target.phone_number || "",
            email: target.email || target.customer_email || "",
            customer_email: target.customer_email || target.email || "",
            address: target.customer_address || target.address || "",
        });
        setSelectedInvoiceIds(new Set());
        setPayAmounts({});
        setTotalPaidThisMonth(0);
        try {
            setIsLoadingCustomerInvoices(true);
            const response = await getCustomerPayment({
                customer_id: target.customer_id,
                offset: 0
            });
            setCustomerInvoices(
                mergeOrphanDebitNotes(response?.data?.invoice_list, response?.data?.debit_note_list)
            );
            setTotalPaidThisMonth(toMoneyNumber(response?.data?.total_paid_this_month));
        } catch (error) {
            console.error("Error fetching customer invoices:", error);
            setCustomerInvoices([]);
            setTotalPaidThisMonth(0);
        } finally {
            setIsLoadingCustomerInvoices(false);
        }
    };

    // Invoices and Debit Notes are both payable, so the "Pending Invoices and Debit Notes" table
    // renders one merged, tagged list rather than two separate tables — mirrors how the Payment
    // Entry / Invoice List views fold Debit Notes in alongside their invoices elsewhere on this page.
    // Both arrays already come back as just the current page (search + pagination are handled
    // server-side in the fetch effect above) — only the Status filter still applies client-side,
    // to whichever page is currently loaded.
    const pendingPaymentItems = [
        ...pendingPaymentInvoices.map((inv) => ({ rowType: "invoice", data: inv })),
        ...pendingDebitNotes.map((note) => ({ rowType: "debit", data: note })),
    ].sort((a, b) => getPendingPaymentRowDateValue(b.rowType, b.data) - getPendingPaymentRowDateValue(a.rowType, a.data));

    const filteredPendingPayments = pendingPaymentItems.filter(({ rowType, data: inv }) => {
        if (rowType === "invoice") {
            const paidAmt = Number(inv.paid_amount || 0);
            const totalAmt = Number(inv.total_amount || 0);
            const due = new Date(inv.invoicing_date); due.setHours(0, 0, 0, 0);
            const today = new Date(); today.setHours(0, 0, 0, 0);

            if (pendingStatusFilter === "Overdue") return due < today && paidAmt < totalAmt;
            if (pendingStatusFilter === "Unpaid") return due >= today && paidAmt === 0;
            if (pendingStatusFilter === "Partially Paid") return paidAmt > 0 && paidAmt < totalAmt;
            return true;
        }
        // Debit Notes carry no due date, so they never match "Overdue"; otherwise go by the
        // paid_status the backend already computed (Unpaid / Partially Paid).
        if (pendingStatusFilter === "Overdue") return false;
        if (pendingStatusFilter) return inv.paid_status === pendingStatusFilter;
        return true;
    });

    const currentPendingPayments = filteredPendingPayments;
    const pendingIndexOfFirst = pendingTotalCount === 0 ? 0 : (pendingCurrentPage - 1) * PENDING_PAGE_LIMIT;
    const pendingIndexOfLast = Math.min(pendingIndexOfFirst + PENDING_PAGE_LIMIT, pendingTotalCount);
    const pendingTotalPages = Math.max(1, Math.ceil(pendingTotalCount / PENDING_PAGE_LIMIT));

    // Fully-settled Debit Notes belong alongside fully paid invoices here — merged, tagged list,
    // same pattern as the Pending Invoices and Debit Notes tab above. Both arrays already come
    // back as just the current page (search, date range and pagination are handled server-side
    // in the fetch effect above) — only the Status filter still applies client-side, to whichever
    // page is currently loaded.
    const paidPaymentItems = [
        ...paidInvoices.map((inv) => ({ rowType: "invoice", data: inv })),
        ...paidDebitNotes.map((note) => ({ rowType: "debit", data: note })),
    ].sort((a, b) => getPaidPaymentRowPaidDateValue(b.rowType, b.data) - getPaidPaymentRowPaidDateValue(a.rowType, a.data));

    const filteredPaidInvoices = paidPaymentItems.filter(({ rowType, data: inv }) => {
        if (rowType === "invoice") {
            const currentStatus = getPaidInvoiceStatus(inv);
            if (paidStatusFilter === "Paid (On Time)") return currentStatus === "Paid (On Time)";
            if (paidStatusFilter === "Paid (Overdue)") return currentStatus === "Overdue - Paid";
            return true;
        }
        // Debit Notes carry no due date, so they always count as "On Time" and never
        // "Overdue" for the status filter.
        return paidStatusFilter !== "Paid (Overdue)";
    });

    const currentPaidInvoices = filteredPaidInvoices;
    const paidIndexOfFirst = paidTotalCount === 0 ? 0 : (paidCurrentPage - 1) * PAID_PAGE_LIMIT;
    const paidIndexOfLast = Math.min(paidIndexOfFirst + PAID_PAGE_LIMIT, paidTotalCount);
    const paidTotalPages = Math.max(1, Math.ceil(paidTotalCount / PAID_PAGE_LIMIT));

    const paymentEntryTotalPages = Math.ceil(paymentEntryTotalCount / paymentEntryLimit);


    const handleClearPayment = () => {
        setPaymentAmount("");
        setPaymentMethod("Cash");
        setReferenceNumber("");
        setPaymentDate("");
        setPaymentNote("");
        setReceiptType("");
        setCollector("");
        setPaymentBank("");
        setPayAmounts({});
        setSelectedInvoiceIds(new Set());
    };

    /** Payment Amount = sum of every Pay Amount entered in the Invoice List, checked or not. */
    useEffect(() => {
        const sum = Object.values(payAmounts).reduce((acc, v) => acc + (Number(v) || 0), 0);
        setPaymentAmount(sum > 0 ? sum.toFixed(2) : "");
    }, [payAmounts]);

    /** Unsettled Amount = each row's (invoice or Debit Note) Amount Due minus whatever Pay Amount
     *  is entered for it in this transaction (checked or manually typed), summed across every
     *  row and never negative per row. A fully-covered row contributes 0; an untouched or
     *  partially-paid one contributes its remaining balance — so this reflects what's left
     *  unsettled on the customer's account once this receipt is applied. */
    const unsettledAmount = paymentLineItems.reduce((sum, item) => {
        const enteredAmount = Number(payAmounts[item.key] || 0);
        const remaining = Math.max(0, getLineDueAmount(item) - enteredAmount);
        return sum + remaining;
    }, 0);

    const totalOutstandingAmount = buildPaymentLineItems(
        customerInvoices.filter((inv) => inv.approval_status === "Approved")
    ).reduce((sum, item) => sum + getLineDueAmount(item), 0);

    const handlePayAmountChange = (invoiceId, rawValue, balance) => {
        if (rawValue === "") {
            setPayAmounts((prev) => ({
                ...prev,
                [invoiceId]: "",
            }));
            return;
        }

        const numVal = parseFloat(rawValue);
        if (!isNaN(numVal)) {
            if (numVal > balance) {
                setPayAmounts((prev) => ({
                    ...prev,
                    [invoiceId]: balance.toString(),
                }));
            } else if (numVal < 0) {
                setPayAmounts((prev) => ({
                    ...prev,
                    [invoiceId]: "0",
                }));
            } else {
                setPayAmounts((prev) => ({
                    ...prev,
                    [invoiceId]: rawValue,
                }));
            }
        } else {
            setPayAmounts((prev) => ({
                ...prev,
                [invoiceId]: rawValue,
            }));
        }
    };

    const handleShowPrint = (invoice) => {
        setSelectedInvoice(invoice);
        setShowPrintInvoice(true);
    };

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Customer Payments</h1>
                    <p className="text-xl text-black/50">Record customer payments and manage invoices.</p>
                </div>
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-5">
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 0 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(0)}>Customer Payment</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(1)}>Payment Entry</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(2)}>Pending Invoices and Debit Notes</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 3 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(3)}>Paid Invoices and Debit Notes</h2>
            </div>

            {selectedTab === 0 ? (
                <div className="flex flex-col gap-y-5">
                    {/* Customer Search Section */}
                    <div className="bg-white rounded-xl border border-primary/20 p-5">
                        <label className="text-lg font-semibold text-black block mb-3">Select Customer</label>
                        <div className="flex flex-row gap-x-3 items-center">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={selectedCustomer}
                                    onChange={(e) => { setSelectedCustomer(e.target.value); setShowSuggestions(true); }}
                                    onKeyDown={(e) => e.key === "Enter" && handleLoadCustomer()}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                    placeholder="Search customer by name..."
                                    className="w-full px-4 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                />
                                {showSuggestions && customerSuggestions.length > 0 && (
                                    <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-primary/20 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                                        {customerSuggestions.map((c, i) => (
                                            <li
                                                key={i}
                                                onMouseDown={() => handleLoadCustomer(c)}
                                                className="px-4 py-2 cursor-pointer hover:bg-primary/10 text-sm border-b border-black/5 last:border-0"
                                            >
                                                <p className="font-medium text-black">{c.company_name}</p>
                                                <p className="text-xs text-black/50">{c.customer_name}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button
                                onClick={() => handleLoadCustomer()}
                                className="bg-primary text-white rounded-full p-2 hover:bg-primary/90 cursor-pointer"
                            >
                                <MdSearch className="size-5" />
                            </button>
                        </div>

                        {customerInfo && (
                            <div className="mt-4 grid grid-cols-4 gap-4 pt-4 border-t border-black/10">
                                <div>
                                    <p className="text-xs text-black/50 font-medium mb-1">Company Name</p>
                                    <p className="text-sm font-semibold text-black">{customerInfo.company_name || "-"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-black/50 font-medium mb-1">Contact Number</p>
                                    <p className="text-sm font-semibold text-black">{customerInfo.phone_number || "-"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-black/50 font-medium mb-1">Email</p>
                                    <p className="text-sm font-semibold text-black">{customerInfo.customer_email || customerInfo.email || "-"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-black/50 font-medium mb-1">Address</p>
                                    <p className="text-sm font-semibold text-black">{customerInfo.address || "-"}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-primary/20 p-4">
                            <p className="text-black/50 text-sm font-medium mb-2">Total Outstanding</p>
                            <p className="text-2xl font-bold text-primary">
                                Rs. {totalOutstandingAmount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="bg-white rounded-xl border border-primary/20 p-4">
                            <p className="text-black/50 text-sm font-medium mb-2">Current Invoice Total</p>
                            <p className="text-2xl font-bold text-primary">
                                Rs. {customerInvoices.filter(inv => inv.approval_status === 'Approved').reduce((s, inv) => s + getInvoiceGrossTotal(inv), 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="bg-white rounded-xl border border-primary/20 p-4">
                            <p className="text-black/50 text-sm font-medium mb-2">Overdue Amount</p>
                            <p className="text-2xl font-bold text-red-500">
                                Rs. {customerInvoices.filter(inv => {
                                    if (inv.approval_status !== 'Approved') return false;
                                    const due = new Date(inv.invoicing_date);
                                    due.setHours(0, 0, 0, 0);
                                    const today = new Date(); today.setHours(0, 0, 0, 0);
                                    return due < today && Number(inv.paid_amount || 0) < Number(inv.total_amount || 0);
                                }).reduce((s, inv) => s + Number(inv.balance_due || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="bg-white rounded-xl border border-primary/20 p-4">
                            <p className="text-black/50 text-sm font-medium mb-2">Total Paid This Month</p>
                            <p className="text-2xl font-bold text-green-500">
                                {/* Approved payment receipts dated this calendar month, from the
                                    backend (total_paid_this_month) — not the list's Paid column,
                                    which is all-time and omits fully paid invoices. */}
                                Rs. {totalPaidThisMonth.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-y-2">
                        <h3 className="text-lg font-semibold text-black">Invoice and Debit Note List</h3>
                        <div className="bg-white rounded-xl border border-primary/20 overflow-hidden shadow-sm">
                        <div className="text-sm grid grid-cols-[28px_130px_repeat(8,minmax(0,1fr))] gap-x-5 text-white bg-primary font-semibold py-3 px-4 uppercase">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={selectedInvoiceIds.size === selectablePaymentLineItems.length && selectablePaymentLineItems.length > 0}
                                    onChange={() => {
                                        if (selectedInvoiceIds.size === selectablePaymentLineItems.length) {
                                            setSelectedInvoiceIds(new Set());
                                            setPayAmounts({});
                                        } else {
                                            setSelectedInvoiceIds(new Set(selectablePaymentLineItems.map((it) => it.key)));
                                            const next = {};
                                            selectablePaymentLineItems.forEach((it) => {
                                                next[it.key] = getLineDueAmount(it).toString();
                                            });
                                            setPayAmounts(next);
                                        }
                                    }}
                                    className="w-4 h-4"
                                />
                            </div>
                            <p>Invoice ID</p>
                            <p>Date</p>
                            <p>Amount</p>
                            <p>Paid</p>
                            <p>Credit Amount</p>
                            <p>Amount Due</p>
                            <p>Due Date</p>
                            <p>Payment Status</p>
                            <p>Pay Amount</p>
                        </div>

                        {isLoadingCustomerInvoices ? (
                            <div className="flex items-center justify-center py-20">
                                <BeatLoader color="#1470F9" size={20} />
                            </div>
                        ) : paymentLineItems.length > 0 ? (
                            paymentLineItems.map((item, index) => {
                                const dueAmount = getLineDueAmount(item);
                                const isChecked = selectedInvoiceIds.has(item.key);

                                if (item.rowType === "debit") {
                                    const note = item.note;
                                    const noteAmount = getNoteGrossTotal(note);
                                    const notePaid = Number(note.paid_amount || 0);
                                    const pendingApproval = getLinePendingApproval(item);
                                    return (
                                        <div key={item.key} className={`grid grid-cols-[28px_130px_repeat(8,minmax(0,1fr))] gap-x-5 text-sm py-3 px-4 ${pendingApproval.hasPending ? "bg-gray-100" : "bg-amber-50/60"} items-center border-b border-primary/10`}>
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={pendingApproval.hasPending}
                                                    onChange={() => handleSelectInvoice(item.key)}
                                                    className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div>
                                                <p className="font-medium text-amber-700">{note.note_no}</p>
                                                <p className="text-[11px] text-black/40">Debit Note &middot; for {item.invoice?.invoice_id}</p>
                                                {pendingApproval.hasPending && (
                                                    <p
                                                        className="text-[11px] text-amber-700 font-medium"
                                                        title={pendingApproval.entries.map((e) => e.receipt_id).filter(Boolean).join(", ")}
                                                    >
                                                        Rs {pendingApproval.amount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} pending approval
                                                    </p>
                                                )}
                                            </div>
                                            <p className="text-black/70">{note.date ? new Date(note.date).toLocaleDateString() : "-"}</p>
                                            <p className="font-medium">Rs. {noteAmount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</p>
                                            <p className="text-black/70">
                                                {notePaid > 0
                                                    ? `Rs. ${notePaid.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
                                                    : "-"}
                                            </p>
                                            <p className="text-black/70">-</p>
                                            <p className="font-medium text-amber-700">
                                                Rs.{" "}
                                                {dueAmount.toLocaleString(undefined, {
                                                    maximumFractionDigits: 2,
                                                    minimumFractionDigits: 2,
                                                })}
                                            </p>
                                            <p className="text-black/70">{note.due_date ? new Date(note.due_date).toLocaleDateString() : "-"}</p>
                                            <div>
                                                {notePaid >= noteAmount && noteAmount > 0 ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Paid</span>
                                                ) : notePaid > 0 ? (
                                                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Partially Paid</span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Unpaid</span>
                                                )}
                                            </div>
                                            <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1.5 w-full max-w-[10rem] bg-white">
                                                <span className="text-black/50 mr-1.5 select-none">Rs</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    disabled={dueAmount <= 0 || pendingApproval.hasPending}
                                                    value={payAmounts[item.key] || ""}
                                                    onChange={(e) => handlePayAmountChange(item.key, e.target.value, dueAmount)}
                                                    className="w-full focus:outline-none bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                        </div>
                                    );
                                }

                                const invoice = item.invoice;
                                const creditNotesTotal = sumActiveNoteAmounts(invoice?.creditNotes);
                                const pendingApproval = getLinePendingApproval(item);
                                return (
                                <div key={item.key} className={`grid grid-cols-[28px_130px_repeat(8,minmax(0,1fr))] gap-x-5 text-sm py-3 px-4 ${pendingApproval.hasPending ? "bg-gray-100" : index % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center border-b border-primary/10`}>
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={pendingApproval.hasPending}
                                            onChange={() => handleSelectInvoice(item.key)}
                                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <a
                                            href={`/salesCorporate/corporate/invoicing/daily/${invoice?.customer_id || customerInfo?.customer_id || ""}/${invoice?.invoice_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-primary hover:underline"
                                            title="Open this invoice's Bill Preview in a new tab"
                                        >
                                            {invoice?.invoice_id}
                                        </a>
                                        {pendingApproval.hasPending && (
                                            <p
                                                className="text-[11px] text-amber-700 font-medium"
                                                title={pendingApproval.entries.map((e) => e.receipt_id).filter(Boolean).join(", ")}
                                            >
                                                Rs {pendingApproval.amount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} pending approval
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-black/70">{invoice.printed_at ? new Date(invoice.printed_at).toLocaleDateString() : "-"}</p>
                                    <p className="font-medium">Rs. {getInvoiceGrossTotal(invoice).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</p>
                                    <p className="text-black/70">Rs. {Number(invoice?.paid_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</p>
                                    <p className="text-red-500 font-medium">
                                        {creditNotesTotal > 0
                                            ? `- Rs. ${creditNotesTotal.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
                                            : "-"}
                                    </p>
                                    <p className="font-medium text-primary">
                                        Rs.{" "}
                                        {dueAmount.toLocaleString(undefined, {
                                            maximumFractionDigits: 2,
                                            minimumFractionDigits: 2,
                                        })}
                                    </p>
                                    <p className="text-black/70">{invoice.invoicing_date ? new Date(invoice.invoicing_date).toLocaleDateString() : "-"}</p>
                                    <div>
                                        {(() => {
                                            const status = getInvoiceListPaymentStatus(invoice, dueAmount, creditNotesTotal);
                                            if (status === "paid") {
                                                return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Paid</span>;
                                            }
                                            if (status === "partial") {
                                                return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Partially Paid</span>;
                                            }
                                            if (status === "overdue") {
                                                return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Over Due</span>;
                                            }
                                            return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Unpaid</span>;
                                        })()}
                                    </div>
                                    <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1.5 w-full max-w-[10rem] bg-white">
                                        <span className="text-black/50 mr-1.5 select-none">Rs</span>
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            placeholder="0.00"
                                            disabled={pendingApproval.hasPending}
                                            value={payAmounts[item.key] || ""}
                                            onChange={(e) => handlePayAmountChange(item.key, e.target.value, dueAmount)}
                                            className="w-full focus:outline-none bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                                );
                            })
                        ) : (
                            <div className="py-8 text-center text-black/50">
                                {customerInfo ? "No pending invoices found for this customer" : "Search and load a customer to view invoices"}
                            </div>
                        )}
                    </div>
                    </div>

                    {/* Payment Entry */}
                    <div className="bg-white rounded-xl border border-primary/20 p-5">
                        <h3 className="text-xl font-bold text-black mb-4">Payment Entry</h3>
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">Payment Amount</label>
                                <input
                                    type="text"
                                    readOnly
                                    placeholder="0.00"
                                    value={paymentAmount}
                                    title="Sum of amounts for checked invoices in the list above"
                                    className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-black cursor-not-allowed focus:outline-none"
                                />
                            </div>
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">Payment Method</label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                >
                                    <option value="Cash">Cash</option>
                                    <option value="Card">Card</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cheque">Cheque</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">
                                    Reference Number 
                                    {(paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (
                                        <span className="text-red-500 font-bold ml-1">*</span>
                                    )}
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ref #"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">
                                    Payment Date <span className="text-red-500 font-bold ml-1">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                    className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">Receipt Type</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Advance, Settlement"
                                    value={receiptType}
                                    onChange={(e) => setReceiptType(e.target.value)}
                                    className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">Collector</label>
                                <input
                                    type="text"
                                    placeholder="Collected by"
                                    value={collector}
                                    onChange={(e) => setCollector(e.target.value)}
                                    className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">
                                    Bank
                                    {(paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (
                                        <span className="text-red-500 font-bold ml-1">*</span>
                                    )}
                                </label>
                                <select
                                    value={paymentBank}
                                    onChange={(e) => {
                                        const selectedName = e.target.value;
                                        setPaymentBank(selectedName);
                                        const matched = financeBankLedgers.find((l) => l.ledg_name === selectedName);
                                        setPaymentBankLedgerCode(matched?.ledg_number || "");
                                    }}
                                    className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                                >
                                    <option value="">Select Bank...</option>
                                    {financeBankLedgers.map((l) => (
                                        <option key={l.ledg_id} value={l.ledg_name}>
                                            {l.ledg_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-y-2">
                                <label className="text-sm font-medium text-black">Unsettled Amount</label>
                                <input
                                    type="text"
                                    readOnly
                                    placeholder="0.00"
                                    value={unsettledAmount.toFixed(2)}
                                    title="Total amount due across all of this customer's invoices"
                                    className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-black cursor-not-allowed focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-y-2">
                            <label className="text-sm font-medium text-black">Note</label>
                            <textarea
                                placeholder="Add a note..."
                                value={paymentNote}
                                onChange={(e) => setPaymentNote(e.target.value)}
                                rows={2}
                                className="px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-primary/20 p-5">
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={handleClearPayment}
                                className="px-12 py-2 bg-white text-primary border border-primary rounded-full font-semibold hover:bg-primary/5 text-lg min-w-[12rem] cursor-pointer"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => {
                                    if (!customerInfo) {
                                        Swal.fire({
                                            icon: 'error',
                                            title: 'Customer Not Selected',
                                            text: 'Please select and load a customer first.',
                                            confirmButtonColor: '#1470F9'
                                        });
                                        return;
                                    }

                                    if (!paymentAmount || Number(paymentAmount) <= 0) {
                                        Swal.fire({
                                            icon: 'error',
                                            title: 'Invalid Amount',
                                            text: 'Select invoices in the list above — payment amount is set from their totals.',
                                            confirmButtonColor: '#1470F9'
                                        });
                                        return;
                                    }

                                    if (!paymentDate) {
                                        Swal.fire({
                                            icon: 'error',
                                            title: 'Missing Date',
                                            text: 'Please select a payment date.',
                                            confirmButtonColor: '#1470F9'
                                        });
                                        return;
                                    }

                                    if ((paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (!referenceNumber || !referenceNumber.trim())) {
                                        Swal.fire({
                                            icon: 'error',
                                            title: 'Missing Reference',
                                            text: 'Please enter a reference number.',
                                            confirmButtonColor: '#1470F9'
                                        });
                                        return;
                                    }

                                    if ((paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (!paymentBank || !paymentBank.trim())) {
                                        Swal.fire({
                                            icon: 'error',
                                            title: 'Missing Bank',
                                            text: 'Please enter the bank name.',
                                            confirmButtonColor: '#1470F9'
                                        });
                                        return;
                                    }

                                    const payAmountsPayload = {};
                                    const paymentAllocationsPayload = [];
                                    Object.entries(payAmounts).forEach(([key, amt]) => {
                                        if (amt === "" || Number(amt) <= 0) return;
                                        const item = paymentLineItems.find((it) => it.key === key);
                                        // Belt-and-braces: the checkbox/input for these are disabled in the
                                        // UI already, but never let a payment already awaiting approval
                                        // slip into the submitted payload either.
                                        if (item && getLinePendingApproval(item).hasPending) return;
                                        payAmountsPayload[key] = amt;
                                        if (item?.rowType === "debit") {
                                            paymentAllocationsPayload.push({
                                                invoice_id: key,
                                                payAmount: amt,
                                                type: "debit_note",
                                                debit_note_id: item.note?.id,
                                                note_no: item.note?.note_no,
                                                linked_invoice_id: item.invoice?.invoice_id,
                                            });
                                        } else {
                                            paymentAllocationsPayload.push({
                                                invoice_id: key,
                                                payAmount: amt
                                            });
                                        }
                                    });

                                    if (paymentAllocationsPayload.length === 0) {
                                        Swal.fire({
                                            icon: 'error',
                                            title: 'No Invoices Selected',
                                            text: 'Please enter a Pay Amount for at least one invoice in the Invoice List above.',
                                            confirmButtonColor: '#1470F9'
                                        });
                                        return;
                                    }

                                    navigate(
                                        `/salesCorporate/corporate/payment-receipt/preview`,
                                        {
                                            state: {
                                                customerInfo,
                                                selectedInvoices: [],
                                                customerInvoices,
                                                paymentAmount,
                                                paymentMethod,
                                                referenceNumber,
                                                paymentDate,
                                                paymentNote,
                                                receiptType,
                                                collector,
                                                bank: paymentBank,
                                                bankLedgerCode: paymentBankLedgerCode,
                                                unsettledAmount,
                                                payAmounts: payAmountsPayload,
                                                paymentAllocations: paymentAllocationsPayload,
                                            }
                                        }
                                    );
                                }}
                                disabled={!customerInfo || !paymentAmount || Number(paymentAmount) <= 0}
                                className="px-12 py-2 bg-primary text-white rounded-full font-semibold hover:bg-primary/90 text-lg min-w-[12rem] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Confirm Payment
                            </button>
                        </div>
                    </div>
                </div>
            ) : selectedTab === 1 ? (
                <div className="flex flex-col gap-y-5">
                    <div className="flex flex-row justify-between items-end gap-4 flex-wrap">
                        <div className="flex flex-col gap-y-1">
                            <h3 className="text-2xl font-semibold text-black">Payment Entry</h3>
                            <p className="text-base text-black/50">Recent payment receipts from pickup entry.</p>
                        </div>
                        <div className="text-sm text-black/50">
                            Showing {paymentEntryReceipts.length > 0 ? ((paymentEntryCurrentPage - 1) * paymentEntryLimit) + 1 : 0}
                            {" "}to{" "}
                            {Math.min(paymentEntryCurrentPage * paymentEntryLimit, paymentEntryTotalCount)}
                            {" "}of {paymentEntryTotalCount} receipts
                        </div>
                    </div>

                    <div className="flex flex-row gap-x-3 items-center flex-wrap">
                        <div className="relative flex flex-row border border-gray-300 rounded-full h-fit w-full max-w-xl bg-white items-center px-4 py-2 gap-x-2">
                            <MdSearch className="size-6 text-gray-400 shrink-0" />
                            <input
                                className="grow text-lg focus:outline-none bg-transparent min-w-0 placeholder:text-black/40"
                                type="text"
                                value={paymentEntrySearchQuery}
                                onChange={(e) => {
                                    setPaymentEntrySearchQuery(e.target.value);
                                    setPaymentEntryCurrentPage(1);
                                }}
                                placeholder="Search by customer name or receipt no..."
                            />
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-2 bg-white text-base shrink-0">
                            <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={paymentEntryStartDate}
                                max={paymentEntryEndDate || undefined}
                                onChange={(e) => {
                                    setPaymentEntryStartDate(e.target.value);
                                    setPaymentEntryCurrentPage(1);
                                }}
                            />
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-2 bg-white text-base shrink-0">
                            <span className="text-black/50 font-semibold mr-2">End Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={paymentEntryEndDate}
                                min={paymentEntryStartDate || undefined}
                                onChange={(e) => {
                                    setPaymentEntryEndDate(e.target.value);
                                    setPaymentEntryCurrentPage(1);
                                }}
                            />
                        </div>
                        {(paymentEntryStartDate || paymentEntryEndDate) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPaymentEntryStartDate("");
                                    setPaymentEntryEndDate("");
                                    setPaymentEntryCurrentPage(1);
                                }}
                                className="text-primary text-base font-medium hover:underline cursor-pointer shrink-0"
                            >
                                Clear dates
                            </button>
                        )}
                    </div>

                    {isLoadingPaymentEntry ? (
                        <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    ) : (
                        <div className="rounded-xl bg-white overflow-hidden border border-gray-200">
                            <div className="overflow-x-auto">
                                <table className="w-full table-fixed border-collapse">
                                    <thead className="bg-primary text-white uppercase text-xs tracking-wide">
                                        <tr>
                                            <th className="py-3 px-2 text-left w-[10%]">Receipt ID</th>
                                            <th className="py-3 px-2 text-left w-[23%]">Company</th>
                                            <th className="py-3 px-2 text-left w-[14%]">Customer ID</th>
                                            <th className="py-3 px-2 text-left w-[10%]">Payment Method</th>
                                            <th className="py-3 px-2 text-right w-[12%]">Total Amount</th>
                                            <th className="py-3 px-2 text-right w-[12%]">Credit Amount</th>
                                            <th className="py-3 px-2 text-right w-[12%]">Paid Amount</th>
                                            <th className="py-3 px-2 text-right w-[12%]">Balance Due</th>
                                            <th className="py-3 px-2 text-left w-[8%]">Approval Status</th>
                                            <th className="py-3 px-2 text-center w-[10%]">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentEntryReceipts.length > 0 ? (
                                            paymentEntryReceipts.map((receipt, index) => {
                                                const approvalStatus = receipt?.approval_status || "Created";
                                                const creditAmount = Array.isArray(receipt?.invoices)
                                                    ? receipt.invoices.reduce((sum, inv) => sum + Number(inv?.credit_amount || 0), 0)
                                                    : Number(receipt?.credit_amount || 0);
                                                const balanceDue = Array.isArray(receipt?.invoices)
                                                    ? receipt.invoices.reduce((sum, inv) => sum + Number(inv?.balance_due || 0), 0)
                                                    : Number(receipt?.balance_due || 0);
                                                // Sum of every allocation (invoices + Debit Notes) on this receipt — the
                                                // receipt's top-level paid_amount can be just its first row's share.
                                                const paidAmount = Array.isArray(receipt?.invoices) && receipt.invoices.length > 0
                                                    ? receipt.invoices.reduce((sum, inv) => sum + Number(inv?.payAmount || 0), 0)
                                                    : Number(receipt?.paid_amount || 0);
                                                const approvalBadgeClass =
                                                    approvalStatus === "Approved"
                                                        ? "text-green-600 bg-green-50"
                                                        : approvalStatus === "Checked"
                                                        ? "text-blue-600 bg-blue-50"
                                                        : "text-amber-600 bg-amber-50";
                                                return (
                                                <tr
                                                    key={receipt?.receipt_id || receipt?.id || index}
                                                    className={index % 2 === 0 ? "bg-white" : "bg-primary/5"}
                                                >
                                                    <td className="py-3 px-2 font-medium text-black whitespace-nowrap overflow-hidden text-ellipsis">{receipt?.receipt_id || "-"}</td>
                                                    <td className="py-3 px-2 text-black/80 truncate">{receipt?.company_name?.trim() || "-"}</td>
                                                    <td className="py-3 px-2 text-black/80 whitespace-nowrap overflow-hidden text-ellipsis">{receipt?.customer_id || "-"}</td>
                                                    <td className="py-3 px-2 text-black/80 whitespace-nowrap overflow-hidden text-ellipsis">{receipt?.payment_method || "-"}</td>
                                                    <td className="py-3 px-2 text-right text-black/90 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">{formatRsFromNumber(receipt?.total_amount)}</td>
                                                    <td className="py-3 px-2 text-right text-black/90 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">{formatRsFromNumber(creditAmount)}</td>
                                                    <td className="py-3 px-2 text-right text-black/90 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">{formatRsFromNumber(paidAmount)}</td>
                                                    <td className="py-3 px-2 text-right text-black/90 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">{formatRsFromNumber(balanceDue)}</td>
                                                    <td className="py-3 px-2 whitespace-nowrap overflow-hidden text-ellipsis">
                                                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${approvalBadgeClass}`}>
                                                            {approvalStatus}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-2 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedReceipt(receipt);
                                                                    setShowReceiptModal(true);
                                                                }}
                                                                className="inline-flex items-center gap-1 rounded-full border border-primary px-2.5 py-1 text-primary hover:bg-primary/5 cursor-pointer text-sm leading-none whitespace-nowrap"
                                                            >
                                                                <Icon icon="lsicon:view-filled" className="text-sm" />
                                                                View
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    navigate("/salesCorporate/corporate/payment-receipt/preview", {
                                                                        state: { receiptIdToLoad: receipt?.receipt_id }
                                                                    });
                                                                }}
                                                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 cursor-pointer text-sm leading-none whitespace-nowrap border ${
                                                                    approvalStatus === "Approved"
                                                                        ? "border-green-500 text-green-600 hover:bg-green-50"
                                                                        : "border-amber-500 text-amber-600 hover:bg-amber-50"
                                                                }`}
                                                                title="Open the full receipt preview and approval workflow"
                                                            >
                                                                <Icon icon="mdi:check-decagram-outline" className="text-sm" />
                                                                {approvalStatus === "Approved" ? "Approved" : "Approve"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={10} className="py-12 text-center text-black/50">
                                                    No payment receipts found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {paymentEntryTotalPages > 1 && (
                        <div className="flex flex-row justify-between items-center flex-wrap gap-y-2">
                            <p className="text-base text-black/50">
                                Show{" "}
                                {paymentEntryReceipts.length === 0 ? 0 : ((paymentEntryCurrentPage - 1) * paymentEntryLimit) + 1} to{" "}
                                {Math.min(paymentEntryCurrentPage * paymentEntryLimit, paymentEntryTotalCount)} of{" "}
                                {paymentEntryTotalCount} entries
                            </p>
                            <div className="flex justify-end gap-2 flex-wrap items-center">
                                <button
                                    type="button"
                                    onClick={() => setPaymentEntryCurrentPage((p) => Math.max(p - 1, 1))}
                                    disabled={paymentEntryCurrentPage === 1}
                                    className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-40 text-base font-medium cursor-pointer"
                                >
                                    Previous
                                </button>
                                {Array.from({ length: paymentEntryTotalPages }, (_, i) => i + 1).map((page) => (
                                    <button
                                        key={page}
                                        type="button"
                                        onClick={() => setPaymentEntryCurrentPage(page)}
                                        className={`px-3.5 py-2 rounded-lg border text-base font-medium cursor-pointer ${
                                            page === paymentEntryCurrentPage
                                                ? "bg-primary text-white border-primary"
                                                : "bg-white text-black/60 border-gray-200 hover:bg-gray-50"
                                        }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPaymentEntryCurrentPage((p) => Math.min(p + 1, paymentEntryTotalPages))}
                                    disabled={paymentEntryCurrentPage === paymentEntryTotalPages}
                                    className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-40 text-base font-medium cursor-pointer"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : selectedTab === 2 ? (
                <div className="flex flex-col gap-y-5">
                    {/* Search + Status — layout aligned with invoicing screens */}
                    <div className="flex flex-row gap-x-3 items-center flex-wrap">
                        <div className="relative flex flex-row border border-gray-300 rounded-full h-fit w-full max-w-xl bg-white items-center px-4 py-2 gap-x-2">
                            <MdSearch className="size-6 text-gray-400 shrink-0" />
                            <input
                                className="grow text-lg focus:outline-none bg-transparent min-w-0 placeholder:text-black/40"
                                type="text"
                                value={pendingSearchQuery}
                                onChange={(e) => {
                                    setPendingSearchQuery(e.target.value);
                                    setPendingCurrentPage(1);
                                }}
                                placeholder="Search by customer name or invoice ID..."
                            />
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-2 bg-white text-base shrink-0">
                            <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={pendingStartDate}
                                max={pendingEndDate || undefined}
                                onChange={(e) => {
                                    setPendingStartDate(e.target.value);
                                    setPendingCurrentPage(1);
                                }}
                            />
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-2 bg-white text-base shrink-0">
                            <span className="text-black/50 font-semibold mr-2">End Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={pendingEndDate}
                                min={pendingStartDate || undefined}
                                onChange={(e) => {
                                    setPendingEndDate(e.target.value);
                                    setPendingCurrentPage(1);
                                }}
                            />
                        </div>
                        {(pendingStartDate || pendingEndDate) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingStartDate("");
                                    setPendingEndDate("");
                                    setPendingCurrentPage(1);
                                }}
                                className="text-primary text-base font-medium hover:underline cursor-pointer shrink-0"
                            >
                                Clear dates
                            </button>
                        )}
                        <div className="flex flex-row items-center gap-x-2 shrink-0">
                            <span className="text-lg font-medium text-black/70 whitespace-nowrap">Status</span>
                            <div className="relative">
                                <FilterSelector
                                    className="appearance-none bg-white border border-gray-300 rounded-full pl-4 pr-10 py-2.5 text-lg font-medium text-black/80 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer min-w-[11.5rem]"
                                    placeholder="All"
                                    options={[
                                        { value: "Overdue", label: "Overdue" },
                                        { value: "Unpaid", label: "Unpaid" },
                                        { value: "Partially Paid", label: "Partially Paid" },
                                    ]}
                                    value={pendingStatusFilter}
                                    onChange={(e) => {
                                        setPendingStatusFilter(e.target.value);
                                        setPendingCurrentPage(1);
                                    }}
                                />
                                <Icon
                                    icon="mdi:chevron-down"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none size-6"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Invoice table */}
                    {isLoadingPendingPayment ? (
                        <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    ) : (
                        <div className="rounded-xl bg-white overflow-hidden border border-gray-200">
                            <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-x-3 text-base text-white bg-primary font-semibold py-2 px-3 uppercase tracking-wide text-center items-center">
                                <p className="col-span-2 text-start pl-1">Invoice / Note ID</p>
                                <p className="col-span-3 text-start">Customer</p>
                                <p className="col-span-1">Date</p>
                                <p className="col-span-2">Total Amount</p>
                                <p className="col-span-2">Credit Amount</p>
                                <p className="col-span-2">Balance Amount</p>
                                <p className="col-span-1">Due Date</p>
                                <p className="col-span-2">Payment Status</p>
                                <p className="col-span-1">Action</p>
                            </div>

                            {currentPendingPayments.length > 0 ? (
                                currentPendingPayments.map(({ rowType, data: item }, index) => {
                                    const isDebit = rowType === "debit";
                                    const payState = isDebit
                                        ? (item.paid_status === "Partially Paid" ? "partial" : "unpaid")
                                        : getPendingRowPaymentState(item);
                                    const rowKey = isDebit
                                        ? `debit-${item?.id ?? item?.note_no ?? index}`
                                        : `${item?.invoice_id ?? index}-${index}`;
                                    // Debit Notes are never credited against, so Total = their own
                                    // gross amount and Credit Amount is not applicable.
                                    const totalAmount = isDebit ? getNoteGrossTotal(item) : Number(item.total_amount || 0);
                                    const creditAmount = isDebit ? 0 : Number(item.credit_amount || 0);
                                    // Straight off the response's own balance_due column for invoices (matches the
                                    // Payment Entry tab's Balance Due column) — Debit Notes have no balance_due
                                    // field, so they keep using the backend's computed amount_due.
                                    const balanceAmount = isDebit ? Number(item.amount_due || 0) : Number(item.balance_due ?? item.amount_due ?? 0);
                                    return (
                                        <div
                                            key={rowKey}
                                            className={`grid grid-cols-[repeat(16,minmax(0,1fr))] gap-x-3 text-base py-2 px-3 items-center border-b border-gray-100 last:border-b-0 ${
                                                index % 2 === 0 ? "bg-white" : "bg-primary/5"
                                            } ${isDebit ? "bg-amber-50/40" : ""}`}
                                        >
                                            <div className="col-span-2 text-start pl-1">
                                                <p className={`font-medium ${isDebit ? "text-amber-700" : "text-black"}`}>
                                                    {isDebit ? item?.note_no ?? "—" : item?.invoice_id ?? "—"}
                                                </p>
                                                {isDebit && (
                                                    <p className="text-xs text-black/40">Debit Note &middot; for {item?.linked_invoice_id ?? "—"}</p>
                                                )}
                                            </div>
                                            <div className="col-span-3 flex flex-row items-center gap-x-3 text-start min-w-0">
                                                <Icon
                                                    icon="lucide:user"
                                                    className="text-primary bg-primary/15 rounded-full size-8 p-1.5 shrink-0"
                                                />
                                                <div className="flex flex-col min-w-0">
                                                    <p className="font-medium text-black truncate text-[1.05rem] leading-snug">
                                                        {item.company_name ?? "—"}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="col-span-1 text-center font-medium text-black/90 tabular-nums">
                                                {formatDateSlash(isDebit ? item.date : item.printed_at)}
                                            </p>
                                            <p className="col-span-2 text-center font-medium text-black tabular-nums">
                                                {formatRsFromNumber(totalAmount)}
                                            </p>
                                            <p className="col-span-2 text-center font-medium text-red-500 tabular-nums">
                                                {isDebit ? "-" : (creditAmount > 0 ? `- ${formatRsFromNumber(creditAmount)}` : "-")}
                                            </p>
                                            <p className="col-span-2 text-center font-medium text-black tabular-nums">
                                                {formatRsFromNumber(balanceAmount)}
                                            </p>
                                            <p className="col-span-1 text-center text-black/80 tabular-nums">
                                                {formatDateSlash(isDebit ? item.due_date : item.invoicing_date)}
                                            </p>
                                            <div className="col-span-2 flex justify-center">
                                                <PendingPaymentStatusPill state={payState} />
                                            </div>
                                            <div className="col-span-1 flex flex-row items-center justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isDebit) {
                                                            navigate(`/salesCorporate/corporate/credit-debit-notes?viewNoteId=${item?.id}`);
                                                            return;
                                                        }
                                                        const invoicingPath = String(item?.invoicing_type || "").toLowerCase().includes("period")
                                                            ? "period"
                                                            : "daily";
                                                        navigate(`/salesCorporate/corporate/invoicing/${invoicingPath}/${item?.customer_id || ""}/${item?.invoice_id}`);
                                                    }}
                                                    className="flex flex-col items-center gap-0.5 text-blue-500 hover:text-blue-600 bg-transparent border-0 p-0 cursor-pointer"
                                                    title="View"
                                                >
                                                    <Icon icon="mdi:eye" className="text-[1.75rem]" />
                                                    <span className="text-sm text-black/60">View</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-12 px-4 text-center text-black/50 text-lg">
                                    {pendingPaymentItems.length > 0
                                        ? "No invoices match the filter"
                                        : "No pending payment invoices found"}
                                </div>
                            )}
                        </div>
                    )}

                    {pendingTotalCount > 0 && (
                        <div className="flex flex-row justify-between items-center flex-wrap gap-y-2">
                            <p className="text-base text-black/50">
                                Show{" "}
                                {pendingIndexOfFirst + 1} to{" "}
                                {pendingIndexOfLast} of{" "}
                                {pendingTotalCount} invoices
                            </p>
                            <div className="flex justify-end gap-2 flex-wrap items-center">
                                <button
                                    type="button"
                                    onClick={() => setPendingCurrentPage((p) => Math.max(p - 1, 1))}
                                    disabled={pendingCurrentPage === 1}
                                    className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-40 text-base font-medium cursor-pointer"
                                >
                                    Previous
                                </button>
                                {getPaginationRange(pendingCurrentPage, pendingTotalPages).map((page, i) =>
                                    page === "..." ? (
                                        <span key={`ellipsis-${i}`} className="px-2 text-base font-medium text-black/40 select-none">
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={page}
                                            type="button"
                                            onClick={() => setPendingCurrentPage(page)}
                                            className={`px-3.5 py-2 rounded-lg border text-base font-medium cursor-pointer ${
                                                page === pendingCurrentPage
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-white text-black/60 border-gray-200 hover:bg-gray-50"
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    )
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPendingCurrentPage((p) => Math.min(p + 1, pendingTotalPages))}
                                    disabled={pendingCurrentPage === pendingTotalPages}
                                    className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-40 text-base font-medium cursor-pointer"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-y-5">
                    {/* Search + Filter */}
                    <div className="flex flex-row gap-x-3 items-center flex-wrap">
                        <div className="relative w-full max-w-md">
                            <div className="flex flex-row border border-primary rounded-full h-fit bg-white overflow-visible">
                                <div className="flex justify-center items-center rounded-l-full px-4">
                                    <MdSearch className="size-5 text-primary" />
                                </div>
                                <input
                                    className="grow h-fit px-3 py-2 text-sm rounded-r-full border border-transparent focus:outline-none"
                                    type="text"
                                    value={paidSearchQuery}
                                    onChange={(e) => {
                                        setPaidSearchQuery(e.target.value);
                                        setPaidCurrentPage(1);
                                    }}
                                    placeholder="Search by customer name or invoice ID..."
                                />
                            </div>
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-2 bg-white text-sm shrink-0">
                            <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={paidStartDate}
                                max={paidEndDate || undefined}
                                onChange={(e) => {
                                    setPaidStartDate(e.target.value);
                                    setPaidCurrentPage(1);
                                }}
                            />
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-2 bg-white text-sm shrink-0">
                            <span className="text-black/50 font-semibold mr-2">End Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={paidEndDate}
                                min={paidStartDate || undefined}
                                onChange={(e) => {
                                    setPaidEndDate(e.target.value);
                                    setPaidCurrentPage(1);
                                }}
                            />
                        </div>
                        {(paidStartDate || paidEndDate) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPaidStartDate("");
                                    setPaidEndDate("");
                                    setPaidCurrentPage(1);
                                }}
                                className="text-primary text-sm font-medium hover:underline cursor-pointer shrink-0"
                            >
                                Clear dates
                            </button>
                        )}
                        <FilterSelector
                            options={statusPaidOptions}
                            value={paidStatusFilter}
                            onChange={(e) => { setPaidStatusFilter(e.target.value); setPaidCurrentPage(1); }}
                        />
                    </div>

                    {/* Invoice Table */}
                    {isLoadingPaidInvoices ? (
                        <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-primary/20">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    ) : (
                        <div className="rounded-xl bg-white overflow-hidden border border-primary/20">
                            <div className="text-sm grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-3 px-4 uppercase">
                                <p>Invoice / Note ID</p>
                                <p className="col-span-2">Customer</p>
                                <p>Date</p>
                                <p>Amount</p>
                                <p>Due Date</p>
                                <p>Paid Date</p>
                                <p>Payment Status</p>
                                <p className="text-center">Action</p>
                            </div>

                            {currentPaidInvoices.length > 0 ? (
                                currentPaidInvoices.map(({ rowType, data: item }, index) => {
                                    const isDebit = rowType === "debit";
                                    const rowKey = isDebit ? `debit-${item?.id ?? item?.note_no ?? index}` : index;
                                    return (
                                    <div key={rowKey} className={`grid grid-cols-9 gap-x-3 text-sm py-3 px-4 ${index % 2 === 0 ? "bg-white" : "bg-blue-50"} ${isDebit ? "bg-amber-50/40" : ""} items-center border-b border-primary/10`}>
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isDebit) {
                                                        navigate(`/salesCorporate/corporate/credit-debit-notes?viewNoteId=${item?.id}`);
                                                        return;
                                                    }
                                                    const invoicingPath = String(item?.invoicing_type || "").toLowerCase().includes("period")
                                                        ? "period"
                                                        : "daily";
                                                    navigate(`/salesCorporate/corporate/invoicing/${invoicingPath}/${item?.customer_id || ""}/${item?.invoice_id}`);
                                                }}
                                                className={`font-medium hover:underline cursor-pointer bg-transparent border-0 p-0 text-left ${isDebit ? "text-amber-700" : "text-primary"}`}
                                            >
                                                {isDebit ? item?.note_no : item?.invoice_id}
                                            </button>
                                            {isDebit && (
                                                <p className="text-xs text-black/40">Debit Note &middot; for {item?.linked_invoice_id ?? "—"}</p>
                                            )}
                                        </div>
                                        <div className="col-span-2 flex flex-row items-center gap-x-3">
                                            <Icon icon={"lucide:user"} className="text-primary bg-blue-100 rounded-full size-6 p-1 shrink-0" />
                                            <div className="flex flex-col">
                                                <p className="font-medium text-black">{item.company_name}</p>
                                            </div>
                                        </div>
                                        <p className="text-black/70">{(isDebit ? item.date : item.printed_at) ? new Date(isDebit ? item.date : item.printed_at).toLocaleDateString() : "-"}</p>
                                        <p className="font-medium">Rs. {(isDebit ? getNoteGrossTotal(item) : getPaidInvoiceNetAmount(item)).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</p>
                                        <p className="text-black/70">{(isDebit ? item.due_date : item.invoicing_date) ? new Date(isDebit ? item.due_date : item.invoicing_date).toLocaleDateString() : "-"}</p>
                                        <p className="text-black/70">{isDebit ? (item.paid_date ? new Date(item.paid_date).toLocaleDateString() : "-") : (item.paid_date ? new Date(item.paid_date).toLocaleDateString() : "-")}</p>
                                        <div>
                                            {isDebit ? (
                                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                    Paid
                                                </span>
                                            ) : (() => {
                                                const status = getPaidInvoiceStatus(item);
                                                if (status === "Paid (On Time)") {
                                                    return (
                                                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                            Paid (On Time)
                                                        </span>
                                                    );
                                                } else {
                                                    return (
                                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                                            Overdue - Paid
                                                        </span>
                                                    );
                                                }
                                            })()}
                                        </div>
                                        <div className="flex flex-row gap-x-2 justify-center">
                                            <button
                                                onClick={() => {
                                                    if (isDebit) {
                                                        navigate(`/salesCorporate/corporate/credit-debit-notes?viewNoteId=${item?.id}`);
                                                        return;
                                                    }
                                                    const invoicingPath = String(item?.invoicing_type || "").toLowerCase().includes("period")
                                                        ? "period"
                                                        : "daily";
                                                    navigate(`/salesCorporate/corporate/invoicing/${invoicingPath}/${item?.customer_id || ""}/${item?.invoice_id}`);
                                                }}
                                                className="text-blue-500 hover:text-blue-700 p-1"
                                                title="View"
                                            >
                                                <Icon icon={"lsicon:view-filled"} className="text-lg" />
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })
                            ) : (
                                <div className="py-8 text-center text-black/50">
                                    {paidPaymentItems.length > 0 ? "No invoices match the filter" : "No paid invoices found"}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pagination */}
                    {paidTotalCount > 0 && (
                        <div className="flex flex-row justify-between items-center flex-wrap gap-y-2">
                            <p className="text-sm text-black/60">
                                Show {paidIndexOfFirst + 1} to {paidIndexOfLast} of {paidTotalCount} invoices
                            </p>
                            <div className="flex justify-end gap-1 flex-wrap items-center">
                                <button
                                    onClick={() => setPaidCurrentPage(p => Math.max(p - 1, 1))}
                                    disabled={paidCurrentPage === 1}
                                    className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 text-sm font-medium hover:bg-primary/5"
                                >Previous</button>
                                {getPaginationRange(paidCurrentPage, paidTotalPages).map((page, i) =>
                                    page === "..." ? (
                                        <span key={`ellipsis-${i}`} className="px-2 text-sm font-medium text-black/40 select-none">
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={page}
                                            onClick={() => setPaidCurrentPage(page)}
                                            className={`px-3 py-1 rounded-lg border text-sm font-medium ${page === paidCurrentPage ? "bg-primary text-white border-primary" : "bg-white text-black border-primary/20 hover:bg-primary/5"}`}
                                        >{page}</button>
                                    )
                                )}
                                <button
                                    onClick={() => setPaidCurrentPage(p => Math.min(p + 1, paidTotalPages))}
                                    disabled={paidCurrentPage === paidTotalPages}
                                    className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 text-sm font-medium hover:bg-primary/5"
                                >Next</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showPrintInvoice && selectedInvoice !== null &&
                <CorporateViewInvoice
                    handleClose={() => {
                        setShowPrintInvoice(false)
                        setSelectedInvoice(null);
                    }}
                    data={selectedInvoice}
                />
            }

            {showReceiptModal && selectedReceipt !== null &&
                <CorporateViewReceipt
                    handleClose={() => {
                        setShowReceiptModal(false);
                        setSelectedReceipt(null);
                    }}
                    data={selectedReceipt}
                />
            }


        </div>
    );
};

export default SalesCorporateReceivePayment;
