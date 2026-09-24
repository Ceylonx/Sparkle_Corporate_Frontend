import { MdSearch } from "react-icons/md";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link } from "react-router-dom";
import {
    getAllCorporateDailyInvoicingCustomers,
    getAllCorporatePeriodInvoicingCustomers,
    pickTaxInvoicePreviewApprovalRaw,
} from "../../services/corporate/CorporateInvoicingServices";
import { BeatLoader } from "react-spinners";

const MONTHS = [
    { value: "",   label: "Month" },
    { value: "1",  label: "January" },
    { value: "2",  label: "February" },
    { value: "3",  label: "March" },
    { value: "4",  label: "April" },
    { value: "5",  label: "May" },
    { value: "6",  label: "June" },
    { value: "7",  label: "July" },
    { value: "8",  label: "August" },
    { value: "9",  label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
];

const ITEMS_PER_PAGE = 15;

/** Merge axios `data` with nested `data` (common API shape). Top-level keys win so nested blobs cannot override fresh lists/fields. */
function mergeInvoicingCustomersPayload(response) {
    const d = response?.data;
    if (!d || typeof d !== "object") return {};
    if (d.data != null && typeof d.data === "object" && !Array.isArray(d.data)) {
        return { ...d.data, ...d };
    }
    return d;
}

function pickTotalCount(bag, rows) {
    const candidates = [
        bag?.total_count,
        bag?.total_customers_count,
        bag?.total_customer_count,
        bag?.total_invoicing_customers_count,
        bag?.count,
    ];
    for (const candidate of candidates) {
        const total = Number(candidate);
        if (Number.isFinite(total)) return total;
    }
    return rows.length;
}

function getMonthDateRange(month) {
    if (!month) return { start_date: "", end_date: "" };
    const year = new Date().getFullYear();
    const monthNumber = Number(month);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const paddedMonth = String(monthNumber).padStart(2, "0");
    return {
        start_date: `${year}-${paddedMonth}-01`,
        end_date: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
    };
}

/** Tax preview badge only — do not prefer pickup/order `approval_status` first (see `pickTaxInvoicePreviewApprovalRaw` doc). */
function previewApprovalFromRow(row) {
    if (!row || typeof row !== "object") return "Created";
    const fromPreview = pickTaxInvoicePreviewApprovalRaw(row);
    if (fromPreview != null && String(fromPreview).trim() !== "") return String(fromPreview).trim();
    const taxAdjacent = [row.invoice_approval_status, row.invoice_tax_approval_status, row.tax_invoice_preview_approval_status];
    for (const c of taxAdjacent) {
        if (c != null && String(c).trim() !== "") return String(c).trim();
    }
    // Do not use generic approval_status / approvalStatus — pickup/order workflow, not tax preview.
    const lastResort = [row.preview_approval_status, row.previewApprovalStatus];
    for (const c of lastResort) {
        if (c != null && String(c).trim() !== "") return String(c).trim();
    }
    return "Created";
}

const normalizeLatestInvoiceStatus = (row) => {
    const raw =
        row.latest_invoice_status ??
        row.invoice_status ??
        row.latest_order_status ??
        "";
    if (raw === "Pending") return "Pending";
    if (raw === "Generated") return "Generated";
    if (raw === "No Invoice" || raw === "N/A" || raw === "No Any Invoice") return "No Invoice";
    return "Generated";
};

/** Preview workflow badge: Created (amber) / Checked (blue) / Approved (green) — matches `preview_approval_status` from API */
const PreviewApprovalStatusBadge = ({ status }) => {
    const base =
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap";
    const s = String(status ?? "")
        .trim()
        .toLowerCase();
    if (s === "approved") {
        return <span className={`${base} border-green-200 bg-green-50 text-green-700`}>Approved</span>;
    }
    if (s === "checked") {
        return <span className={`${base} border-blue-200 bg-blue-50 text-blue-700`}>Checked</span>;
    }
    return <span className={`${base} border-amber-200 bg-amber-50 text-amber-800`}>Created</span>;
};

/** Ant Design–style tags (project does not include antd). */
const LatestInvoiceBadge = ({ status }) => {
    const base =
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap";
    if (status === "Pending") {
        return (
            <span className={`${base} border-red-200 bg-red-50 text-red-600`}>Pending</span>
        );
    }
    if (status === "No Invoice") {
        return (
            <span className={`${base} border-gray-200 bg-gray-50 text-gray-600`}>No Invoice</span>
        );
    }
    return (
        <span className={`${base} border-green-200 bg-green-50 text-green-700`}>Generated</span>
    );
};

const SalesCorporateInvoicing = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTab, setSelectedTab] = useState(1);
    const [dailyInvoiceData, setDailyInvoiceData] = useState([]);
    const [periodInvoiceData, setPeriodInvoiceData] = useState([]);
    const [dailyTotalCount, setDailyTotalCount] = useState(0);
    const [periodTotalCount, setPeriodTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    // Tab 1 filter: Date range
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    // Tab 2 filter: Month dropdown
    const [selectedMonth, setSelectedMonth] = useState("");
    // Status filter — frontend-only, applied to whichever page of rows is already loaded
    // (does not re-query the backend, so it narrows what's currently fetched, not the full dataset).
    const [selectedStatus, setSelectedStatus] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    const normalizeCustomerRows = (rows) => rows.map((row) => ({
        customer_id: row.customer_id,
        company_name: row.customer_company_name,
        customer_name: row.customer_name || row.customer_contact_person || row.customer_id,
        phone_number: row.customer_phone || row.phone_number,
        address: row.customer_address || row.address,
        total_orders: row.total_orders ?? row.total_pickup_entries ?? row.pickup_entries ?? 0,
        total_categories: row.total_categories ?? row.total_pickup_categories ?? row.total_pickup_entries_categories ?? 0,
        completed_orders: row.completed_orders ?? row.total_completed_pickup_entries ?? row.total_completed ?? 0,
        completed_categories: row.total_completed_categories ?? row.total_completed_pickup_categories ?? row.total_completed_pickup_entries_categories ?? 0,
        pending_orders: row.pending_orders ?? row.total_pending_pickup_entries ?? row.total_pending ?? 0,
        pending_categories: row.total_pending_categories ?? row.total_pending_pickup_categories ?? row.total_pending_pickup_entries_categories ?? 0,
        latest_invoice_status: normalizeLatestInvoiceStatus(row),
        preview_approval_status: previewApprovalFromRow(row),
        invoice_approval_status: row.invoice_approval_status,
        created: row.customer_created_at,
        invoice_type: row.customer_invoice_type,
        customer_invoicing_period: row.customer_invoicing_period,
        customer_payment_period: row.customer_payment_period,
    }));

    const fetchAllDailyInvoicingCustomers = async () => {
        try {
            setIsLoading(true);
            const response = await getAllCorporateDailyInvoicingCustomers(localStorage.getItem("userId"), {
                limit: ITEMS_PER_PAGE,
                offset: (currentPage - 1) * ITEMS_PER_PAGE,
                search: debouncedSearchQuery.trim(),
                start_date: startDate,
                end_date: endDate,
            });
            const bag = mergeInvoicingCustomersPayload(response);
            const rows = bag?.in_invoicing_customers_daily_invoicing ?? [];
            setDailyInvoiceData(normalizeCustomerRows(rows));
            setDailyTotalCount(pickTotalCount(bag, rows));
        } catch (error) {
            console.error("Error fetching daily invoicing customers", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAllPeriodInvoicingCustomers = async () => {
        try {
            setIsLoading(true);
            const monthRange = getMonthDateRange(selectedMonth);
            const response = await getAllCorporatePeriodInvoicingCustomers(localStorage.getItem("userId"), {
                limit: ITEMS_PER_PAGE,
                offset: (currentPage - 1) * ITEMS_PER_PAGE,
                search: debouncedSearchQuery.trim(),
                start_date: monthRange.start_date,
                end_date: monthRange.end_date,
            });
            const bag = mergeInvoicingCustomersPayload(response);
            const rows = bag?.in_invoicing_customers_period_invoicing ?? [];
            setPeriodInvoiceData(normalizeCustomerRows(rows));
            setPeriodTotalCount(pickTotalCount(bag, rows));
        } catch (error) {
            console.error("Error fetching period invoicing customers", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
            setCurrentPage(1);
        }, 350);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedTab, startDate, endDate, selectedMonth]);

    useEffect(() => {
        if (selectedTab === 1) {
            fetchAllDailyInvoicingCustomers();
        } else {
            fetchAllPeriodInvoicingCustomers();
        }
    }, [selectedTab, currentPage, debouncedSearchQuery, startDate, endDate, selectedMonth]);

    const invoiceData = selectedTab === 1 ? dailyInvoiceData : periodInvoiceData;
    const totalCount = selectedTab === 1 ? dailyTotalCount : periodTotalCount;
    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const indexOfFirstItem = (currentPage - 1) * ITEMS_PER_PAGE;
    const indexOfLastItem = indexOfFirstItem + invoiceData.length;
    // Status filter only narrows the page of rows already fetched — it doesn't re-query the backend.
    const currentInvoices = selectedStatus
        ? invoiceData.filter((invoice) => invoice.latest_invoice_status === selectedStatus)
        : invoiceData;
    const blankRows = ITEMS_PER_PAGE - currentInvoices.length;

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header */}
            <div className="flex flex-col">
                <h1 className="text-4xl font-bold text-primary">Invoicing</h1>
                <p className="text-2xl text-black/50">Record new laundry pickup with item counts by category.</p>
            </div>

            {/* Tabs */}
            <div className="flex flex-row gap-x-8 border-b border-gray-300 text-xl">
                <button
                    type="button"
                    className={`pb-2 font-semibold cursor-pointer transition-colors ${selectedTab === 1 ? "border-b-2 border-black text-black" : "text-black/40 hover:text-black"}`}
                    onClick={() => { setSelectedTab(1); setCurrentPage(1); }}
                >
                    Daily Invoicing Customers
                </button>
                <button
                    type="button"
                    className={`pb-2 font-semibold cursor-pointer transition-colors ${selectedTab === 2 ? "border-b-2 border-black text-black" : "text-black/40 hover:text-black"}`}
                    onClick={() => { setSelectedTab(2); setCurrentPage(1); }}
                >
                    Period Invoicing Customers
                </button>
            </div>

            {/* Filters — different per tab */}
            <div className="flex flex-row gap-x-3">
                {/* Search — always shown */}
                <div className="flex flex-row border border-gray-300 rounded-full h-fit w-1/2 bg-white items-center px-4 py-1.5 gap-x-2">
                    <MdSearch className="size-5 text-gray-400" />
                    <input
                        className="grow text-base focus:outline-none bg-transparent"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                    />
                </div>

                {/* Tab 1: Date range filter — commented out for now
                {selectedTab === 1 && (
                    <div className="flex flex-row items-center gap-x-3">
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-1 bg-white text-base">
                            <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-1 bg-white text-base">
                            <span className="text-black/50 font-semibold mr-2">End Date:</span>
                            <input
                                type="date"
                                className="focus:outline-none text-black/70 font-medium cursor-pointer"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        {(startDate || endDate) && (
                            <button
                                type="button"
                                onClick={() => { setStartDate(""); setEndDate(""); }}
                                className="flex flex-row items-center gap-x-1 text-sm text-red-500 font-semibold cursor-pointer hover:underline"
                            >
                                <Icon icon="material-symbols:close-rounded" className="size-4" />
                                Clear
                            </button>
                        )}
                    </div>
                )}
                */}

                {/* Tab 2: Month dropdown — commented out for now
                {selectedTab === 2 && (
                    <div className="relative">
                        <select
                            value={selectedMonth}
                            onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                            className="appearance-none bg-white border border-gray-300 rounded-full px-5 py-1.5 pr-9 text-base font-medium focus:outline-none cursor-pointer"
                        >
                            {MONTHS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <Icon icon="mdi:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                )}
                */}

                {/* Status filter — frontend-only, shared by both tabs */}
                <div className="relative">
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="appearance-none bg-white border border-gray-300 rounded-full px-5 py-1.5 pr-9 text-base font-medium focus:outline-none cursor-pointer"
                    >
                        <option value="">Status</option>
                        <option value="Generated">Generated</option>
                        <option value="Pending">Pending</option>
                    </select>
                    <Icon icon="mdi:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            ) : (
                <div className="rounded-xl bg-white overflow-hidden border border-gray-200">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-x-3 text-white bg-primary font-semibold py-2.5 px-3 text-lg">
                        <p className="col-span-1"></p>
                        <p className="col-span-2">CUSTOMER</p>
                        <p className="col-span-2">CONTACT DETAILS</p>
                        <p className="col-span-1">NO OF ORDERS</p>
                        <p className="col-span-2">COMPLETED ORDERS</p>
                        <p className="col-span-2">PENDING ORDERS</p>
                        <p className="col-span-1">LATEST INVOICE</p>
                        <p className="col-span-1 text-center">ACTION</p>
                    </div>

                    {currentInvoices.map((invoice, index) => (
                        <div
                            key={String(invoice.customer_id ?? index)}
                            className={`grid grid-cols-12 gap-x-3 text-lg py-2.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center`}
                        >
                            {/* Icon */}
                            <div className="col-span-1 flex justify-center">
                                <Icon icon="lucide:user" className="text-primary bg-primary/20 rounded-full size-7 p-1" />
                            </div>

                            {/* Customer */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium">{invoice.company_name}</p>
                                <p className="text-base text-black/50">{invoice.customer_name}</p>
                            </div>

                            {/* Contact Details */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium">{invoice.phone_number}</p>
                                <p className="text-base text-black/50">{invoice.address}</p>
                            </div>

                            {/* No of Orders */}
                            <div className="col-span-1 flex flex-col">
                                <p className="font-medium">{invoice.total_orders}</p>
                                {selectedTab === 1 && invoice.total_categories > 0 && (
                                    <p className="text-base text-black/50">{invoice.total_categories} Categories</p>
                                )}
                            </div>

                            {/* Completed Orders */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium">{invoice.completed_orders}</p>
                                {selectedTab === 1 && invoice.completed_categories > 0 && (
                                    <p className="text-base text-black/50">{invoice.completed_categories} Categories</p>
                                )}
                            </div>

                            {/* Pending Orders */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium">{invoice.pending_orders}</p>
                                {selectedTab === 1 && invoice.pending_categories > 0 && (
                                    <p className="text-base text-black/50">{invoice.pending_categories} Categories</p>
                                )}
                            </div>

                            {/* Latest Invoice Badge */}
                            <div className="col-span-1">
                                <LatestInvoiceBadge status={invoice.latest_invoice_status} />
                            </div>

                            {/* Action */}
                            <div className="col-span-1 flex flex-row items-center justify-center gap-x-4">
                                {/* View — always shown */}
                                <Link
                                    to={selectedTab === 1 ? `daily/${invoice.customer_id}` : `period/${invoice.customer_id}`}
                                    className="flex flex-col items-center cursor-pointer"
                                >
                                    <Icon icon="mdi:eye" className="text-blue-500 text-2xl" />
                                    <p className="text-base text-black/60">View</p>
                                </Link>

                                {/* <div className="h-8 w-px bg-gray-400"></div> */}

                                {/* Invoicing — when Pending */}
                                {/* {invoice.latest_invoice_status === "Pending" && (
                                    <Link
                                        to={selectedTab === 1 ? `generate/daily/${invoice.customer_id}` : `generate/period/${invoice.customer_id}`}
                                        state={{ customerData: invoice }}
                                        className="flex flex-col items-center cursor-pointer"
                                    >
                                        <Icon icon="mdi:invoice-text-send" className="text-green-500 text-2xl" />
                                        <p className="text-xs text-black/60">Invoicing</p>
                                    </Link>
                                )} */}

                            </div>
                        </div>
                    ))}

                    {/* Blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`h-10 ${(currentInvoices.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/5"}`}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-sm text-black/50">
                    Show {totalCount === 0 ? 0 : indexOfFirstItem + 1} to {Math.min(indexOfLastItem, totalCount)} of {totalCount} entries
                </p>

                <div className="flex justify-end gap-2 flex-wrap">
                    <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 text-sm font-medium cursor-pointer"
                    >
                        Previous
                    </button>

                    {(() => {
                        const pageWindow = 5;
                        const half = Math.floor(pageWindow / 2);
                        let start = Math.max(currentPage - half, 1);
                        let end = Math.min(start + pageWindow - 1, totalPages);
                        if (end - start < pageWindow - 1) start = Math.max(end - pageWindow + 1, 1);

                        return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(i => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer border ${i === currentPage ? "bg-primary text-white border-primary" : "bg-white text-black/60 border-gray-200"}`}
                            >
                                {i}
                            </button>
                        ));
                    })()}

                    <button
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 text-sm font-medium cursor-pointer"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalesCorporateInvoicing;
