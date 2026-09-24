import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useLocation, useNavigate } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import Swal from "sweetalert2";
import logo from "../../../assets/logo.png";

/** YYYY-MM-DD -> DD-MM-YYYY (matches the blank slip's "___-___-___" date cell). */
function formatDateDash(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${day}-${m}-${y}`;
}

/**
 * Printable, mostly-blank Sales Receipt slip — opened from the Pending Payment Invoices "View"
 * action. Laid out to match CorporateInvoicePreview.jsx's Credit/Debit Note format (same header
 * structure, fonts, and border/table styling) so every printable document in the app reads as
 * one consistent system. Since the invoice hasn't been paid yet, only what's already known about
 * it (purchaser details, and this invoice as the first Inv/Debit Note row) is pre-filled; Receipt
 * No, Pay Mode, Bank, Allocated Amount, Remarks and the Created/Approved By lines stay blank for
 * manual entry — matching the physical receipt-book slip this mirrors.
 */
export default function CorporateSalesReceiptView() {
    const navigate = useNavigate();
    const location = useLocation();
    const printRef = useRef(null);

    const { invoice = null } = location.state || {};

    useEffect(() => {
        if (!invoice || !invoice.invoice_id) {
            Swal.fire({
                icon: "warning",
                title: "Invalid Access",
                text: "Please open this from the Pending Payment Invoices list.",
                confirmButtonColor: "#1470F9",
            });
            navigate("/salesCorporate/corporate/receive-payment");
        }
    }, [invoice, navigate]);

    const handlePrint = useReactToPrint({ contentRef: printRef });

    // Filled in on-screen by whoever is collecting the payment — kept as plain text so the
    // typed values still print (no borders/placeholders) instead of just being blank cells.
    const [receiptType, setReceiptType] = useState("");
    const [collector, setCollector] = useState("");
    const [payMode, setPayMode] = useState("");
    const [bank, setBank] = useState("");

    if (!invoice) return null;

    const invoiceDateForRow = formatDateDash(invoice.printed_at || invoice.invoicing_date || invoice.date);

    return (
        <div className="flex flex-col gap-y-5">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft
                    className="size-6 text-primary cursor-pointer"
                    onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                />
                <h1 className="text-3xl text-primary font-bold">
                    Customer Payments / Sales Receipt
                </h1>
            </div>
            <p className="text-xl text-black/50">
                Blank sales receipt slip for {invoice.invoice_id} — print and fill in by hand once payment is collected.
            </p>

            <div
                ref={printRef}
                className="sales-receipt-print-root bg-white rounded-[10px] border border-[#e5e7ef] shadow-[0_2px_20px_rgba(0,0,0,0.03)] px-5 pt-4 pb-5 text-black text-[12px] leading-snug font-sans print:shadow-none print:border-0 print:p-0"
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
                    `}
                </style>
                {/* Printed Date / Time — filled with the actual print moment, plus the ORIGINAL copy watermark */}
                <div className="flex flex-col items-end text-right text-[11px]">
                    <p>
                        <span className="font-bold">Printed Date :</span> {new Date().toLocaleDateString()}
                        <span className="font-bold ml-4">Time :</span> {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-gray-400 font-semibold uppercase tracking-widest text-sm mt-1">ORIGINAL</p>
                </div>

                {/* Company header + Sales Receipt title box */}
                <div className="flex flex-row justify-between items-start mt-1 gap-x-6">
                    <img src={logo} alt="Sparkle Laundry" className="w-32 object-contain shrink-0" />
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
                    <div className="border border-black shrink-0 w-[230px]">
                        <div className="text-center py-3">
                            <p className="text-xl font-bold tracking-wide">SALES RECEIPT</p>
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
                                    <td className="border-r border-black py-1.5">S-RCPT-________</td>
                                    <td className="py-1.5">___-___-___</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Customer block */}
                <div className="mt-6 text-[12px]">
                    <p className="font-bold">CUSTOMER NAME</p>
                    <p className="text-blue-600 font-semibold">{invoice.company_name || "—"}</p>
                    <p className="border-b border-black mt-1 pb-1">&nbsp;</p>
                    <p className="text-blue-600 font-semibold mt-1">CUSTOMER ID</p>
                    <p className="border-b border-black mt-1 pb-1">{invoice.customer_id || " "}</p>
                </div>

                {/* Receipt Type / Collector / Pay Mode / Bank — editable, filled in before printing */}
                <div className="mt-4">
                    <table className="border border-black/20 border-collapse w-full text-xs text-black">
                        <thead>
                            <tr className="border-b border-black/20">
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black w-1/4">Receipt Type</th>
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black w-1/4">Collector</th>
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black w-1/4">Pay Mode</th>
                                <th className="p-2 text-left font-bold bg-white text-black w-1/4">Bank</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border-r border-black/20 p-1 h-8">
                                    <input
                                        type="text"
                                        value={receiptType}
                                        onChange={(e) => setReceiptType(e.target.value)}
                                        className="w-full h-full px-1 bg-transparent border-0 outline-none text-black text-xs"
                                    />
                                </td>
                                <td className="border-r border-black/20 p-1 h-8">
                                    <input
                                        type="text"
                                        value={collector}
                                        onChange={(e) => setCollector(e.target.value)}
                                        className="w-full h-full px-1 bg-transparent border-0 outline-none text-black text-xs"
                                    />
                                </td>
                                <td className="border-r border-black/20 p-1 h-8">
                                    <input
                                        type="text"
                                        value={payMode}
                                        onChange={(e) => setPayMode(e.target.value)}
                                        className="w-full h-full px-1 bg-transparent border-0 outline-none text-black text-xs"
                                    />
                                </td>
                                <td className="p-1 h-8">
                                    <input
                                        type="text"
                                        value={bank}
                                        onChange={(e) => setBank(e.target.value)}
                                        className="w-full h-full px-1 bg-transparent border-0 outline-none text-black text-xs"
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Invoice / Debit Note allocation table — this invoice pre-filled on row 1 */}
                <div className="mt-3">
                    <table className="border border-black/20 border-collapse w-full text-xs text-black">
                        <thead>
                            <tr className="border-b border-black/20">
                                <th className="border-r border-black/20 p-2 text-center font-bold bg-white text-black w-12">No</th>
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black">Inv / Debit Note No</th>
                                <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black">Inv / Debit Note Date</th>
                                <th className="p-2 text-right font-bold bg-white text-black">Allocated Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map((rowNo) => (
                                <tr key={rowNo} className="border-b border-black/20 last:border-b-0">
                                    <td className="border-r border-black/20 p-2 h-8 text-center">{rowNo}</td>
                                    <td className="border-r border-black/20 p-2 h-8 text-left font-semibold">
                                        {rowNo === 1 ? invoice.invoice_id : " "}
                                    </td>
                                    <td className="border-r border-black/20 p-2 h-8 text-left">
                                        {rowNo === 1 ? (invoiceDateForRow || " ") : " "}
                                    </td>
                                    <td className="p-2 h-8 text-right">&nbsp;</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals — left blank for manual entry, matching the physical slip */}
                <div className="mt-3 border border-black/20 text-[9px] font-normal text-black bg-white divide-y divide-black/20 rounded-sm">
                    <div className="px-2 py-1 flex justify-between">
                        <span>Allocated Total &nbsp; LKR</span>
                        <span>&nbsp;</span>
                    </div>
                    <div className="px-2 py-1 flex justify-between">
                        <span>Unsettled Amount &nbsp; LKR</span>
                        <span>-</span>
                    </div>
                </div>

                {/* Remarks */}
                <div className="border border-black/20 mt-1.5 text-[9px] font-normal text-black bg-white px-2 py-1 rounded-sm">
                    <p className="font-bold mb-1">Remarks</p>
                    <div className="h-14"></div>
                </div>

                {/* Sign-off */}
                <div className="border-t-2 border-[#002A74] w-full mt-4" />
                <div className="grid grid-cols-2 gap-x-4 w-full mt-3 mb-1 text-center text-black">
                    <div className="flex flex-col items-center w-full">
                        <span className="text-[9px] text-neutral-900 leading-tight min-h-[14px]">&nbsp;</span>
                        <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5" style={{ marginTop: "36px" }} />
                        <span className="text-[9px] text-neutral-900 font-normal">Created By</span>
                    </div>
                    <div className="flex flex-col items-center w-full">
                        <span className="text-[9px] text-neutral-900 leading-tight min-h-[14px]">&nbsp;</span>
                        <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mb-1.5" style={{ marginTop: "36px" }} />
                        <span className="text-[9px] text-neutral-900 font-normal">Approved By</span>
                    </div>
                </div>

                <p className="text-center italic text-[9px] mt-2">
                    "THIS IS SYSTEM GENERATED DOCUMENT, HENCE NO MANUAL SIGNATURE REQUIRED"
                </p>
            </div>

            <div className="flex flex-row justify-center gap-x-4 my-4 print:hidden">
                <button
                    type="button"
                    className="font-semibold text-primary bg-white border border-primary rounded-full py-2.5 px-16 cursor-pointer hover:bg-primary/5 transition-all"
                    onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                >
                    Back
                </button>
                <button
                    type="button"
                    className="font-semibold text-white bg-primary rounded-full py-2.5 px-16 cursor-pointer hover:bg-blue-600 transition-all"
                    onClick={handlePrint}
                >
                    Print
                </button>
            </div>
        </div>
    );
}
