import { BiPlus } from "react-icons/bi";
import { applyDiscountToAmount } from "../../utils/discount";
import DetailsCard from "../../components/ui/DetailsCard";
import { MdSearch } from "react-icons/md";
import { useEffect, useRef, useState } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import RetailCustomerCreateDialog from "../../components/dialogs/retail/RetailCustomerCreateDialog";
import RetailCustomerUpdateDialog from "../../components/dialogs/retail/RetailCustomerUpdateDialog";
import { Link, useLocation } from "react-router-dom";
import { getAllRetailOrders, getAllRetailOrdersAllBranches, getAllBranches, getRetailOrderById } from "../../services/Retail/RetailOrderServices";
import { BeatLoader } from "react-spinners";
import { getAllCustomers } from "../../services/CustomerServices";
import RetailViewOrder from "../../components/dialogs/retail/RetailViewOrder";
import { getAllItemTypes } from "../../services/Retail/RetailSettingsServices";
import { getAllServiceTypes } from "../../services/ServiceTypeServices";
import { getRetailDashboardExpressOrders, getRetailDashboardReadyForPickupOrders, getRetailDashboardReleaseTodayOrders, getRetailDashboardTotalOrders } from "../../services/Retail/RetailDashboardServices";
import { hasPermission, isSuperadminRole } from "../../utils/permissionHelper";
import { isRetailViewOnlyForPrefix, parsePermissionTokens } from "../../utils/retailSubTabPermissions";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { isDateRangeFilterActive, isDateWithinRange } from "../../utils/dateRange";

function getOrderTotalAdvanced(order) {
    if (!order) return 0;
    const parseAmt = (v) => {
        if (v == null || v === "") return 0;
        if (typeof v === "number" && !isNaN(v)) return v;
        const n = parseFloat(String(v).replace(/,/g, ""));
        return isNaN(n) ? 0 : n;
    };
    let fromPayment = 0;
    if (order.payment && Array.isArray(order.payment) && order.payment.length > 0) {
        fromPayment = order.payment.reduce(
            (sum, p) => sum + parseAmt(p.paid_amount ?? p.paidAmount ?? 0),
            0
        );
    }
    const fromAdvance = parseAmt(order.advance_payment ?? order.advancePayment ?? 0);
    return Math.max(fromPayment, fromAdvance) || fromAdvance || fromPayment;
}

const SalesRetailOrderEntry = () => {
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
    const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("");
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [showUpdateCustomerDialog, setShowUpdateCustomerDialog] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [showOrder, setShowOrder] = useState(false);
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
    const [totalOrderEntryCount, setTotalOrderEntryCount] = useState(null);
    const [loadingOrderEntryPage, setLoadingOrderEntryPage] = useState(false);
    const lastOrderEntryFetchRef = useRef({ page: 1, branch: null });
    // API search when All Branches is selected (same as Dispatch/Transfer Note)
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
    const permissionTokens = parsePermissionTokens(localStorage.getItem("permissions") || "");
    // Someone who can only View Order Entry (no Create/Edit/Approve of their own) is locked to
    // the branch they started their day with.
    const isBranchViewOnly = isRetailViewOnlyForPrefix(permissionTokens, "SalesRetail_Order_");
    const [branchFilter, setBranchFilter] = useState(localStorage.getItem("selectedBranchId") || "");

    const deliveryTypeOptions = [
        { value: 'Normal', label: 'Normal' },
        { value: 'Two Day', label: 'Two Day' },
        { value: 'One Day', label: 'One Day' },
        { value: 'Express', label: 'Express' },
        { value: 'Urgent', label: 'Urgent' },
    ];

    const handleDeliveryTypeFilterChange = (e) => {
        setDeliveryTypeFilter(e.target.value);
    };

    const handleBranchFilterChange = (e) => {
        setBranchFilter(e.target.value);
    };

    // Fetch branches for branch filter dropdown (same as service order page)
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

    const buildOrderEntryPayload = (offset = 0, searchTextOverride = null) => {
        const userId = localStorage.getItem("userId");
        const searchText = (searchTextOverride != null ? String(searchTextOverride) : submittedSearchQuery).trim();
        const payload = {
            user_id: userId,
            offset: Number(offset) || 0,
        };

        const isAllBranchMode = (isSuperadmin || isWIP || isCustomerServiceAssistant || isDirector) && (!branchFilter || String(branchFilter).trim() === "");
        const branchId = branchFilter != null && String(branchFilter).trim() !== ""
            ? Number(branchFilter)
            : Number(localStorage.getItem("selectedBranchId")) || 1;

        if (!isAllBranchMode) {
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

        return { payload, isAllBranchMode };
    };

    const fetchAllOrders = async (offset = 0, append = false) => {
        try {
            if (append) {
                setIsLoadingMore(true);
            } else {
                setLoadingOrderEntryPage(true);
                setOrders([]);
            }
            const requestOffset = offset != null ? Number(offset) : 0;
            const { payload, isAllBranchMode } = buildOrderEntryPayload(requestOffset);
            if (!payload.user_id) return;
            let response;
            if (isAllBranchMode) {
                response = await getAllRetailOrdersAllBranches(payload);
            } else {
                response = await getAllRetailOrders(payload);
            }

            let allOrders = [];
            let totalCount = 0; // API "count" = total number of orders (for pagination: totalPages = count / 15)
            if (response?.data) {
                if (Array.isArray(response.data.orders)) {
                    allOrders = response.data.orders;
                    totalCount = response.data.count ?? allOrders.length;
                } else if (Array.isArray(response.data)) {
                    allOrders = response.data;
                    totalCount = response.data.count ?? allOrders.length;
                } else {
                    allOrders = response.data.orders ?? [];
                    totalCount = response.data.count ?? allOrders.length;
                }
            }

            // Normalize order data to handle both snake_case and camelCase field names from API
            const normalizedOrders = allOrders.map((order) => {
                if (!order || typeof order !== "object") return order;

                const parseAmount = (val) => {
                    if (val == null || val === "" || val === undefined) return null;
                    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
                    return isNaN(num) ? null : num;
                };

                const base = { ...order };

                // Normalize total_amount
                if (base.total_amount == null || base.total_amount === 0) {
                    base.total_amount = parseAmount(order.total_amount ?? order.totalAmount ?? order.total ?? order.amount);
                } else {
                    base.total_amount = parseAmount(base.total_amount);
                }

                // Normalize remaining_amount
                if (base.remaining_amount == null) {
                    base.remaining_amount = parseAmount(order.remaining_amount ?? order.remainingAmount ?? order.balance);
                } else {
                    base.remaining_amount = parseAmount(base.remaining_amount);
                }

                // Normalize advance_payment
                if (base.advance_payment == null) {
                    base.advance_payment = parseAmount(order.advance_payment ?? order.advancePayment ?? order.advance ?? order.paid);
                } else {
                    base.advance_payment = parseAmount(base.advance_payment);
                }

                // Normalize delivery_charge
                if (base.delivery_charge == null) {
                    base.delivery_charge = parseAmount(order.delivery_charge ?? order.deliveryCharge);
                } else {
                    base.delivery_charge = parseAmount(base.delivery_charge);
                }

                // Normalize items array and ensure each item has price
                if (Array.isArray(base.items)) {
                    base.items = base.items.map((item) => {
                        if (!item || typeof item !== "object") return item;
                        const normalizedItem = { ...item };
                        // Ensure price is parsed as a number
                        normalizedItem.price = parseAmount(item.price ?? item.unit_price ?? item.unitPrice ?? item.item_price ?? item.itemPrice) ?? 0;
                        normalizedItem.quantity = parseAmount(item.quantity ?? item.qty) ?? 1;
                        return normalizedItem;
                    });
                }

                // If total_amount is still 0 or null, calculate from items
                if ((base.total_amount == null || base.total_amount === 0) && Array.isArray(base.items) && base.items.length > 0) {
                    const itemsTotal = base.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
                    base.total_amount = itemsTotal + (Number(base.delivery_charge) || 0);
                }

                return base;
            });

            const sorted = normalizedOrders.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });

            setTotalOrderEntryCount(totalCount);
            setOrders(sorted.slice(0, 15));
            setCurrentOffset(requestOffset);
            setHasMoreOrders(totalCount != null && totalCount > 0 && requestOffset + allOrders.length < totalCount);
        } catch (error) {
            console.error("Error fetching orders: ", error);
            if (!append) {
                setOrders([]);
                setTotalOrderEntryCount(null);
                setHasMoreOrders(false);
            }
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
            setLoadingOrderEntryPage(false);
        }
    };

    const handleLoadMoreOrders = () => {
        if (!hasMoreOrders || isLoadingMore) return;
        // Pagination is page-based (same as Service Order); use page buttons instead
    };

    const SEARCH_PAGE_SIZE = 15;
    const fetchSearchOrders = async (append = false, queryOverride = null) => {
        const q = (queryOverride != null && String(queryOverride).trim() !== "") ? String(queryOverride).trim() : searchQuery.trim();
        if (!q) return;
        try {
            if (append) setSearchLoadingMore(true);
            else setIsSearching(true);
            const offset = append ? searchOffset : 0;
            const { payload, isAllBranchMode } = buildOrderEntryPayload(offset, q);
            if (!payload.user_id) return;
            const response = isAllBranchMode
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

            const validOrders = ordersWithFullDetails.filter(order => order != null);

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

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
        }
    };

    const fetchAllServiceTypes = async () => {
        try {
            const response = await getAllServiceTypes();
            setServiceTypes(response.data.service_types);
        } catch (error) {
            console.error("Error fetching service types: ", error);
        }
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

    useEffect(() => {
        fetchItemTypes();
        fetchAllServiceTypes();
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
        setTotalOrderEntryCount(null);
        lastOrderEntryFetchRef.current = { page: 0, branch: null };
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
    }, [branchFilter, location.state?.refreshOrders]);

    // Reset to page 1 when search or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [submittedSearchQuery, deliveryTypeFilter, isTodaySelected]);

    const isAllBranches = (isSuperadmin || isWIP || isCustomerServiceAssistant || isDirector) && (!branchFilter || String(branchFilter).trim() === "");

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

    // Apply search, delivery type, and today filters on top of backend data (search only when user pressed Enter)
    const filteredOrders = orders.filter((order) => {
        const matchesQuery = (field) => {
            if (!submittedSearchQuery || !field) return submittedSearchQuery === "";
            const fieldStr = String(field).toLowerCase();
            const searchWords = submittedSearchQuery
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .filter((word) => word.length > 0);
            return searchWords.every((word) => fieldStr.includes(word));
        };
        const matchesSearch =
            !submittedSearchQuery.trim() ||
            matchesQuery(order.order_id) ||
            matchesQuery(order.customer_name) ||
            matchesQuery(order.phone_number);
        const matchesDeliveryType =
            !deliveryTypeFilter || order.delivery_type === deliveryTypeFilter;
        const matchesToday = !isTodaySelected || isDateWithinRange(order?.created_at, startDate, endDate);
        return matchesSearch && matchesDeliveryType && matchesToday;
    });

    const isSearchMode = submittedSearchQuery.trim().length > 0;
    const searchFiltered = isSearchMode
        ? mergeAndFilterSearch(
            searchResults,
            orders.filter((o) => matchesSearchQuery(o.order_id ?? o.id)),
            (order) => {
                const matchesDeliveryType = !deliveryTypeFilter || order.delivery_type === deliveryTypeFilter;
                return matchesDeliveryType && getTodayFilter(order);
            }
        )
        : [];
    const ordersForTable = isSearchMode ? searchFiltered : filteredOrders;

    // Pagination: when Today filter is on, use filtered list length and slice; otherwise API count / full page
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const totalPages = (() => {
        if (isTodaySelected) {
            return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
        }
        if (!isSearchMode && totalOrderEntryCount != null && totalOrderEntryCount > 0) {
            if (totalOrderEntryCount <= 15) return 1;
            return Math.max(1, Math.ceil(totalOrderEntryCount / itemsPerPage));
        }
        return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
    })();
    const safePage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
    const indexOfLastItem = safePage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentOrders = (isTodaySelected || isSearchMode)
        ? ordersForTable.slice(indexOfFirstItem, indexOfLastItem)
        : (!isSearchMode && totalOrderEntryCount != null && totalOrderEntryCount > 0)
            ? ordersForTable
            : ordersForTable.slice(indexOfFirstItem, indexOfLastItem);
    const blankRows = itemsPerPage - currentOrders.length;

    // Page-based fetch: refetch when Today filter toggles so list reflects filter; same as Service Order
    useEffect(() => {
        if (isSearchMode) return;
        const prev = lastOrderEntryFetchRef.current;
        if (prev.page === currentPage && prev.branch === branchFilter && prev.today === isTodaySelected) return;
        lastOrderEntryFetchRef.current = { page: currentPage, branch: branchFilter, today: isTodaySelected };
        const pageOffset = (currentPage - 1) * itemsPerPage;
        fetchAllOrders(pageOffset, false);
    }, [currentPage, branchFilter, isSearchMode, isTodaySelected, itemsPerPage]);


    // When clicking a page: set page; useEffect will fetch more until filtered list has enough
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleView = (order) => {
        // Open immediately for better UX; RetailViewOrder fetches latest details after open.
        setSelectedOrder(order);
        setShowOrder(true);
    };

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Order Entry Management</h1>
                    <p className="text-xl text-black/50">Manage your organization's customer resources efficiently.</p>
                </div>
                {hasPermission("SalesRetail_Order_Create") && (
                    <Link className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer" to={'add-new-order'}><BiPlus /> Add New Order</Link>
                )}
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

            <div className="w-full border-b border-primary">
                <p className="border-b-3 border-black w-fit px-1 text-2xl font-semibold">Orders</p>
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
                            const v = e.target.value;
                            setSearchQuery(v);
                            if (!v.trim()) setSubmittedSearchQuery("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const q = searchQuery.trim();
                            setSubmittedSearchQuery(q);
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

            {(isLoading) || (isSearchMode && isSearching && searchResults.length === 0 && orders.filter((o) => matchesSearchQuery(o.order_id ?? o.id)).length === 0) ?
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="rounded-xl bg-white overflow-x-auto">
                    <div className="text-sm grid gap-x-5 divide-x divide-white/20 text-white bg-primary font-semibold py-2 px-3 min-w-[1240px] [&>*]:min-w-0 [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1" style={{ gridTemplateColumns: "1.6fr 1.8fr 1.2fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr 1fr 1fr" }}>
                        <p>ORDER ID</p>
                        <p>NAME</p>
                        <p>PHONE</p>
                        <p>NO OF ITEMS</p>
                        <p>DELIVERY TYPE</p>
                        <p>TOTAL AMOUNT</p>
                        <p>ADVANCED</p>
                        <p>REMAIN</p>
                        <p>DATE</p>
                        <p>TIME</p>
                        <p>DELIVERY DATE</p>
                        <p>STATUS</p>
                        <p>ACTION</p>
                    </div>

                    {currentOrders.map((order, index) => {
                        const totalAdvanced = getOrderTotalAdvanced(order);
                        const formatRs = (n) => (n == null || Number.isNaN(n) ? "0.00" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                        return (
                            <div key={index} className={`grid gap-x-5 divide-x divide-black/10 text-xs py-1.5 px-3 min-w-[1240px] whitespace-nowrap [&>*]:min-w-0 [&>*]:overflow-hidden [&>p]:text-ellipsis [&>p]:whitespace-nowrap [&>p]:text-center [&>p]:px-1 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`} style={{ gridTemplateColumns: "1.6fr 1.8fr 1.2fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr 1fr 1fr" }}>
                                <p className="!overflow-visible text-xs leading-tight">{order.order_id}</p>
                                <div className="min-w-0 overflow-hidden whitespace-normal break-normal leading-tight text-center px-1">{order.customer_name}</div>
                                <p>{order.phone_number}</p>
                                <p>{(() => {
                                    const items = Array.isArray(order.items) ? order.items : [];
                                    if (items.length === 0) return 0;

                                    // Some APIs return one row per piece while repeating the order-level pics_count on each row.
                                    // In that case (e.g. 6 rows each with pics_count=6), show 6 instead of summing to 36.
                                    const picsValues = items
                                        .map((item) => Number(item?.pics_count))
                                        .filter((value) => Number.isFinite(value) && value > 0);
                                    const uniquePicsValues = Array.from(new Set(picsValues));
                                    if (
                                        uniquePicsValues.length === 1 &&
                                        Number(uniquePicsValues[0]) === items.length
                                    ) {
                                        return items.length;
                                    }

                                    return items.reduce((sum, item) => {
                                        const pics = Number(item?.pics_count);
                                        if (Number.isFinite(pics) && pics > 0) return sum + pics;
                                        const qty = Number(item?.quantity);
                                        if (Number.isFinite(qty) && qty > 0) return sum + qty;
                                        return sum + 1;
                                    }, 0);
                                })()}</p>
                                <p>{order.delivery_type}</p>
                                <p>{(() => {
                                    const rawTotal = order.total_amount != null
                                        ? Number(order.total_amount)
                                        : (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0) + (Number(order.delivery_charge) || 0);
                                    return formatRs(applyDiscountToAmount(rawTotal, order.discount));
                                })()}</p>
                                <p>{formatRs(totalAdvanced)}</p>
                                <p>{order.remaining_amount != null ? formatRs(order.remaining_amount) : order.remaining_amount}</p>
                                <p>{(() => { const raw = order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()}</p>
                                <p>{(() => { const raw = order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); })()}</p>
                                <p>{order.delivery_date ? (() => { const d = new Date(order.delivery_date); return isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "—"}</p>
                                <p className={(() => {
                                    const s = (order.display_status ?? (order.status === "Deactive" ? "Cancelled" : (order.status ?? ""))).toLowerCase().trim();
                                    if (s === "completed" || s === "active") return "text-green-600 font-semibold";
                                    if (s === "cancelled" || s === "deactive" || s === "cancel") return "text-red-600 font-semibold";
                                    if (s === "open") return "text-blue-600 font-semibold";
                                    if (s === "processing") return "text-yellow-500 font-semibold";
                                    return "";
                                })()}>{order.display_status ?? (order.status === "Deactive" ? "Cancelled" : (order.status ?? "—"))}</p>
                                <div className="flex flex-row gap-x-1 justify-center">
                                    <div className="flex flex-col cursor-pointer" onClick={() => handleView(order)}>
                                        <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                        <p className="text-sm">View</p>
                                    </div>

                                    {order.can_update === 1 && order.status !== "Deactive" && hasPermission("SalesRetail_Order_Edit") &&
                                        <div className="min-h-max border border-black/50 my-1" />
                                    }

                                    {order.can_update === 1 && order.status !== "Deactive" && hasPermission("SalesRetail_Order_Edit") &&
                                        <Link to={`update-order/${order.order_id}`} className="flex flex-col cursor-pointer">
                                            <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                            <p className="text-sm">Edit</p>
                                        </Link>
                                    }
                                </div>
                            </div>
                        );
                    })}

                    {/* Render blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid gap-x-5 text-xs py-1.5 min-w-[1240px] whitespace-nowrap [&>p]:whitespace-nowrap ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                            style={{ gridTemplateColumns: "1.6fr 1.8fr 1.2fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr 1fr 1fr" }}
                        >
                            <div className="h-8" style={{ gridColumn: "1 / -1" }}></div>
                        </div>
                    ))}
                </div>
            }

            {/* Loading: below table when fetching a page (same as Service Order) */}
            {(() => {
                const isLoadingMoreData = isSearchMode ? searchLoadingMore : (isLoadingMore || loadingOrderEntryPage);
                const hasMore = isSearchMode ? searchHasMore : hasMoreOrders;
                const shouldShowLoading = loadingOrderEntryPage || (isLoadingMoreData && hasMore && currentOrders.length < itemsPerPage);
                return shouldShowLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-primary/5 border-t border-primary/10 animate-pulse">
                        <BeatLoader color="#1470F9" size={12} />
                        <span className="text-primary font-medium text-sm">{loadingOrderEntryPage ? "Loading orders..." : "Loading more orders..."}</span>
                    </div>
                ) : null;
            })()}

            {/* Pagination - stable layout */}
            <div className="flex flex-row justify-between items-center mb-5 min-h-[40px]">
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
                        const isLoadingMoreData = isSearchMode ? searchLoadingMore : (isLoadingMore || loadingOrderEntryPage);
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

            {/* More Orders Button (only for search mode) or All Orders Loaded message */}
            {(() => {
                if (isSearchMode) {
                    // Only show "More search results" when we're showing API results (no matches in table)
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
                } else {
                    // Not in search mode: no "More Orders" button; more orders load automatically when user goes to next page
                    const showAllLoaded = !hasMoreOrders && !isLoadingMore && ordersForTable.length > 0;
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

            {showOrder && selectedOrder &&
                <RetailViewOrder
                    itemTypes={itemTypes}
                    serviceTypes={serviceTypes}
                    data={selectedOrder}
                    orderItems={Array.isArray(selectedOrder?.items) ? selectedOrder.items : []}
                    // customer={customers.find(c => c.customer_id === selectedOrder.customer_id)}
                    customer={{
                        customer_id: selectedOrder?.customer_id,
                        customer_name: selectedOrder?.customer_name,
                        phone_number: selectedOrder?.phone_number
                    }}
                    handleClose={() => {
                        setShowOrder(false);
                        setSelectedOrder(null);
                    }}
                    refreshOrders={fetchAllOrders}
                />
            }
        </div>
    );
};

export default SalesRetailOrderEntry;
