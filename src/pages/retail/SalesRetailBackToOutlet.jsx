import React, { useEffect, useMemo, useState, useRef } from "react";
import { applyDiscountToAmount } from "../../utils/discount";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import DetailsCard from "../../components/ui/DetailsCard";
import { MdSearch } from "react-icons/md";
import FilterSelector from "../../components/ui/FilterSelector";
import { BeatLoader } from "react-spinners";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import RetailServiceOrder from "../../components/printables/RetailServiceOrder";
import RetailBulkServiceOrder from "../../components/printables/RetailBulkServiceOrder";
import { getAllBranches, searchOrderById } from "../../services/Retail/RetailOrderServices";
import {
    getAllRetailBackToOutletOrders,
    getAllRetailRecieveBackToOutletOrders,
    getAllRetailCompletedBackToOutletOrders,
    markAsSendBackToOutletOrder,
    markBulkAsSendBackToOutletOrder,
    markAsReceivedBackToOutletOrder,
    markBulkAsReceivedBackToOutletOrder,
    getAllRetailBackToOutletOrdersAllBranches,
    getAllRetailRecieveBackToOutletOrdersAllBranches,
    getAllRetailCompletedBackToOutletOrdersAllBranches,
    getNextDispatchNoteNumber,
    useDispatchNoteNumber,
} from "../../services/Retail/RetailBackToOutletServices";
import {
    getRetailDashboardTotalOrders,
    getRetailDashboardReadyForPickupOrders,
    getRetailDashboardReleaseTodayOrders,
    getRetailDashboardExpressOrders,
} from "../../services/Retail/RetailDashboardServices";
import { getAllRetailPendingInvoices, getPendingInvoiceOrdersAllBranches } from "../../services/Retail/RetailInvoiceServices";
import { getAllSettings } from "../../services/Retail/RetailSettingsServices";
import { useReactToPrint } from "react-to-print";
import Pagination from "../../components/ui/Pagination";
import {
    hasSalesRetailInvoiceDispatchNoteEdit,
    hasSalesRetailOutletDispatchNoteEdit,
    hasSalesRetailOutletDispatchNoteSend,
    hasSalesRetailOutletReceivedNoteEdit,
    hasSalesRetailOutletReceivedNoteReceiveAction,
    parsePermissionTokens,
    getDispatchNoteTabVisibility,
    canAccessDispatchNoteManagement,
} from "../../utils/retailSubTabPermissions";
import { isSuperadminRole } from "../../utils/permissionHelper";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { isDateRangeFilterActive, isDateWithinRange } from "../../utils/dateRange";
import PermissionDenied from "../../components/ui/PermissionDenied";

const SalesRetailBackToOutlet = () => {
    const dispatchStickerRef = useRef(null);
    const bulkDispatchStickerRef = useRef(null);
    const ordersToPrintRef = useRef([]);

    const [selectedDriver, setSelectedDriver] = useState("");
    const [selectedVehicle, setSelectedVehicle] = useState("");

    const handlePrintDispatchStickers = useReactToPrint({
        contentRef: dispatchStickerRef,
    });

    const handlePrintBulkDispatchStickers = useReactToPrint({
        contentRef: bulkDispatchStickerRef,
    });

    const location = useLocation();

    const permissions = localStorage.getItem("permissions") || "";
    const permissionTokens = useMemo(() => parsePermissionTokens(permissions), [permissions]);
    const isSuperadmin = isSuperadminRole(localStorage.getItem("role"));
    const dispatchNoteTabVisibility = useMemo(
        () => getDispatchNoteTabVisibility(permissionTokens, isSuperadmin),
        [permissionTokens, isSuperadmin]
    );
    const canAccessPage = useMemo(
        () => canAccessDispatchNoteManagement(permissionTokens, isSuperadmin),
        [permissionTokens, isSuperadmin]
    );

    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    // Touched explicitly (vs. derived from the values) so a deep link from the dashboard can force
    // the today/today default range to actually filter, instead of reading as "untouched".
    const [isDateRangeTouched, setIsDateRangeTouched] = useState(!!location.state?.todayFilter);
    const isTodaySelected = isDateRangeTouched || isDateRangeFilterActive(startDate, endDate);
    const handleStartDateChange = (value) => {
        setStartDate(value);
        setIsDateRangeTouched(true);
    };
    const handleEndDateChange = (value) => {
        setEndDate(value);
        setIsDateRangeTouched(true);
    };
    const [branches, setBranches] = useState([]);

    const [branchFilter, setBranchFilter] = useState(localStorage.getItem("selectedBranchId") || "");

    const [selectedTab, setSelectedTab] = useState(location.state?.tab ?? 1);
    const canEditCurrentTab = useMemo(() => {
        if (selectedTab === 1) return hasSalesRetailOutletDispatchNoteEdit(permissions, permissionTokens);
        if (selectedTab === 2) return hasSalesRetailOutletReceivedNoteEdit(permissions, permissionTokens);
        return hasSalesRetailInvoiceDispatchNoteEdit(permissions, permissionTokens);
    }, [selectedTab, permissions, permissionTokens]);

    const canSendOrReceiveAction = useMemo(() => {
        if (selectedTab === 1) return hasSalesRetailOutletDispatchNoteSend(permissions, permissionTokens);
        if (selectedTab === 2) return hasSalesRetailOutletReceivedNoteReceiveAction(permissions, permissionTokens);
        return false;
    }, [selectedTab, permissions, permissionTokens]);
    /**
     * A role that can only View the current sub-tab (no Edit and no Send/Receive of its own) is
     * locked to the branch it started its day with — it shouldn't be able to browse other
     * branches' orders through the filter.
     */
    const isBranchViewOnly = useMemo(() => {
        const hasView = selectedTab === 1
            ? dispatchNoteTabVisibility.outletDispatch
            : selectedTab === 2
                ? dispatchNoteTabVisibility.outletReceived
                : dispatchNoteTabVisibility.readyToInvoice;
        return !!hasView && !canEditCurrentTab && !canSendOrReceiveAction;
    }, [selectedTab, dispatchNoteTabVisibility, canEditCurrentTab, canSendOrReceiveAction]);
    const [backToOutletOrders, setBackToOutletOrders] = useState([]);
    const [backToOutletOrdersReceived, setBackToOutletOrdersReceived] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchResultsOffset, setSearchResultsOffset] = useState(0);
    const [searchResultsHasMore, setSearchResultsHasMore] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchResultsLoadingMore, setSearchResultsLoadingMore] = useState(false);
    const [deliveryTypeFilter, setDeliveryTypeFilter] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);

    // Pagination and Count States
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const [totalBackToOutletCount, setTotalBackToOutletCount] = useState(0);
    const [totalReceivedCount, setTotalReceivedCount] = useState(0);
    const [totalInvoicesCount, setTotalInvoicesCount] = useState(0);

    const [totalOrders, setTotalOrders] = useState(null);
    const [readyForPickupOrders, setReadyForPickupOrders] = useState(null);
    const [releaseTodayOrders, setReleaseTodayOrders] = useState(null);
    const [expressOrders, setExpressOrders] = useState(null);
    const [settings, setSettings] = useState(null);
    const [selectMultipleSend, setSelectMultipleSend] = useState(false);
    const [selectMultipleReceive, setSelectMultipleReceive] = useState(false);
    const [selectedSendOrders, setSelectedSendOrders] = useState([]);
    const [selectedReceiveOrders, setSelectedReceiveOrders] = useState([]);
    const selectedForSend = useMemo(() => selectedSendOrders.map(order => order.order_id), [selectedSendOrders]);
    const selectedForReceive = useMemo(() => selectedReceiveOrders.map(order => order.order_id), [selectedReceiveOrders]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
    const [showSendConfirmationDialog, setShowSendConfirmationDialog] = useState(false);
    const [showSendBulkConfirmationDialog, setShowSendBulkConfirmationDialog] = useState(false);
    const [showReceiveBulkConfirmationDialog, setShowReceiveBulkConfirmationDialog] = useState(false);
    const [dispatchServiceTypeId, setDispatchServiceTypeId] = useState(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Bulk print / dispatch note state
    const [ordersToPrint, setOrdersToPrint] = useState([]);
    const [shouldPrint, setShouldPrint] = useState(false);
    const [printDispatchNoteOnly, setPrintDispatchNoteOnly] = useState(false);
    const [showDispatchNoteDialog, setShowDispatchNoteDialog] = useState(false);
    const [stickersOnly, setStickersOnly] = useState(false);
    const [dispatchNoteCreatedFirst, setDispatchNoteCreatedFirst] = useState(false);
    const [currentDispatchNoteNo, setCurrentDispatchNoteNo] = useState("DN - 01");
    const lastFetchedScopeRef = useRef("");
    const branchRefreshInProgressRef = useRef(false);

    const deliveryTypeOptions = [
        { value: "Urgent", label: "Urgent" },
        { value: "Express", label: "Express" },
        { value: "One Day", label: "One Day" },
        { value: "Two Day", label: "Two Day" },
        { value: "Normal", label: "Normal" },
    ];

    // Trigger bulk print after ordersToPrint state has updated
    useEffect(() => {
        if (shouldPrint && ordersToPrint.length > 0) {
            setTimeout(() => {
                handlePrintBulkDispatchStickers();
                setShouldPrint(false);
                ordersToPrintRef.current = [];
                setStickersOnly(false);
            }, 300);
        }
    }, [shouldPrint, ordersToPrint, handlePrintBulkDispatchStickers]);

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

    const getBranchIdForPayload = () => {
        if (branchFilter) return Number(branchFilter);
        const stored = localStorage.getItem("selectedBranchId");
        if (stored && !Number.isNaN(Number(stored))) return Number(stored);
        return 1;
    };

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

    const extractPendingOrders = (response) => {
        if (!response) {
            console.warn("extractPendingOrders: No response", response);
            return [];
        }

        if (response.data) {
            if (Array.isArray(response.data.pending_invoice_orders)) {
                return response.data.pending_invoice_orders;
            }
            if (Array.isArray(response.data.orders)) {
                return response.data.orders;
            }
            if (Array.isArray(response.data)) {
                return response.data;
            }
            if (response.data.pending_invoice_orders) {
                return Array.isArray(response.data.pending_invoice_orders)
                    ? response.data.pending_invoice_orders
                    : [];
            }
            for (const key in response.data) {
                if (Array.isArray(response.data[key])) {
                    return response.data[key];
                }
            }
        }

        if (Array.isArray(response)) return response;
        if (Array.isArray(response.orders)) return response.orders;

        return [];
    };

    const extractOrdersArray = (response) => {
        const d = response?.data;
        if (!d) return [];
        if (Array.isArray(d)) return d;
        const arr = d.pending_back_to_outlet_orders ?? d.pending_back_to_outlet ?? d.pending_orders ?? d.orders ?? d.data;
        if (Array.isArray(arr)) return arr;
        for (const key of Object.keys(d)) {
            if (Array.isArray(d[key])) return d[key];
        }
        return [];
    };

    const SEARCH_PAGE_SIZE = 15;
    const fetchSearchOrders = async (append = false) => {
        const q = searchQuery.trim();
        if (!q) return;
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        try {
            if (append) setSearchResultsLoadingMore(true);
            else setIsSearching(true);
            const offset = append ? searchResultsOffset : 0;

            const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
            const searchBranchId = isAllBranches
                ? -1
                : (branchFilter != null && String(branchFilter).trim() !== ""
                    ? Number(branchFilter)
                    : Number(localStorage.getItem("selectedBranchId")) || 1);

            const currentStatus =
                selectedTab === 1 ? "Outlet Dispatch Note"
                    : selectedTab === 2 ? "Outlet Received Note"
                        : selectedTab === 3 ? "Pending Invoiced Order"
                            : undefined;

            const response = await searchOrderById(userId, q, offset, searchBranchId, 50, currentStatus);

            if (!response || !response.data) {
                setSearchResults([]);
                return;
            }

            const raw = response.data;

            let list = [];
            if (Array.isArray(raw?.orders)) {
                list = raw.orders.length > 0 && Array.isArray(raw.orders[0]) ? raw.orders.flat() : raw.orders;
            } else if (Array.isArray(raw?.data?.orders)) {
                list = raw.data.orders.length > 0 && Array.isArray(raw.data.orders[0]) ? raw.data.orders.flat() : raw.data.orders;
            } else if (Array.isArray(raw?.data)) {
                list = raw.data.length > 0 && Array.isArray(raw.data[0]) ? raw.data.flat() : raw.data;
            } else if (Array.isArray(raw)) {
                list = raw.length > 0 && Array.isArray(raw[0]) ? raw.flat() : raw;
            } else if (Array.isArray(raw?.result)) {
                list = raw.result.length > 0 && Array.isArray(raw.result[0]) ? raw.result.flat() : raw.result;
            } else if (Array.isArray(raw?.searchResults)) {
                list = raw.searchResults.length > 0 && Array.isArray(raw.searchResults[0]) ? raw.searchResults.flat() : raw.searchResults;
            } else if (raw?.order && typeof raw.order === "object" && (raw.order.order_id != null || raw.order.items != null)) {
                list = [raw.order];
            } else if (raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) && (raw.data.order_id != null || raw.data.items != null)) {
                list = [raw.data];
            } else if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw.order_id != null || raw.items != null)) {
                list = [raw];
            }

            const count = raw?.count ?? raw?.data?.count ?? list.length;

            const displayList = list
                .map((order) => {
                    if (!order || typeof order !== "object") return null;
                    const base = { ...order };

                    if (!base.order_id) {
                        if (base.id) base.order_id = String(base.id);
                        else if (base.order_number) base.order_id = String(base.order_number);
                        else if (base.orderId) base.order_id = String(base.orderId);
                    }
                    if (base.order_id) base.order_id = String(base.order_id);

                    if (!base.customer_name || base.customer_name === "") {
                        if (base.customer) base.customer_name = String(base.customer);
                        else if (base.customerName) base.customer_name = String(base.customerName);
                    }
                    if (base.customer_name) base.customer_name = String(base.customer_name);

                    if (!base.phone_number || base.phone_number === "") {
                        if (base.phone) base.phone_number = String(base.phone);
                        else if (base.phoneNumber) base.phone_number = String(base.phoneNumber);
                        else if (base.contact_number) base.phone_number = String(base.contact_number);
                    }
                    if (base.phone_number) base.phone_number = String(base.phone_number);

                    if (!base.delivery_type || base.delivery_type === "") {
                        if (base.delivery_method) base.delivery_type = String(base.delivery_method);
                        else if (base.deliveryType) base.delivery_type = String(base.deliveryType);
                    }
                    if (base.delivery_type) base.delivery_type = String(base.delivery_type);

                    if (!base.created_at || base.created_at === "") {
                        if (base.created_date) base.created_at = base.created_date;
                        else if (base.createdDate) base.created_at = base.createdDate;
                        else if (base.created) base.created_at = base.created;
                    }

                    if (!base.delivery_date || base.delivery_date === "") {
                        if (base.delivery_due_date) base.delivery_date = base.delivery_due_date;
                        else if (base.deliveryDueDate) base.delivery_date = base.deliveryDueDate;
                        else if (base.due_date) base.delivery_date = base.due_date;
                    }

                    if (!Array.isArray(base.items)) {
                        if (base.items && typeof base.items === "object") {
                            base.items = Array.isArray(base.items.items) ? base.items.items : [];
                        } else {
                            base.items = [];
                        }
                    }

                    const parseAmount = (val) => {
                        if (val == null || val === "") return null;
                        const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
                        return isNaN(num) ? null : num;
                    };
                    base.total_amount = parseAmount(base.total_amount ?? base.totalAmount);
                    base.remaining_amount = parseAmount(base.remaining_amount ?? base.remainingAmount);
                    base.advance_payment = parseAmount(base.advance_payment ?? base.advancePayment);
                    base.delivery_charge = parseAmount(base.delivery_charge ?? base.deliveryCharge);

                    if (base.remaining_amount == null && base.total_amount != null) {
                        base.remaining_amount = (Number(base.total_amount) || 0) - (Number(base.advance_payment) || 0);
                    }

                    if (base.status == null && base.order_status != null) base.status = base.order_status;
                    if (base.order_status == null && base.status != null) base.order_status = base.status;

                    if (base.invoice_id == null && base.invoiceId != null) base.invoice_id = String(base.invoiceId);

                    return base;
                })
                .filter((order) => order != null && order.status !== "Deactive");

            if (displayList.length === 0) {
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

    const fetchAllBackToOutletOrders = async (offset = 0) => {
        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
            const branchId = Number(branchFilter) || (Number(localStorage.getItem("selectedBranchId")) || 1);

            // Backend pages return up to 15 orders regardless of status, so a batch with
            // Deactive orders can leave this page short. Keep pulling further raw pages
            // until we have a full page of active orders or the backend runs out.
            let rawOffset = offset;
            let collected = [];
            let totalCount = 0;
            let guard = 0;
            while (collected.length < 15 && guard < 20) {
                const response = isAllBranches
                    ? await getAllRetailBackToOutletOrdersAllBranches(userId, rawOffset)
                    : await getAllRetailBackToOutletOrders(userId, branchId, rawOffset);
                const list = extractOrdersArray(response);
                totalCount = response?.data?.total_count || totalCount;
                collected = collected.concat(list.filter(order => order.status !== "Deactive"));
                rawOffset += list.length;
                guard += 1;
                if (list.length === 0 || (totalCount && rawOffset >= totalCount)) break;
            }

            setTotalBackToOutletCount(totalCount || collected.length);
            const sorted = collected.sort((a, b) => {
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });
            setBackToOutletOrders(sorted.slice(0, 15));
        } catch (error) {
            console.error("Error fetching back to outlet orders:", error);
            setBackToOutletOrders([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAllReceiveBackToOutletOrders = async (offset = 0) => {
        try {
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
            const branchId = Number(branchFilter) || (Number(localStorage.getItem("selectedBranchId")) || 1);

            // Same top-up as fetchAllBackToOutletOrders: don't let Deactive orders in a
            // batch leave this page short of a full 15 rows.
            let rawOffset = offset;
            let collected = [];
            let totalCount = 0;
            let guard = 0;
            while (collected.length < 15 && guard < 20) {
                const response = isAllBranches
                    ? await getAllRetailRecieveBackToOutletOrdersAllBranches(userId, rawOffset)
                    : await getAllRetailRecieveBackToOutletOrders(userId, branchId, rawOffset);
                const list = extractOrdersArray(response);
                totalCount = response?.data?.total_count || totalCount;
                collected = collected.concat(list.filter(order => order.status !== "Deactive"));
                rawOffset += list.length;
                guard += 1;
                if (list.length === 0 || (totalCount && rawOffset >= totalCount)) break;
            }

            setTotalReceivedCount(totalCount || collected.length);
            const sorted = collected.sort((a, b) => {
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });
            setBackToOutletOrdersReceived(sorted.slice(0, 15));
        } catch (error) {
            console.error("Error fetching receive back to outlet orders:", error);
            setBackToOutletOrdersReceived([]);
        }
    };

    const fetchAllPendingInvoices = async (offset = 0) => {
        try {
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const isAllBranches = (!branchFilter || String(branchFilter).trim() === "");
            const branchId = getBranchIdForPayload();

            // Same top-up as fetchAllBackToOutletOrders: don't let Deactive/already-invoiced
            // orders in a batch leave this page short of a full 15 rows.
            let rawOffset = offset;
            let collected = [];
            let totalCount = 0;
            let guard = 0;
            while (collected.length < 15 && guard < 20) {
                const response = isAllBranches
                    ? await getPendingInvoiceOrdersAllBranches(userId, rawOffset)
                    : await getAllRetailPendingInvoices(userId, branchId, rawOffset);
                const list = extractPendingOrders(response);
                totalCount = response?.data?.total_orders_count || totalCount;
                collected = collected.concat(list.filter(order => order.status !== "Deactive" && !isOrderAlreadyInvoiced(order)));
                rawOffset += list.length;
                guard += 1;
                if (list.length === 0 || (totalCount && rawOffset >= totalCount)) break;
            }

            setTotalInvoicesCount(totalCount || collected.length);
            const sorted = collected.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });
            setInvoices(sorted.slice(0, 15));
        } catch (error) {
            console.error("Error fetching pending invoices:", error);
            setInvoices([]);
        }
    };

    const fetchTotalOrders = async () => {
        try {
            const payload = { user_id: localStorage.getItem("userId"), branch_id: getBranchIdForPayload() };
            const response = await getRetailDashboardTotalOrders(payload);
            setTotalOrders(response ?? null);
        } catch (error) {
            console.error("Error fetching total orders:", error);
            setTotalOrders(null);
        }
    };

    const fetchReadyForPickupOrders = async () => {
        try {
            const payload = { user_id: localStorage.getItem("userId"), branch_id: getBranchIdForPayload() };
            const response = await getRetailDashboardReadyForPickupOrders(payload);
            setReadyForPickupOrders(response ?? null);
        } catch (error) {
            console.error("Error fetching ready for pickup orders:", error);
            setReadyForPickupOrders(null);
        }
    };

    const fetchReleaseTodayOrders = async () => {
        try {
            const payload = { user_id: localStorage.getItem("userId"), branch_id: getBranchIdForPayload() };
            const response = await getRetailDashboardReleaseTodayOrders(payload);
            setReleaseTodayOrders(response ?? null);
        } catch (error) {
            console.error("Error fetching release today orders:", error);
            setReleaseTodayOrders(null);
        }
    };

    const fetchExpressOrders = async () => {
        try {
            const payload = { user_id: localStorage.getItem("userId"), branch_id: getBranchIdForPayload() };
            const response = await getRetailDashboardExpressOrders(payload);
            setExpressOrders(response ?? null);
        } catch (error) {
            console.error("Error fetching express orders:", error);
            setExpressOrders(null);
        }
    };

    const fetchAllSettings = async () => {
        try {
            const userId = localStorage.getItem("userId");
            if (!userId) return;
            const response = await getAllSettings(userId);
            const settingsList = response?.data?.settings ?? response?.data ?? response;
            setSettings(Array.isArray(settingsList) && settingsList.length > 0 ? settingsList[0] : null);
        } catch (error) {
            console.error("Error fetching settings:", error);
            setSettings(null);
        }
    };

    const fetchActiveTabData = async (offset = 0) => {
        const scopeKey = `${selectedTab}|${branchFilter || "selected"}|${offset}`;
        if (lastFetchedScopeRef.current === scopeKey) return true;
        lastFetchedScopeRef.current = scopeKey;

        if (selectedTab === 1) return fetchAllBackToOutletOrders(offset);
        if (selectedTab === 2) return fetchAllReceiveBackToOutletOrders(offset);
        return fetchAllPendingInvoices(offset);
    };

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                await Promise.all([
                    (async () => { await fetchAllBranches(); })(),
                    (async () => { fetchTotalOrders(); })(),
                    (async () => { fetchReadyForPickupOrders(); })(),
                    (async () => { fetchReleaseTodayOrders(); })(),
                    (async () => { fetchExpressOrders(); })(),
                    (async () => { fetchAllSettings(); })(),
                ]);
                await fetchActiveTabData(0);
            } catch (e) {
                console.error("Error running initial fetches:", e);
            } finally {
                if (!cancelled) setIsInitialLoad(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, []);

    // Refetch when branch filter changes
    useEffect(() => {
        if (!isInitialLoad) {
            branchRefreshInProgressRef.current = true;
            lastFetchedScopeRef.current = "";
            setCurrentPage(1);
            setSearchQuery("");
            setSubmittedSearchQuery("");
            setSearchResults([]);
            setSearchResultsOffset(0);
            setSearchResultsHasMore(false);
            setDispatchNoteCreatedFirst(false);
            (async () => {
                try {
                    await fetchActiveTabData(0);
                } finally {
                    branchRefreshInProgressRef.current = false;
                }
            })();
        }
    }, [branchFilter]);

    const handleTabChange = (tab) => {
        if (selectedTab !== tab) {
            setSelectedTab(tab);
            setCurrentPage(1);
            setSearchQuery("");
            setSubmittedSearchQuery("");
            setSearchResults([]);
            setSearchResultsOffset(0);
            setSearchResultsHasMore(false);
            setDispatchNoteCreatedFirst(false); // Reset dispatch note flag when changing tabs
            lastFetchedScopeRef.current = "";
            fetchActiveTabData(0);
        }
    };

    // Fetch data when page changes
    useEffect(() => {
        if (!isInitialLoad && !branchRefreshInProgressRef.current) {
            const offset = (currentPage - 1) * itemsPerPage;
            fetchActiveTabData(offset);
        }
    }, [currentPage, selectedTab, branchFilter, isInitialLoad]);

    useEffect(() => {
        const currentTabVisible =
            (selectedTab === 1 && dispatchNoteTabVisibility.outletDispatch) ||
            (selectedTab === 2 && dispatchNoteTabVisibility.outletReceived) ||
            (selectedTab === 3 && dispatchNoteTabVisibility.readyToInvoice);
        if (currentTabVisible) return;
        if (dispatchNoteTabVisibility.outletDispatch) setSelectedTab(1);
        else if (dispatchNoteTabVisibility.outletReceived) setSelectedTab(2);
        else if (dispatchNoteTabVisibility.readyToInvoice) setSelectedTab(3);
    }, [dispatchNoteTabVisibility]);

    if (!canAccessPage) {
        return <PermissionDenied required="SalesRetail_Back_to_Outlet_View" label="Dispatch Note Management" />;
    }

    const handleDeliveryTypeFilterChange = (e) => {
        setDeliveryTypeFilter(e.target.value || null);
    };

    const safeDateString = (dateVal) => {
        if (dateVal == null) return "—";
        const d = new Date(dateVal);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toISOString().split("T")[0];
    };

    const isSearchMode = !!(submittedSearchQuery.trim());

    const filteredOrders = selectedTab === 1
        ? backToOutletOrders.filter((order) => {
            const matchesStatusFilter = deliveryTypeFilter ? order.delivery_type === deliveryTypeFilter : true;
            const matchesBranchFilter = (() => {
                const storedId = branchFilter != null && String(branchFilter).trim() !== "" ? String(branchFilter).trim() : null;
                if (!storedId) return true;
                const targetBranch = branches.find(b => String(b.value) === String(storedId));
                const targetName = targetBranch ? targetBranch.label : "";
                if (String(order.delivery_outlet_id) === String(storedId) || String(order.branch_id) === String(storedId) || String(order.delivery_outlet) === String(storedId)) return true;
                if (targetName && String(order.delivery_outlet).toLowerCase() === targetName.toLowerCase()) return true;
                return false;
            })();
            const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order?.created_at, startDate, endDate);
            return matchesStatusFilter && matchesBranchFilter && matchesTodayFilter;
        })
        : selectedTab === 2
            ? backToOutletOrdersReceived.filter((order) => {
                const matchesStatusFilter = deliveryTypeFilter ? order.delivery_type === deliveryTypeFilter : true;
                const matchesBranchFilter = (() => {
                    const storedId = branchFilter != null && String(branchFilter).trim() !== "" ? String(branchFilter).trim() : null;
                    if (!storedId) return true;
                    const targetBranch = branches.find(b => String(b.value) === String(storedId));
                    const targetName = targetBranch ? targetBranch.label : "";
                    if (String(order.delivery_outlet_id) === String(storedId) || String(order.branch_id) === String(storedId) || String(order.delivery_outlet) === String(storedId)) return true;
                    if (targetName && String(order.delivery_outlet).toLowerCase() === targetName.toLowerCase()) return true;
                    return false;
                })();
                const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order?.created_at, startDate, endDate);
                return matchesStatusFilter && matchesBranchFilter && matchesTodayFilter;
            })
            : invoices.filter((order) => {
                if (isOrderAlreadyInvoiced(order)) return false;
                const matchesStatusFilter = deliveryTypeFilter ? order.delivery_type === deliveryTypeFilter : true;
                const matchesBranchFilter = (() => {
                    const storedId = branchFilter != null && String(branchFilter).trim() !== "" ? String(branchFilter).trim() : null;
                    if (!storedId) return true;
                    const targetBranch = branches.find(b => String(b.value) === String(storedId));
                    const targetName = targetBranch ? targetBranch.label : "";
                    if (String(order.delivery_outlet_id) === String(storedId) || String(order.branch_id) === String(storedId) || String(order.delivery_outlet) === String(storedId)) return true;
                    if (targetName && String(order.delivery_outlet).toLowerCase() === targetName.toLowerCase()) return true;
                    return false;
                })();
                const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);
                return matchesStatusFilter && matchesBranchFilter && matchesTodayFilter;
            });

    const ordersForTable = isSearchMode ? searchResults : filteredOrders;
    const currentOrders = ordersForTable;

    const activeTotalCount = selectedTab === 1
        ? totalBackToOutletCount
        : selectedTab === 2
            ? totalReceivedCount
            : totalInvoicesCount;

    const totalPages = Math.ceil(activeTotalCount / itemsPerPage);
    const blankRows = itemsPerPage - currentOrders.length;

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handleMarkAsReceived = async () => {
        try {
            setIsLoadingSubmit(true);
            const itemIds = selectedOrder.items.map(item => item.service_item_id);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: selectedOrder.order_id,
                service_items: itemIds
            };
            await markAsReceivedBackToOutletOrder(payload);
            setShowConfirmationDialog(false);
            setSearchResults(prev => prev.filter(o => o.order_id !== selectedOrder.order_id));
            setSelectedOrder(null);
            lastFetchedScopeRef.current = "";
            await fetchActiveTabData(0);
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleMarkAsSent = async () => {
        try {
            setIsLoadingSubmit(true);
            const itemIds = selectedOrder.items.map(item => item.service_item_id);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: selectedOrder.order_id,
                service_items: itemIds
            };
            await markAsSendBackToOutletOrder(payload);
            setShowSendConfirmationDialog(false);
            setSearchResults(prev => prev.filter(o => o.order_id !== selectedOrder.order_id));

            setOrdersToPrint([selectedOrder]);
            ordersToPrintRef.current = [selectedOrder];
            setStickersOnly(true);
            setPrintDispatchNoteOnly(false);
            setTimeout(() => {
                handlePrintBulkDispatchStickers();
                setTimeout(() => setStickersOnly(false), 500);
            }, 500);

            lastFetchedScopeRef.current = "";
            await fetchActiveTabData(0);
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleCreateDispatchNote = async () => {
        try {
            const userId = localStorage.getItem("userId");
            const res = await getNextDispatchNoteNumber(userId);
            if (res && res.success) {
                setCurrentDispatchNoteNo(res.nextNo);
            }
        } catch (err) {
            console.error("Error fetching next DN number", err);
        }
        setOrdersToPrint(selectedSendOrders);
        ordersToPrintRef.current = selectedSendOrders;
        setPrintDispatchNoteOnly(true);
        setShowDispatchNoteDialog(true);
        setDispatchNoteCreatedFirst(true); // Set flag that dispatch note was created first
    };

    const handlePrintDispatchNote = async () => {
        try {
            const orderIds = ordersToPrint.map(o => o.order_id);
            await useDispatchNoteNumber({
                dispatch_note_number: currentDispatchNoteNo,
                order_ids: orderIds
            });
        } catch (err) {
            console.error("Error recording dispatch note print:", err);
        }

        setTimeout(() => {
            handlePrintBulkDispatchStickers();
            setTimeout(() => {
                setPrintDispatchNoteOnly(false);
                setShowDispatchNoteDialog(false);
            }, 600);
        }, 400);
    };

    const handleAddToSelectedSend = (id) => {
        setSelectedSendOrders(prev => {
            const exists = prev.some(item => String(item.order_id) === String(id));
            if (exists) {
                return prev.filter(item => String(item.order_id) !== String(id));
            }
            const orderObj = currentOrders.find(o => String(o.order_id) === String(id)) ||
                             backToOutletOrders.find(o => String(o.order_id) === String(id));
            if (orderObj) {
                return [...prev, orderObj];
            }
            return prev;
        });
        setDispatchNoteCreatedFirst(false); // Reset dispatch note flag when selection changes
    };

    const handleAddToSelectedReceive = (id) => {
        setSelectedReceiveOrders(prev => {
            const exists = prev.some(item => String(item.order_id) === String(id));
            if (exists) {
                return prev.filter(item => String(item.order_id) !== String(id));
            }
            const orderObj = currentOrders.find(o => String(o.order_id) === String(id)) ||
                             backToOutletOrdersReceived.find(o => String(o.order_id) === String(id));
            if (orderObj) {
                return [...prev, orderObj];
            }
            return prev;
        });
    };

    const handleSendBulkBackToOutlet = async () => {
        try {
            setIsLoadingSubmit(true);

            let dnNo = currentDispatchNoteNo;
            if (!dnNo || dnNo === "DN - 01") {
                const userId = localStorage.getItem("userId");
                const res = await getNextDispatchNoteNumber(userId);
                if (res && res.success) {
                    dnNo = res.nextNo;
                    setCurrentDispatchNoteNo(dnNo);
                }
            }

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_ids: selectedForSend,
                branch_id: Number(localStorage.getItem("selectedBranchId")),
                dispatch_note_number: dnNo
            };

            await markBulkAsSendBackToOutletOrder(payload);
            setShowSendBulkConfirmationDialog(false);
            setSearchResults(prev => prev.filter(o => !selectedForSend.includes(o.order_id)));

            // Always show sticker print when sending orders
            const ordersArray = [...selectedSendOrders];
            setOrdersToPrint(ordersArray);
            ordersToPrintRef.current = ordersArray;
            setStickersOnly(true);
            setPrintDispatchNoteOnly(false);
            setShouldPrint(true);

            // Reset the flag after processing
            setDispatchNoteCreatedFirst(false);
            setSelectedSendOrders([]);
            setSelectMultipleSend(false);
            setCurrentDispatchNoteNo("DN - 01");
            lastFetchedScopeRef.current = "";
            await fetchActiveTabData(0);
        } catch (error) {
            console.error("Error sending back to outlet: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleReceiveBulkBackToOutlet = async () => {
        try {
            setIsLoadingSubmit(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_ids: selectedForReceive,
                branch_id: Number(localStorage.getItem("selectedBranchId")),
            };

            await markBulkAsReceivedBackToOutletOrder(payload);
            setShowReceiveBulkConfirmationDialog(false);
            setSearchResults(prev => prev.filter(o => !selectedForReceive.includes(o.order_id)));
            setSelectedReceiveOrders([]);
            setSelectMultipleReceive(false);
            lastFetchedScopeRef.current = "";
            await fetchActiveTabData(0);
        } catch (error) {
            console.error("Error receiving back to outlet: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    if (isInitialLoad) {
        return (
            <div className="flex flex-col gap-y-5 flex-1 items-center justify-center py-20">
                <BeatLoader color="#1470F9" size={24} />
                <p className="text-black/60 mt-4">Loading branch and session...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Dispatch Note Management</h1>
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
                    value2={`${readyForPickupOrders?.waiting_pickup_percentage != null ? Number(readyForPickupOrders.waiting_pickup_percentage).toFixed(2) : "0"} %`}
                    extraDetails={false}
                    icon={<Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500 size-12" />}
                />
                */}
                {/* Release Today card temporarily hidden — not needed yet, re-enable when ready to use.
                <DetailsCard
                    title={"Release Today"}
                    value={releaseTodayOrders?.today_released_orders ?? 0}
                    label1={"Total Orders"}
                    value1={releaseTodayOrders?.today_total_orders ?? 0}
                    label2={"Release Percentage"}
                    value2={`${releaseTodayOrders?.release_percentage != null ? Number(releaseTodayOrders.release_percentage).toFixed(2) : "0"} %`}
                    extraDetails={true}
                    icon={<Icon icon={"streamline:give-gift-remix"} className="text-yellow-500 size-10" />}
                />
                */}
                <DetailsCard
                    title={"Express Orders"}
                    value={expressOrders?.today_express_orders ?? 0}
                    label1={"Total Pending Orders"}
                    value1={expressOrders?.today_pending_orders ?? 0}
                    label2={"Urgent Percentage"}
                    value2={`${expressOrders?.urgent_percentage != null ? Number(expressOrders.urgent_percentage).toFixed(2) : "0"} %`}
                    extraDetails={true}
                    icon={<Icon icon={"material-symbols-light:delivery-truck-bolt"} className="text-red-500 size-12" />}
                />
            </div>

            {/* Tabs */}
            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-5">
                {dispatchNoteTabVisibility.outletDispatch && (
                    <h2 className={`${(selectMultipleSend || selectMultipleReceive) ? "text-black/50" : "hover:border-b-3 cursor-pointer"} border-black px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => { !(selectMultipleSend || selectMultipleReceive) ? handleTabChange(1) : null }}>Outlet Dispatch Note</h2>
                )}
                {dispatchNoteTabVisibility.outletReceived && (
                    <h2 className={`${(selectMultipleSend || selectMultipleReceive) ? "text-black/50" : "hover:border-b-3 cursor-pointer"} border-black px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => { !(selectMultipleSend || selectMultipleReceive) ? handleTabChange(2) : null }}>Outlet Received Note</h2>
                )}
                {dispatchNoteTabVisibility.readyToInvoice && (
                    <h2 className={`${(selectMultipleSend || selectMultipleReceive) ? "text-black/50" : "hover:border-b-3 cursor-pointer"} border-black px-1 ${selectedTab === 3 ? 'border-b-3 font-semibold' : ''}`} onClick={() => { !(selectMultipleSend || selectMultipleReceive) ? handleTabChange(3) : null }}>Ready To Invoice</h2>
                )}
            </div>

            {/* Filter Section */}
            <div className="flex flex-row flex-wrap gap-x-5 gap-y-3">
                <div className="flex flex-row border border-primary rounded-full h-fit w-1/2 bg-white">
                    <div className="flex justify-center items-center rounded-l-full px-5">
                        <MdSearch className="size-6 text-primary" />
                    </div>
                    <input
                        className={`grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none`}
                        type="text"
                        value={searchQuery}
                        placeholder="Search Orders here (press Enter)..."
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchQuery(value);
                            if (!value.trim()) {
                                setSubmittedSearchQuery("");
                                setSearchResults([]);
                                setSearchResultsOffset(0);
                                setSearchResultsHasMore(false);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const q = searchQuery.trim();
                            setSubmittedSearchQuery(q);
                            setCurrentPage(1);
                            if (q) fetchSearchOrders(false);
                            else {
                                setSearchResults([]);
                                setSearchResultsOffset(0);
                                setSearchResultsHasMore(false);
                            }
                        }}
                    />
                </div>

                <div className="basis-full h-0" aria-hidden="true" />

                <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={handleStartDateChange}
                    onEndDateChange={handleEndDateChange}
                    isActive={isTodaySelected}
                />

                <div className="flex flex-row items-center rounded-xl bg-white text-xl gap-x-2 px-4 border border-black/20 text-black/70 w-fit shrink-0">
                    <Icon icon="mdi:store-marker-outline" className="text-primary text-2xl shrink-0" />
                    <FilterSelector
                        options={(() => {
                            const loggedInId = localStorage.getItem("selectedBranchId") || "";
                            const loggedInName = (localStorage.getItem("selectedBranchName") || "").trim();
                            if (isBranchViewOnly) {
                                const own = branches.filter((b) => String(b.value ?? "").trim() === String(loggedInId).trim());
                                if (own.length > 0) return own;
                                return loggedInId ? [{ value: loggedInId, label: loggedInName || `Branch ${loggedInId}` }] : [];
                            }
                            const base = [{ value: "", label: "All Branches" }, ...branches.filter((b) => (b.label || "").toString().toLowerCase().trim() !== "all branches" && String(b.value ?? "").trim() !== "")];
                            if (loggedInId && !base.some((o) => String(o.value) === String(loggedInId)) && loggedInName.toLowerCase() !== "all branches") {
                                base.push({ value: loggedInId, label: loggedInName || `Branch ${loggedInId}` });
                            }
                            return base.filter((o) => (o.label || "").toString().toLowerCase().trim() !== "all branches" || String(o.value ?? "").trim() === "");
                        })()}
                        value={branchFilter}
                        onChange={(e) => { if (!isBranchViewOnly) setBranchFilter(e.target.value ?? ""); }}
                        className="bg-transparent border-0 font-semibold text-primary focus:outline-none cursor-pointer appearance-none px-3"
                    />
                    <Icon icon="mdi:chevron-down" className="text-primary text-xl shrink-0" />
                </div>

                <FilterSelector
                    options={deliveryTypeOptions}
                    value={deliveryTypeFilter}
                    onChange={handleDeliveryTypeFilterChange}
                />

                {!selectMultipleSend && !selectMultipleReceive && selectedTab !== 3 && canSendOrReceiveAction &&
                    <button
                        className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 ms-auto"
                        onClick={() => {
                            selectedTab === 1
                                ? setSelectMultipleSend(true)
                                : setSelectMultipleReceive(true)
                        }}
                    >Select Multiple
                    </button>
                }

                {/* Send multi-select toolbar */}
                {selectMultipleSend && (
                    <div className="flex flex-row gap-x-5 ms-auto items-center">
                        <p>Selected {selectedForSend.length}</p>
                        {currentOrders.length > 0 && currentOrders.every(order => selectedForSend.includes(order.order_id)) ? (
                            <button
                                className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                                onClick={() => {
                                    setSelectedSendOrders(prev => prev.filter(order => !currentOrders.some(co => String(co.order_id) === String(order.order_id))));
                                    setDispatchNoteCreatedFirst(false); // Reset dispatch note flag when selection changes
                                }}
                            >Deselect All
                            </button>
                        ) : (
                            <button
                                className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                                onClick={() => {
                                    setSelectedSendOrders(prev => {
                                        const next = [...prev];
                                        currentOrders.forEach(order => {
                                            if (!next.some(o => String(o.order_id) === String(order.order_id))) {
                                                next.push(order);
                                            }
                                        });
                                        return next;
                                    });
                                    setDispatchNoteCreatedFirst(false); // Reset dispatch note flag when selection changes
                                }}
                            >Select All
                            </button>
                        )}
                        <button
                            className={`${selectedForSend.length === 0 ? "bg-gray-500 cursor-not-allowed" : "bg-primary border-primary"} rounded-xl border font-semibold text-white px-2 py-0.5 text-sm leading-tight`}
                            onClick={handleCreateDispatchNote}
                            disabled={selectedForSend.length === 0}
                        >Create Dispatch Note
                        </button>
                        <button
                            className={`${selectedForSend.length === 0 ? "bg-gray-500 cursor-not-allowed text-white" : "bg-white text-primary border-primary"} rounded-xl border font-semibold px-3 py-1.5`}
                            onClick={() => setShowSendBulkConfirmationDialog(true)}
                            disabled={selectedForSend.length === 0}
                        >Send
                        </button>
                        <button
                            className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                            onClick={() => {
                                setSelectMultipleSend(false);
                                setSelectedSendOrders([]);
                                setDispatchNoteCreatedFirst(false); // Reset dispatch note flag when cancelling selection
                            }}
                        >Cancel
                        </button>
                    </div>
                )}

                {/* Receive multi-select toolbar */}
                {selectMultipleReceive && (
                    <div className="flex flex-row gap-x-5 ms-auto items-center">
                        <p>Selected {selectedForReceive.length}</p>
                        {currentOrders.length > 0 && currentOrders.every(order => selectedForReceive.includes(order.order_id)) ? (
                            <button
                                className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                                onClick={() => {
                                    setSelectedReceiveOrders(prev => prev.filter(order => !currentOrders.some(co => String(co.order_id) === String(order.order_id))));
                                }}
                            >Deselect All
                            </button>
                        ) : (
                            <button
                                className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                                onClick={() => {
                                    setSelectedReceiveOrders(prev => {
                                        const next = [...prev];
                                        currentOrders.forEach(order => {
                                            if (!next.some(o => String(o.order_id) === String(order.order_id))) {
                                                next.push(order);
                                            }
                                        });
                                        return next;
                                    });
                                }}
                            >Select All
                            </button>
                        )}
                        <button
                            className={`${selectedForReceive.length === 0 ? "bg-gray-500 cursor-not-allowed" : "bg-primary border-primary"} rounded-xl border font-semibold text-white px-3 py-1.5`}
                            onClick={() => setShowReceiveBulkConfirmationDialog(true)}
                            disabled={selectedForReceive.length === 0}
                        >Receive
                        </button>
                        <button
                            className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                            onClick={() => {
                                setSelectMultipleReceive(false);
                                setSelectedReceiveOrders([]);
                            }}
                        >Cancel
                        </button>
                    </div>
                )}
            </div>

            {isSearchMode && isSearching && searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 bg-white rounded-xl animate-pulse">
                    <BeatLoader color="#1470F9" size={20} />
                    <span className="text-primary/80 text-sm font-medium">Searching orders...</span>
                </div>
            ) : isLoading ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            ) : (
                <div className="rounded-xl bg-white overflow-x-auto">
                    <div className="text-sm grid gap-x-3 divide-x divide-white/20 text-white bg-primary font-semibold py-2 px-3 min-w-[1320px] [&>*]:min-w-0 [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1" style={{ gridTemplateColumns: "1fr 1.8fr 1.2fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}>
                        <p>ORDER ID</p>
                        <p>NAME</p>
                        <p>PHONE</p>
                        <p>DELIVERY TYPE</p>
                        <p>TOTAL AMOUNT</p>
                        <p>ADVANCED</p>
                        <p>REMAIN</p>
                        <p>DATE</p>
                        <p>TIME</p>
                        <p>DELIVERY DATE</p>
                        <p>ACTION</p>
                    </div>

                    {currentOrders.map((order, index) => (
                        <div
                            key={index}
                            className={`grid gap-x-3 divide-x divide-black/10 text-xs py-1.5 px-3 min-w-[1320px] whitespace-nowrap [&>*]:min-w-0 [&>*]:overflow-hidden [&>p]:text-ellipsis [&>p]:whitespace-nowrap [&>p]:text-center [&>p]:px-1 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center ${selectMultipleSend || selectMultipleReceive ? "cursor-pointer" : ""} ${selectedForSend.includes(order.order_id) || selectedForReceive.includes(order.order_id) ? "text-red-500" : ""}`}
                            style={{ gridTemplateColumns: "1fr 1.8fr 1.2fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}
                            onClick={() => {
                                selectMultipleSend
                                    ? handleAddToSelectedSend(order.order_id)
                                    : selectMultipleReceive
                                        ? handleAddToSelectedReceive(order.order_id)
                                        : null
                            }}
                        >
                            <p className="!overflow-visible text-[10px] leading-tight">{order.order_id}</p>
                            <div className="min-w-0 overflow-hidden whitespace-normal break-normal leading-tight text-center px-1">{order.customer_name}</div>
                            <p>{order.phone_number}</p>
                            <p>{order.delivery_type}</p>
                            <p>{applyDiscountToAmount(order.total_amount, order.discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p>{order.advance_payment}</p>
                            <p>{order.remaining_amount}</p>
                            <p>{safeDateString(order?.created_at)}</p>
                            <p className="text-center">
                                {order?.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                            </p>
                            <p className="text-center">{safeDateString(order?.delivery_date)}</p>
                            <div className="flex flex-row gap-x-1 justify-center">
                                <Link
                                    className="flex flex-col cursor-pointer items-center"
                                    to={selectedTab === 1 ? `pending/${order.order_id}` : selectedTab === 2 ? `receive/${order.order_id}` : `complete/${order.order_id}`}
                                    state={{
                                        order,
                                        searchBranchId: (branchFilter != null && String(branchFilter).trim() !== "")
                                            ? Number(branchFilter)
                                            : (Number(localStorage.getItem("selectedBranchId")) || 1),
                                    }}
                                >
                                    <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                    <p className="text-sm">View</p>
                                </Link>

                                {selectedTab === 1 && canSendOrReceiveAction && <div className="min-h-max border border-black/50 my-1" />}
                                {selectedTab === 1 && canSendOrReceiveAction &&
                                    <div
                                        className="flex flex-col cursor-pointer items-center"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowSendConfirmationDialog(true);
                                            setSelectedOrder(order);
                                            const availableServiceTypes = [1, 2, 3].filter(st =>
                                                (order.items || []).some(item => item.service_type_id === st)
                                            );
                                            if (availableServiceTypes.length > 0) {
                                                setDispatchServiceTypeId(availableServiceTypes[0]);
                                            }
                                        }}>
                                        <Icon icon={"mage:home-check-fill"} className="text-green-500" />
                                        <p className="text-sm">Send</p>
                                    </div>
                                }

                                {selectedTab === 2 && canSendOrReceiveAction && <div className="min-h-max border border-black/50 my-1" />}
                                {selectedTab === 2 && canSendOrReceiveAction &&
                                    <div
                                        className="flex flex-col cursor-pointer items-center"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowConfirmationDialog(true);
                                            setSelectedOrder(order);
                                        }}>
                                        <Icon icon={"mage:home-check-fill"} className="text-green-500" />
                                        <p className="text-sm">Recieve</p>
                                    </div>
                                }
                                {/* edit option */}
                                {canEditCurrentTab && order.status !== "Deactive" &&
                                    <div className="min-h-max border border-black/50 my-1" />
                                }

                                {canEditCurrentTab && order.status !== "Deactive" &&
                                    <Link to={`update-order/${order.order_id}`} className="flex flex-col cursor-pointer">
                                        <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                        <p className="text-sm">Edit</p>
                                    </Link>
                                }
                            </div>
                        </div>
                    ))}

                    {/* Blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid gap-x-3 text-xs py-1.5 min-w-[1320px] whitespace-nowrap [&>p]:whitespace-nowrap ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                            style={{ gridTemplateColumns: "1fr 1.8fr 1.2fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}
                        >
                            <div className="h-8" style={{ gridColumn: "1 / -1" }}></div>
                        </div>
                    ))}
                </div>
            )}

            {/* Hidden print components */}
            <div style={{
                position: 'fixed',
                left: '-9999px',
                top: '0',
                width: '210mm',
                height: '297mm',
                overflow: 'hidden',
                visibility: 'hidden',
                pointerEvents: 'none'
            }}>
                <RetailBulkServiceOrder
                    ref={bulkDispatchStickerRef}
                    orders={ordersToPrint.length > 0 ? ordersToPrint : ordersToPrintRef.current}
                    settings={settings}
                    dispatchNoteOnly={printDispatchNoteOnly}
                    stickersOnly={stickersOnly}
                    dispatchNoteNo={currentDispatchNoteNo}
                    driver={selectedDriver}
                    vehicle={selectedVehicle}
                />
                {selectedOrder && (
                    <RetailServiceOrder
                        ref={dispatchStickerRef}
                        order={selectedOrder}
                        serviceType="ALL"
                        foldType={null}
                        settings={settings}
                        isBulk={false}
                    />
                )}
            </div>

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-base text-black/50">
                    Showing {currentOrders.length} materials
                </p>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                />
            </div>

            {/* Dialogs */}
            {showConfirmationDialog &&
                <ConfirmationDialog
                    title={"Mark as Received"}
                    text={`Are you sure to mark as received the order`}
                    item={selectedOrder?.order_id}
                    onClose={() => { setShowConfirmationDialog(false); setSelectedOrder(null); }}
                    onSubmit={() => handleMarkAsReceived()}
                    isLoading={isLoadingSubmit}
                />
            }

            {showSendConfirmationDialog &&
                <ConfirmationDialog
                    title={"Mark as Sent"}
                    text={`Are you sure to mark as sent the order`}
                    item={selectedOrder?.order_id}
                    onClose={() => { setShowSendConfirmationDialog(false); setSelectedOrder(null); }}
                    onSubmit={() => handleMarkAsSent()}
                    isLoading={isLoadingSubmit}
                />
            }

            {showSendBulkConfirmationDialog &&
                <ConfirmationDialog
                    title={"Outlet Dispatch Note"}
                    text={`Are you sure to send dispatch note for the selected orders`}
                    onClose={() => setShowSendBulkConfirmationDialog(false)}
                    onSubmit={() => handleSendBulkBackToOutlet()}
                    isLoading={isLoadingSubmit}
                />
            }

            {showReceiveBulkConfirmationDialog &&
                <ConfirmationDialog
                    title={"Outlet Received Note"}
                    text={`Are you sure to receive dispatch note for the selected orders`}
                    onClose={() => setShowReceiveBulkConfirmationDialog(false)}
                    onSubmit={() => handleReceiveBulkBackToOutlet()}
                    isLoading={isLoadingSubmit}
                />
            }

            {/* Dispatch Note Preview Modal */}
            {showDispatchNoteDialog && ordersToPrint.length > 0 &&
                <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
                    <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                        <h1 className="text-primary text-3xl font-bold text-center mb-2">Dispatch Note</h1>

                        <RetailBulkServiceOrder
                            orders={ordersToPrint}
                            settings={settings}
                            dispatchNoteOnly={true}
                            transaction="Plant-Orugodawatta"
                            state="Transfer washing plant"
                            dispatchNoteNo={currentDispatchNoteNo}
                            driver={selectedDriver}
                            vehicle={selectedVehicle}
                            onDriverChange={setSelectedDriver}
                            onVehicleChange={setSelectedVehicle}
                        />

                        <div className="flex flex-row gap-x-5 mt-5">
                            <button
                                className="cursor-pointer bg-primary text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl"
                                onClick={handlePrintDispatchNote}
                            >
                                Print
                            </button>
                            <button
                                className="cursor-pointer bg-black/50 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl"
                                onClick={() => {
                                    setShowDispatchNoteDialog(false);
                                    setOrdersToPrint([]);
                                    setPrintDispatchNoteOnly(false);
                                    setSelectedDriver("");
                                    setSelectedVehicle("");
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            }
        </div>
    );
};

export default SalesRetailBackToOutlet;
