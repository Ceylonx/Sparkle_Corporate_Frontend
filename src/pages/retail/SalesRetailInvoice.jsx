import { BiPlus } from "react-icons/bi";
import { applyDiscountToAmount } from "../../utils/discount";
import DetailsCard from "../../components/ui/DetailsCard";
import { MdSearch } from "react-icons/md";
import { useEffect, useState, useRef } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link, useNavigate } from "react-router-dom";
import Select from "react-select";
import { useReactToPrint } from "react-to-print";
import { getAllRetailInvoices, getAllRetailPendingInvoices, getPendingInvoiceOrdersAllBranches, INVOICED_ORDERS_PAGE_SIZE, updateInvoiceDate } from "../../services/Retail/RetailInvoiceServices";
import { getAllCustomers } from "../../services/CustomerServices";
import { BeatLoader } from "react-spinners";
import RetailViewInvoices from "../../components/dialogs/retail/RetailViewInvoices";
import { getRetailDashboardExpressOrders, getRetailDashboardReadyForPickupOrders, getRetailDashboardReleaseTodayOrders, getRetailDashboardTotalOrders } from "../../services/Retail/RetailDashboardServices";
import { getAllRetailVouchers, updateRetailVoucher, changeRetailVoucherStatus } from "../../services/Retail/RetailVoucherServices";
import RetailActivateVoucherDialog from "../../components/dialogs/retail/RetailActivateVoucherDialog";
import Swal from "sweetalert2";
import { getAllBranches, getRetailOrderById } from "../../services/Retail/RetailOrderServices";
import logo from "../../assets/logo.png";
import {
    hasSalesRetailInvoiceAlreadyInvoicedListEditAction,
    hasSalesRetailInvoicePendingListEditAction,
    hasSalesRetailSellVouchersView,
    hasSalesRetailSellVouchersCreate,
    hasSalesRetailSoldVouchersView,
    hasSalesRetailSoldVouchersEdit,
    isRetailViewOnlyForPrefix,
    parsePermissionTokens,
} from "../../utils/retailSubTabPermissions";
import { hasPermission, isSuperadminRole } from "../../utils/permissionHelper";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { isDateRangeFilterActive, isDateWithinRange } from "../../utils/dateRange";

function getOrderTotalAdvanced(order, useSumLikeBill = false) {
    if (!order) return 0;
    const parseAmt = (v) => {
        if (v == null || v === "") return 0;
        if (typeof v === "number" && !isNaN(v)) return v;
        const n = parseFloat(String(v).replace(/,/g, ""));
        return isNaN(n) ? 0 : n;
    };
    let paymentList = order.payment;
    if (typeof paymentList === "string") {
        try {
            paymentList = JSON.parse(paymentList);
        } catch {
            paymentList = null;
        }
    }
    let fromPayment = 0;
    if (paymentList && Array.isArray(paymentList) && paymentList.length > 0) {
        fromPayment = paymentList.reduce(
            (sum, p) => sum + parseAmt(p.paid_amount ?? p.paidAmount ?? 0),
            0
        );
    }
    const fromAdvance = parseAmt(order.advance_payment ?? order.advancePayment ?? order.advanced_payment ?? 0);
    if (useSumLikeBill) {
        return fromAdvance + fromPayment;
    }
    return Math.max(fromPayment, fromAdvance) || fromAdvance || fromPayment;
}

/** Bill total (numeric) — same basis as the TOTAL AMOUNT column in invoice tables. */
function getOrderBillTotalNumeric(order) {
    if (!order) return 0;
    const rawTotal = (order.total_amount != null && order.total_amount !== "" && !isNaN(Number(order.total_amount)))
        ? (Number(order.total_amount) || 0) + (Number(order.delivery_charge) || 0)
        : (order.items || []).reduce((s, item) => {
            const price = Number(item.price) || 0;
            const quantity = Number(item.quantity) || 1;
            return s + price * quantity;
        }, 0) + (Number(order.delivery_charge) || 0);
    // order.remaining_amount (used by getOrderRemainingBalanceNumeric) is already discount-adjusted
    // from order entry, so this must apply the same discount to stay on the same basis — otherwise
    // "paid = billTotal - remaining" comes out to the discount amount itself on an unpaid order.
    return applyDiscountToAmount(rawTotal, order.discount);
}

/** Balance still due (numeric) — same basis as previous pending-tab cell. */
function getOrderRemainingBalanceNumeric(order) {
    if (!order) return null;
    if (order.remaining_amount != null && order.remaining_amount !== "" && !isNaN(Number(order.remaining_amount))) {
        return Number(order.remaining_amount);
    }
    if (order.total_amount != null && order.advance_payment != null) {
        return (Number(order.total_amount) || 0) - (Number(order.advance_payment) || 0);
    }
    return null;
}

const SalesRetailInvoice = () => {
    const navigate = useNavigate();
    const userRole = localStorage.getItem("role") || "";
    const isSuperadmin = isSuperadminRole(userRole);
    const [invoiceListRowEditFlags, setInvoiceListRowEditFlags] = useState(() => {
        const raw = localStorage.getItem("permissions") || "";
        return {
            pending: hasSalesRetailInvoicePendingListEditAction(raw),
            alreadyInvoiced: hasSalesRetailInvoiceAlreadyInvoicedListEditAction(raw),
        };
    });
    const [voucherTabFlags, setVoucherTabFlags] = useState(() => {
        const raw = localStorage.getItem("permissions") || "";
        return {
            canViewSellVouchers: hasSalesRetailSellVouchersView(raw),
            canCreateSellVouchers: hasSalesRetailSellVouchersCreate(raw),
            canViewSoldVouchers: hasSalesRetailSoldVouchersView(raw),
            canEditSoldVouchers: hasSalesRetailSoldVouchersEdit(raw),
        };
    });

    useEffect(() => {
        const sync = () => {
            const raw = localStorage.getItem("permissions") || "";
            setInvoiceListRowEditFlags({
                pending: hasSalesRetailInvoicePendingListEditAction(raw),
                alreadyInvoiced: hasSalesRetailInvoiceAlreadyInvoicedListEditAction(raw),
            });
            setVoucherTabFlags({
                canViewSellVouchers: hasSalesRetailSellVouchersView(raw),
                canCreateSellVouchers: hasSalesRetailSellVouchersCreate(raw),
                canViewSoldVouchers: hasSalesRetailSoldVouchersView(raw),
                canEditSoldVouchers: hasSalesRetailSoldVouchersEdit(raw),
            });
        };
        sync();
        const onStorage = (e) => {
            if (e.key === "permissions" || e.key == null) sync();
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", sync);
        window.addEventListener("sparkle-permissions-changed", sync);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("focus", sync);
            window.removeEventListener("sparkle-permissions-changed", sync);
        };
    }, [isSuperadmin]);

    const [branchFilter, setBranchFilter] = useState(localStorage.getItem("selectedBranchId") || "");

    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
    const [selectedTab, setSelectedTab] = useState(1);

    const invoicePermissionTokens = parsePermissionTokens(localStorage.getItem("permissions") || "");
    /**
     * A role that can only View the current tab (no Create/Edit/Approve of its own) is locked to
     * the branch it started its day with — it shouldn't be able to browse other branches' orders
     * through the filter.
     */
    const isBranchViewOnly =
        selectedTab === 1
            ? isRetailViewOnlyForPrefix(invoicePermissionTokens, "SalesRetail_Invoice_Pending_Invoiced_Order_")
            : selectedTab === 2
                ? isRetailViewOnlyForPrefix(invoicePermissionTokens, "SalesRetail_Invoice_Already_invoiced_Order_")
                : false;

    /** Row Edit on tabs 1–2: exact sub-row edit tokens only (no superadmin bypass). */
    const invoiceRowEditAllowed =
        (selectedTab === 1 && invoiceListRowEditFlags.pending) ||
        (selectedTab === 2 && invoiceListRowEditFlags.alreadyInvoiced);
    const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("");
    const [invoices, setInvoices] = useState([]);
    const [alreadyInvoiced, setAlreadyInvoiced] = useState([]);
    const [showViewInvoicesDialog, setShowViewInvoicesDialog] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [selectedOrderForView, setSelectedOrderForView] = useState(null);
    const [totalOrders, setTotalOrders] = useState(null);
    const [readyForPickupOrders, setReadyForPickupOrders] = useState(null);
    const [releaseTodayOrders, setReleaseTodayOrders] = useState(null);
    const [expressOrders, setExpressOrders] = useState(null);
    const [selectMultiple, setSelectMulitple] = useState(false);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const isTodaySelected = isDateRangeFilterActive(startDate, endDate);
    const [vouchers, setVouchers] = useState([]);
    const [searchQueryVoucher, setSearchQueryVoucher] = useState("");
    const [showActivateVoucherDialog, setShowActivateVoucherDialog] = useState(false);
    const [selectedVoucher, setSelectedVoucher] = useState(null);
    const [isLoadingVouchers, setIsLoadingVouchers] = useState(false);
    const [branches, setBranches] = useState([]);
    const [searchQuerySoldVouchers, setSearchQuerySoldVouchers] = useState("");
    const [soldVouchersStartDate, setSoldVouchersStartDate] = useState("");
    const [soldVouchersEndDate, setSoldVouchersEndDate] = useState("");
    const isSoldVouchersTodaySelected = isDateRangeFilterActive(soldVouchersStartDate, soldVouchersEndDate);
    const [soldVouchersCurrentPage, setSoldVouchersCurrentPage] = useState(1);
    const [soldVouchersAmountFilter, setSoldVouchersAmountFilter] = useState("all");
    const soldVouchersItemsPerPage = 10;
    const [voucherSellCustomers, setVoucherSellCustomers] = useState([]);
    const [voucherSellCustomer, setVoucherSellCustomer] = useState(null);
    const [voucherSellIssuedDate, setVoucherSellIssuedDate] = useState("");
    const [vouchersAddedToSell, setVouchersAddedToSell] = useState([]);
    const [voucherAddCodeInput, setVoucherAddCodeInput] = useState("");
    const [voucherSellPaymentMethod, setVoucherSellPaymentMethod] = useState("Card");
    const [voucherSellCardAmount, setVoucherSellCardAmount] = useState("");
    const [voucherSellCardType, setVoucherSellCardType] = useState("Credit");
    const [voucherSellBank, setVoucherSellBank] = useState("");
    const [voucherSellNotes, setVoucherSellNotes] = useState("");
    const [voucherSellTerms, setVoucherSellTerms] = useState("");
    const [voucherInvoiceNo, setVoucherInvoiceNo] = useState("INV-VOU-001");
    const voucherInvoicePrintRef = useRef(null);
    // Pagination state for invoice tabs
    const [pendingInvoicesOffset, setPendingInvoicesOffset] = useState(0);
    const [pendingInvoicesHasMore, setPendingInvoicesHasMore] = useState(false);
    const [pendingInvoicesLoadingMore, setPendingInvoicesLoadingMore] = useState(false);
    const [allBranchesPendingFullList, setAllBranchesPendingFullList] = useState([]);
    const [pendingAllBranchesDisplayCount, setPendingAllBranchesDisplayCount] = useState(15);
    const [totalOrdersCount, setTotalOrdersCount] = useState(null);
    const [loadedPagesCount, setLoadedPagesCount] = useState(0);
    const [totalAlreadyInvoicedCount, setTotalAlreadyInvoicedCount] = useState(null);
    const [loadedAlreadyInvoicedPagesCount, setLoadedAlreadyInvoicedPagesCount] = useState(0);
    const [alreadyInvoicedOffset, setAlreadyInvoicedOffset] = useState(0);
    const [alreadyInvoicedHasMore, setAlreadyInvoicedHasMore] = useState(false);
    const [alreadyInvoicedLoadingMore, setAlreadyInvoicedLoadingMore] = useState(false);
    // API search (search any order, not only loaded)
    const [searchResults, setSearchResults] = useState([]);
    const [searchResultsOffset, setSearchResultsOffset] = useState(0);
    const [searchResultsHasMore, setSearchResultsHasMore] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchResultsLoadingMore, setSearchResultsLoadingMore] = useState(false);
    const fetchedMoreOnPage3Ref = useRef(false);
    const lastStableTotalPagesRef = useRef(1);
    const lastStableWindowRef = useRef({ start: 1, end: 5 });
    const lastPendingAllBranchesFetchRef = useRef({ page: 1, branch: null });
    const lastActiveTabLoadRef = useRef("");
    const lastInvoiceDateRangeRef = useRef({ startDate: "", endDate: "" });

    // Date change calendar state (superAdmin only)
    const [showDateChangeCalendar, setShowDateChangeCalendar] = useState(false);
    const [selectedOrderForDateChange, setSelectedOrderForDateChange] = useState(null);
    const [selectedNewDate, setSelectedNewDate] = useState("");
    const [isUpdatingDate, setIsUpdatingDate] = useState(false);

    const getBranchIdForFetch = () => {
        if (branchFilter != null && String(branchFilter).trim() !== "") return Number(branchFilter);
        return Number(localStorage.getItem("selectedBranchId")) || 1;
    };

    const getBranchIdsFromApi = async () => {
        const response = await getAllBranches();
        if (!response) return [];
        let data = [];
        if (Array.isArray(response)) data = response;
        else if (response.data && Array.isArray(response.data)) data = response.data;
        else if (response.branches && Array.isArray(response.branches)) data = response.branches;
        else if (response.results && Array.isArray(response.results)) data = response.results;
        else {
            for (const key of Object.keys(response)) {
                if (Array.isArray(response[key])) {
                    data = response[key];
                    break;
                }
            }
        }
        return (data || []).map((b) => b.branch_id ?? b.id).filter((id) => id != null && !Number.isNaN(Number(id))).map(Number);
    };

    const extractPendingOrders = (response) => {
        if (!response) {
            console.warn("extractPendingOrders: No response", response);
            return [];
        }

        console.log("extractPendingOrders: Full response:", response);
        console.log("extractPendingOrders: response.data:", response.data);

        // Try multiple possible response structures
        if (response.data) {
            // First try: pending_invoice_orders array
            if (Array.isArray(response.data.pending_invoice_orders)) {
                console.log("extractPendingOrders: Found pending_invoice_orders array, count:", response.data.pending_invoice_orders.length);
                return response.data.pending_invoice_orders;
            }
            // Second try: orders array
            if (Array.isArray(response.data.orders)) {
                console.log("extractPendingOrders: Found orders array, count:", response.data.orders.length);
                return response.data.orders;
            }
            // Third try: data is directly an array
            if (Array.isArray(response.data)) {
                console.log("extractPendingOrders: Found data array, count:", response.data.length);
                return response.data;
            }
            // Fourth try: pending_invoice_orders exists but might not be array
            if (response.data.pending_invoice_orders) {
                const fallback = Array.isArray(response.data.pending_invoice_orders)
                    ? response.data.pending_invoice_orders
                    : [];
                console.log("extractPendingOrders: Using pending_invoice_orders (non-array), count:", fallback.length);
                return fallback;
            }
            // Fifth try: check all keys in data for arrays
            for (const key in response.data) {
                if (Array.isArray(response.data[key])) {
                    console.log(`extractPendingOrders: Found array in response.data.${key}, count:`, response.data[key].length);
                    return response.data[key];
                }
            }
        }

        // Check if response itself is an array
        if (Array.isArray(response)) {
            console.log("extractPendingOrders: Response is array, count:", response.length);
            return response;
        }

        // Check if response has orders at root level
        if (Array.isArray(response.orders)) {
            console.log("extractPendingOrders: Found orders at root, count:", response.orders.length);
            return response.orders;
        }

        console.warn("extractPendingOrders: Could not extract orders from response structure");
        console.warn("extractPendingOrders: Response keys:", Object.keys(response || {}));
        console.warn("extractPendingOrders: Response.data keys:", response?.data ? Object.keys(response.data) : "no data");
        console.warn("extractPendingOrders: Full response structure:", JSON.stringify(response, null, 2));
        return [];
    };

    const fetchAllPendingInvoices = async (offset = null, append = false, branchIdOverride = null) => {
        console.log("fetchAllPendingInvoices: Called with offset:", offset, "append:", append, "branchIdOverride:", branchIdOverride);
        try {
            if (append) {
                setPendingInvoicesLoadingMore(true);
            } else {
                setIsLoading(true);
            }
            const userId = localStorage.getItem("userId");
            console.log("fetchAllPendingInvoices: userId:", userId);
            if (!userId) {
                setIsLoading(false);
                setPendingInvoicesLoadingMore(false);
                return;
            }

            const activeFilters = {
                searchText: submittedSearchQuery.trim(),
                from_date: startDate,
                to_date: endDate,
            };

            let allOrders = [];
            let count = 0;
            let currentLoadedPages = 0;
            // Use override when changing branch so we always fetch for the selected branch
            const effectiveBranchFilter = branchIdOverride !== null && branchIdOverride !== undefined
                ? branchIdOverride
                : branchFilter;
            // Treat empty, "null", or non-numeric values as "all branches"
            const parsedBranchFilterPending = Number(effectiveBranchFilter);
            const isAllBranches = !effectiveBranchFilter
                || String(effectiveBranchFilter).trim() === ""
                || String(effectiveBranchFilter).trim().toLowerCase() === "null"
                || isNaN(parsedBranchFilterPending);
            console.log("fetchAllPendingInvoices: effectiveBranchFilter:", effectiveBranchFilter, "isAllBranches:", isAllBranches);

            let allBranchesTotal = null;
            if (isAllBranches) {
                // All branches: clear table so we don't show previous page's orders while loading
                setInvoices([]);
                // All branches: do NOT send branch_id (including -1). Only call:
                // get-all-pending-invoice-orders-all-branches/{user_id}/{offset}
                const requestOffset = offset != null ? Number(offset) : 0;
                try {
                    const response = await getPendingInvoiceOrdersAllBranches(userId, requestOffset, activeFilters);
                    allOrders = extractPendingOrders(response || {});
                    allBranchesTotal = response?.data?.total_orders_count ?? null;
                    setTotalOrdersCount(allBranchesTotal);
                    count = allOrders.length;
                    setLoadedPagesCount(1);
                } catch (err) {
                    console.error("Error fetching pending invoice orders (all branches):", err);
                    allOrders = [];
                    count = 0;
                    setTotalOrdersCount(null);
                    setLoadedPagesCount(0);
                }
            } else {
                // Specific branch: call API with branch_id (use effectiveBranchFilter for correct branch when switching)
                const branchId = (!isNaN(parsedBranchFilterPending) && parsedBranchFilterPending)
                    ? parsedBranchFilterPending
                    : Number(localStorage.getItem("selectedBranchId")) || 1;
                currentLoadedPages = loadedPagesCount;

                if (!append) {
                    // Initial load: fetch offset 0 (first 15 orders)
                    const offset = 0;
                    console.log("fetchAllPendingInvoices: Fetching initial data for branchId:", branchId, "offset:", offset);
                    try {
                        const response = await getAllRetailPendingInvoices(userId, branchId, offset, activeFilters);
                        console.log("fetchAllPendingInvoices: API response received:", response);
                        allOrders = extractPendingOrders(response || {});
                        console.log("fetchAllPendingInvoices: Extracted orders count:", allOrders.length);
                        const totalCount = response?.data?.total_orders_count ?? null;
                        setTotalOrdersCount(totalCount);
                        currentLoadedPages = 1;
                        setLoadedPagesCount(1);
                        count = allOrders.length;
                        console.log("fetchAllPendingInvoices: Setting count to:", count);
                    } catch (err) {
                        console.error("Error fetching pending invoices:", err);
                        console.error("Error details:", err?.response?.data || err?.message);
                        allOrders = [];
                        count = 0;
                        setTotalOrdersCount(null);
                        currentLoadedPages = 0;
                        setLoadedPagesCount(0);
                    }
                } else {
                    // Append: load next page (offset increments by 15: 15, 30, 45...)
                    // loadedPagesCount starts at 1, so:
                    // - Page 2: loadedPagesCount = 1, offset = 1 * 15 = 15
                    // - Page 3: loadedPagesCount = 2, offset = 2 * 15 = 30
                    const nextOffset = loadedPagesCount * 15;
                    try {
                        const response = await getAllRetailPendingInvoices(userId, branchId, nextOffset, activeFilters);
                        const newOrders = extractPendingOrders(response || {});
                        // Deduplicate against existing invoices
                        const existingIds = new Set(invoices.map(o => o?.order_id ?? o?.id).filter(Boolean));
                        allOrders = newOrders.filter((o) => {
                            const id = o?.order_id ?? o?.id;
                            return id && !existingIds.has(id);
                        });
                        currentLoadedPages = loadedPagesCount + 1;
                        setLoadedPagesCount(currentLoadedPages);
                        count = allOrders.length;
                    } catch (err) {
                        console.error("Error fetching more pending invoices:", err);
                        allOrders = [];
                        count = 0;
                    }
                }
                if (count === undefined) {
                    count = allOrders.length;
                }
            }

            // Filter out Deactive orders
            const filtered = allOrders.filter(order => order.status !== "Deactive");
            console.log("fetchAllPendingInvoices: Before sorting, filtered orders count:", filtered.length);
            console.log("fetchAllPendingInvoices: append mode:", append, "existing invoices count:", invoices.length);

            const ordersToSort = append ? [...invoices, ...filtered] : filtered;
            console.log("fetchAllPendingInvoices: ordersToSort count:", ordersToSort.length);

            const sorted = ordersToSort.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });

            if (isAllBranches) {
                setAllBranchesPendingFullList([]);
                setInvoices(sorted.slice(0, 15));
                const effectiveOffset = offset != null ? Number(offset) : 0;
                const totalCount = allBranchesTotal ?? totalOrdersCount ?? 0;
                setPendingInvoicesHasMore(totalCount > 0 && effectiveOffset + sorted.length < totalCount);
                setPendingInvoicesOffset(effectiveOffset);
            } else {
                setAllBranchesPendingFullList([]);
                console.log("fetchAllPendingInvoices: Setting invoices for specific branch, sorted count:", sorted.length);
                setInvoices(sorted);
                // Check if we've loaded all API pages (each offset returns 15 orders)
                // Use currentLoadedPages (local variable) instead of state for accurate calculation
                const currentTotal = totalOrdersCount;
                // Check if there are more orders to load
                // If we have totalOrdersCount, check if we've loaded less than the total
                // Otherwise, check if we got a full page (15 orders)
                const hasMore = currentTotal != null
                    ? (sorted.length < currentTotal)
                    : (allOrders.length >= 15);
                console.log("fetchAllPendingInvoices: hasMore:", hasMore, "currentTotal:", currentTotal, "sorted.length:", sorted.length, "allOrders.length:", allOrders.length);
                setPendingInvoicesHasMore(hasMore);
                setPendingInvoicesOffset(currentLoadedPages);
            }
        } catch (error) {
            console.error("Error fetching orders: ", error);
            console.error("Error details:", error?.response?.data || error?.message);
            if (!append) {
                setInvoices([]);
                setTotalOrdersCount(null);
                setLoadedPagesCount(0);
                setPendingInvoicesHasMore(false);
            }
        } finally {
            setIsLoading(false);
            setPendingInvoicesLoadingMore(false);
        }
    };

    const handleLoadMorePendingInvoices = () => {
        if (!pendingInvoicesHasMore || pendingInvoicesLoadingMore) return;
        const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
        if (isAllBranches) {
            // All branches: pagination is page-based; go to next page (useEffect will fetch)
            setCurrentPage((prev) => prev + 1);
        } else {
            // For specific branch: load next offset (increment by 1)
            fetchAllPendingInvoices(null, true);
        }
    };

    const fetchAllInvoiced = async (offset = 0, append = false, branchIdOverride = null) => {
        try {
            if (append) {
                setAlreadyInvoicedLoadingMore(true);
            } else {
                setIsLoading(true);
            }
            const userId = localStorage.getItem("userId");
            if (!userId) {
                setIsLoading(false);
                setAlreadyInvoicedLoadingMore(false);
                return;
            }

            const activeFilters = {
                searchText: submittedSearchQuery.trim(),
                from_date: startDate,
                to_date: endDate,
            };

            // Use override when changing branch so we always fetch for the selected branch
            const effectiveBranchFilter = branchIdOverride !== null && branchIdOverride !== undefined
                ? branchIdOverride
                : branchFilter;
            // Treat empty, "null", or non-numeric values as "all branches"
            const parsedBranchFilter = Number(effectiveBranchFilter);
            const isAllBranches = !effectiveBranchFilter
                || String(effectiveBranchFilter).trim() === ""
                || String(effectiveBranchFilter).trim().toLowerCase() === "null"
                || isNaN(parsedBranchFilter);

            let allOrders = [];
            let count = 0;
            let currentLoadedPages = loadedAlreadyInvoicedPagesCount;

            // Determine branch_id: -1 for all branches, otherwise use effectiveBranchFilter
            const branchId = isAllBranches
                ? -1
                : (parsedBranchFilter || Number(localStorage.getItem("selectedBranchId")) || 1);

            if (!append) {
                // Initial load: fetch offset 0 (first 15 orders)
                const requestOffset = 0;
                try {
                    const response = await getAllRetailInvoices(userId, requestOffset, branchId, activeFilters);
                    let chunk = [];
                    if (response?.data) {
                        if (Array.isArray(response.data.invoiced_orders)) {
                            chunk = response.data.invoiced_orders;
                        } else if (Array.isArray(response.data)) {
                            chunk = response.data;
                        } else {
                            chunk = response.data.invoiced_orders ?? [];
                        }
                    }
                    allOrders = chunk;
                    // Read "count" from response for total order count
                    const totalCount = response?.data?.count ?? null;
                    setTotalAlreadyInvoicedCount(totalCount);
                    currentLoadedPages = 1;
                    setLoadedAlreadyInvoicedPagesCount(1);
                    count = allOrders.length;
                } catch (err) {
                    console.error("Error fetching already invoiced orders:", err);
                    allOrders = [];
                    count = 0;
                    setTotalAlreadyInvoicedCount(null);
                    currentLoadedPages = 0;
                    setLoadedAlreadyInvoicedPagesCount(0);
                }
            } else {
                // Append: load next page (offset increments by 15: 15, 30, 45...)
                const nextOffset = loadedAlreadyInvoicedPagesCount * 15;
                try {
                    const response = await getAllRetailInvoices(userId, nextOffset, branchId, activeFilters);
                    let chunk = [];
                    if (response?.data) {
                        if (Array.isArray(response.data.invoiced_orders)) {
                            chunk = response.data.invoiced_orders;
                        } else if (Array.isArray(response.data)) {
                            chunk = response.data;
                        } else {
                            chunk = response.data.invoiced_orders ?? [];
                        }
                    }
                    // Deduplicate against existing orders
                    const existingIds = new Set(alreadyInvoiced.map(o => o?.order_id ?? o?.id).filter(Boolean));
                    allOrders = chunk.filter((o) => {
                        const id = o?.order_id ?? o?.id;
                        return id && !existingIds.has(id);
                    });
                    currentLoadedPages = loadedAlreadyInvoicedPagesCount + 1;
                    setLoadedAlreadyInvoicedPagesCount(currentLoadedPages);
                    count = allOrders.length;
                    // Update total count if available (in case it changed)
                    const totalCount = response?.data?.count ?? totalAlreadyInvoicedCount;
                    if (totalCount != null) {
                        setTotalAlreadyInvoicedCount(totalCount);
                    }
                } catch (err) {
                    console.error("Error fetching more already invoiced orders:", err);
                    allOrders = [];
                    count = 0;
                }
            }

            const filtered = allOrders.filter(order => order.status === "Active");

            let ordersToSort = append ? [...alreadyInvoiced, ...filtered] : filtered;
            const seenIds = new Set();
            ordersToSort = ordersToSort.filter((order) => {
                const id = order?.order_id ?? order?.id;
                if (id == null || seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            });

            const sorted = ordersToSort.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });

            setAlreadyInvoiced(sorted);

            // Update offset and hasMore based on count from API
            const currentTotal = totalAlreadyInvoicedCount;
            const hasMore = currentTotal != null
                ? (sorted.length < currentTotal)
                : (allOrders.length >= INVOICED_ORDERS_PAGE_SIZE);
            setAlreadyInvoicedHasMore(hasMore);
            setAlreadyInvoicedOffset(currentLoadedPages);

            return { added: sorted.length, nextOffset: alreadyInvoicedOffset };
        } catch (error) {
            console.error("Error fetching invoiced orders: ", error);
            if (!append) {
                setAlreadyInvoiced([]);
                setTotalAlreadyInvoicedCount(null);
                setLoadedAlreadyInvoicedPagesCount(0);
            }
            return { added: 0, nextOffset: offset };
        } finally {
            if (append) {
                setAlreadyInvoicedLoadingMore(false);
            } else {
                // Defer hiding loader until after table has rendered with data (avoids gap)
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setIsLoading(false);
                    });
                });
            }
        }
    };

    const handleLoadMoreAlreadyInvoiced = () => {
        if (!alreadyInvoicedHasMore || alreadyInvoicedLoadingMore) return;
        fetchAllInvoiced(alreadyInvoicedOffset, true);
    };

    const SEARCH_PAGE_SIZE = 15;
    const extractInvoiceOrderList = (raw) => {
        if (Array.isArray(raw?.invoiced_orders)) return raw.invoiced_orders;
        if (Array.isArray(raw?.pending_invoices)) return raw.pending_invoices;
        if (Array.isArray(raw?.orders)) return raw.orders;
        if (Array.isArray(raw?.data?.invoiced_orders)) return raw.data.invoiced_orders;
        if (Array.isArray(raw?.data?.pending_invoices)) return raw.data.pending_invoices;
        if (Array.isArray(raw?.data?.orders)) return raw.data.orders;
        if (Array.isArray(raw?.data)) return raw.data;
        if (Array.isArray(raw)) return raw;
        return [];
    };

    const fetchSearchOrders = async (append = false) => {
        const q = submittedSearchQuery.trim();
        if (!q) return;
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        try {
            if (append) setSearchResultsLoadingMore(true);
            else setIsSearching(true);
            const offset = append ? searchResultsOffset : 0;
            const activeFilters = {
                searchText: q,
                from_date: startDate,
                to_date: endDate,
            };
            const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
            const response = selectedTab === 1
                ? (isAllBranches
                    ? await getPendingInvoiceOrdersAllBranches(userId, offset, activeFilters)
                    : await getAllRetailPendingInvoices(userId, Number(branchFilter) || (Number(localStorage.getItem("selectedBranchId")) || 1), offset, activeFilters))
                : await getAllRetailInvoices(userId, offset, isAllBranches ? -1 : (Number(branchFilter) || (Number(localStorage.getItem("selectedBranchId")) || 1)), activeFilters);
            console.log("fetchSearchOrders: Response received:", response);

            if (!response || !response.data) {
                console.warn("fetchSearchOrders: No response or response.data");
                setSearchResults([]);
                return;
            }

            const raw = response.data;
            console.log("fetchSearchOrders: Raw response data:", JSON.stringify(raw, null, 2));

            const list = extractInvoiceOrderList(raw);
            const normalizedList = raw?.order && typeof raw.order === "object" && (raw.order.order_id != null || raw.order.items != null)
                ? [raw.order]
                : raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) && (raw.data.order_id != null || raw.data.items != null)
                    ? [raw.data]
                    : raw && typeof raw === "object" && !Array.isArray(raw) && (raw.order_id != null || raw.items != null)
                        ? [raw]
                        : list;

            console.log("fetchSearchOrders: Parsed list (after flattening):", normalizedList);
            console.log("fetchSearchOrders: List length:", normalizedList.length);
            const count = raw?.count ?? raw?.data?.count ?? normalizedList.length;

            // Check if orders already have complete data (items field) or need to fetch full details
            const ordersWithFullDetails = await Promise.all(
                normalizedList.map(async (order) => {
                    if (!order || typeof order !== "object") return null;

                    console.log("fetchSearchOrders: Processing order from search:", order);

                    // Extract order_id from various possible fields
                    const orderId = order.order_id || order.id || order.order_number || order.orderId;

                    if (!orderId) {
                        console.warn("fetchSearchOrders: Order has no order_id:", order);
                        return order; // Return as-is if no order_id
                    }

                    // Check if order already has items - if yes, use it directly
                    const hasItems = Array.isArray(order.items) && order.items.length > 0;
                    const hasAllFields = order.customer_name && order.phone_number && order.delivery_type;

                    // If order has items and all required fields, use it directly
                    if (hasItems && hasAllFields) {
                        console.log(`fetchSearchOrders: Order ${orderId} already has complete data, using directly`);
                        return order;
                    }

                    // Otherwise, fetch full order details
                    try {
                        console.log(`fetchSearchOrders: Fetching full details for order ${orderId}`);
                        const fullOrderData = await getRetailOrderById({
                            user_id: userId,
                            order_id: String(orderId)
                        });

                        if (fullOrderData) {
                            // Handle different response structures
                            let fullOrder = null;
                            if (fullOrderData.order && typeof fullOrderData.order === "object") {
                                fullOrder = fullOrderData.order;
                            } else if (fullOrderData.order_id || fullOrderData.items) {
                                fullOrder = fullOrderData;
                            }

                            if (fullOrder) {
                                console.log(`fetchSearchOrders: Got full details for order ${orderId}:`, fullOrder);
                                // Merge search result with full details (full details take precedence, but preserve search result fields)
                                return { ...order, ...fullOrder };
                            } else {
                                console.warn(`fetchSearchOrders: Full order data structure unexpected for ${orderId}:`, fullOrderData);
                                return order; // Return original if structure is unexpected
                            }
                        } else {
                            console.warn(`fetchSearchOrders: No full order data returned for ${orderId}, using search result`);
                            return order; // Return original if no full data
                        }
                    } catch (err) {
                        console.error(`fetchSearchOrders: Failed to fetch full details for order ${orderId}:`, err);
                        // Return original order data if fetch fails
                        return order;
                    }
                })
            );

            // Filter out null entries
            const validOrders = ordersWithFullDetails.filter(order => order != null && order.status !== "Deactive");
            console.log("fetchSearchOrders: Orders with full details:", validOrders);

            // Normalize for display - extract all fields properly
            const displayList = validOrders.map((order) => {
                if (!order || typeof order !== "object") {
                    console.warn("fetchSearchOrders: Invalid order object:", order);
                    return null;
                }

                console.log("fetchSearchOrders: Raw order before normalization:", JSON.stringify(order, null, 2));

                const base = { ...order };

                // Extract order_id from various possible fields
                if (!base.order_id) {
                    if (base.id) base.order_id = String(base.id);
                    else if (base.order_number) base.order_id = String(base.order_number);
                    else if (base.orderId) base.order_id = String(base.orderId);
                }
                if (base.order_id) base.order_id = String(base.order_id);

                // Extract customer_name from various possible fields
                if (!base.customer_name || base.customer_name === "") {
                    if (base.customer) base.customer_name = String(base.customer);
                    else if (base.customerName) base.customer_name = String(base.customerName);
                    else if (base.customer_name) base.customer_name = String(base.customer_name);
                }
                if (base.customer_name) base.customer_name = String(base.customer_name);

                // Extract phone_number from various possible fields
                if (!base.phone_number || base.phone_number === "") {
                    if (base.phone) base.phone_number = String(base.phone);
                    else if (base.phoneNumber) base.phone_number = String(base.phoneNumber);
                    else if (base.contact_number) base.phone_number = String(base.contact_number);
                    else if (base.phone_number) base.phone_number = String(base.phone_number);
                }
                if (base.phone_number) base.phone_number = String(base.phone_number);

                // Extract delivery_type from various possible fields
                if (!base.delivery_type || base.delivery_type === "") {
                    if (base.delivery_method) base.delivery_type = String(base.delivery_method);
                    else if (base.deliveryType) base.delivery_type = String(base.deliveryType);
                    else if (base.delivery_type) base.delivery_type = String(base.delivery_type);
                }
                if (base.delivery_type) base.delivery_type = String(base.delivery_type);

                // Extract created_at from various possible fields
                if (!base.created_at || base.created_at === "") {
                    if (base.created_date) base.created_at = base.created_date;
                    else if (base.createdDate) base.created_at = base.createdDate;
                    else if (base.created) base.created_at = base.created;
                    else if (base.created_at) base.created_at = base.created_at;
                }

                // Extract delivery_date from various possible fields
                if (!base.delivery_date || base.delivery_date === "") {
                    if (base.delivery_due_date) base.delivery_date = base.delivery_due_date;
                    else if (base.deliveryDueDate) base.delivery_date = base.deliveryDueDate;
                    else if (base.due_date) base.delivery_date = base.due_date;
                    else if (base.delivery_date) base.delivery_date = base.delivery_date;
                }

                // Normalize items array - handle various structures
                if (!Array.isArray(base.items)) {
                    if (base.items && typeof base.items === "object" && !Array.isArray(base.items)) {
                        // If items is an object, try to extract an array
                        if (Array.isArray(base.items.items)) base.items = base.items.items;
                        else base.items = [];
                    } else {
                        base.items = [];
                    }
                }

                const items = base.items || [];
                const normalizedItems = [];
                items.forEach((item) => {
                    if (!item || typeof item !== "object") return;
                    const quantity = Number(item.quantity) || 1;
                    for (let i = 0; i < quantity; i++) {
                        normalizedItems.push({ ...item, quantity: 1 });
                    }
                });
                base.items = normalizedItems;

                // Normalize amounts - preserve as numbers for calculations, but ensure they exist
                const parseAmount = (val) => {
                    if (val == null || val === "" || val === undefined) return null;
                    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
                    return isNaN(num) ? null : num;
                };

                base.total_amount = parseAmount(base.total_amount ?? base.totalAmount ?? base.totalAmount);
                base.remaining_amount = parseAmount(base.remaining_amount ?? base.remainingAmount ?? base.remainingAmount);
                base.advance_payment = parseAmount(base.advance_payment ?? base.advancePayment ?? base.advancePayment);
                base.delivery_charge = parseAmount(base.delivery_charge ?? base.deliveryCharge ?? base.deliveryCharge);

                // Calculate remaining_amount if not provided
                if (base.remaining_amount == null && base.total_amount != null) {
                    const total = Number(base.total_amount) || 0;
                    const advance = Number(base.advance_payment) || 0;
                    base.remaining_amount = total - advance;
                }

                // Normalize status
                if (base.status == null && base.order_status != null) base.status = base.order_status;
                if (base.order_status == null && base.status != null) base.order_status = base.status;

                // Ensure invoice_id if exists
                if (base.invoice_id == null && base.invoiceId != null) base.invoice_id = String(base.invoiceId);

                console.log("fetchSearchOrders: Normalized order:", {
                    order_id: base.order_id,
                    customer_name: base.customer_name,
                    phone_number: base.phone_number,
                    delivery_type: base.delivery_type,
                    delivery_date: base.delivery_date,
                    created_at: base.created_at,
                    items_count: base.items.length,
                    total_amount: base.total_amount,
                    advance_payment: base.advance_payment,
                    remaining_amount: base.remaining_amount,
                    delivery_charge: base.delivery_charge
                });

                return base;
            }).filter(order => order != null); // Remove any null entries

            console.log("fetchSearchOrders: Final displayList:", displayList);
            console.log("fetchSearchOrders: displayList length:", displayList.length);

            if (displayList.length === 0) {
                console.warn("fetchSearchOrders: No orders found after processing");
                setSearchResults([]);
                setSearchResultsOffset(0);
                setSearchResultsHasMore(false);
                return;
            }

            if (append) {
                setSearchResults((prev) => {
                    const seen = new Set(prev.map((o) => o.order_id ?? o.id));
                    const merged = [...prev];
                    for (const o of displayList) {
                        const id = o.order_id ?? o.id;
                        if (id && !seen.has(id)) {
                            seen.add(id);
                            merged.push(o);
                        }
                    }
                    return merged;
                });
                setSearchResultsOffset(offset + count);
                setSearchResultsHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            } else {
                setSearchResults(displayList);
                setSearchResultsOffset(count);
                setSearchResultsHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            }
        } catch (err) {
            console.error("Error searching orders:", err);
            if (!append) setSearchResults([]);
        } finally {
            setIsSearching(false);
            setSearchResultsLoadingMore(false);
        }
    };

    const handleLoadMoreSearchResults = () => {
        if (!searchResultsHasMore || searchResultsLoadingMore) return;
        fetchSearchOrders(true);
    };

    const fetchTotalOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardTotalOrders(payload);
            setTotalOrders(response);
        } catch (error) {
            console.error("Error fetching totalorders: ", error);
        }
    };

    const fetchReadyForPickupOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardReadyForPickupOrders(payload);
            setReadyForPickupOrders(response);
        } catch (error) {
            console.error("Error fetching ready for pickup orders: ", error);
        }
    };

    const fetchReleaseTodayOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardReleaseTodayOrders(payload);
            setReleaseTodayOrders(response);
        } catch (error) {
            console.error("Error fetching release today orders: ", error);
        }
    };

    const fetchExpressOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardExpressOrders(payload);
            setExpressOrders(response);
        } catch (error) {
            console.error("Error fetching express orders: ", error);
        }
    };

    const fetchVouchers = async () => {
        try {
            setIsLoadingVouchers(true);
            const response = await getAllRetailVouchers(localStorage.getItem("userId"));
            if (!response || !response.data || !response.data.vouchers) {
                setVouchers([]);
                return;
            }
            const filtered = response.data.vouchers.filter(voucher => voucher.status !== "Deactive");

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const updatedVouchers = filtered.map(voucher => {
                const issuedDate = new Date(voucher.issued_date);
                const expireDate = new Date(voucher.expire_date);

                let status = voucher.status;

                // Client-side overrides removed. Display exactly what the API returns.
                // Previously, logic was checking dates/balance and overriding 'Active' to 'Expired'/'Redeemed'.
                // If the backend says 'Active', we show 'Active'.

                // If you still want to handle 'Redeemed' visually for 0 balance, you can re-enable that check, 
                // but for now we are forcing strict adherence to backend status as requested.
                // Note: The previous logic also had issues with date comparisons causing 'Active' items to appear 'Expired'.

                status = voucher.status;

                return {
                    ...voucher,
                    status
                };
            });

            setVouchers(updatedVouchers);
        } catch (error) {
            console.error("Error fetching vouchers: ", error);
            setVouchers([]);
        } finally {
            setIsLoadingVouchers(false);
        }
    };

    const loadActiveTabData = (offset = 0, append = false, branchIdOverride = null) => {
        const branchScope = branchIdOverride != null && String(branchIdOverride).trim() !== ""
            ? String(branchIdOverride)
            : (branchFilter || "all");
        const scopeKey = selectedTab === 3 || selectedTab === 4
            ? `tab:${selectedTab}|branch:${branchScope}|vouchers`
            : `tab:${selectedTab}|branch:${branchScope}|page:${currentPage}|today:${isTodaySelected}|search:${submittedSearchQuery.trim()}|delivery:${deliveryTypeFilter}|offset:${offset}|append:${append}`;

        if (lastActiveTabLoadRef.current === scopeKey) return;
        lastActiveTabLoadRef.current = scopeKey;

        if (selectedTab === 1) {
            return fetchAllPendingInvoices(offset, append, branchIdOverride ?? branchFilter);
        }
        if (selectedTab === 2) {
            return fetchAllInvoiced(offset, append, branchIdOverride ?? branchFilter);
        }
        if (selectedTab === 3 || selectedTab === 4) {
            return fetchVouchers();
        }
        return undefined;
    };

    const handleActivateVoucher = async (formData) => {
        if (!voucherTabFlags.canEditSoldVouchers) {
            await Swal.fire({ icon: "error", title: "Not allowed", text: "You don't have permission to activate vouchers.", confirmButtonColor: "#1470F9" });
            return;
        }
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                voucher_id: selectedVoucher.voucher_id,
                voucher_code: formData.voucher_code,
                value: Number(formData.value),
                balance: Number(formData.value),
                issued_date: formData.issued_date,
                expire_date: formData.expire_date,
                status: "Active"
            };
            await changeRetailVoucherStatus(payload);

            await Swal.fire({
                icon: "success",
                title: "Voucher Activated",
                text: `Voucher ${formData.voucher_code} has been activated successfully.`,
                confirmButtonColor: "#1470F9"
            });

            setShowActivateVoucherDialog(false);
            setSelectedVoucher(null);
            fetchVouchers();
        } catch (error) {
            console.error("Error activating voucher: ", error);
            await Swal.fire({
                icon: "error",
                title: "Activation Failed",
                text: error.response?.data?.message || "Failed to activate voucher. Please try again.",
                confirmButtonColor: "#1470F9"
            });
        }
    };

    const formatDateForApi = (dateVal) => {
        if (!dateVal) return "";
        const d = new Date(dateVal);
        return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
    };

    const handleApplySellVouchers = async () => {
        if (!voucherTabFlags.canCreateSellVouchers) {
            await Swal.fire({ icon: "error", title: "Not allowed", text: "You don't have permission to sell vouchers.", confirmButtonColor: "#1470F9" });
            return;
        }
        if (!voucherSellCustomer) {
            await Swal.fire({ icon: "warning", title: "Select customer", text: "Please select a customer.", confirmButtonColor: "#1470F9" });
            return;
        }
        if (vouchersAddedToSell.length === 0) {
            await Swal.fire({ icon: "warning", title: "Add vouchers", text: "Please add at least one voucher.", confirmButtonColor: "#1470F9" });
            return;
        }
        if (!voucherSellIssuedDate) {
            await Swal.fire({ icon: "warning", title: "Issued date", text: "Please set issued date.", confirmButtonColor: "#1470F9" });
            return;
        }
        try {
            setIsLoadingVouchers(true);
            const issuedTo = voucherSellCustomer?.customer_id ?? voucherSellCustomer?.customer_name ?? "";
            const issuedDateStr = formatDateForApi(voucherSellIssuedDate);
            for (const v of vouchersAddedToSell) {
                const payload = {
                    user_id: localStorage.getItem("userId"),
                    voucher_id: v.voucher_id,
                    voucher_code: v.voucher_code,
                    value: Number(v.value) || 0,
                    balance: Number(v.balance) ?? Number(v.value) ?? 0,
                    issued_to: issuedTo,
                    issued_date: issuedDateStr,
                    expire_date: formatDateForApi(v.expire_date) || issuedDateStr,
                    status: "Active",
                    invoice_id: voucherInvoiceNo,
                };
                await updateRetailVoucher(payload);
            }
            await fetchVouchers();
            setSelectedTab(4);
            await Swal.fire({
                icon: "success",
                title: "Applied",
                text: `${vouchersAddedToSell.length} voucher(s) have been sold and added to Sold Vouchers. Status set to Active.`,
                confirmButtonColor: "#1470F9"
            });
        } catch (error) {
            console.error("Error applying sell vouchers: ", error);
            await Swal.fire({
                icon: "error",
                title: "Apply failed",
                text: error.response?.data?.message || "Failed to update vouchers. Please try again.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            setIsLoadingVouchers(false);
        }
    };

    const fetchAllBranches = async () => {
        try {
            const response = await getAllBranches();

            if (!response) {
                setBranches([]);
                return;
            }

            let branchesData = [];
            if (Array.isArray(response)) {
                branchesData = response;
            } else if (response.data && Array.isArray(response.data)) {
                branchesData = response.data;
            } else if (response.branches && Array.isArray(response.branches)) {
                branchesData = response.branches;
            } else if (response.results && Array.isArray(response.results)) {
                branchesData = response.results;
            } else {
                const keys = Object.keys(response);
                for (const key of keys) {
                    if (Array.isArray(response[key])) {
                        branchesData = response[key];
                        break;
                    }
                }
            }

            if (Array.isArray(branchesData) && branchesData.length > 0) {
                const branchesOptions = branchesData.map((branch) => ({
                    value: branch.branch_id || branch.id,
                    label: branch.branch_name || branch.name || branch.branchName || `Branch ${branch.id || branch.branch_id}`,
                }));
                setBranches(branchesOptions);
            } else {
                setBranches([]);
            }
        } catch (error) {
            console.error("Error fetching branches:", error);
            setBranches([]);
        }
    };

    useEffect(() => {
        // Reset pagination on mount
        setPendingInvoicesOffset(0);
        setPendingInvoicesHasMore(false);
        setAlreadyInvoicedOffset(0);
        setAlreadyInvoicedHasMore(false);
        setTotalOrdersCount(null);
        setLoadedPagesCount(0);
        loadActiveTabData(0, false, branchFilter);
        fetchTotalOrders();
        // NOTE: Ready-for-pickup dashboard API currently returns 500 from backend.
        // It is only used here for a summary card, not for invoice creation.
        // To avoid noisy console errors when creating/printing invoices,
        // we skip this call on the invoice page and still keep the others.
        // fetchReadyForPickupOrders();
        fetchReleaseTodayOrders();
        fetchExpressOrders();
        fetchAllBranches();
    }, []);

    useEffect(() => {
        // Clear pending invoices immediately when branch changes so old branch data doesn't show
        setInvoices([]);
        setPendingInvoicesOffset(0);
        setPendingInvoicesHasMore(false);
        setAlreadyInvoicedOffset(0);
        setAlreadyInvoicedHasMore(false);
        setAllBranchesPendingFullList([]);
        setPendingAllBranchesDisplayCount(15);
        setTotalOrdersCount(null);
        setLoadedPagesCount(0);
        setTotalAlreadyInvoicedCount(null);
        setLoadedAlreadyInvoicedPagesCount(0);
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        lastPendingAllBranchesFetchRef.current = { page: 1, branch: branchFilter };
        // Pass current branch so we always fetch for the newly selected branch (avoids stale closure)
        loadActiveTabData(0, false, branchFilter);
    }, [branchFilter]);

    useEffect(() => {
        setSelectMulitple(false);
        setSelectedOrders([]);
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };

        // Clear search when switching between invoice tabs (tab 1: Pending, tab 2: Already Invoiced)
        if (selectedTab === 1 || selectedTab === 2) {
            setSearchQuery("");
            setSubmittedSearchQuery("");
            setSearchResults([]);
            setSearchResultsOffset(0);
            setSearchResultsHasMore(false);
        }

        // When switching to Already Invoiced tab (tab 2), fetch data if not already loaded
        if (selectedTab === 2 && alreadyInvoiced.length === 0 && totalAlreadyInvoicedCount === null) {
            setIsLoading(true); // Show loader immediately until table has data
            loadActiveTabData(0, false, branchFilter);
        } else if ((selectedTab === 3 || selectedTab === 4) && vouchers.length === 0) {
            loadActiveTabData(0, false, branchFilter);
        } else if (selectedTab === 1 && invoices.length === 0 && totalOrdersCount === null) {
            loadActiveTabData(0, false, branchFilter);
        }
    }, [selectedTab]);

    useEffect(() => {
        const q = submittedSearchQuery.trim();
        if (selectedTab !== 1 && selectedTab !== 2) return;
        if (!q) {
            setSearchResults([]);
            setSearchResultsOffset(0);
            setSearchResultsHasMore(false);
            return;
        }
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
        fetchSearchOrders(false);
    }, [submittedSearchQuery, branchFilter, selectedTab]);

    useEffect(() => {
        if (selectedTab !== 1 && selectedTab !== 2) return;

        const previous = lastInvoiceDateRangeRef.current;
        const hasChanged = previous.startDate !== startDate || previous.endDate !== endDate;
        lastInvoiceDateRangeRef.current = { startDate, endDate };

        if (!hasChanged) return;

        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;

        if (submittedSearchQuery.trim()) {
            fetchSearchOrders(false);
        } else {
            loadActiveTabData(0, false, branchFilter);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        if (selectedTab === 3) {
            const fetchVoucherCustomers = async () => {
                try {
                    const payload = { user_id: localStorage.getItem("userId"), customer_type: "Retail", branch_id: localStorage.getItem("selectedBranchId") || 1 };
                    const response = await getAllCustomers(payload);
                    const list = response?.data?.allCustomers?.filter(c => c.customer_type === "Retail" && c.account_status === "Active") ?? [];
                    setVoucherSellCustomers(list);
                } catch (err) {
                    console.error("Error fetching customers for voucher sell:", err);
                }
            };
            fetchVoucherCustomers();
        }
    }, [selectedTab]);

    useEffect(() => {
        setSoldVouchersCurrentPage(1);
    }, [searchQuerySoldVouchers, isSoldVouchersTodaySelected, soldVouchersAmountFilter]);

    // Clear submitted search when leaving tabs 1 or 2
    useEffect(() => {
        if (selectedTab !== 1 && selectedTab !== 2) {
            setSubmittedSearchQuery("");
            setSearchResults([]);
        }
    }, [selectedTab]);

    const handlePrintVoucherInvoice = useReactToPrint({
        contentRef: voucherInvoicePrintRef,
    });

    const deliveryTypeOptions = [
        { value: 'Urgent', label: 'Urgent' },
        { value: 'Express', label: 'Express' },
        { value: 'One Day', label: 'One Day' },
        { value: 'Two Day', label: 'Two Day' },
        { value: 'Normal', label: 'Normal' },
    ];

    const handleDeliveryTypeFilterChange = (e) => {
        setDeliveryTypeFilter(e.target.value);
    };

    const firstSelectedOrder = selectedOrders.length > 0
        ? (invoices.find(inv => inv.order_id === selectedOrders[0]) || (Array.isArray(searchResults) ? searchResults.find(inv => inv.order_id === selectedOrders[0]) : null))
        : null;
    const selectedCustomerId = firstSelectedOrder?.customer_id ?? null;
    const selectedCustomerPhone = firstSelectedOrder?.phone_number ?? null;

    // Order is already invoiced: do not show in Pending Invoiced tab
    const isOrderAlreadyInvoiced = (order) => {
        if (!order) return false;
        const orderStatus = order.status != null ? String(order.status).trim().toLowerCase() : "";
        if (orderStatus === "invoiced") return true;
        if (Array.isArray(order.items) && order.items.length > 0) {
            const allItemsInvoiced = order.items.every((item) => {
                const s = item.status != null ? String(item.status).trim().toLowerCase() : "";
                return s === "invoiced";
            });
            if (allItemsInvoiced) return true;
        }
        return false;
    };

    // Handle invoice date change (superAdmin only)
    const handleDateChangeClick = (order) => {
        if (!isSuperadmin) return;
        setSelectedOrderForDateChange(order);
        const currentDate = order.printed_at ? new Date(order.printed_at) : new Date();
        const formattedDate = currentDate.toISOString().split("T")[0];
        setSelectedNewDate(formattedDate);
        setShowDateChangeCalendar(true);
    };

    const handleDateChangeSubmit = async () => {
        if (!selectedOrderForDateChange || !selectedNewDate) return;

        const userId = localStorage.getItem("userId");
        // Use 'invoice_id' field from API response (e.g. "26FEB_L3KH_205")
        const invoiceId = selectedOrderForDateChange.invoice_id;

        if (!userId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "User ID not found. Please log in again.",
            });
            return;
        }

        if (!invoiceId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Invoice ID not found for this order.",
            });
            return;
        }

        setIsUpdatingDate(true);
        try {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
            const payload = {
                user_id: userId,
                invoice_id: invoiceId,
                new_date: `${selectedNewDate} ${currentTime}`
            };

            const response = await updateInvoiceDate(payload);

            if (response) {
                Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: "Invoice date updated successfully.",
                });

                // Update the order in local state
                setAlreadyInvoiced(prev => prev.map(order =>
                    order.invoice_id === invoiceId
                        ? { ...order, printed_at: `${selectedNewDate}T${currentTime}` }
                        : order
                ));

                setShowDateChangeCalendar(false);
                setSelectedOrderForDateChange(null);
                setSelectedNewDate("");
            }
        } catch (error) {
            console.error("Error updating invoice date:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to update invoice date. Please try again.",
            });
        } finally {
            setIsUpdatingDate(false);
        }
    };

    // For tab 1: Pending Invoiced – exclude orders that are already invoiced; apply Today filter when set
    const filteredOrders = selectedTab === 1
        ? invoices.filter((order) => {
            if (isOrderAlreadyInvoiced(order)) return false;
            // When multi-selecting and at least one order is selected, show only invoices of the same customer
            if (selectMultiple && selectedOrders.length > 0) {
                const matchId = selectedCustomerId != null && order.customer_id === selectedCustomerId;
                const matchPhone = selectedCustomerPhone && order.phone_number === selectedCustomerPhone;
                if (!matchId && !matchPhone) return false;
            }
            if (!isTodaySelected) return true;
            return isDateWithinRange(order.created_at, startDate, endDate);
        })
        : selectedTab === 2
            ? alreadyInvoiced.filter((order) => {
                const matchesQuery = (field) => {
                    if (!submittedSearchQuery || !field) return false;

                    const fieldStr = field.toString().toLowerCase();
                    const searchWords = submittedSearchQuery
                        .toLowerCase()
                        .split(/\s*\*\s*/) // split by `*` with optional spaces
                        .filter(word => word.trim().length > 0);

                    return searchWords.every(word => fieldStr.includes(word));
                };

                const matchesSearch = submittedSearchQuery
                    ? matchesQuery(order.invoice_id) ||
                    matchesQuery(order.order_id) ||
                    matchesQuery(order.customer_name) ||
                    matchesQuery(order.phone_number)
                    : true;

                const matchesStatusFilter = deliveryTypeFilter
                    ? order.delivery_type === deliveryTypeFilter
                    : true;

                const matchesBranchFilter = (() => {
                    const storedId = (branchFilter != null && String(branchFilter).trim() !== "") ? String(branchFilter) : null;
                    if (!storedId) return true;

                    const targetBranch = branches.find(b => String(b.value) === String(storedId));
                    const targetName = targetBranch ? targetBranch.label : "";
                    const outletName = String(order.delivery_outlet || "").toLowerCase().trim();
                    const outletId = order.delivery_outlet_id != null ? String(order.delivery_outlet_id) : "";
                    const orderBranchId = order.branch_id != null ? String(order.branch_id) : "";

                    if (targetName && outletName && outletName === targetName) return true;
                    if (targetName && outletName && outletName.includes(targetName)) return true;
                    if (outletId && outletId === storedId) return true;
                    if (orderBranchId && orderBranchId === storedId) return true;
                    if (outletId && outletId !== storedId) return false;
                    if (orderBranchId && orderBranchId !== storedId) return false;
                    if (outletName && targetName && outletName !== targetName && !outletName.includes(targetName)) return false;
                    return false;
                })();

                const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);

                return matchesSearch && matchesStatusFilter && matchesBranchFilter && matchesTodayFilter;
            })
            : invoices.filter((order) => {
                const matchesQuery = (field) => {
                    if (!submittedSearchQuery || !field) return false;

                    const fieldStr = field.toString().toLowerCase();
                    const searchWords = submittedSearchQuery
                        .toLowerCase()
                        .split(/\s*\*\s*/) // split by `*` with optional spaces
                        .filter(word => word.trim().length > 0);

                    return searchWords.every(word => fieldStr.includes(word));
                };

                const matchesSearch = submittedSearchQuery
                    ? matchesQuery(order.order_id) ||
                    matchesQuery(order.customer_name) ||
                    matchesQuery(order.phone_number)
                    : true;

                const matchesStatusFilter = deliveryTypeFilter
                    ? order.delivery_type === deliveryTypeFilter
                    : true;

                const matchesBranchFilter = (() => {
                    const storedId = (branchFilter != null && String(branchFilter).trim() !== "") ? String(branchFilter) : null;
                    if (!storedId) return true;

                    // If allBranchesPendingFullList is empty, we fetched for a specific branch from API
                    // In that case, skip branch filtering since API already filtered correctly
                    if (allBranchesPendingFullList.length === 0) {
                        return true;
                    }

                    // For "all branches" mode, apply branch filtering
                    const targetBranch = branches.find(b => String(b.value) === String(storedId));
                    const targetName = (targetBranch ? targetBranch.label : "").toLowerCase().trim();
                    const outletName = String(order.delivery_outlet || "").toLowerCase().trim();
                    const outletId = order.delivery_outlet_id != null ? String(order.delivery_outlet_id) : "";
                    const orderBranchId = order.branch_id != null ? String(order.branch_id) : "";

                    // Include if order belongs to selected branch: match by outlet name, outlet id, or branch_id (same as Already Invoiced tab)
                    if (targetName && outletName && outletName === targetName) return true;
                    if (targetName && outletName && outletName.includes(targetName)) return true;
                    if (outletId && outletId === storedId) return true;
                    if (orderBranchId && orderBranchId === storedId) return true;
                    // Exclude when order clearly belongs to another branch
                    if (outletId && outletId !== storedId) return false;
                    if (orderBranchId && orderBranchId !== storedId) return false;
                    if (outletName && targetName && outletName !== targetName && !outletName.includes(targetName)) return false;
                    return false;
                })();

                const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);

                return matchesSearch && matchesStatusFilter && matchesBranchFilter && matchesTodayFilter;
            });

    // Order is in outlet dispatch note if it has items: is_recived_to_production === 1 && is_send_to_back_to_outlet === 0
    const isInOutletDispatchNote = (order) => {
        if (!order || !Array.isArray(order.items) || order.items.length === 0) return false;
        return order.items.some((item) => {
            const receivedToProduction = item.is_recived_to_production === 1 || item.is_recived_to_production === "1";
            const notSentToOutlet = item.is_send_to_back_to_outlet === 0 || item.is_send_to_back_to_outlet === "0" || item.is_send_to_back_to_outlet == null;
            return receivedToProduction && notSentToOutlet;
        });
    };

    // Order is in outlet received note if it has items: is_send_to_back_to_outlet === 1 && is_recived_to_back_to_outlet === 0
    const isInOutletReceiveNote = (order) => {
        if (!order || !Array.isArray(order.items) || order.items.length === 0) return false;
        return order.items.some((item) => {
            const sentToOutlet = item.is_send_to_back_to_outlet === 1 || item.is_send_to_back_to_outlet === "1";
            const notReceivedAtOutlet = item.is_recived_to_back_to_outlet === 0 || item.is_recived_to_back_to_outlet === "0" || item.is_recived_to_back_to_outlet == null;
            return sentToOutlet && notReceivedAtOutlet;
        });
    };

    // When searching: show API results only after Enter (submittedSearchQuery)
    const isSearchMode = !!(submittedSearchQuery.trim() && (selectedTab === 1 || selectedTab === 2));
    const ordersForTable = isSearchMode
        ? searchResults.filter((order) => {
            if (selectedTab === 1) {
                if (isOrderAlreadyInvoiced(order)) return false;
                if (selectMultiple && selectedOrders.length > 0) {
                    const matchId = selectedCustomerId != null && order.customer_id === selectedCustomerId;
                    const matchPhone = selectedCustomerPhone && order.phone_number === selectedCustomerPhone;
                    if (!matchId && !matchPhone) return false;
                }
                const matchesToday = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);
                return matchesToday;
            }
            if (selectedTab === 2) {
                const matchesToday = !isTodaySelected || isDateWithinRange(order.printed_at, startDate, endDate);
                return matchesToday;
            }
            return true;
        })
        : filteredOrders;

    const getLocalDateString = (d) => {
        if (!d || isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const soldVoucherRowsRaw = (() => {
        const issued = vouchers.filter(v => v.issued_date && (v.status === "Active" || v.status === "Redeemed" || v.status === "Expired"));
        const groups = new Map();
        issued.forEach(v => {
            const key = (v.invoice_id != null && v.invoice_id !== "") ? String(v.invoice_id) : `${getLocalDateString(new Date(v.issued_date))}_${v.issued_to || ""}`;
            if (!groups.has(key)) {
                groups.set(key, { invoice_id: v.invoice_id != null && v.invoice_id !== "" ? v.invoice_id : "—", vouchers: [], issued_to: v.issued_to || "—", issued_date: v.issued_date, expire_date: v.expire_date, status: v.status, totalValue: 0 });
            }
            const g = groups.get(key);
            g.vouchers.push(v);
            g.totalValue += (Number(v.value) || 0);
            if (v.expire_date && (!g.expire_date || new Date(v.expire_date) > new Date(g.expire_date))) g.expire_date = v.expire_date;
            if (g.vouchers.length > 1 && v.status !== g.vouchers[0].status) g.status = "Mixed";
        });
        return Array.from(groups.values()).map(g => ({ ...g, count: g.vouchers.length, totalValue: g.totalValue || 0 }));
    })();

    const filteredSoldVoucherRows = soldVoucherRowsRaw.filter(row => {
        const matchSearch = !searchQuerySoldVouchers || [row.invoice_id, row.issued_to].some(f => String(f || "").toLowerCase().includes(searchQuerySoldVouchers.toLowerCase()));
        const matchToday = !isSoldVouchersTodaySelected || isDateWithinRange(row.issued_date, soldVouchersStartDate, soldVouchersEndDate);
        let matchAmount = true;
        if (soldVouchersAmountFilter === "0-5000") matchAmount = row.totalValue >= 0 && row.totalValue <= 5000;
        else if (soldVouchersAmountFilter === "5000-10000") matchAmount = row.totalValue > 5000 && row.totalValue <= 10000;
        else if (soldVouchersAmountFilter === "10000+") matchAmount = row.totalValue > 10000;
        return matchSearch && matchToday && matchAmount;
    });

    const soldVouchersTotalAmount = filteredSoldVoucherRows.reduce((sum, row) => sum + row.totalValue, 0);
    const soldVouchersTotalPages = Math.ceil(filteredSoldVoucherRows.length / soldVouchersItemsPerPage) || 1;
    const soldVouchersStart = (soldVouchersCurrentPage - 1) * soldVouchersItemsPerPage;
    const soldVouchersEnd = Math.min(soldVouchersStart + soldVouchersItemsPerPage, filteredSoldVoucherRows.length);
    const currentPageSoldVouchers = filteredSoldVoucherRows.slice(soldVouchersStart, soldVouchersStart + soldVouchersItemsPerPage);
    const soldVouchersBlankRows = soldVouchersItemsPerPage - currentPageSoldVouchers.length;

    //pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    // For pending invoices with totalOrdersCount: use totalOrdersCount / itemsPerPage for UI pagination
    // For already invoiced with totalAlreadyInvoicedCount: use totalAlreadyInvoicedCount / itemsPerPage for UI pagination
    // API returns 15 orders per offset, and UI displays itemsPerPage (15) per page
    // Otherwise: calculate from ordersForTable.length
    const isCustomerLockedSelection = selectedTab === 1 && selectMultiple && selectedOrders.length > 0;
    const totalPages = (() => {
        if (isCustomerLockedSelection) {
            return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
        }
        if (selectedTab === 1 && !isSearchMode && totalOrdersCount != null && totalOrdersCount > 0) {
            // If total order count is 15 or less, show only one page (no 2nd page in pagination)
            if (totalOrdersCount <= 15) return 1;
            // Calculate total pages based on totalOrdersCount
            // Example: 26 orders / 15 per page = 1.73 -> ceil = 2 pages
            const calculatedPages = Math.ceil(totalOrdersCount / itemsPerPage);
            return Math.max(1, calculatedPages);
        }
        if (selectedTab === 2 && !isSearchMode && totalAlreadyInvoicedCount != null && totalAlreadyInvoicedCount > 0) {
            // If total order count is 15 or less, show only one page (no 2nd page in pagination)
            if (totalAlreadyInvoicedCount <= 15) return 1;
            // Calculate total pages based on totalAlreadyInvoicedCount
            const calculatedPages = Math.ceil(totalAlreadyInvoicedCount / itemsPerPage);
            return Math.max(1, calculatedPages);
        }
        return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
    })();
    const safePage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
    const indexOfLastItem = safePage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    // All branches + Pending tab: we fetch one page at a time from API, so ordersForTable is already the current page — don't slice
    const isAllBranchesPending = selectedTab === 1 && !isSearchMode && (!branchFilter || String(branchFilter).trim() === "") && !isCustomerLockedSelection;
    const currentOrders = isAllBranchesPending
        ? ordersForTable
        : ordersForTable.slice(indexOfFirstItem, indexOfLastItem);
    const blankRows = itemsPerPage - currentOrders.length;

    // Pending Invoices (Tab 1): when user goes to a page, fetch that page if needed
    useEffect(() => {
        if (selectedTab !== 1 || isSearchMode || isCustomerLockedSelection) return;
        const isAllBranches = !branchFilter || String(branchFilter).trim() === "";

        if (isAllBranches) {
            // All branches: fetch the current page from API only when page or branch changed (avoid loop)
            const prev = lastPendingAllBranchesFetchRef.current;
            if (prev.page === currentPage && prev.branch === branchFilter) return;
            lastPendingAllBranchesFetchRef.current = { page: currentPage, branch: branchFilter };
            const pageOffset = (currentPage - 1) * itemsPerPage;
            loadActiveTabData(pageOffset, false, branchFilter);
        } else {
            // For specific branch: when the current page doesn't have a full 15 rows yet
            // (e.g. some orders in the fetched batch were filtered out), keep fetching
            // further pages until it does or there's nothing left to load.
            const neededCount = currentPage * itemsPerPage;
            const hasEnoughInTable = ordersForTable.length >= Math.min(neededCount, totalOrdersCount ?? neededCount);
            if (!hasEnoughInTable && pendingInvoicesHasMore && !pendingInvoicesLoadingMore) {
                loadActiveTabData(null, true, branchFilter);
            }
        }
    }, [selectedTab, currentPage, isSearchMode, branchFilter, loadedPagesCount, pendingInvoicesHasMore, pendingInvoicesLoadingMore, itemsPerPage, ordersForTable.length, totalOrdersCount]);

    // Already Invoiced (Tab 2): when user goes to page 2+, fetch that page's data so it can display
    // Similar to Pending Invoiced Order - handle both all branches and specific branch cases
    useEffect(() => {
        if (selectedTab !== 2 || isSearchMode) return;
        const isAllBranches = !branchFilter || String(branchFilter).trim() === "";

        if (isAllBranches) {
            // For all branches: show more from already-loaded list (existing logic)
            const needed = currentPage * itemsPerPage;
            if (ordersForTable.length >= needed) return;
            if (!alreadyInvoicedHasMore || alreadyInvoicedLoadingMore) return;
            loadActiveTabData(alreadyInvoicedOffset, true, branchFilter);
        } else {
            // For specific branch: when the current page doesn't have a full 15 rows yet
            // (e.g. some orders in the fetched batch were filtered out), keep fetching
            // further pages until it does or there's nothing left to load.
            const neededCount = currentPage * itemsPerPage;
            const hasEnoughInTable = ordersForTable.length >= Math.min(neededCount, totalAlreadyInvoicedCount ?? neededCount);
            if (!hasEnoughInTable && alreadyInvoicedHasMore && !alreadyInvoicedLoadingMore) {
                loadActiveTabData(null, true, branchFilter);
            }
        }
    }, [selectedTab, currentPage, isSearchMode, branchFilter, loadedAlreadyInvoicedPagesCount, alreadyInvoicedHasMore, alreadyInvoicedLoadingMore, itemsPerPage, ordersForTable.length, totalAlreadyInvoicedCount]);

    // Removed old useEffect hooks - pagination is now handled by the main useEffect above

    // When clicking a page (2, 3, ...) on Already Invoiced: set page; useEffect will fetch more until filtered list has enough (handles specific branch)
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleAddToSelected = (id, customerId) => {
        setSelectedOrders(prev => {
            if (prev.includes(id)) {
                // remove it if already in array
                return prev.filter(item => item !== id);
            }
            return [...prev, id];
        });
    };

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Invoice Management</h1>
                    <p className="text-xl text-black/50">Manage your organization's customer resources efficiently.</p>
                </div>
            </div>

            {/* Detail Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-10">
                <DetailsCard
                    title={"Total Order Today"}
                    value={totalOrders?.total_orders_today ?? 0}
                    label1={"Orders Placed Today"}
                    value1={"100"}
                    label2={"Orders Placed Percentage"}
                    value2={"10%"}
                    extraDetails={false}
                />

                {/* Ready for Pickup card temporarily hidden — not needed yet, re-enable when ready to use.
                <DetailsCard
                    title={"Ready for Pickup"}
                    value={readyForPickupOrders?.pickup_ready_orders ?? 0}
                    label1={"Total Ready Orders Today"}
                    value1={readyForPickupOrders?.total_pickup_ready_orders_today ?? 0}
                    label2={"Waiting Pickup Percentage"}
                    value2={`${readyForPickupOrders?.waiting_pickup_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={false}
                    icon={
                        <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500 size-12" />
                    }
                />
                */}

                {/* Release Today card temporarily hidden — not needed yet, re-enable when ready to use.
                <DetailsCard
                    title={"Release Today"}
                    value={releaseTodayOrders?.today_released_orders ?? 0}
                    label1={"Total Orders"}
                    value1={releaseTodayOrders?.today_total_orders ?? 0}
                    label2={"Release Percentage"}
                    value2={`${releaseTodayOrders?.release_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"streamline:give-gift-remix"} className="text-yellow-500 size-10" />
                    }
                />
                */}

                <DetailsCard
                    title={"Express Orders"}
                    value={expressOrders?.today_express_orders ?? 0}
                    label1={"Total Pending Orders"}
                    value1={expressOrders?.today_pending_orders ?? 0}
                    label2={"Urgent Percentage"}
                    value2={`${expressOrders?.urgent_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"material-symbols-light:delivery-truck-bolt"} className="text-red-500 size-12" />
                    }
                />
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-5">
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(1)}>Pending Invoiced Order</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(2)}>Already Invoiced Order</h2>
                {/* Sell Vouchers / Sold Vouchers tabs temporarily hidden — not needed yet, re-enable when ready to use.
                {voucherTabFlags.canViewSellVouchers && (
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 3 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(3)}>Sell Vouchers</h2>
                )}
                {voucherTabFlags.canViewSoldVouchers && (
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 4 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(4)}>Sold Vouchers</h2>
                )}
                */}
            </div>

            {/* Filter Section - hidden on Sell Vouchers (tab 3) */}
            {selectedTab !== 3 && (
                <div className="flex flex-row flex-wrap gap-x-5 gap-y-3">
                    <div className="flex flex-row border border-primary rounded-full h-fit w-1/2 bg-white">
                        <div className="flex justify-center items-center rounded-l-full px-5">
                            <MdSearch className="size-6 text-primary" />
                        </div>

                        <input
                            className={`grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none`}
                            type="text"
                            value={selectedTab === 4 ? searchQuerySoldVouchers : searchQuery}
                            onChange={(e) => {
                                if (selectedTab === 4) {
                                    setSearchQuerySoldVouchers(e.target.value);
                                } else {
                                    const value = e.target.value;
                                    setSearchQuery(value);
                                    if (!value.trim()) {
                                        setSubmittedSearchQuery("");
                                        setSearchResults([]);
                                        setSearchResultsOffset(0);
                                        setSearchResultsHasMore(false);
                                    }
                                }
                            }}
                            onKeyDown={(e) => {
                                if (selectedTab === 4) return;
                                if (e.key !== "Enter") return;
                                const q = searchQuery.trim();
                                setSubmittedSearchQuery(q);
                                setCurrentPage(1);
                            }}
                            placeholder={selectedTab === 4 ? "Search..." : "Search Orders here (press Enter)..."}
                        />
                    </div>

                    <div className="basis-full h-0" aria-hidden="true" />

                    {selectedTab === 4 && (
                        <>
                            <DateRangeFilter
                                startDate={soldVouchersStartDate}
                                endDate={soldVouchersEndDate}
                                onStartDateChange={setSoldVouchersStartDate}
                                onEndDateChange={setSoldVouchersEndDate}
                                isActive={isSoldVouchersTodaySelected}
                            />
                            <div className="flex flex-row items-center rounded-xl bg-white text-xl gap-x-2 px-4 border border-black/20 text-black/70 min-w-[160px]">
                                <p className="font-semibold text-lg whitespace-nowrap">Voucher Amount</p>
                                <select
                                    value={soldVouchersAmountFilter}
                                    onChange={(e) => setSoldVouchersAmountFilter(e.target.value)}
                                    className="border-0 bg-transparent font-semibold text-primary focus:outline-none cursor-pointer appearance-none px-3"
                                >
                                    <option value="all" className="text-black">All</option>
                                    <option value="0-5000" className="text-black">0 - 5,000</option>
                                    <option value="5000-10000" className="text-black">5,000 - 10,000</option>
                                    <option value="10000+" className="text-black">10,000+</option>
                                </select>
                                <Icon icon="mdi:chevron-down" className="size-5 text-primary shrink-0" />
                            </div>
                        </>
                    )}

                    {selectedTab !== 3 && selectedTab !== 4 && (
                        <>
                            <DateRangeFilter
                                startDate={startDate}
                                endDate={endDate}
                                onStartDateChange={setStartDate}
                                onEndDateChange={setEndDate}
                                isActive={isTodaySelected}
                            />

                            <div className="flex flex-row items-center rounded-xl bg-white text-xl gap-x-2 px-4 border border-black/20 text-black/70 w-fit shrink-0">
                                <Icon icon="mdi:store-marker-outline" className="text-primary text-2xl shrink-0" />
                                <FilterSelector
                                    options={(() => {
                                        if (isBranchViewOnly) {
                                            const dayStartBranchId = localStorage.getItem("selectedBranchId");
                                            return branches.filter((b) => String(b.value ?? "").trim() === String(dayStartBranchId ?? "").trim());
                                        }
                                        const base = [{ value: "", label: "All Branches" }, ...branches.filter((b) => (b.label || "").toString().toLowerCase().trim() !== "all branches" && String(b.value ?? "").trim() !== "")];
                                        return base.filter((o) => (o.label || "").toString().toLowerCase().trim() !== "all branches" || String(o.value ?? "").trim() === "");
                                    })()}
                                    value={branchFilter}
                                    onChange={(e) => { if (!isBranchViewOnly) setBranchFilter(e.target.value); }}
                                    placeholder="All Branches"
                                    className="bg-transparent border-0 font-semibold text-primary focus:outline-none cursor-pointer appearance-none px-3"
                                />
                                <Icon icon="mdi:chevron-down" className="text-primary text-xl shrink-0" />
                            </div>

                            <FilterSelector
                                options={deliveryTypeOptions}
                                value={deliveryTypeFilter}
                                onChange={handleDeliveryTypeFilterChange}
                            />
                        </>
                    )}

                    {!selectMultiple && selectedTab === 1 && hasPermission("SalesRetail_Invoice_Pending_Invoiced_Order_Create") &&
                        <button
                            className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 ms-auto"
                            onClick={() => setSelectMulitple(true)}
                        >Select Multiple
                        </button>
                    }

                    {selectMultiple && selectedOrders.length < ordersForTable.length &&
                        <div className="flex flex-row gap-x-5 basis-full justify-end items-center">
                            <p>Selected {selectedOrders.length} of {ordersForTable.length}</p>
                            {selectedOrders.length > 0 &&
                                <button
                                    className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                                    onClick={() => setSelectedOrders(
                                        ordersForTable.map(order => order.order_id)
                                    )}
                                >Select All
                                </button>
                            }
                            <Link
                                className={
                                    `bg-primary rounded-xl border border-primary font-semibold px-3 py-1.5 text-center ${selectedOrders.length === 0
                                        ? "pointer-events-none opacity-50 text-white/50"
                                        : "text-white"
                                    }`
                                }
                                to={
                                    selectedOrders.length > 0
                                        ? `/salesCorporate/retail/invoice/${selectedOrders.join(",")}/generate`
                                        : "#"
                                }
                                state={selectedOrders.length > 0 ? { orders: ordersForTable.filter(o => selectedOrders.includes(o.order_id)) } : null}
                            >
                                Generate Invoice
                            </Link>
                            <button
                                className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                                onClick={() => {
                                    setSelectMulitple(false);
                                    setSelectedOrders([]);
                                }}
                            >Cancel
                            </button>
                        </div>
                    }

                    {selectMultiple && selectedOrders.length === ordersForTable.length &&
                        <div className="flex flex-row gap-x-5 basis-full justify-end items-center">
                            <p>Selected {selectedOrders.length} of {ordersForTable.length}</p>
                            <button
                                className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                                onClick={() => setSelectedOrders([])}
                            >Deselect All
                            </button>
                            <Link
                                className={
                                    `bg-primary rounded-xl border border-primary font-semibold px-3 py-1.5 text-center ${selectedOrders.length === 0
                                        ? "pointer-events-none opacity-50 text-white/50"
                                        : "text-white"
                                    }`
                                }
                                to={
                                    selectedOrders.length > 0
                                        ? `/salesCorporate/retail/invoice/${selectedOrders.join(",")}/generate`
                                        : "#"
                                }
                                state={selectedOrders.length > 0 ? { orders: ordersForTable.filter(o => selectedOrders.includes(o.order_id)) } : null}
                            >
                                Generate Invoice
                            </Link>
                            <button
                                className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                                onClick={() => {
                                    setSelectMulitple(false);
                                    setSelectedOrders([]);
                                }}
                            >Cancel
                            </button>
                        </div>
                    }
                </div>
            )}

            {/* Orders Table for Tabs 1 & 2 */}
            {selectedTab !== 3 && selectedTab !== 4 && (
                <>
                    {(isLoading && !isSearchMode) || (isSearchMode && isSearching && searchResults.length === 0) ?
                        <div className="flex flex-col items-center justify-center gap-3 py-20 bg-white rounded-xl animate-pulse">
                            <BeatLoader color="#1470F9" size={20} />
                            <span className="text-primary/80 text-sm font-medium">Loading orders...</span>
                        </div> :
                        <div className="rounded-xl bg-white overflow-x-auto relative">
                            <div className={`text-sm grid gap-x-3 divide-x divide-white/20 text-white bg-primary font-semibold py-2 px-3 ${selectedTab === 2 ? "min-w-[1460px]" : "min-w-[1320px]"} [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1`} style={{ gridTemplateColumns: selectedTab === 2 ? "1.6fr 1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" : "1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}>
                                {selectedTab === 2 && <p>INVOICE ID</p>}
                                <p>ORDER ID</p>
                                <p>NAME</p>
                                <p>PHONE</p>
                                <p>DELIVERY TYPE</p>
                                <p>TOTAL AMOUNT</p>
                                <p>ADVANCED</p>
                                <p>PAID AMOUNT</p>
                                <p>DATE</p>
                                <p>TIME</p>
                                <p>DELIVERY DATE</p>
                                <p>ACTION</p>
                            </div>

                            {currentOrders.map((order, index) => {
                                const isSelected = selectedOrders.includes(order.order_id);
                                return (
                                <div
                                    key={index}
                                    className={`grid gap-x-3 divide-x divide-black/10 text-xs py-1.5 px-3 ${selectedTab === 2 ? "min-w-[1460px]" : "min-w-[1320px]"} whitespace-nowrap [&>p]:whitespace-nowrap [&>p]:text-center [&>p]:px-1 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center ${selectMultiple ? "cursor-pointer" : ""} ${isSelected ? "text-red-500 font-bold bg-primary/20" : ""}`}
                                    style={{ gridTemplateColumns: selectedTab === 2 ? "1.6fr 1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" : "1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}
                                    onClick={() => {
                                        if (selectMultiple) {
                                            handleAddToSelected(order.order_id, order.customer_id);
                                        }
                                    }}
                                >
                                    {selectedTab === 2 && <p className="!overflow-visible text-[10px] leading-tight">{order.invoice_id ?? "—"}</p>}
                                    <p className="!overflow-visible text-[10px] leading-tight">{order.order_id ?? "—"}</p>
                                    <div className="min-w-0 whitespace-normal break-normal leading-tight text-center px-1 text-[10px]">{order.customer_name ?? "—"}</div>
                                    <p>{order.phone_number ?? "—"}</p>
                                    <p>{order.delivery_type ?? "—"}</p>
                                    <p>{(() => {
                                        // Use order.total_amount directly if available (from complete API data)
                                        // Otherwise calculate from items as fallback
                                        const rawTotal = (order.total_amount != null && order.total_amount !== "" && !isNaN(Number(order.total_amount)))
                                            ? Number(order.total_amount) + (Number(order.delivery_charge) || 0)
                                            // Fallback: calculate from items if total_amount not available
                                            // Note: API returns price as unit price and quantity separately, so multiply price * quantity
                                            : (order.items || []).reduce((sum, item) => {
                                                const price = Number(item.price) || 0;
                                                const quantity = Number(item.quantity) || 1; // Default to 1 if quantity not specified
                                                return sum + (price * quantity);
                                            }, 0) + (Number(order.delivery_charge) || 0);

                                        // Already Invoiced Order: prefer the actual final invoiced amount (already nets
                                        // out damaged/returned item deductions, computed when the invoice was generated)
                                        // over reapplying the discount to the stale order-entry-time total. Guard against
                                        // "" the same way as invoice_discount below — Number("") is 0, not NaN, so an
                                        // empty value would otherwise silently pass this check as a valid zero total.
                                        const hasInvoiceTotalForReady = order.invoice_total_amount_for_ready != null && String(order.invoice_total_amount_for_ready).trim() !== "" && !isNaN(Number(order.invoice_total_amount_for_ready));
                                        const base = (selectedTab === 2 && hasInvoiceTotalForReady)
                                            ? Number(order.invoice_total_amount_for_ready)
                                            : rawTotal;
                                        // The invoice's own discount field is unreliable — it can be saved as a literal
                                        // "0" (verified in sales_invoices.discount) even when the order itself carries a
                                        // real seasonal/manual discount (sales_orders.discount, e.g. "10%"), so a plain
                                        // null/"" check isn't enough. Only trust invoice_discount when it parses to an
                                        // actual non-zero magnitude; otherwise use the order's own discount.
                                        const discountMagnitude = (d) => {
                                            if (d == null) return 0;
                                            const s = String(d).trim();
                                            if (s === "") return 0;
                                            const n = parseFloat(s.replace('%', '').trim());
                                            return isNaN(n) ? 0 : n;
                                        };
                                        const hasInvoiceDiscount = discountMagnitude(order.invoice_discount) > 0;
                                        const effectiveDiscount = selectedTab === 2 ? (hasInvoiceDiscount ? order.invoice_discount : order.discount) : order.discount;

                                        const total = applyDiscountToAmount(base, effectiveDiscount);
                                        if (isNaN(total)) return "0.00";
                                        return total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    })()}</p>
                                    <p>{(() => {
                                        const totalAdvanced = getOrderTotalAdvanced(order, true);
                                        const formatRs = (n) => (n == null || Number.isNaN(n) ? "0.00" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                        return formatRs(totalAdvanced);
                                    })()}</p>
                                    {selectedTab === 2 && <p>{(() => {
                                        // Amount actually collected when the invoice was generated (after damaged/returned
                                        // deductions and discount) — sales_orders.total_amount/advance_payment/remaining_amount
                                        // reflect order-entry-time values only, so they don't match what was really paid.
                                        if (order.invoice_amount_paid != null && !isNaN(Number(order.invoice_amount_paid))) {
                                            return Number(order.invoice_amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                        }
                                        // Fallback for rows without the invoice-level field yet
                                        let remaining = null;
                                        if (order.remaining_amount != null && order.remaining_amount !== "" && !isNaN(Number(order.remaining_amount))) {
                                            remaining = Number(order.remaining_amount);
                                        } else if (order.total_amount != null && order.advance_payment != null) {
                                            const total = Number(order.total_amount) || 0;
                                            const advance = Number(order.advance_payment) || 0;
                                            remaining = total - advance;
                                        }
                                        if (remaining == null || isNaN(remaining)) return "0.00";
                                        return remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    })()}</p>}
                                    {selectedTab === 1 && <p>{(() => {
                                        const formatRs = (n) =>
                                            n == null || Number.isNaN(n)
                                                ? "0.00"
                                                : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                        const billTotal = getOrderBillTotalNumeric(order);
                                        const remaining = getOrderRemainingBalanceNumeric(order);
                                        if (remaining == null || Number.isNaN(remaining)) return formatRs(0);
                                        const paid = billTotal - remaining;
                                        return formatRs(Math.max(0, paid));
                                    })()}</p>}
                                    {selectedTab === 2 && isSuperadmin ? (
                                        <p
                                            className="cursor-pointer hover:text-primary hover:underline"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDateChangeClick(order);
                                            }}
                                        >
                                            {(() => { const raw = selectedTab === 2 ? order.printed_at : order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()}
                                        </p>
                                    ) : (
                                        <p>{(() => { const raw = selectedTab === 2 ? order.printed_at : order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()}</p>
                                    )}
                                    <p>{(() => { const raw = selectedTab === 2 ? order.printed_at : order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); })()}</p>
                                    <p>{order.delivery_date ? (() => { const d = new Date(order.delivery_date); return isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "—"}</p>
                                    <div className="flex flex-row gap-x-1 justify-center">
                                        {selectedTab === 1 &&
                                            <button
                                                type="button"
                                                className="flex flex-col cursor-pointer items-center bg-transparent border-0"
                                                onClick={() => navigate(`/salesCorporate/retail/invoice/${order.order_id}`, { state: { order } })}
                                            >
                                                <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                                <p className="text-sm">View</p>
                                            </button>
                                        }
                                        {selectedTab === 2 &&
                                            <button
                                                className="flex flex-col cursor-pointer items-center"
                                                onClick={() => {
                                                    setSelectedOrderId(order.order_id);
                                                    setSelectedOrderForView(order);
                                                    setShowViewInvoicesDialog(true);
                                                }}
                                            >
                                                <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                                <p className="text-sm">View</p>
                                            </button>
                                        }
                                        {(invoiceRowEditAllowed && order.status !== "Deactive") && (
                                            <>
                                                <div className="min-h-max border border-black/50 my-1" />
                                                <Link
                                                    to={`update-order/${order.order_id}`}
                                                    className="flex flex-col cursor-pointer"
                                                >
                                                    <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                                    <p className="text-sm">Edit</p>
                                                </Link>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );})}

                            {/* Render blank rows */}
                            {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                                <div
                                    key={`blank-${idx}`}
                                    className={`grid gap-x-3 text-xs py-1.5 ${selectedTab === 2 ? "min-w-[1460px]" : "min-w-[1320px]"} whitespace-nowrap [&>p]:whitespace-nowrap ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                                    style={{ gridTemplateColumns: selectedTab === 2 ? "1.6fr 1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" : "1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}
                                >
                                    <div className="h-8" style={{ gridColumn: "1 / -1" }}></div>
                                </div>
                            ))}
                        </div>
                    }

                    {/* Loading more orders: below table, only when current page is incomplete, we're fetching more, AND there are more orders to load */}
                    {(() => {
                        const isLoadingMore = (selectedTab === 1 && pendingInvoicesLoadingMore) || (selectedTab === 2 && !isSearchMode && alreadyInvoicedLoadingMore);
                        const hasMore = selectedTab === 1 ? pendingInvoicesHasMore : (selectedTab === 2 ? alreadyInvoicedHasMore : false);
                        const shouldShowLoading = isLoadingMore && hasMore && currentOrders.length < itemsPerPage;
                        return shouldShowLoading ? (
                            <div className="flex items-center justify-center gap-2 py-3 bg-primary/5 border-t border-primary/10 animate-pulse">
                                <BeatLoader color="#1470F9" size={12} />
                                <span className="text-primary font-medium text-sm">Loading more orders...</span>
                            </div>
                        ) : null;
                    })()}

                    {/* Pagination - stable layout and displayTotalPages while loading to prevent numbers hiding/reappearing */}
                    <div className="flex flex-row justify-between items-center min-h-[40px]">
                        <p className="text-base text-black/50">
                            Showing {currentOrders.length} materials
                        </p>

                        <div className="flex justify-end gap-2 flex-wrap items-center min-h-[32px]">
                            <button
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                            >
                                First
                            </button>

                            <button
                                onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                            >
                                Previous
                            </button>

                            {(() => {
                                const isLoadingMore = (selectedTab === 1 && pendingInvoicesLoadingMore) || (selectedTab === 2 && !isSearchMode && alreadyInvoicedLoadingMore);
                                const rawTotal = totalPages || 1;
                                // Use stable total pages: never decrease while loading, always show at least current page
                                // This prevents pagination from flickering when totalPages changes
                                const displayTotalPages = isLoadingMore
                                    ? Math.max(rawTotal, lastStableTotalPagesRef.current, currentPage)
                                    : Math.max(rawTotal, currentPage);
                                if (!isLoadingMore) lastStableTotalPagesRef.current = Math.max(rawTotal, currentPage);
                                const effectiveTotalPages = Math.max(displayTotalPages, currentPage);
                                const pageWindow = 5;
                                const half = Math.floor(pageWindow / 2);

                                // Use stable window: NEVER recalculate during loading - keep exact same window
                                let start, end;
                                const lastWindow = lastStableWindowRef.current;

                                if (isLoadingMore) {
                                    // During loading: keep the EXACT same window, never change it
                                    // This ensures pagination is completely stable during data loading
                                    start = lastWindow.start;
                                    end = lastWindow.end; // Keep exact same end, don't expand during loading
                                } else {
                                    // Not loading: check if we need to recalculate
                                    const currentPageInLastWindow = currentPage >= lastWindow.start && currentPage <= lastWindow.end;

                                    if (currentPageInLastWindow) {
                                        // Keep the same window if current page is still in it - don't recalculate
                                        // This maintains stability when totalPages changes but user hasn't navigated
                                        start = lastWindow.start;
                                        end = Math.min(lastWindow.end, effectiveTotalPages);

                                        // Only expand if new pages became available (totalPages increased)
                                        if (effectiveTotalPages > lastWindow.end) {
                                            end = Math.min(effectiveTotalPages, lastWindow.end + 1); // Expand by 1 at a time
                                        }
                                    } else {
                                        // Current page moved outside window: recalculate centered around current page
                                        // This ensures consecutive pages when user navigates
                                        start = Math.max(1, currentPage - half);
                                        end = Math.min(effectiveTotalPages, currentPage + half);

                                        // Ensure window is at least pageWindow size and consecutive
                                        if (end - start + 1 < pageWindow) {
                                            if (start === 1) {
                                                end = Math.min(effectiveTotalPages, start + pageWindow - 1);
                                            } else if (end === effectiveTotalPages) {
                                                start = Math.max(1, end - pageWindow + 1);
                                            } else {
                                                const diff = pageWindow - (end - start + 1);
                                                start = Math.max(1, start - Math.floor(diff / 2));
                                                end = Math.min(effectiveTotalPages, end + Math.ceil(diff / 2));
                                            }
                                        }

                                        // Ensure current page is in the window
                                        if (currentPage < start) start = currentPage;
                                        if (currentPage > end) end = currentPage;
                                    }
                                }

                                // Final bounds check (but don't shrink during loading)
                                // Ensure start and end are valid integers and consecutive
                                start = Math.floor(Math.max(1, Math.min(start, effectiveTotalPages)));
                                end = Math.floor(Math.max(start, Math.min(end, effectiveTotalPages)));

                                if (!isLoadingMore) {
                                    // Ensure current page is always in range
                                    if (currentPage < start) start = currentPage;
                                    if (currentPage > end) end = currentPage;

                                    // Ensure window is at least 1 page wide and consecutive
                                    if (end < start) end = start;
                                } else {
                                    // During loading: keep window stable, just ensure valid bounds
                                    if (end < start) end = start;
                                }

                                // Update stable window ref only when not loading (or when expanding)
                                if (!isLoadingMore || end > lastWindow.end) {
                                    lastStableWindowRef.current = { start, end };
                                }

                                const pages = [];

                                if (start > 1) {
                                    pages.push(
                                        <button
                                            key={1}
                                            onClick={() => handlePageChange(1)}
                                            className={`px-3 py-1 rounded-lg border border-primary/20 shrink-0 ${currentPage === 1
                                                ? "bg-primary text-white font-bold"
                                                : "bg-white text-black/60"
                                                }`}
                                        >
                                            1
                                        </button>
                                    );

                                    if (start > 2) {
                                        pages.push(<span key="start-ellipsis" className="shrink-0">...</span>);
                                    }
                                }

                                // Build page buttons: ensure consecutive pages from start to end (no gaps)
                                // Always include ALL pages from start to end - no skipping, no gaps
                                const pagesToShow = [];

                                // CRITICAL: Add ALL consecutive pages from start to end, no exceptions
                                // This ensures no gaps like 6 ... 8 (missing 7)
                                for (let i = start; i <= end; i++) {
                                    // Only validate bounds, but include all pages in range
                                    if (i >= 1 && i <= effectiveTotalPages) {
                                        pagesToShow.push(i);
                                    }
                                }

                                // Ensure current page is included (should already be, but double-check)
                                if (currentPage >= 1 && currentPage <= effectiveTotalPages) {
                                    if (!pagesToShow.includes(currentPage)) {
                                        pagesToShow.push(currentPage);
                                    }
                                }

                                // Sort to ensure order (should already be sorted, but be safe)
                                pagesToShow.sort((a, b) => a - b);

                                // Render page buttons - render ALL pages in pagesToShow consecutively
                                // No ellipsis logic here - ellipsis only before/after this block
                                for (const pageNum of pagesToShow) {
                                    pages.push(
                                        <button
                                            key={pageNum}
                                            onClick={() => handlePageChange(pageNum)}
                                            className={`px-3 py-1 rounded-lg border border-primary/20 shrink-0 min-w-[2rem] text-center ${pageNum === currentPage
                                                ? "bg-primary text-white font-bold"
                                                : "bg-white text-black/60"
                                                }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                }

                                if (end < effectiveTotalPages) {
                                    if (end < effectiveTotalPages - 1) {
                                        pages.push(<span key="end-ellipsis" className="shrink-0">...</span>);
                                    }

                                    pages.push(
                                        <button
                                            key={effectiveTotalPages}
                                            onClick={() => handlePageChange(effectiveTotalPages)}
                                            className={`px-3 py-1 rounded-lg border border-primary/20 shrink-0 min-w-[2rem] text-center ${currentPage === effectiveTotalPages
                                                ? "bg-primary text-white font-bold"
                                                : "bg-white text-black/60"
                                                }`}
                                        >
                                            {effectiveTotalPages}
                                        </button>
                                    );
                                }

                                return pages;
                            })()}

                            <button
                                onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                            >
                                Next
                            </button>

                            <button
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                            >
                                Last
                            </button>
                        </div>
                    </div>

                    {/* More Orders Button (or More Search Results when using API search) */}
                    {(() => {
                        let hasMore = false;
                        let isLoadingMore = false;
                        let handleLoadMore = null;
                        let showAllLoaded = false;

                        if (isSearchMode) {
                            hasMore = searchResultsHasMore;
                            isLoadingMore = searchResultsLoadingMore;
                            handleLoadMore = handleLoadMoreSearchResults;
                            showAllLoaded = !hasMore && !isLoadingMore && ordersForTable.length > 0;
                        } else if (selectedTab === 1) {
                            // Tab 1 (Pending Invoices): show "More Orders" button for specific branch
                            const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
                            if (!isAllBranches) {
                                // For specific branch: show Load More button
                                hasMore = pendingInvoicesHasMore;
                                isLoadingMore = pendingInvoicesLoadingMore;
                                handleLoadMore = handleLoadMorePendingInvoices;
                            }
                            // Show "All orders loaded" when we have orders but no more to load
                            showAllLoaded = !pendingInvoicesHasMore && !pendingInvoicesLoadingMore && ordersForTable.length > 0;
                        } else if (selectedTab === 2) {
                            // Tab 2 (Already Invoiced): no "More Orders" button; more orders load automatically when user goes to next page
                            // Show "All orders loaded" when we have orders but no more to load
                            showAllLoaded = !alreadyInvoicedHasMore && !alreadyInvoicedLoadingMore && ordersForTable.length > 0;
                        }

                        // Temporarily removed More Orders button
                        // if (hasMore) {
                        //     return (
                        //         <div className="flex justify-center mt-4">
                        //             <button
                        //                 onClick={handleLoadMore}
                        //                 disabled={isLoadingMore}
                        //                 className="px-6 py-2 rounded-lg bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                        //             >
                        //                 {isLoadingMore ? "Loading..." : (isSearchMode ? "More search results" : "More Orders")}
                        //             </button>
                        //         </div>
                        //     );
                        // }

                        if (showAllLoaded) {
                            return (
                                <div className="flex justify-center mt-4">
                                    <p className="text-sm text-black/60 font-medium">All orders loaded</p>
                                </div>
                            );
                        }

                        return null;
                    })()}
                </>
            )
            }

            {/* Sell Vouchers – Voucher Invoice layout (Tab 3) */}
            {selectedTab === 3 && (
                <div className="mt-5 flex flex-col gap-4">
                    {isLoadingVouchers ? (
                        <div className="flex rounded-xl bg-white items-center justify-center py-20">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    ) : (
                        <div className="flex flex-row gap-5">
                            {/* Left: Voucher Invoice preview */}
                            <div ref={voucherInvoicePrintRef} className="flex-1 flex flex-col min-h-[70vh] bg-white rounded-xl border border-primary p-6 shadow-sm print:shadow-none">
                                <div className="flex-1">
                                    <div className="flex flex-row items-start justify-between">
                                        <div className="flex flex-row items-center gap-2">
                                            <span className="text-primary font-bold text-xl">Voucher Invoice</span>
                                            <Icon icon="mdi:refresh" className="text-primary size-5 cursor-pointer" onClick={fetchVouchers} />
                                        </div>
                                        <img src={logo} alt="Logo" className="w-16 object-contain" />
                                    </div>
                                    <div className="text-xs text-black/70 mt-1">
                                        <p className="font-semibold uppercase">SPARKLE OUTLET {localStorage.getItem("selectedBranchName") || "PANADURA"}</p>
                                        <p>NO 489/C, PANADURA</p>
                                        <p>0715522633</p>
                                    </div>
                                    <div className="flex flex-row gap-x-5 mt-2 text-sm">
                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Printed Date:</p>
                                            <p>{new Date().toISOString().split("T")[0]}</p>
                                        </div>
                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Time:</p>
                                            <p>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                        </div>
                                    </div>
                                    <h1 className="font-bold text-center text-2xl my-4">INVOICE</h1>
                                    <div className="border border-black/20 grid grid-cols-2 gap-x-3 p-2 text-sm max-w-md w-fit">
                                        <p className="font-semibold">INVOICE NO:</p>
                                        <p>{voucherInvoiceNo}</p>
                                        <p className="font-semibold">CUSTOMER ID:</p>
                                        <p>{voucherSellCustomer?.customer_id ?? "—"}</p>
                                        <p className="font-semibold">CUSTOMER NAME:</p>
                                        <p className="uppercase">{voucherSellCustomer?.customer_name ?? "—"}</p>
                                        <p className="font-semibold">PHONE NO:</p>
                                        <p>{voucherSellCustomer?.phone_number ?? "—"}</p>
                                    </div>
                                    <p className="font-semibold mt-4 mb-1 text-sm">ITEMS READY:</p>
                                    <table className="w-full border border-black/20 text-sm">
                                        <thead>
                                            <tr className="border-b border-black/20 bg-primary/10">
                                                <th className="border-r border-black/20 py-1 px-2 text-left">VOUCHER CODE</th>
                                                <th className="border-r border-black/20 py-1 px-2">ISSUED DATE</th>
                                                <th className="border-r border-black/20 py-1 px-2">EXPIRE DATE</th>
                                                <th className="border-r border-black/20 py-1 px-2">VALIDITY PERIOD</th>
                                                <th className="py-1 px-2">VALUE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vouchersAddedToSell.map((v, i) => (
                                                <tr key={i} className="border-b border-black/10">
                                                    <td className="border-r border-black/20 py-1 px-2">{v.voucher_code}</td>
                                                    <td className="border-r border-black/20 py-1 px-2 text-center">{voucherSellIssuedDate || (v.issued_date ? new Date(v.issued_date).toISOString().split("T")[0] : "—")}</td>
                                                    <td className="border-r border-black/20 py-1 px-2 text-center">{v.expire_date ? new Date(v.expire_date).toISOString().split("T")[0] : "—"}</td>
                                                    <td className="border-r border-black/20 py-1 px-2 text-center">{v.validity_period != null && v.validity_period !== "" ? (typeof v.validity_period === "number" ? `${v.validity_period} DAYS` : v.validity_period) : "—"}</td>
                                                    <td className="py-1 px-2 text-right">Rs {Number(v.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="border border-black/20 mt-3 p-2 text-sm space-y-1">
                                        <div className="flex flex-row justify-between">
                                            <span className="font-semibold">Total Amount</span>
                                            <span>Rs {vouchersAddedToSell.reduce((s, v) => s + (Number(v.value) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex flex-row justify-between">
                                            <span className="font-semibold">Cash Received</span>
                                            <span>Rs {vouchersAddedToSell.reduce((s, v) => s + (Number(v.value) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex flex-row justify-between">
                                            <span className="font-semibold">Payment Method</span>
                                            <span>{voucherSellPaymentMethod}</span>
                                        </div>
                                        <div className="flex flex-row justify-between">
                                            <span className="font-semibold">Balance</span>
                                            <span>Rs 0.00</span>
                                        </div>
                                    </div>
                                    <div className="mt-3 text-sm">
                                        <p className="font-semibold">NOTES:</p>
                                        <p className="text-black/70 min-h-[1.5rem]">{voucherSellNotes || ""}</p>
                                        <p className="font-semibold mt-2">TERMS & CONDITIONS:</p>
                                        <p className="text-black/70 min-h-[1.5rem]">{voucherSellTerms || ""}</p>
                                    </div>
                                </div>
                                <div className="mt-auto pt-4">
                                    <p className="text-xs text-center text-black/60">"THIS IS SYSTEM GENERATED"</p>
                                    <div className="text-xs text-center mt-2 text-black/70 pt-2">
                                        <p className="font-semibold">CL Solutions (PVT) LTD</p>
                                        <p>Registered address:583/71, Augustine Premathirathne Mawatha, Liyanagemulla, Seeduwa</p>
                                        <p>Laundry facility: 391,Avissawella Road,Wellampitiya</p>
                                        <p>TEL: 94 114 701 566, EMAIL: info@sparklelaundry.lk, WEB : www.sparklelaundry.lk</p>
                                        <p className="mt-1">PAGE NO 1</p>
                                        <p>POWERED BY CEYLONX CORPORATION (PVT) LTD</p>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Form panel */}
                            <aside className="w-[380px] flex-shrink-0 bg-gray-100 rounded-xl p-5 flex flex-col gap-4">
                                <div className="relative">
                                    <label className="block font-semibold text-sm mb-1">Add Gift Voucher</label>
                                    <div className="flex flex-row gap-2">
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm"
                                                placeholder="Search or scan voucher code."
                                                value={voucherAddCodeInput}
                                                onChange={(e) => setVoucherAddCodeInput(e.target.value)}
                                            />
                                            {voucherAddCodeInput.trim() !== "" && (() => {
                                                const available = vouchers.filter(
                                                    v => (v.status === "Inactive" || v.status === "Pending") &&
                                                        String(v.voucher_code || "").toLowerCase().includes(voucherAddCodeInput.trim().toLowerCase()) &&
                                                        !vouchersAddedToSell.some(added => added.voucher_id === v.voucher_id)
                                                );
                                                if (available.length === 0) return null;
                                                return (
                                                    <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-black/20 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                                        {available.map((v) => (
                                                            <li
                                                                key={v.voucher_id}
                                                                className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 border-b border-black/5 last:border-b-0"
                                                                onClick={() => {
                                                                    setVouchersAddedToSell(prev => [...prev, v]);
                                                                    setVoucherAddCodeInput("");
                                                                }}
                                                            >
                                                                <span className="font-medium">{v.voucher_code}</span>
                                                                <span className="text-black/60 ml-2">Rs {Number(v.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                {v.status && <span className="ml-2 text-xs text-black/50">({v.status})</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                );
                                            })()}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!voucherTabFlags.canCreateSellVouchers}
                                            className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => {
                                                if (!voucherTabFlags.canCreateSellVouchers) return;
                                                const code = (voucherAddCodeInput || "").trim();
                                                if (!code) return;
                                                const available = vouchers.filter(
                                                    v => (v.status === "Inactive" || v.status === "Pending") &&
                                                        String(v.voucher_code || "").toLowerCase().includes(code.toLowerCase()) &&
                                                        !vouchersAddedToSell.some(added => added.voucher_id === v.voucher_id)
                                                );
                                                if (available.length === 1) {
                                                    setVouchersAddedToSell(prev => [...prev, available[0]]);
                                                    setVoucherAddCodeInput("");
                                                } else if (available.length > 1) {
                                                    Swal.fire({ icon: "info", title: "Select one", text: `Multiple vouchers match. Type more or pick from the list (${available.length} matches).`, confirmButtonColor: "#1470F9" });
                                                } else {
                                                    const alreadyAdded = vouchers.some(v => v.voucher_code?.toLowerCase() === code.toLowerCase() && vouchersAddedToSell.some(added => added.voucher_id === v.voucher_id));
                                                    if (alreadyAdded) Swal.fire({ icon: "info", title: "Already added", text: "This voucher is already in the list.", confirmButtonColor: "#1470F9" });
                                                    else Swal.fire({ icon: "warning", title: "Not found", text: "No pre-created voucher found with this code or it is not available to sell (must be Inactive/Pending).", confirmButtonColor: "#1470F9" });
                                                }
                                            }}
                                        >
                                            Add Voucher
                                        </button>
                                    </div>
                                    {vouchersAddedToSell.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {vouchersAddedToSell.map((v, i) => (
                                                <div key={v.voucher_id || i} className="flex flex-row items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border border-black/10">
                                                    <span>{v.voucher_code} Rs {Number(v.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    <button type="button" className="text-red-500 hover:bg-red-500/10 rounded p-1" onClick={() => setVouchersAddedToSell(prev => prev.filter((_, idx) => idx !== i))}>
                                                        <Icon icon="mdi:close" className="size-5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Select Customer:</label>
                                    <Select
                                        placeholder="Add customer."
                                        options={voucherSellCustomers.map(c => ({ value: c.customer_id, label: `${c.customer_name} (${c.customer_id})` }))}
                                        value={voucherSellCustomer ? { value: voucherSellCustomer.customer_id, label: `${voucherSellCustomer.customer_name} (${voucherSellCustomer.customer_id})` } : null}
                                        onChange={(opt) => setVoucherSellCustomer(voucherSellCustomers.find(c => c.customer_id === opt?.value) ?? null)}
                                        styles={{ control: (base) => ({ ...base, borderRadius: "0.5rem", minHeight: "40px" }) }}
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Issued Date:</label>
                                    <input
                                        type="date"
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Add issued date"
                                        value={voucherSellIssuedDate}
                                        onChange={(e) => setVoucherSellIssuedDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Select Payment Method:</label>
                                    <select
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm bg-white"
                                        value={voucherSellPaymentMethod}
                                        onChange={(e) => setVoucherSellPaymentMethod(e.target.value)}
                                    >
                                        <option value="Card">Card</option>
                                        <option value="CASH">Cash</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Card Amount:</label>
                                    <input
                                        type="text"
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Amount"
                                        value={voucherSellCardAmount}
                                        onChange={(e) => setVoucherSellCardAmount(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Card Type:</label>
                                    <select
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm bg-white"
                                        value={voucherSellCardType}
                                        onChange={(e) => setVoucherSellCardType(e.target.value)}
                                    >
                                        <option value="Credit">Credit</option>
                                        <option value="Debit">Debit</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Bank:</label>
                                    <input
                                        type="text"
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Select bank"
                                        value={voucherSellBank}
                                        onChange={(e) => setVoucherSellBank(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Enter Note:</label>
                                    <textarea
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm min-h-[60px]"
                                        placeholder="Enter note here."
                                        value={voucherSellNotes}
                                        onChange={(e) => setVoucherSellNotes(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Enter Terms & Conditions:</label>
                                    <textarea
                                        className="w-full border border-black/20 rounded-lg px-3 py-2 text-sm min-h-[60px]"
                                        placeholder="Enter terms & conditions."
                                        value={voucherSellTerms}
                                        onChange={(e) => setVoucherSellTerms(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    disabled={!voucherTabFlags.canCreateSellVouchers}
                                    className="bg-primary text-white rounded-xl py-2.5 font-semibold w-full disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleApplySellVouchers}
                                >
                                    Apply
                                </button>
                            </aside>
                        </div>
                    )}

                    {/* Bottom bar: Back, Print Invoice */}
                    <div className="flex flex-row justify-between items-center py-4">
                        <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 px-6" onClick={() => setSelectedTab(1)}>Back</button>
                        <button type="button" className="font-semibold text-white bg-primary rounded-full py-2 px-6" onClick={handlePrintVoucherInvoice}>Print Invoice</button>
                    </div>
                </div>
            )}

            {/* Sold Vouchers Table for Tab 4 */}
            {selectedTab === 4 && (
                <div className="mt-5">
                    {isLoadingVouchers ? (
                        <div className="flex rounded-xl bg-white items-center justify-center py-20">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    ) : filteredSoldVoucherRows.length === 0 ? (
                        <div className="text-center py-10 text-black/50 bg-white rounded-xl border border-primary/20">
                            <p className="text-xl">No sold vouchers found</p>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl bg-white overflow-hidden border border-primary">
                                <div className="text-xl grid [&>*]:min-w-0 grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                                    <p className="text-start">INVOICE ID</p>
                                    <p>NO OF VOUCHERS</p>
                                    <p>TOTAL VALUE</p>
                                    <p>ISSUED TO</p>
                                    <p>ISSUED DATE</p>
                                    <p>EXPIRY DATE</p>
                                    <p>STATUS</p>
                                    <p>ACTION</p>
                                </div>
                                {currentPageSoldVouchers.map((row, index) => {
                                    const formatDateSlash = (dateVal) => {
                                        if (!dateVal) return "—";
                                        const d = new Date(dateVal);
                                        return isNaN(d.getTime()) ? "—" : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
                                    };
                                    const statusLabel = row.status === "Expired" ? "Expire" : row.status;
                                    const statusPillClass = "rounded-full px-4 py-0.5 inline-block min-w-[5.5rem] text-center";
                                    const statusEl = row.status === "Pending"
                                        ? <p className={`text-amber-600 bg-amber-500/20 ${statusPillClass}`}>{statusLabel}</p>
                                        : row.status === "Active"
                                            ? <p className={`text-green-500 bg-green-500/20 ${statusPillClass}`}>{statusLabel}</p>
                                            : row.status === "Inactive"
                                                ? <p className={`text-green-500 bg-green-500/20 ${statusPillClass}`}>{statusLabel}</p>
                                                : row.status === "Redeemed"
                                                    ? <p className={`text-red-500 bg-red-500/20 ${statusPillClass}`}>{statusLabel}</p>
                                                    : row.status === "Expired"
                                                        ? <p className={`text-red-500 bg-red-500/20 ${statusPillClass}`}>{statusLabel}</p>
                                                        : <p className={`text-gray-600 bg-gray-500/20 ${statusPillClass}`}>{statusLabel || "Pending"}</p>;
                                    return (
                                        <div
                                            key={row.invoice_id + "-" + index}
                                            className={`grid [&>*]:min-w-0 [&>*]:overflow-hidden [&>p]:text-ellipsis grid-cols-8 gap-x-3 text-lg py-1.5 text-center px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                                        >
                                            <p className="text-start">{row.invoice_id}</p>
                                            <p>{row.count}</p>
                                            <p>{Number(row.totalValue).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                            <p>{row.issued_to}</p>
                                            <p>{formatDateSlash(row.issued_date)}</p>
                                            <p>{formatDateSlash(row.expire_date)}</p>
                                            <p className="flex justify-center">
                                                {statusEl}
                                            </p>
                                            <div className="flex flex-row gap-x-1 justify-center">
                                                <button
                                                    type="button"
                                                    className="flex flex-col cursor-pointer items-center"
                                                    onClick={() => {
                                                        setSelectedVoucher(row.vouchers[0]);
                                                        setShowActivateVoucherDialog(true);
                                                    }}
                                                >
                                                    <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                                    <p className="text-sm">View</p>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {currentPageSoldVouchers.length > 0 && Array.from({ length: soldVouchersBlankRows }, (_, i) => (
                                    <div key={`blank-${i}`} className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 text-center px-3 ${(currentPageSoldVouchers.length + i) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center min-h-[44px]`}>
                                        <p className="text-start">&nbsp;</p>
                                        <p>&nbsp;</p>
                                        <p>&nbsp;</p>
                                        <p>&nbsp;</p>
                                        <p>&nbsp;</p>
                                        <p>&nbsp;</p>
                                        <p>&nbsp;</p>
                                        <p>&nbsp;</p>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-row justify-between items-center mt-3 px-1">
                                <p className="text-base text-black/50">
                                    Show {filteredSoldVoucherRows.length === 0 ? 0 : soldVouchersStart + 1} to {soldVouchersEnd} of {filteredSoldVoucherRows.length} entries
                                </p>
                                <div className="flex justify-end gap-2 flex-wrap items-center">
                                    <button
                                        type="button"
                                        onClick={() => setSoldVouchersCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={soldVouchersCurrentPage === 1}
                                        className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-50 font-semibold"
                                    >
                                        Previous
                                    </button>
                                    {(() => {
                                        const pageWindow = 5;
                                        const half = Math.floor(pageWindow / 2);
                                        let start = Math.max(soldVouchersCurrentPage - half, 1);
                                        let end = Math.min(start + pageWindow - 1, soldVouchersTotalPages);
                                        if (end - start + 1 < pageWindow) start = Math.max(1, end - pageWindow + 1);
                                        const pages = [];
                                        for (let p = start; p <= end; p++) {
                                            pages.push(
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setSoldVouchersCurrentPage(p)}
                                                    className={`px-3 py-1.5 rounded-lg font-semibold border border-primary/20 ${soldVouchersCurrentPage === p ? "bg-primary text-white" : "bg-white text-black/60"}`}
                                                >
                                                    {p}
                                                </button>
                                            );
                                        }
                                        return pages;
                                    })()}
                                    <button
                                        type="button"
                                        onClick={() => setSoldVouchersCurrentPage((p) => Math.min(soldVouchersTotalPages, p + 1))}
                                        disabled={soldVouchersCurrentPage >= soldVouchersTotalPages}
                                        className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-50 font-semibold"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {
                showActivateVoucherDialog && (
                    <RetailActivateVoucherDialog
                        voucher={selectedVoucher}
                        handleClose={() => {
                            setShowActivateVoucherDialog(false);
                            setSelectedVoucher(null);
                        }}
                        onActivate={handleActivateVoucher}
                    />
                )
            }

            {
                showViewInvoicesDialog &&
                <RetailViewInvoices
                    orderId={selectedOrderId}
                    order={selectedOrderForView}
                    handleClose={() => {
                        setShowViewInvoicesDialog(false);
                        setSelectedOrderId(null);
                        setSelectedOrderForView(null);
                    }} />
            }

            {/* Date Change Calendar Popup (superAdmin only) */}
            {showDateChangeCalendar && isSuperadmin && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                        <h2 className="text-xl font-semibold mb-4">Change Invoice Date</h2>
                        <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">
                                Order ID: <span className="font-medium">{selectedOrderForDateChange?.order_id}</span>
                            </p>
                            <p className="text-sm text-gray-600 mb-4">
                                Invoice ID: <span className="font-medium">{selectedOrderForDateChange?.invoice_id}</span>
                            </p>
                            <label className="block text-sm font-medium mb-2">Select New Date</label>
                            <input
                                type="date"
                                value={selectedNewDate}
                                onChange={(e) => setSelectedNewDate(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDateChangeCalendar(false);
                                    setSelectedOrderForDateChange(null);
                                    setSelectedNewDate("");
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                                disabled={isUpdatingDate}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDateChangeSubmit}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                                disabled={isUpdatingDate || !selectedNewDate}
                            >
                                {isUpdatingDate ? "Updating..." : "Update Date"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default SalesRetailInvoice;
