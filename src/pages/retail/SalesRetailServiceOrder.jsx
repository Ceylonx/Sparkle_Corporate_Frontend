import DetailsCard from "../../components/ui/DetailsCard";
import { applyDiscountToAmount } from "../../utils/discount";
import { MdSearch } from "react-icons/md";
import { useEffect, useState, useRef } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link } from "react-router-dom";
import { markAsCompletedServiceOrder } from "../../services/Retail/RetailServiceOrderServices";
import { BeatLoader } from "react-spinners";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import { getRetailDashboardExpressOrders, getRetailDashboardReadyForPickupOrders, getRetailDashboardReleaseTodayOrders, getRetailDashboardTotalOrders } from "../../services/Retail/RetailDashboardServices";
import { getAllBranches, getAllRetailOrders, getAllRetailOrdersAllBranches, getRetailOrderById } from "../../services/Retail/RetailOrderServices";
import { hasPermission, isSuperadminRole } from "../../utils/permissionHelper";
import { isRetailViewOnlyForPrefix, parsePermissionTokens } from "../../utils/retailSubTabPermissions";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { isDateRangeFilterActive, isDateWithinRange } from "../../utils/dateRange";

const SalesRetailServiceOrder = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
    const [selectedTab, setSelectedTab] = useState(2);
    const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("");
    const [selectedServiceOrder, setSelectedServiceOrder] = useState(null);
    const [serviceOrders, setServiceOrders] = useState([]);
    const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
    const [productions, setProductions] = useState([]);
    const [totalOrders, setTotalOrders] = useState(null);
    const [readyForPickupOrders, setReadyForPickupOrders] = useState(null);
    const [releaseTodayOrders, setReleaseTodayOrders] = useState(null);
    const [expressOrders, setExpressOrders] = useState(null);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const isTodaySelected = isDateRangeFilterActive(startDate, endDate);
    const [branches, setBranches] = useState([]);
    const [currentOffset, setCurrentOffset] = useState(0);
    const [hasMoreOrders, setHasMoreOrders] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [totalServiceOrdersCount, setTotalServiceOrdersCount] = useState(null);
    const [loadingServiceOrderPage, setLoadingServiceOrderPage] = useState(false);
    const lastServiceOrderFetchRef = useRef({ page: 1, branch: null });
    // API search when All Branches is selected (same as Order Entry/Invoice)
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchOffset, setSearchOffset] = useState(0);
    const [searchHasMore, setSearchHasMore] = useState(false);
    const [searchLoadingMore, setSearchLoadingMore] = useState(false);
    // Stable pagination refs
    const fetchedMoreOnPage3Ref = useRef(false);
    const lastStableTotalPagesRef = useRef(1);
    const lastStableWindowRef = useRef({ start: 1, end: 5 });
    // Initialize branch filter from logged-in branch
    const userRole = localStorage.getItem("role") || "";
    const isSuperadmin = isSuperadminRole(userRole);
    const isWIP = userRole.toLowerCase().includes("wip");
    const isCustomerServiceAssistant = userRole.toLowerCase().includes("customer service assistant");
    const isDirector = userRole.toLowerCase().includes("director");
    const permissions = localStorage.getItem("permissions") || "";
    const permissionTokens = parsePermissionTokens(permissions);
    // Someone who can only View Service Order (no Create/Edit/Approve of their own) is locked to
    // the branch they started their day with — they shouldn't be able to browse other branches'
    // orders through the filter, even though the "All Branches" option itself stays visible for
    // the existing exception roles below.
    const isBranchViewOnly = isRetailViewOnlyForPrefix(permissionTokens, "SalesRetail_Service_");
    const [branchFilter, setBranchFilter] = useState(localStorage.getItem("selectedBranchId") || "");

    const deliveryTypeOptions = [
        { value: 'Urgent', label: 'Urgent' },
        { value: 'Express', label: 'Express' },
        { value: 'One Day', label: 'One Day' },
        { value: 'Two Day', label: 'Two Day' },
        { value: 'Normal', label: 'Normal' },
    ];

    const fetchAllPendingProductions = async (offset = 0, append = false) => {
        const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
        try {
            if (append) {
                setIsLoadingMore(true);
            } else {
                setLoadingServiceOrderPage(true);
                setProductions([]);
            }
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const fetchRawPage = async (rawOffset) => {
                const payload = {
                    user_id: userId,
                    offset: rawOffset,
                };
                if (startDate) payload.from_date = startDate;
                if (endDate) payload.to_date = endDate;
                const searchText = submittedSearchQuery.trim();
                if (searchText) payload.searchText = searchText;

                const response = isAllBranches
                    ? await getAllRetailOrdersAllBranches(payload)
                    : await getAllRetailOrders({
                        ...payload,
                        branch_id: Number(branchFilter) || (Number(localStorage.getItem("selectedBranchId")) || 1),
                    });

                let orders = [];
                let count = 0; // API "count" = total number of orders (for pagination: totalPages = count / 15)
                if (response?.data) {
                    if (Array.isArray(response.data.orders)) {
                        orders = response.data.orders;
                        count = response.data.count ?? orders.length;
                    } else if (Array.isArray(response.data)) {
                        orders = response.data;
                        count = response.data.count ?? orders.length;
                    } else {
                        orders = response.data.orders ?? [];
                        count = response.data.count ?? orders.length;
                    }
                }
                return { orders, count };
            };

            // Backend pages return up to 15 orders regardless of status, so a batch with
            // inactive orders can leave this page short. Keep pulling further raw pages
            // until we have a full page of Active orders or the backend runs out.
            let requestOffset = offset != null ? Number(offset) : 0;
            let activeOrders = [];
            let totalCount = 0;
            let guard = 0;
            while (activeOrders.length < 15 && guard < 20) {
                const { orders, count } = await fetchRawPage(requestOffset);
                totalCount = count;
                activeOrders = activeOrders.concat(orders.filter((order) => order.status === "Active"));
                requestOffset += orders.length;
                guard += 1;
                if (orders.length === 0 || requestOffset >= totalCount) break;
            }

            const sorted = activeOrders.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });

            setTotalServiceOrdersCount(totalCount);
            setProductions(sorted.slice(0, 15));
            setCurrentOffset(requestOffset);
            setHasMoreOrders(totalCount != null && totalCount > 0 && requestOffset < totalCount);
        } catch (error) {
            console.error("Error fetching orders: ", error);
            if (!append) {
                setProductions([]);
                setTotalServiceOrdersCount(null);
                setHasMoreOrders(false);
            }
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
            setLoadingServiceOrderPage(false);
        }
    };

    const buildServiceOrderPayload = (offset = 0, searchTextOverride = null) => {
        const userId = localStorage.getItem("userId");
        const searchText = (searchTextOverride != null ? String(searchTextOverride) : submittedSearchQuery).trim();
        const payload = {
            user_id: userId,
            offset: Number(offset) || 0,
        };

        const isAllBranches = (isSuperadmin || isWIP || isCustomerServiceAssistant || isDirector) && (!branchFilter || String(branchFilter).trim() === "");
        const branchId = branchFilter != null && String(branchFilter).trim() !== ""
            ? Number(branchFilter)
            : Number(localStorage.getItem("selectedBranchId")) || 1;

        if (!isAllBranches) {
            payload.branch_id = branchId;
        }
        if (searchText) {
            payload.searchText = searchText;
        }
        if (startDate) {
            payload.from_date = startDate;
        }
        if (endDate) {
            payload.to_date = endDate;
        }

        return { payload, isAllBranches };
    };

    const handleLoadMoreOrders = () => {
        if (!hasMoreOrders || isLoadingMore) return;
        // Pagination is page-based (same as Pending Invoiced Order); use page buttons instead
    };

    const SEARCH_PAGE_SIZE = 15;
    const fetchSearchOrders = async (append = false, queryOverride = null) => {
        const q = (queryOverride != null && String(queryOverride).trim() !== "") ? String(queryOverride).trim() : searchQuery.trim();
        if (!q) return;
        try {
            if (append) setSearchLoadingMore(true);
            else setIsSearching(true);
            const offset = append ? searchOffset : 0;
            const { payload, isAllBranches } = buildServiceOrderPayload(offset, q);
            if (!payload.user_id) return;
            const response = isAllBranches
                ? await getAllRetailOrdersAllBranches(payload)
                : await getAllRetailOrders(payload);

            if (!response || !response.data) {
                setSearchResults([]);
                return;
            }

            const raw = response.data;

            // Parse response - handle array and single-order structures (same as Invoice)
            let list = [];
            if (Array.isArray(raw?.orders)) {
                if (raw.orders.length > 0 && Array.isArray(raw.orders[0])) {
                    list = raw.orders.flat();
                } else {
                    list = raw.orders;
                }
            } else if (Array.isArray(raw?.data?.orders)) {
                if (raw.data.orders.length > 0 && Array.isArray(raw.data.orders[0])) {
                    list = raw.data.orders.flat();
                } else {
                    list = raw.data.orders;
                }
            } else if (Array.isArray(raw?.data)) {
                if (raw.data.length > 0 && Array.isArray(raw.data[0])) {
                    list = raw.data.flat();
                } else {
                    list = raw.data;
                }
            } else if (Array.isArray(raw)) {
                if (raw.length > 0 && Array.isArray(raw[0])) {
                    list = raw.flat();
                } else {
                    list = raw;
                }
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

            // Check if orders already have complete data (items field) or need to fetch full details (same as Invoice)
            const ordersWithFullDetails = await Promise.all(
                list.map(async (order) => {
                    if (!order || typeof order !== "object") return null;

                    const orderId = order.order_id || order.id || order.order_number || order.orderId;

                    if (!orderId) {
                        return order;
                    }

                    const hasItems = Array.isArray(order.items) && order.items.length > 0;
                    const hasAllFields = order.customer_name && order.phone_number && order.delivery_type;

                    if (hasItems && hasAllFields) {
                        return order;
                    }

                    // Otherwise, fetch full order details
                    try {
                        const fullOrderData = await getRetailOrderById({
                            user_id: userId,
                            order_id: String(orderId)
                        });

                        if (fullOrderData) {
                            let fullOrder = null;
                            if (fullOrderData.order && typeof fullOrderData.order === "object") {
                                fullOrder = fullOrderData.order;
                            } else if (fullOrderData.order_id || fullOrderData.items) {
                                fullOrder = fullOrderData;
                            }

                            if (fullOrder) {
                                return { ...order, ...fullOrder };
                            } else {
                                return order;
                            }
                        } else {
                            return order;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch full details for order ${orderId}:`, err);
                        return order;
                    }
                })
            );

            const validOrders = ordersWithFullDetails.filter(order => order != null && order.status !== "Deactive");

            // Normalize for display (same as Invoice)
            const displayList = validOrders.map((order) => {
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
                    if (base.items && typeof base.items === "object" && !Array.isArray(base.items)) {
                        if (Array.isArray(base.items.items)) base.items = base.items.items;
                        else base.items = [];
                    } else {
                        base.items = [];
                    }
                }

                const parseAmount = (val) => {
                    if (val == null || val === "" || val === undefined) return null;
                    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
                    return isNaN(num) ? null : num;
                };

                base.total_amount = parseAmount(base.total_amount ?? base.totalAmount);
                base.remaining_amount = parseAmount(base.remaining_amount ?? base.remainingAmount);
                base.advance_payment = parseAmount(base.advance_payment ?? base.advancePayment);
                base.delivery_charge = parseAmount(base.delivery_charge ?? base.deliveryCharge);

                if (base.remaining_amount == null && base.total_amount != null) {
                    const total = Number(base.total_amount) || 0;
                    const advance = Number(base.advance_payment) || 0;
                    base.remaining_amount = total - advance;
                }

                if (base.status == null && base.order_status != null) base.status = base.order_status;
                if (base.order_status == null && base.status != null) base.order_status = base.status;

                return base;
            }).filter(order => order != null);

            if (append) {
                setSearchResults((prev) => {
                    const seen = new Set(prev.map((o) => String(o.order_id ?? o.id ?? "")));
                    const merged = [...prev];
                    for (const o of displayList) {
                        const id = String(o.order_id ?? o.id ?? "");
                        if (id && !seen.has(id)) {
                            seen.add(id);
                            merged.push(o);
                        }
                    }
                    return merged;
                });
                setSearchOffset(offset + count);
                setSearchHasMore(count >= SEARCH_PAGE_SIZE && displayList.length > 0);
            } else {
                setSearchResults(displayList);
                setSearchOffset(count);
                setSearchHasMore(count >= SEARCH_PAGE_SIZE && displayList.length > 0);
            }
        } catch (err) {
            console.error("Error searching orders:", err);
            if (!append) setSearchResults([]);
        } finally {
            setIsSearching(false);
            setSearchLoadingMore(false);
        }
    };

    const handleLoadMoreSearch = () => {
        if (!searchHasMore || searchLoadingMore) return;
        fetchSearchOrders(true, submittedSearchQuery.trim());
    };

    const fetchTotalOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: Number(localStorage.getItem("selectedBranchId")),
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
                branch_id: Number(localStorage.getItem("selectedBranchId")),
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
                branch_id: Number(localStorage.getItem("selectedBranchId")),
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
                branch_id: Number(localStorage.getItem("selectedBranchId")),
            };
            const response = await getRetailDashboardExpressOrders(payload);
            setExpressOrders(response);
        } catch (error) {
            console.error("Error fetching express orders: ", error);
        }
    };

    useEffect(() => {
        fetchTotalOrders();
        fetchReadyForPickupOrders();
        fetchReleaseTodayOrders();
        fetchExpressOrders();
        fetchAllBranches();
    }, []);

    // When branch filter changes: reset to page 1; page-based useEffect will fetch
    useEffect(() => {
        setCurrentPage(1);
        setCurrentOffset(0);
        setHasMoreOrders(false);
        setTotalServiceOrdersCount(null);
        lastServiceOrderFetchRef.current = { page: 0, branch: null };
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
    }, [branchFilter]);

    // Backend search: call the same get-all-orders endpoint when user presses Enter (submittedSearchQuery)
    useEffect(() => {
        const q = submittedSearchQuery.trim();
        if (!q) {
            setSearchResults([]);
            setSearchOffset(0);
            setSearchHasMore(false);
            return;
        }
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
        fetchSearchOrders(false, q);
    }, [submittedSearchQuery, branchFilter, startDate, endDate]);

    const handleDeliveryTypeFilterChange = (e) => {
        setDeliveryTypeFilter(e.target.value);
    };

    const handleBranchFilterChange = (e) => {
        setBranchFilter(e.target.value);
    };

    // Fetch branches for branch filter dropdown (same source as Order Entry)
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

    // Apply search, delivery type, and today filters on top of backend data (search only when user pressed Enter)
    const filteredOrders = productions.filter((order) => {
        const matchesQuery = (field, query) => {
            const q = (query != null && query !== undefined) ? String(query).trim() : "";
            if (!q || !field) return q === "";
            const fieldStr = String(field).toLowerCase();
            const searchWords = q
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .filter((word) => word.length > 0);
            return searchWords.every((word) => fieldStr.includes(word));
        };
        const matchesSearch =
            !submittedSearchQuery.trim() ||
            matchesQuery(order.order_id, submittedSearchQuery) ||
            matchesQuery(order.customer_name, submittedSearchQuery) ||
            matchesQuery(order.phone_number, submittedSearchQuery);
        const matchesDeliveryType =
            !deliveryTypeFilter || order.delivery_type === deliveryTypeFilter;
        const matchesToday = !isTodaySelected || isDateWithinRange(order?.created_at, startDate, endDate);
        return matchesSearch && matchesDeliveryType && matchesToday;
    });

    const isAllBranches = (isSuperadmin || isWIP || isCustomerServiceAssistant || isDirector) && (!branchFilter || String(branchFilter).trim() === "");
    const isSearchMode = submittedSearchQuery.trim().length > 0;
    const getTodayFilter = (order) => {
        if (!isTodaySelected) return true;
        return isDateWithinRange(order?.created_at, startDate, endDate);
    };
    const matchesSearchQuery = (orderId) => {
        if (!submittedSearchQuery.trim()) return false;
        if (orderId !== 0 && orderId !== "0" && !orderId) return false;
        const fieldStr = String(orderId ?? "").toLowerCase().trim();
        const searchWords = submittedSearchQuery
            .toLowerCase()
            .trim()
            .split(/\s*\*\s*/)
            .map((w) => w.trim())
            .filter((w) => w.length > 0);
        if (searchWords.length === 0) return true;
        return searchWords.every((word) => fieldStr.includes(word));
    };
    const toOrderId = (o) => String(o?.order_id ?? o?.id ?? "");
    const mergeAndFilterSearch = (fromApi, fromLoaded, applyFilters) => {
        const seen = new Set(fromLoaded.map((o) => toOrderId(o)));
        const merged = [...fromLoaded];
        for (const o of fromApi) {
            const id = toOrderId(o);
            if (id && !seen.has(id)) {
                seen.add(id);
                merged.push(o);
            }
        }
        return merged.filter(applyFilters);
    };
    const searchFiltered = isSearchMode
        ? mergeAndFilterSearch(
            searchResults,
            productions.filter((o) => matchesSearchQuery(o.order_id ?? o.id)),
            (order) => {
                const matchesDeliveryType = !deliveryTypeFilter || order.delivery_type === deliveryTypeFilter;
                return matchesDeliveryType && getTodayFilter(order);
            }
        )
        : [];
    const searchFilteredOrRaw = isSearchMode && searchFiltered.length === 0 && searchResults.length > 0
        ? searchResults.filter((order) => {
            const matchesDeliveryType = !deliveryTypeFilter || order.delivery_type === deliveryTypeFilter;
            return matchesDeliveryType;
        })
        : searchFiltered;
    const ordersForTable = isSearchMode ? searchFilteredOrRaw : filteredOrders;

    // Pagination: when Today filter is on, use filtered list length and slice; otherwise API count / full page
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const totalPages = (() => {
        if (isTodaySelected) {
            return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
        }
        if (!isSearchMode && totalServiceOrdersCount != null && totalServiceOrdersCount > 0) {
            if (totalServiceOrdersCount <= 15) return 1;
            return Math.max(1, Math.ceil(totalServiceOrdersCount / itemsPerPage));
        }
        return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
    })();
    const safePage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
    const indexOfLastItem = safePage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentOrders = (isTodaySelected || isSearchMode)
        ? ordersForTable.slice(indexOfFirstItem, indexOfLastItem)
        : (!isSearchMode && totalServiceOrdersCount != null && totalServiceOrdersCount > 0)
            ? ordersForTable
            : ordersForTable.slice(indexOfFirstItem, indexOfLastItem);
    const blankRows = itemsPerPage - currentOrders.length;

    // Page-based fetch: refetch when Today filter toggles so list reflects filter
    useEffect(() => {
        if (isSearchMode) return;
        const prev = lastServiceOrderFetchRef.current;
        if (
            prev.page === currentPage &&
            prev.branch === branchFilter &&
            prev.today === isTodaySelected &&
            prev.startDate === startDate &&
            prev.endDate === endDate
        ) return;
        lastServiceOrderFetchRef.current = {
            page: currentPage,
            branch: branchFilter,
            today: isTodaySelected,
            startDate,
            endDate,
        };
        const pageOffset = (currentPage - 1) * itemsPerPage;
        fetchAllPendingProductions(pageOffset, false);
    }, [currentPage, branchFilter, isSearchMode, isTodaySelected, startDate, endDate, itemsPerPage]);

    // When clicking a page: set page; useEffect will fetch more until filtered list has enough
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    // Reset to page 1 when search or filters change
    useEffect(() => {
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
    }, [submittedSearchQuery, deliveryTypeFilter, startDate, endDate, isTodaySelected]);

    const handleClickComplete = (order) => {
        setSelectedServiceOrder(order);
        setShowConfirmationDialog(true);
    };

    const handleMarkAsComplete = async () => {
        try {
            setIsLoadingSubmit(true);
            const itemIds = selectedServiceOrder.items.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: selectedServiceOrder.order_id,
                branch_id: selectedServiceOrder.branch_id,
                service_items: itemIds
            };

            const response = await markAsCompletedServiceOrder(payload);
            setShowConfirmationDialog(false);
            //fetchAllServiceOrders();
            setSelectedServiceOrder(null);
        } catch (error) {
            console.error("Error marking as complete: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Service Order Management</h1>
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

            <div className="flex flex-wrap gap-x-5 gap-y-2 w-full border-b border-primary text-2xl mb-5">
                {/* <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(1)}>Pending</h2> */}
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(2)}>Orders</h2>
            </div>

            {/* Filter Section */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-row border border-primary rounded-full h-fit w-full md:w-1/2 md:min-w-[320px] bg-white">
                    <div className="flex justify-center items-center rounded-l-full px-5">
                        <MdSearch className="size-6 text-primary" />
                    </div>

                    <input
                        className={`grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none`}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchQuery(value);
                            if (!value.trim()) setSubmittedSearchQuery("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const q = searchQuery.trim();
                            setSubmittedSearchQuery(q);
                            setCurrentPage(1);
                        }}
                        placeholder="Search Orders here (press Enter)..."
                    />
                </div>

                <div className="basis-full h-0" aria-hidden="true" />

                <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                    isActive={isTodaySelected}
                />

                <FilterSelector
                    options={deliveryTypeOptions}
                    value={deliveryTypeFilter}
                    onChange={handleDeliveryTypeFilterChange}
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
            </div>

            {isLoading ?
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="rounded-xl bg-white overflow-x-auto">
                    <div className="text-sm grid gap-x-5 divide-x divide-white/20 text-white bg-primary font-semibold py-2 px-3 min-w-[1280px] [&>*]:min-w-0 [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1" style={{ gridTemplateColumns: "1.6fr 1.8fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(95px, 1.2fr)" }}>
                        <p>ORDER ID</p>
                        <p>NAME</p>
                        <p>PHONE</p>
                        <p>DELIVERY TYPE</p>
                        <p>WASHING</p>
                        <p>PRESSING</p>
                        <p>DRY CLEAN</p>
                        <p>TOTAL AMOUNT</p>
                        <p>ADVANCED</p>
                        <p>REMAIN</p>
                        <p>DATE</p>
                        <p>TIME</p>
                        <p>DELIVERY DATE</p>
                        <p>ACTION</p>
                    </div>

                    {currentOrders.map((order, index) => (
                        <div key={index} className={`grid gap-x-5 divide-x divide-black/10 text-xs py-1.5 px-3 min-w-[1280px] whitespace-nowrap [&>*]:min-w-0 [&>*]:overflow-hidden [&>p]:text-ellipsis [&>p]:whitespace-nowrap [&>p]:text-center [&>p]:px-1 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`} style={{ gridTemplateColumns: "1.6fr 1.8fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(95px, 1.2fr)" }}>
                            <p className="!overflow-visible text-[10px] leading-tight">{order.order_id}</p>
                            <div className="min-w-0 overflow-hidden whitespace-normal break-normal leading-tight text-center px-1">{order.customer_name}</div>
                            <p>{order.phone_number}</p>
                            <p>{order.delivery_type}</p>
                            {(() => {
                                const items = order.items || [];
                                const sid = (o) => Number(o.service_type_id ?? o.serviceTypeId);
                                const qty = (o) => Number(o.pics_count ?? o.qty ?? 1);
                                const washingQty = items.filter(o => sid(o) === 1).reduce((s, o) => s + qty(o), 0);
                                const pressingQty = items.filter(o => sid(o) === 2).reduce((s, o) => s + qty(o), 0);
                                const dryCleanQty = items.filter(o => sid(o) === 3).reduce((s, o) => s + qty(o), 0);
                                return (
                                    <>
                                        <div className="flex flex-row items-center justify-center px-1">
                                            {washingQty > 0 ? (
                                                <div className="flex flex-row items-center">
                                                    <p>{washingQty}</p>
                                                    <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500" />
                                                </div>
                                            ) : (
                                                <Icon icon={"carbon:close-filled"} className="text-red-500" />
                                            )}
                                        </div>
                                        <div className="flex flex-row items-center justify-center px-1">
                                            {pressingQty > 0 ? (
                                                <div className="flex flex-row items-center">
                                                    <p>{pressingQty}</p>
                                                    <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500" />
                                                </div>
                                            ) : (
                                                <Icon icon={"carbon:close-filled"} className="text-red-500" />
                                            )}
                                        </div>
                                        <div className="flex flex-row items-center justify-center px-1">
                                            {dryCleanQty > 0 ? (
                                                <div className="flex flex-row items-center">
                                                    <p>{dryCleanQty}</p>
                                                    <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500" />
                                                </div>
                                            ) : (
                                                <Icon icon={"carbon:close-filled"} className="text-red-500" />
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                            <p>{(() => {
                                const apiTotal = Number(order?.total_amount);
                                const rawTotal = Number.isFinite(apiTotal)
                                    ? apiTotal
                                    : (order.items || []).reduce((sum, item) => {
                                        const qty = Number(item.quantity) || 0;
                                        const damaged = Number(item.damaged_quantity) || 0;
                                        const price = Number(item.price) || 0;
                                        return sum + ((qty - damaged) * price);
                                    }, 0) + (Number(order.delivery_charge) || 0);
                                return applyDiscountToAmount(rawTotal, order.discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}</p>
                            <p>{order.advance_payment}</p>
                            <p>{order.remaining_amount}</p>
                            <p>{(() => { const raw = order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()}</p>
                            <p>{(() => { const raw = order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); })()}</p>
                            <p>{order.delivery_date ? (() => { const d = new Date(order.delivery_date); return isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "—"}</p>
                            <div className="flex flex-row gap-x-1 justify-center">
                                <Link
                                    className="flex flex-col cursor-pointer"
                                    to={`/salesCorporate/retail/service-order/${order.order_id}`}
                                    state={{ order }}
                                >
                                    <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                    <p className="text-sm">View</p>
                                </Link>
                                {/* edit option */}
                                {order.can_update === 1 && order.status !== "Deactive" && hasPermission("SalesRetail_Service_Edit") &&
                                    <div className="min-h-max border border-black/50 my-1" />
                                }

                                {order.can_update === 1 && order.status !== "Deactive" && hasPermission("SalesRetail_Service_Edit") &&
                                    <Link to={`update-order/${order.order_id}`} className="flex flex-col cursor-pointer">
                                        <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                        <p className="text-sm">Edit</p>
                                    </Link>
                                }

                                {selectedTab == 1 &&
                                    <div className="min-h-max border border-black/50 my-1" />
                                }
                                {selectedTab == 1 &&
                                    <div className="flex flex-col cursor-pointer items-center" onClick={() => handleClickComplete(order)}>
                                        <Icon icon={"mage:home-check-fill"} className="text-green-500" />
                                        <p className="text-sm">Complete</p>
                                    </div>
                                }
                            </div>
                        </div>
                    ))}

                    {/* Render blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid gap-x-5 text-xs py-1.5 min-w-[1280px] whitespace-nowrap [&>p]:whitespace-nowrap ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                            style={{ gridTemplateColumns: "1.6fr 1.8fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(95px, 1.2fr)" }}
                        >
                            <div className="h-8" style={{ gridColumn: "1 / -1" }}></div>
                        </div>
                    ))}
                </div>
            }

            {/* Loading: below table when fetching a page (same as Pending Invoiced Order) */}
            {(() => {
                const shouldShowLoading = loadingServiceOrderPage || (isLoadingMore && hasMoreOrders && currentOrders.length < itemsPerPage);
                return shouldShowLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-primary/5 border-t border-primary/10 animate-pulse">
                        <BeatLoader color="#1470F9" size={12} />
                        <span className="text-primary font-medium text-sm">{loadingServiceOrderPage ? "Loading orders..." : "Loading more orders..."}</span>
                    </div>
                ) : null;
            })()}

            {/* More Orders Button (only for search mode) or All Orders Loaded message */}
            {(() => {
                if (isSearchMode) {
                    const showingApiResults = filteredOrders.length === 0;
                    const hasMore = showingApiResults && searchHasMore;
                    const isLoadingMoreData = searchLoadingMore;
                    const showAllLoaded = showingApiResults && !hasMore && !isLoadingMoreData && ordersForTable.length > 0;

                    if (hasMore) {
                        return (
                            <div className="flex justify-center mt-4">
                                <button
                                    onClick={handleLoadMoreSearch}
                                    disabled={isLoadingMoreData}
                                    className="px-6 py-2 rounded-lg bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                                >
                                    {isLoadingMoreData ? "Loading..." : "More search results"}
                                </button>
                            </div>
                        );
                    }

                    if (showAllLoaded) {
                        return (
                            <div className="flex justify-center mt-4">
                                <p className="text-sm text-black/60 font-medium">All orders loaded</p>
                            </div>
                        );
                    }
                }
                return null;
            })()}

            {/* Pagination - stable layout */}
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
                        const isLoadingMoreData = isSearchMode ? searchLoadingMore : (isLoadingMore || loadingServiceOrderPage);
                        const rawTotal = totalPages || 1;
                        // Use stable total pages: never decrease while loading, always show at least current page
                        const displayTotalPages = isLoadingMoreData
                            ? Math.max(rawTotal, lastStableTotalPagesRef.current, currentPage)
                            : Math.max(rawTotal, currentPage);
                        if (!isLoadingMoreData) lastStableTotalPagesRef.current = Math.max(rawTotal, currentPage);
                        const effectiveTotalPages = Math.max(displayTotalPages, currentPage);
                        const pageWindow = 5;
                        const half = Math.floor(pageWindow / 2);

                        // Use stable window: NEVER recalculate during loading - keep exact same window
                        let start, end;
                        const lastWindow = lastStableWindowRef.current;

                        if (isLoadingMoreData) {
                            // During loading: keep the EXACT same window, never change it
                            start = lastWindow.start;
                            end = lastWindow.end; // Keep exact same end, don't expand during loading
                        } else {
                            // Not loading: check if we need to recalculate
                            const currentPageInLastWindow = currentPage >= lastWindow.start && currentPage <= lastWindow.end;

                            if (currentPageInLastWindow) {
                                // Keep the same window if current page is still in it - don't recalculate
                                start = lastWindow.start;
                                end = Math.min(lastWindow.end, effectiveTotalPages);

                                // Only expand if new pages became available (totalPages increased)
                                if (effectiveTotalPages > lastWindow.end) {
                                    end = Math.min(effectiveTotalPages, lastWindow.end + 1); // Expand by 1 at a time
                                }
                            } else {
                                // Current page moved outside window: recalculate centered around current page
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

                        // Final bounds check - ensure start and end are valid integers and consecutive
                        start = Math.floor(Math.max(1, Math.min(start, effectiveTotalPages)));
                        end = Math.floor(Math.max(start, Math.min(end, effectiveTotalPages)));

                        if (!isLoadingMoreData) {
                            // Ensure current page is always in range
                            if (currentPage < start) start = currentPage;
                            if (currentPage > end) end = currentPage;
                            if (end < start) end = start;
                        } else {
                            // During loading: keep window stable, just ensure valid bounds
                            if (end < start) end = start;
                        }

                        // Update stable window ref only when not loading (or when expanding)
                        if (!isLoadingMoreData || end > lastWindow.end) {
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
                        const pagesToShow = [];

                        // Add ALL consecutive pages from start to end - no skipping, no gaps
                        for (let i = start; i <= end; i++) {
                            if (i >= 1 && i <= effectiveTotalPages) {
                                pagesToShow.push(i);
                            }
                        }

                        // Ensure current page is included
                        if (currentPage >= 1 && currentPage <= effectiveTotalPages) {
                            if (!pagesToShow.includes(currentPage)) {
                                pagesToShow.push(currentPage);
                            }
                        }

                        // Sort to ensure order
                        pagesToShow.sort((a, b) => a - b);

                        // Render page buttons - render ALL pages in pagesToShow consecutively
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

            {/* All Orders Loaded message */}
            {!hasMoreOrders && !isLoadingMore && filteredOrders.length > 0 && (
                <div className="flex justify-center mt-4">
                    <p className="text-sm text-black/60 font-medium">All orders loaded</p>
                </div>
            )}

            {showConfirmationDialog &&
                <ConfirmationDialog
                    title={"Mark Order as Completed"}
                    text={"Are you sure to mark as completed the order"}
                    item={selectedServiceOrder?.order_id}
                    onClose={() => {
                        setShowConfirmationDialog(false);
                    }}
                    onSubmit={handleMarkAsComplete}
                    isLoading={isLoadingSubmit}
                />
            }
        </div>
    );
};

export default SalesRetailServiceOrder;
