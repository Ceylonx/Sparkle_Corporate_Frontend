import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import defaultLogo from "../../../assets/logo.png";

/** YYYY-MM-DD(-ish) -> DD-MM-YYYY, matching the Sales Receipt slip's date cell. */
function formatDateDash(value) {
    if (value == null || value === "") return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${day}-${m}-${y}`;
}

/** [__/__/____ __:__:__]-style timestamp for the Created By signature line. */
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

function formatRs(n) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Read-only "View Receipt" popup for an already-created payment receipt — laid out to match
 * CorporateSalesReceiptView.jsx's Sales Receipt slip (same header/company block, fonts and
 * table styling) so every version of this document — blank pre-payment slip and this filled-in
 * record of an actual payment — reads as one consistent design.
 */
const CorporateViewReceipt = ({ handleClose, data }) => {
    const receiptRef = useRef(null);
    const handlePrint = useReactToPrint({ contentRef: receiptRef });

    // Oldest first, regardless of the order the backend stored allocations in.
    const invoices = [...(data.invoices || [])].sort(
        (a, b) => new Date(a.printed_at || a.invoicing_date || 0) - new Date(b.printed_at || b.invoicing_date || 0)
    );
    const allocatedTotal = invoices.reduce((sum, inv) => sum + Number(inv.payAmount || 0), 0);
    const customerName = data.customerInfo?.company_name || data.company_name || "—";
    const customerId = data.customerInfo?.customer_id || data.customer_id || "—";
    const createdByTimestamp = formatSignatureTimestamp(data.printed_at || data.created_at);

    return (
        <div className="fixed inset-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10 flex justify-center items-center">
            <div
                className="bg-canvas rounded-3xl w-[85%] max-w-[750px] h-fit max-h-[95%] overflow-y-auto flex flex-col p-6 shadow-2xl relative border border-primary/20"
                style={{ transform: "translateZ(0)", willChange: "transform" }}
            >
                <h1 className="text-primary text-3xl font-bold text-center mb-4">Sales Receipt</h1>

                <div className="border border-black/10 rounded-2xl p-4 bg-gray-50/50 mb-6 flex justify-center items-start overflow-x-auto overflow-y-visible">
                    <div
                        ref={receiptRef}
                        className="sales-receipt-print-root flex flex-col box-border bg-white text-black font-sans text-[12px] leading-snug relative mx-auto shadow-sm px-5 pt-4 pb-5 shrink-0"
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
                                        height: auto !important;
                                        min-height: max-content !important;
                                        -webkit-print-color-adjust: exact;
                                        print-color-adjust: exact;
                                        background: #ffffff !important;
                                    }
                                }
                                @media screen {
                                    .sales-receipt-print-root {
                                        width: 100% !important;
                                        max-width: 650px !important;
                                        height: auto !important;
                                        min-height: max-content !important;
                                        background: #ffffff !important;
                                    }
                                }
                            `}
                        </style>

                        {/* Printed Date / Time */}
                        <div className="flex flex-col items-end text-right text-[11px]">
                            <p>
                                <span className="font-bold">Printed Date :</span> {new Date().toLocaleDateString()}
                                <span className="font-bold ml-4">Time :</span> {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                        </div>

                        {/* Company header + Sales Receipt title box */}
                        <div className="flex flex-row justify-between items-start mt-1 gap-x-6">
                            <img src={defaultLogo} alt="Sparkle Laundry" className="w-28 object-contain shrink-0" />
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
                                            <td className="border-r border-black py-1.5 font-semibold">{data.receipt_id || "—"}</td>
                                            <td className="py-1.5">{formatDateDash(data.printed_at || data.created_at)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Customer block */}
                        <div className="mt-6 text-[12px]">
                            <p className="font-bold">CUSTOMER NAME</p>
                            <p className="text-blue-600 font-semibold pb-1">{customerName}</p>
                            <p className="text-blue-600 font-semibold mt-1">CUSTOMER ID</p>
                            <p className="border-b border-black pb-1">{customerId}</p>
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
                                    <td className="border-r border-black/20 p-2 h-8">{data.receipt_type || "—"}</td>
                                    <td className="border-r border-black/20 p-2 h-8">{data.collector || "—"}</td>
                                    <td className="border-r border-black/20 p-2 h-8">{data.payment_method || "—"}</td>
                                    <td className="p-2 h-8">{data.bank || "—"}</td>
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
                                {invoices.length > 0 ? (
                                    invoices.map((inv, index) => (
                                        <tr key={inv.invoice_id || index} className="border-b border-black/20 last:border-b-0">
                                            <td className="border-r border-black/20 p-2 h-8 text-center">{index + 1}</td>
                                            <td className="border-r border-black/20 p-2 h-8 text-left font-semibold">{inv.invoice_id}</td>
                                            <td className="border-r border-black/20 p-2 h-8 text-left">{formatDateDash(inv.printed_at || inv.invoicing_date)}</td>
                                            <td className="p-2 h-8 text-right">Rs {formatRs(inv.payAmount)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="p-3 text-center text-black/40">No invoices on this receipt.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Totals */}
                        <div className="mt-3 border border-black/20 text-[9px] font-normal text-black bg-white divide-y divide-black/20 rounded-sm">
                            <div className="px-2 py-1 flex justify-between">
                                <span>Allocated Total &nbsp; LKR</span>
                                <span className="font-semibold">{formatRs(allocatedTotal)}</span>
                            </div>
                            <div className="px-2 py-1 flex justify-between">
                                <span>Unsettled Amount &nbsp; LKR</span>
                                <span className="font-semibold">{formatRs(data.unsettled_amount ?? data.balance_due ?? 0)}</span>
                            </div>
                        </div>

                        {/* Remarks */}
                        <div className="border border-black/20 mt-1.5 text-[9px] font-normal text-black bg-white px-2 py-1 rounded-sm">
                            <p className="font-bold mb-1">Remarks</p>
                            <p className="text-[10px] leading-snug min-h-[3rem]">{data.notes || ""}</p>
                        </div>

                        {/* Sign-off */}
                        <div className="border-t-2 border-[#002A74] w-full mt-4" />
                        <div className="grid grid-cols-2 gap-x-4 w-full mt-3 mb-1 text-center text-black">
                            <div className="flex flex-col items-center w-full">
                                <span className="text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                    {data.printed_by || data.signed_by || " "}
                                </span>
                                <span className="text-[8px] text-neutral-500 leading-tight">
                                    {createdByTimestamp || " "}
                                </span>
                                <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5 mt-1" />
                                <span className="text-[9px] text-neutral-900 font-normal">Created By</span>
                            </div>
                            <div className="flex flex-col items-center w-full">
                                <span className="text-[9px] text-neutral-900 leading-tight min-h-[14px]">&nbsp;</span>
                                <span className="text-[8px] text-neutral-500 leading-tight">&nbsp;</span>
                                <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5 mt-1" />
                                <span className="text-[9px] text-neutral-900 font-normal">Approved By</span>
                            </div>
                        </div>

                        <p className="text-center italic text-[9px] mt-2">
                            "THIS IS SYSTEM GENERATED DOCUMENT, HENCE NO MANUAL SIGNATURE REQUIRED"
                        </p>
                    </div>
                </div>

                <div className="flex flex-row justify-center gap-x-4">
                    <button className="cursor-pointer bg-primary hover:bg-blue-600 text-white font-bold w-fit px-20 py-2 rounded-full text-lg transition-colors" onClick={handlePrint}>Print</button>
                    <button className="cursor-pointer bg-black/50 hover:bg-black/60 text-white font-bold w-fit px-20 py-2 rounded-full text-lg transition-colors" onClick={handleClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default CorporateViewReceipt;
