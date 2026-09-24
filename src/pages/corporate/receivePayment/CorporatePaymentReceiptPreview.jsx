import { useEffect, useRef, useState, useMemo } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useReactToPrint } from "react-to-print";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import logo from "../../../assets/logo.png";
import { createPaymentReceipt, updateReceiptApprovalStatus, getPaymentReceiptById } from "../../../services/corporate/CorporateReceivePaymentServices";
import { getAllCorporateSettings } from "../../../services/corporate/CorporateSettingsServices";
import { getFinanceBankLedgers } from "../../../services/corporate/CreditDebitNoteServices";

function toMoneyNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

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
    return toMoneyNumber(value);
}

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

/** DD-MM-YYYY, matching the Sales Receipt slip's date cells. */
function formatDateDash(value) {
    if (value == null || value === "") return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${day}-${m}-${y}`;
}

/** [DD/MM/YYYY HH:MM:SS]-style timestamp for the Created/Approved By signature lines. */
function formatSignatureTimestamp(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${m}/${y} ${hh}:${min}:${ss}`;
}

function formatDateTime(value) {
    if (value == null || value === "") return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strTime = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
    
    return `${y}/${m}/${day} - ${strTime}`;
}

const CorporatePaymentReceiptPreview = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const printRef = useRef(null);

    // Retrieve state from navigation
    const {
        customerInfo: customerInfoFromState = {},
        selectedInvoices = [],
        customerInvoices = [],
        paymentAmount = 0,
        paymentMethod: initialPaymentMethod = "Cash",
        referenceNumber: initialReferenceNumber = "",
        paymentDate: initialPaymentDate = "",
        paymentNote: initialPaymentNote = "",
        receiptType: initialReceiptType = "",
        collector: initialCollector = "",
        bank: initialBank = "",
        bankLedgerCode: initialBankLedgerCode = "",
        unsettledAmount: unsettledAmountFromState = 0,
        payAmounts = {},
        paymentAllocations = [],
        // Set when arriving from the Payment Entry list's "Approve" action (an already-created
        // receipt, identified only by id) rather than fresh off the create-receipt flow — the
        // full record is then fetched below via getPaymentReceiptById.
        receiptIdToLoad = null,
    } = location.state || {};

    // An already-created receipt fetched by id (Approve flow) — null on the normal create flow.
    const [fetchedReceipt, setFetchedReceipt] = useState(null);
    const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

    const customerInfo = fetchedReceipt?.customerInfo || customerInfoFromState;
    const unsettledAmount = fetchedReceipt ? Number(fetchedReceipt.unsettled_amount || 0) : unsettledAmountFromState;

    // Redirect if direct page access without state
    useEffect(() => {
        if (receiptIdToLoad) return; // validated by the fetch effect below instead
        if (!customerInfoFromState || !customerInfoFromState.customer_id) {
            Swal.fire({
                icon: "warning",
                title: "Invalid Access",
                text: "Please navigate from the receive payment dashboard.",
                confirmButtonColor: "#1470F9",
            });
            navigate("/salesCorporate/corporate/receive-payment");
        }
    }, [customerInfoFromState, receiptIdToLoad, navigate]);

    // Approve flow: fetch the full receipt record (invoices, approval workflow state, etc.) by id.
    useEffect(() => {
        if (!receiptIdToLoad) return;
        let cancelled = false;
        (async () => {
            try {
                setIsLoadingReceipt(true);
                const res = await getPaymentReceiptById({ receipt_id: receiptIdToLoad });
                if (cancelled) return;
                if (!res?.success || !res?.receipt) {
                    Swal.fire({
                        icon: "error",
                        title: "Not Found",
                        text: res?.message || "Could not load this payment receipt.",
                        confirmButtonColor: "#1470F9",
                    });
                    navigate("/salesCorporate/corporate/receive-payment");
                    return;
                }
                setFetchedReceipt(res.receipt);
            } catch (error) {
                console.error("Error loading payment receipt:", error);
                if (!cancelled) {
                    Swal.fire({
                        icon: "error",
                        title: "Error",
                        text: "Failed to load this payment receipt.",
                        confirmButtonColor: "#1470F9",
                    });
                    navigate("/salesCorporate/corporate/receive-payment");
                }
            } finally {
                if (!cancelled) setIsLoadingReceipt(false);
            }
        })();
        return () => { cancelled = true; };
    }, [receiptIdToLoad, navigate]);

    // Local states
    const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod);
    const [referenceNumber, setReferenceNumber] = useState(initialReferenceNumber);
    const [receiptType, setReceiptType] = useState(initialReceiptType);
    const [collector, setCollector] = useState(initialCollector);
    const [bank, setBank] = useState(initialBank);
    const [bankLedgerCode, setBankLedgerCode] = useState(initialBankLedgerCode);
    const [financeBankLedgers, setFinanceBankLedgers] = useState([]);
    const [paymentDate, setPaymentDate] = useState(initialPaymentDate || new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState(initialPaymentNote || "* You will receive an SMS once the order is complete.");
    const [termsAndConditions, setTermsAndConditions] = useState("*Please refer to the other side for Terms and Conditions");
    const [enteredAmount, setEnteredAmount] = useState("");
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [isApprovalLoading, setIsApprovalLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");


    // Receipt ID and approval states once receipt is created
    const [receiptId, setReceiptId] = useState(null);
    const [approvalStatus, setApprovalStatus] = useState(null); // null means "Draft/Preview", then "Created" -> "Approved" (no Checked step)

    // Approval actor info
    const [createdByUser, setCreatedByUser] = useState("");
    const [approvedByUser, setApprovedByUser] = useState(null);
    const [createdDateTime, setCreatedDateTime] = useState(new Date().toISOString());
    const [approvedDateTime, setApprovedDateTime] = useState("");
    const [activityLog, setActivityLog] = useState([]);

    useEffect(() => {
        if (activityLog && activityLog.length > 0) {
            activityLog.forEach(log => {
                if (log.type === "Created" || log.type === "Created status") {
                    if (log.user) setCreatedByUser(log.user);
                    if (log.timestamp) setCreatedDateTime(log.timestamp);
                } else if (log.type === "Approved" || log.type === "Approved status") {
                    if (log.user) setApprovedByUser(log.user);
                    if (log.timestamp) setApprovedDateTime(log.timestamp);
                }
            });
        }
    }, [activityLog]);

    // Approve flow: once the full receipt record has loaded, populate every field from it
    // (never auto-calculated) — the Created/Checked/Approved effect above then derives the
    // per-stage actor/timestamp fields off the activity log this sets.
    useEffect(() => {
        if (!fetchedReceipt) return;

        setReceiptId(fetchedReceipt.receipt_id || null);
        setApprovalStatus(fetchedReceipt.approval_status || "Created");
        setPaymentMethod(fetchedReceipt.payment_method || "Cash");
        setReferenceNumber(fetchedReceipt.reference_number || "");
        setReceiptType(fetchedReceipt.receipt_type || "");
        setCollector(fetchedReceipt.collector || "");
        setBank(fetchedReceipt.bank || "");
        setBankLedgerCode(fetchedReceipt.bank_ledger_code || "");
        setPaymentDate(
            fetchedReceipt.payment_date
                || (fetchedReceipt.created_at ? String(fetchedReceipt.created_at).split(" ")[0].split("T")[0] : new Date().toISOString().split("T")[0])
        );
        setNotes(fetchedReceipt.notes || "");
        setTermsAndConditions(fetchedReceipt.terms_and_conditions || "");
        setEnteredAmount(fetchedReceipt.paid_amount ?? fetchedReceipt.total_amount ?? 0);
        setCreatedByUser(fetchedReceipt.printed_by || fetchedReceipt.signed_by || "System");
        setCreatedDateTime(fetchedReceipt.created_at || fetchedReceipt.printed_at || new Date().toISOString());
        if (fetchedReceipt.approved_by_user) setApprovedByUser(fetchedReceipt.approved_by_user);

        let parsedLog = [];
        if (fetchedReceipt.activity_log) {
            if (typeof fetchedReceipt.activity_log === "string") {
                try { parsedLog = JSON.parse(fetchedReceipt.activity_log); } catch (_) { parsedLog = []; }
            } else if (Array.isArray(fetchedReceipt.activity_log)) {
                parsedLog = fetchedReceipt.activity_log;
            }
        }
        setActivityLog(parsedLog);
    }, [fetchedReceipt]);

    // Fetch initial corporate settings for receipt notes & terms
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await getAllCorporateSettings(localStorage.getItem("userId"));
                const settings = response.data.settings[0];
                if (settings) {
                    const dbNotes = settings.receipt_notes && settings.receipt_notes.trim() !== "" 
                        ? settings.receipt_notes 
                        : "* You will receive an SMS once the order is complete.";
                    const dbTerms = settings.receipt_terms && settings.receipt_terms.trim() !== "" 
                        ? settings.receipt_terms 
                        : "*Please refer to the other side for Terms and Conditions";
                    
                    if (!notes || notes === "* You will receive an SMS once the order is complete.") {
                        setNotes(dbNotes);
                    }
                    if (!termsAndConditions || termsAndConditions === "*Please refer to the other side for Terms and Conditions") {
                        setTermsAndConditions(dbTerms);
                    }
                }
            } catch (error) {
                console.error("Error fetching corporate settings:", error);
            }
        };
        fetchSettings();
    }, []);

    // Bank dropdown — sourced from the finance service's bank-access ledgers.
    useEffect(() => {
        getFinanceBankLedgers()
            .then((res) => {
                if (res?.success) setFinanceBankLedgers(res.data || []);
            })
            .catch((err) => {
                console.error("Failed to fetch finance bank ledgers:", err);
            });
    }, []);

    // Combine invoices that have any payment (either full or partial)
    const invoicesToDisplay = useMemo(() => {
        // Approve flow: the fetched receipt already carries its own allocation rows — read
        // straight off them rather than recomputing anything from the create-flow's inputs.
        if (fetchedReceipt) {
            return [...(fetchedReceipt.invoices || [])].sort(
                (a, b) => new Date(a.printed_at || a.invoicing_date || 0) - new Date(b.printed_at || b.invoicing_date || 0)
            );
        }

        const items = [];

        // 1. Invoices checked in the top list (Fully paid)
        selectedInvoices.forEach(inv => {
            const balanceDue = inv.balance_due != null && inv.balance_due !== ""
                ? Number(inv.balance_due)
                : Math.max(0, getInvoiceGrossTotal(inv) - Number(inv.paid_amount || 0));
            
            items.push({
                ...inv,
                payAmount: balanceDue,
                balanceBefore: balanceDue
            });
        });

        // 2. Debit Notes allocated in the Invoice List (billed like their own small invoice) —
        // shaped the same as an invoice item (invoice_id/printed_at/payAmount) so the receipt
        // table below can render it without knowing it's actually a Debit Note.
        paymentAllocations.forEach(alloc => {
            if (alloc.type !== "debit_note") return;
            const parentInvoice = customerInvoices.find(inv => inv.invoice_id === alloc.linked_invoice_id);
            const note = (parentInvoice?.debitNotes || []).find(n => n.id === alloc.debit_note_id) || {};
            items.push({
                invoice_id: alloc.note_no || note.note_no || alloc.invoice_id,
                printed_at: note.date,
                customer_id: parentInvoice?.customer_id,
                payAmount: Number(alloc.payAmount),
                balanceBefore: getNoteGrossTotal(note) || Number(alloc.payAmount || 0),
                isDebitNote: true,
                debitNoteId: alloc.debit_note_id,
                linkedInvoiceId: alloc.linked_invoice_id,
            });
        });

        // 3. Invoices allocated in the bottom list (Partially paid)
        paymentAllocations.forEach(alloc => {
            if (alloc.type === "debit_note") return;
            if (selectedInvoices.some(inv => inv.invoice_id === alloc.invoice_id)) return;

            const fullInv = customerInvoices.find(inv => inv.invoice_id === alloc.invoice_id);
            if (fullInv) {
                const balanceDue = fullInv.balance_due != null && fullInv.balance_due !== ""
                    ? Number(fullInv.balance_due)
                    : Math.max(0, getInvoiceGrossTotal(fullInv) - Number(fullInv.paid_amount || 0));

                items.push({
                    ...fullInv,
                    payAmount: Number(alloc.payAmount),
                    balanceBefore: balanceDue
                });
            }
        });

        // Print/allocation table reads left-to-right as a timeline, oldest first — regardless of
        // which of the three buckets above an item came from (Debit Notes are always pushed
        // before regular allocations, so without this they'd print out of date order).
        items.sort((a, b) => new Date(a.printed_at || a.invoicing_date || 0) - new Date(b.printed_at || b.invoicing_date || 0));

        return items;
    }, [fetchedReceipt, selectedInvoices, paymentAllocations, customerInvoices]);

    // Financial summaries
    const totalPaidAmount = useMemo(() => {
        return invoicesToDisplay.reduce((sum, inv) => sum + Number(inv.payAmount || 0), 0);
    }, [invoicesToDisplay]);

    useEffect(() => {
        if (paymentAmount) {
            setEnteredAmount(paymentAmount);
        } else {
            setEnteredAmount(totalPaidAmount);
        }
    }, [paymentAmount, totalPaidAmount]);

    // Format utility for Rs.
    const formatRs = (n) => {
        return `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Print setup
    const handlePrint = useReactToPrint({
        contentRef: printRef,
    });

    // Handle "Apply" button - saves receipt, transitions status to 'Created', and triggers print
    const handleApply = async () => {
        if (!enteredAmount || Number(enteredAmount) <= 0) {
            Swal.fire({
                icon: "warning",
                title: "Amount Required",
                text: "Please enter a valid payment amount.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        if ((paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (!referenceNumber || !referenceNumber.trim())) {
            Swal.fire({
                icon: "warning",
                title: "Reference Number Required",
                text: "Reference number is required for Cheque or Bank Transfer payments.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        if ((paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (!bank || !bank.trim())) {
            Swal.fire({
                icon: "warning",
                title: "Bank Required",
                text: "Bank is required for Cheque or Bank Transfer payments.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        try {
            setIsLoadingSubmit(true);
            setErrorMessage("");

            const payload = {
                user_id: localStorage.getItem("userId") || "",
                customer_id: customerInfo.customer_id || selectedInvoices[0]?.customer_id || "",
                payment_method: paymentMethod,
                reference_number: referenceNumber || "",
                receipt_type: receiptType || "",
                collector: collector || "",
                bank: bank || "",
                bank_ledger_code: bankLedgerCode || "",
                unsettled_amount: Number(unsettledAmount || 0),
                payment_date: paymentDate || new Date().toISOString().split("T")[0],
                notes: notes,
                terms_and_conditions: termsAndConditions,
                invoices: invoicesToDisplay.map(inv => ({
                    invoice_id: inv.invoice_id,
                    payAmount: inv.payAmount,
                    ...(inv.isDebitNote
                        ? { type: "debit_note", debit_note_id: inv.debitNoteId, linked_invoice_id: inv.linkedInvoiceId }
                        : {})
                }))
            };

            const response = await createPaymentReceipt(payload);

            if (response && response.success) {
                setReceiptId(response.receipt_id);
                setApprovalStatus("Created");
                setCreatedByUser(localStorage.getItem("userName") || localStorage.getItem("userId") || "System");
                
                // Set initial activity log
                setActivityLog([{
                    type: "Created",
                    user: localStorage.getItem("userName") || localStorage.getItem("userId") || "System",
                    timestamp: new Date().toISOString(),
                    description: "Created the payment receipt",
                    changes: []
                }]);

                Swal.fire({
                    icon: "success",
                    title: "Receipt Created!",
                    text: `Receipt ${response.receipt_id} generated successfully.`,
                    confirmButtonColor: "#1470F9",
                }).then(() => {
                    const isFullyPaid = invoicesToDisplay.every(inv => {
                        const balanceAfter = Number(inv.balanceBefore || 0) - Number(inv.payAmount || 0);
                        return balanceAfter <= 0;
                    });
                    navigate("/salesCorporate/corporate/receive-payment", {
                        state: {
                            selectedTab: isFullyPaid ? 2 : 0,
                            customerId: customerInfo.customer_id
                        }
                    });
                });

                // Trigger print
                setTimeout(() => {
                    handlePrint();
                }, 150);
            }
        } catch (error) {
            console.error("Error creating payment receipt:", error);
            const msg = error?.response?.data?.message || error?.message || "Failed to create payment receipt.";
            setErrorMessage(msg);
            Swal.fire({
                icon: "error",
                title: "Creation Failed",
                text: msg,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    // Approval workflow action — no "Checked" stage: Approve moves a Created (or, for any
    // already-Checked legacy receipt, Checked) receipt straight to Approved.
    const handleApprove = async () => {
        const userId = localStorage.getItem("userId");
        if (!userId || !receiptId) return;

        try {
            setIsApprovalLoading(true);
            const result = await updateReceiptApprovalStatus({
                user_id: userId,
                receipt_id: receiptId,
                new_status: "Approved",
            });

            if (result && result.success) {
                setApprovalStatus("Approved");
                setApprovedByUser(result.actor || localStorage.getItem("userName") || userId);

                setActivityLog(prev => [
                    ...prev,
                    {
                        type: "Approved",
                        user: result.actor || localStorage.getItem("userName") || userId,
                        timestamp: new Date().toISOString(),
                        description: "approved the receipt",
                        changes: []
                    }
                ]);

                Swal.fire({
                    icon: "success",
                    title: "Receipt Approved",
                    text: "Receipt approval workflow updated to Approved.",
                    confirmButtonColor: "#1470F9",
                });
            }
        } catch (error) {
            console.error("Error updating approval status:", error);
            Swal.fire({
                icon: "error",
                title: "Approval Failed",
                text: error?.response?.data?.message || error?.message || "Failed to approve this receipt.",
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const isLocked = approvalStatus === "Approved";
    const isSaved = receiptId !== null;

    if (receiptIdToLoad && isLoadingReceipt && !fetchedReceipt) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24 bg-white">
                <BeatLoader color="#1470F9" size={16} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-5 bg-white p-6 h-full overflow-y-auto">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft
                    className="size-6 text-primary cursor-pointer"
                    onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                />
                <h1 className="text-3xl text-primary font-bold">
                    Customer Payments / Payment Receipt Preview
                </h1>
            </div>
            <p className="text-xl text-black/50">
                {isSaved ? "View and manage payment receipt workflow." : "Preview and customize the receipt before saving."}
            </p>

            <div className="grid grid-cols-4 gap-6">
                {/* Left Side: Receipt Preview */}
                <main className="col-span-3 border-r border-black/20 pr-4 flex flex-col gap-y-4">
                    <div className="bg-white border border-black/10 rounded-2xl p-4 shadow-sm flex justify-center overflow-x-auto">
                        <div
                            ref={printRef}
                            className="sales-receipt-print-root flex flex-col box-border bg-white text-black font-sans text-[12px] leading-snug relative mx-auto px-5 pt-4 pb-5"
                        >
                            <style>
                                {`
                                    @media print {
                                        @page {
                                            size: A4 portrait !important;
                                            margin: 8mm !important;
                                        }
                                        .sales-receipt-print-root {
                                            width: 100% !important;
                                            max-width: 100% !important;
                                            -webkit-print-color-adjust: exact;
                                            print-color-adjust: exact;
                                            background: #ffffff !important;
                                        }
                                    }
                                    @media screen {
                                        .sales-receipt-print-root {
                                            width: 100% !important;
                                            max-width: 650px !important;
                                        }
                                    }
                                `}
                            </style>

                            {/* Printed Date / Time + ORIGINAL copy watermark */}
                            <div className="flex flex-col items-end text-right text-[11px]">
                                <p>
                                    <span className="font-bold">Printed Date :</span> {new Date().toLocaleDateString()}
                                    <span className="font-bold ml-4">Time :</span> {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p className="text-gray-400 font-semibold uppercase tracking-widest text-sm mt-1">ORIGINAL</p>
                            </div>

                            {/* Company header + Sales Receipt title box */}
                            <div className="flex flex-row justify-between items-start mt-1 gap-x-6">
                                <img src={logo} alt="Sparkle Laundry" className="w-28 object-contain shrink-0" />
                                <div className="flex-1 text-[11px] leading-snug">
                                    <p>VAT NO : 108812540-7000</p>
                                    <p className="font-bold">C L SOLUTIONS ( PVT ) LTD</p>
                                    <p>Registered Address : No:583/71, Augustine Premathirathna Road</p>
                                    <p>Blue Diamond Road ) Liyanagemulla , Seeduwa</p>
                                    <p>Operational Address : No 391 , Avissawella Road , Wellampitiya</p>
                                    <p>Hot Line : 011-4701566</p>
                                    <p>Hot Line : 0764660661</p>
                                    <p>Email : info@sparklelaundry.lk &nbsp; WEB : www.sparklelaundry.lk</p>
                                </div>
                                <div className="border border-black shrink-0 w-[210px]">
                                    <div className="text-center py-3">
                                        <p className="text-lg font-bold tracking-wide">SALES RECEIPT</p>
                                    </div>
                                    <table className="w-full border-t border-black text-center text-[11px]">
                                        <thead>
                                            <tr>
                                                <th className="border-r border-black py-1 text-blue-600 font-semibold w-1/2">Receipt No</th>
                                                <th className="py-1 text-blue-600 font-semibold w-1/2">DATE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-t border-black">
                                                <td className="border-r border-black py-1.5 font-semibold">{receiptId || "—"}</td>
                                                <td className="py-1.5">{formatDateDash(paymentDate)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Customer block */}
                            <div className="mt-6 text-[12px]">
                                <p className="font-bold">CUSTOMER NAME</p>
                                <p className="text-blue-600 font-semibold pb-1">{customerInfo.company_name || "—"}</p>
                                <p className="text-blue-600 font-semibold mt-1">CUSTOMER ID</p>
                                <p className="border-b border-black pb-1">{customerInfo.customer_id || "—"}</p>
                            </div>

                            {/* Receipt Type / Collector / Pay Mode / Bank */}
                            <table className="w-full border border-black/20 border-collapse mt-4 text-xs text-black">
                                <thead>
                                    <tr className="border-b border-black/20">
                                        <th className="border-r border-black/20 p-2 text-left font-bold bg-gray-100 text-black w-1/4">Receipt Type</th>
                                        <th className="border-r border-black/20 p-2 text-left font-bold bg-gray-100 text-black w-1/4">Collector</th>
                                        <th className="border-r border-black/20 p-2 text-left font-bold bg-gray-100 text-black w-1/4">Pay Mode</th>
                                        <th className="p-2 text-left font-bold bg-gray-100 text-black w-1/4">Bank</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border-r border-black/20 p-2 h-8">{receiptType || "—"}</td>
                                        <td className="border-r border-black/20 p-2 h-8">{collector || "—"}</td>
                                        <td className="border-r border-black/20 p-2 h-8">{paymentMethod || "—"}</td>
                                        <td className="p-2 h-8">{bank || "—"}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Invoice / Debit Note allocation table */}
                            <table className="w-full border border-black/20 border-collapse mt-3 text-xs text-black">
                                <thead>
                                    <tr className="border-b border-black/20">
                                        <th className="border-r border-black/20 p-2 text-center font-bold bg-gray-100 text-black w-12">No</th>
                                        <th className="border-r border-black/20 p-2 text-left font-bold bg-gray-100 text-black">Inv / Debit Note No</th>
                                        <th className="border-r border-black/20 p-2 text-left font-bold bg-gray-100 text-black">Inv / Debit Note Date</th>
                                        <th className="p-2 text-right font-bold bg-gray-100 text-black">Allocated Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoicesToDisplay.length > 0 ? (
                                        invoicesToDisplay.map((inv, index) => (
                                            <tr key={inv.invoice_id} className="border-b border-black/20 last:border-b-0">
                                                <td className="border-r border-black/20 p-2 h-8 text-center">{index + 1}</td>
                                                <td className="border-r border-black/20 p-2 h-8 text-left font-semibold">{inv.invoice_id}</td>
                                                <td className="border-r border-black/20 p-2 h-8 text-left">{formatDateDash(inv.printed_at || inv.invoicing_date)}</td>
                                                <td className="p-2 h-8 text-right">Rs {formatRs(inv.payAmount).replace("Rs. ", "")}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="p-3 text-center text-black/40">No invoices allocated.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Totals */}
                            <div className="mt-3 border border-black/20 text-[9px] font-normal text-black bg-white divide-y divide-black/20 rounded-sm">
                                <div className="px-2 py-1 flex justify-between">
                                    <span>Allocated Total &nbsp; LKR</span>
                                    <span className="font-semibold">{formatRs(totalPaidAmount).replace("Rs. ", "")}</span>
                                </div>
                                <div className="px-2 py-1 flex justify-between">
                                    <span>Unsettled Amount &nbsp; LKR</span>
                                    <span className="font-semibold">
                                        {formatRs(Number(unsettledAmount || 0)).replace("Rs. ", "")}
                                    </span>
                                </div>
                            </div>

                            {/* Remarks */}
                            <div className="border border-black/20 mt-1.5 text-[9px] font-normal text-black bg-white px-2 py-1 rounded-sm">
                                <p className="font-bold mb-1">Remarks</p>
                                <p className="text-[10px] leading-snug min-h-[3rem] whitespace-pre-line">{notes || ""}</p>
                            </div>

                            {/* Sign-off */}
                            <div className="border-t-2 border-[#002A74] w-full mt-4" />
                            <div className="grid grid-cols-2 gap-x-4 w-full mt-3 mb-1 text-center text-black">
                                <div className="flex flex-col items-center w-full">
                                    <span className="text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                        {createdByUser || " "}
                                    </span>
                                    <span className="text-[8px] text-neutral-500 leading-tight">
                                        {formatSignatureTimestamp(createdDateTime) || " "}
                                    </span>
                                    <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5 mt-1" />
                                    <span className="text-[9px] text-neutral-900 font-normal">Created By</span>
                                </div>
                                <div className="flex flex-col items-center w-full">
                                    <span className="text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                        {approvedByUser || " "}
                                    </span>
                                    <span className="text-[8px] text-neutral-500 leading-tight">
                                        {formatSignatureTimestamp(approvedDateTime) || " "}
                                    </span>
                                    <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5 mt-1" />
                                    <span className="text-[9px] text-neutral-900 font-normal">Approved By</span>
                                </div>
                            </div>

                            <p className="text-center italic text-[9px] mt-2">
                                "THIS IS SYSTEM GENERATED DOCUMENT, HENCE NO MANUAL SIGNATURE REQUIRED"
                            </p>
                        </div>
                    </div>

                    {/* Bottom Buttons for Draft/Preview Page */}
                    <div className="flex flex-row text-xl my-4 justify-between gap-x-4">
                        <button
                            type="button"
                            className="font-semibold text-primary bg-white border border-primary rounded-full py-2.5 w-1/3 cursor-pointer hover:bg-primary/5 transition-all"
                            onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                        >
                            Back
                        </button>
                        <p className="text-red-500 font-semibold text-base flex-1 text-center self-center">{errorMessage}</p>
                        {isSaved ? (
                            <button
                                type="button"
                                className="font-semibold text-white bg-primary rounded-full py-2.5 w-1/3 cursor-pointer hover:bg-blue-600 transition-all flex justify-center items-center"
                                onClick={handlePrint}
                            >
                                Print Receipt
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="font-semibold text-white bg-primary rounded-full py-2.5 w-1/3 cursor-pointer hover:bg-blue-600 transition-all flex justify-center items-center"
                                onClick={handleApply}
                                disabled={isLoadingSubmit}
                            >
                                {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={10} /> : "Create and Print Receipt"}
                            </button>
                        )}
                    </div>
                </main>

                {/* Right Side: Sidebar */}
                <aside className="col-span-1 flex flex-col gap-y-5">
                    {/* Main Sidebar controls */}
                    <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm flex flex-col gap-y-4">
                        <h3 className="text-lg font-bold text-black border-b border-black/10 pb-2">Receipt Settings</h3>

                        {/* Payment Method */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">Payment Method:</label>
                            <select
                                value={paymentMethod}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>

                        {/* Reference Number */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">
                                Reference Number:
                                {(paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (
                                    <span className="text-red-500 font-bold ml-1">*</span>
                                )}
                            </label>
                            <input
                                type="text"
                                placeholder="Ref #"
                                value={referenceNumber}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>

                        {/* Bank */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">
                                Bank:
                                {(paymentMethod === "Cheque" || paymentMethod === "Bank Transfer") && (
                                    <span className="text-red-500 font-bold ml-1">*</span>
                                )}
                            </label>
                            <select
                                value={bank}
                                disabled={isSaved || isLocked}
                                onChange={(e) => {
                                    const selectedName = e.target.value;
                                    setBank(selectedName);
                                    const matched = financeBankLedgers.find((l) => l.ledg_name === selectedName);
                                    setBankLedgerCode(matched?.ledg_number || "");
                                }}
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                                <option value="">Select Bank...</option>
                                {financeBankLedgers.map((l) => (
                                    <option key={l.ledg_id} value={l.ledg_name}>
                                        {l.ledg_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Receipt Type */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">Receipt Type:</label>
                            <input
                                type="text"
                                placeholder="e.g. Advance, Settlement"
                                value={receiptType}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setReceiptType(e.target.value)}
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>

                        {/* Collector */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">Collector:</label>
                            <input
                                type="text"
                                placeholder="Collected by"
                                value={collector}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setCollector(e.target.value)}
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>

                        {/* Amount */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">Amount:</label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={enteredAmount}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setEnteredAmount(e.target.value)}
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>

                        {/* Notes Area */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">Enter Notes:</label>
                            <textarea
                                value={notes}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Add notes here..."
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>

                        {/* Terms & Conditions Area */}
                        <div className="flex flex-col gap-y-1">
                            <label className="text-sm font-semibold text-black/70">Terms & Conditions:</label>
                            <textarea
                                value={termsAndConditions}
                                disabled={isSaved || isLocked}
                                onChange={(e) => setTermsAndConditions(e.target.value)}
                                rows={3}
                                placeholder="Add terms and conditions here..."
                                className="px-3 py-2 border border-black/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Workflow Section */}
                    {isSaved && (
                        <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm flex flex-col gap-y-4">
                            <h3 className="text-lg font-bold text-black border-b border-black/10 pb-2">Approval Workflow</h3>

                            {/* Created Step */}
                            <div className="flex flex-col gap-y-1 text-sm">
                                <p className="font-semibold text-black">Created By:</p>
                                <div className="flex flex-row items-center gap-x-2">
                                    <Icon icon="mdi:check-circle" className="text-green-500 text-lg shrink-0" />
                                    <span className="text-black/70 text-xs truncate font-semibold uppercase">{createdByUser || "System"}</span>
                                </div>
                            </div>

                            {/* Approved Step — no Checked stage: Approve is enabled as soon as the
                                receipt is Created (or, for a legacy record, still sitting at Checked). */}
                            <div className="flex flex-col gap-y-1.5 text-sm">
                                <p className="font-semibold text-black">Approved By:</p>
                                {approvedByUser ? (
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon icon="mdi:check-circle" className="text-green-500 text-lg shrink-0" />
                                        <span className="text-black/70 text-xs truncate font-semibold uppercase">{approvedByUser}</span>
                                    </div>
                                ) : (
                                    <button
                                        disabled={(approvalStatus !== "Created" && approvalStatus !== "Checked") || isApprovalLoading}
                                        onClick={handleApprove}
                                        className={`border font-semibold py-2 rounded-full text-sm transition-all flex justify-center items-center ${
                                            (approvalStatus === "Created" || approvalStatus === "Checked") && !isApprovalLoading
                                                ? "bg-primary text-white hover:bg-blue-600 cursor-pointer"
                                                : "border-black/20 text-black/30 bg-gray-50 cursor-not-allowed"
                                        }`}
                                    >
                                        {isApprovalLoading ? <BeatLoader size={6} color="#ffffff" /> : "Approve"}
                                    </button>
                                )}
                            </div>

                            {/* Activity Log */}
                            <div className="flex flex-col gap-y-2 mt-2">
                                <p className="font-semibold text-black text-sm">Activity Log:</p>
                                <div className="border border-black/20 rounded-xl bg-gray-50 shadow-inner overflow-hidden max-h-36 overflow-y-auto">
                                    {activityLog.length === 0 ? (
                                        <div className="px-3 py-2 text-black/40 text-[11px] italic">No activities yet.</div>
                                    ) : (
                                        activityLog.map((log, idx) => (
                                            <div key={idx} className={`px-3 py-1.5 text-[11px] text-black/70 leading-snug ${idx > 0 ? "border-t border-black/10" : ""}`}>
                                                <p className="font-bold text-[10px] text-black/50">{new Date(log.timestamp).toLocaleString()}</p>
                                                <p><span className="font-semibold uppercase">{log.user}</span>: {log.description || `${log.type} status`}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default CorporatePaymentReceiptPreview;
