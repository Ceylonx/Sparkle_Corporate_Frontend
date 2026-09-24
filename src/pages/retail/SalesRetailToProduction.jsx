import DetailsCard from "../../components/ui/DetailsCard";
import { applyDiscountToAmount } from "../../utils/discount";
import { MdSearch } from "react-icons/md";
import { useEffect, useMemo, useRef, useState } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import RetailCustomerCreateDialog from "../../components/dialogs/retail/RetailCustomerCreateDialog";
import RetailCustomerUpdateDialog from "../../components/dialogs/retail/RetailCustomerUpdateDialog";
import { Link } from "react-router-dom";
import { getAllRetailPendingProductions, getAllRetailPendingProductionsAllBranches, getAllRetailPendingProductionsReceived, getAllRetailPendingProductionsReceivedAllBranches, receiveBulkToProductionOrder, receiveToProductionOrder, sendBulkToProductionOrder, sendToProductionOrder } from "../../services/Retail/RetailToProductionServices";
import { BeatLoader } from "react-spinners";
import { getAllRetailBackToOutletOrders, getAllRetailBackToOutletOrdersAllBranches } from "../../services/Retail/RetailBackToOutletServices";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import { getRetailDashboardExpressOrders, getRetailDashboardReadyForPickupOrders, getRetailDashboardReleaseTodayOrders, getRetailDashboardTotalOrders } from "../../services/Retail/RetailDashboardServices";
import { getAllBranches, searchOrderById } from "../../services/Retail/RetailOrderServices";
import { getAllSettings } from "../../services/Retail/RetailSettingsServices";
import { useReactToPrint } from "react-to-print";
import RetailTransferNote from "../../components/printables/RetailTransferNote";
import {
    canAccessTransferNoteManagement,
    getTransferNoteTabActions,
    getTransferNoteTabVisibility,
    hasSalesRetailOutletTransferNoteSendAction,
    parsePermissionTokens,
} from "../../utils/retailSubTabPermissions";
import { isSuperadminRole } from "../../utils/permissionHelper";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { isDateRangeFilterActive, isDateWithinRange } from "../../utils/dateRange";
import PermissionDenied from "../../components/ui/PermissionDenied";

const SalesRetailToProduction = () => {
    const userRole = localStorage.getItem("role") || "";
    const isSuperadmin = isSuperadminRole(userRole);

    const permissions = localStorage.getItem("permissions") || "";
    const permissionTokens = useMemo(() => parsePermissionTokens(permissions), [permissions]);
    const tnTabs = useMemo(() => getTransferNoteTabVisibility(permissionTokens, isSuperadmin), [permissionTokens, isSuperadmin]);
    const tnActions = useMemo(
        () => getTransferNoteTabActions(permissionTokens, isSuperadmin, permissions),
        [permissionTokens, isSuperadmin, permissions]
    );
    const canAccessPage = canAccessTransferNoteManagement(permissionTokens, isSuperadmin, permissions);

    const canSendOutletTransferNote = useMemo(
        () => hasSalesRetailOutletTransferNoteSendAction(permissions, permissionTokens),
        [permissions, permissionTokens]
    );
    /** Receive to Sorting row/bulk Receive (explicit …_Receive, or legacy parent Approve). */
    const canReceiveToSorting = tnActions.receive.approve;

    const [isLoadingSend, setIsLoadingSend] = useState(false);
    const [isLoadingReceive, setIsLoadingReceive] = useState(false);
    const [isLoadingAlreadyReceived, setIsLoadingAlreadyReceived] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
    const [selectedTab, setSelectedTab] = useState(1);
    const canEditCurrentTab = useMemo(
        () =>
            selectedTab === 1 ? tnActions.outlet.edit : selectedTab === 2 ? tnActions.receive.edit : tnActions.wip.edit,
        [selectedTab, tnActions]
    );
    /**
     * A role that can only View the current sub-tab (no Create/Edit/Delete/Approve of its own)
     * is locked to the branch it started its day with — it shouldn't be able to browse other
     * branches' orders through the filter.
     */
    const isBranchViewOnly = useMemo(() => {
        const actions = selectedTab === 1 ? tnActions.outlet : selectedTab === 2 ? tnActions.receive : tnActions.wip;
        return !!actions.view && !actions.create && !actions.edit && !actions.delete && !actions.approve;
    }, [selectedTab, tnActions]);
    const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("");
    const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
    const [showReceiveConfirmationDialog, setShowReceiveConfirmationDialog] = useState(false);
    const [showSendBulkConfirmationDialog, setShowSendBulkConfirmationDialog] = useState(false);
    const [showReceiveBulkConfirmationDialog, setShowReceiveBulkConfirmationDialog] = useState(false);
    const [productions, setProductions] = useState([]);
    const [receiveProductions, setReceiveProductions] = useState([]);
    const [backToOutlets, setBackToOutlets] = useState([]);
    const [selectedProductionOrder, setSelectedProductionOrder] = useState(null);
    const [totalOrders, setTotalOrders] = useState(null);
    const [readyForPickupOrders, setReadyForPickupOrders] = useState(null);
    const [releaseTodayOrders, setReleaseTodayOrders] = useState(null);
    const [expressOrders, setExpressOrders] = useState(null);
    const [selectMultipleSend, setSelectMultipleSend] = useState(false);
    const [selectedForSend, setSelectedForSend] = useState([]);
    const [selectMultipleReceive, setSelectMultipleReceive] = useState(false);
    const [selectedForReceive, setSelectedForReceive] = useState([]);
    const [settings, setSettings] = useState(null);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const isTodaySelected = isDateRangeFilterActive(startDate, endDate);
    const [branches, setBranches] = useState([]);
    const [branchFilter, setBranchFilter] = useState(String(localStorage.getItem("selectedBranchId") || "").trim());
    const [showPrintDialog, setShowPrintDialog] = useState(false);
    const [ordersToPrint, setOrdersToPrint] = useState([]);
    const transferNoteRef = useRef(null);
    // Pagination state for each tab
    const [pendingProductionsOffset, setPendingProductionsOffset] = useState(0);
    const [pendingProductionsHasMore, setPendingProductionsHasMore] = useState(false);
    const [pendingProductionsLoadingMore, setPendingProductionsLoadingMore] = useState(false);
    const [pendingProductionsReceivedOffset, setPendingProductionsReceivedOffset] = useState(0);
    const [pendingProductionsReceivedHasMore, setPendingProductionsReceivedHasMore] = useState(false);
    const [pendingProductionsReceivedLoadingMore, setPendingProductionsReceivedLoadingMore] = useState(false);
    const [backToOutletOffset, setBackToOutletOffset] = useState(0);
    const [backToOutletHasMore, setBackToOutletHasMore] = useState(false);
    const [backToOutletLoadingMore, setBackToOutletLoadingMore] = useState(false);
    // Outlet Transfer Note: API search when All Branches is selected
    const [transferNoteSearchResults, setTransferNoteSearchResults] = useState([]);
    const [isSearchingTransferNote, setIsSearchingTransferNote] = useState(false);
    const [transferNoteSearchOffset, setTransferNoteSearchOffset] = useState(0);
    const [transferNoteSearchHasMore, setTransferNoteSearchHasMore] = useState(false);
    const [transferNoteSearchLoadingMore, setTransferNoteSearchLoadingMore] = useState(false);
    // Outlet Received Note (tab 2): API search when All Branches is selected
    const [receiveSearchResults, setReceiveSearchResults] = useState([]);
    const [isSearchingReceive, setIsSearchingReceive] = useState(false);
    const [receiveSearchOffset, setReceiveSearchOffset] = useState(0);
    const [receiveSearchHasMore, setReceiveSearchHasMore] = useState(false);
    const [receiveSearchLoadingMore, setReceiveSearchLoadingMore] = useState(false);
    // Work in Progress (tab 3): API search — without this, typing a search only filtered the
    // locally-loaded (paginated) backToOutlets list, so a real order could be missing from
    // results under a specific branch simply because it hadn't been paginated in yet, while
    // "All Branches" (a differently-paginated fetch) happened to already include it.
    const [workInProgressSearchResults, setWorkInProgressSearchResults] = useState([]);
    const [isSearchingWorkInProgress, setIsSearchingWorkInProgress] = useState(false);
    const [workInProgressSearchOffset, setWorkInProgressSearchOffset] = useState(0);
    const [workInProgressSearchHasMore, setWorkInProgressSearchHasMore] = useState(false);
    const [workInProgressSearchLoadingMore, setWorkInProgressSearchLoadingMore] = useState(false);
    const searchDebounceRef = useRef(null);
    const receiveSearchDebounceRef = useRef(null);
    // Stable pagination refs
    const fetchedMoreOnPage3Ref = useRef(false);
    const lastStableTotalPagesRef = useRef(1);
    const lastStableWindowRef = useRef({ start: 1, end: 5 });
    const lastProductionsAllBranchesFetchRef = useRef({ page: 1, branch: null });
    const tabDataScopeRef = useRef({ 1: null, 2: null, 3: null });
    const [totalPendingProductionsCount, setTotalPendingProductionsCount] = useState(null);
    const [loadingProductionsPage, setLoadingProductionsPage] = useState(false);

    const deliveryTypeOptions = [
        { value: 'Urgent', label: 'Urgent' },
        { value: 'Express', label: 'Express' },
        { value: 'One Day', label: 'One Day' },
        { value: 'Two Day', label: 'Two Day' },
        { value: 'Normal', label: 'Normal' },
    ];

    useEffect(() => {
        const visible = (tab) => (tab === 1 ? tnTabs.outlet : tab === 2 ? tnTabs.receive : tnTabs.wip);
        if (!visible(selectedTab)) {
            const order = [1, 2, 3];
            const next = order.find((t) => visible(t));
            if (next != null) setSelectedTab(next);
        }
    }, [tnTabs, selectedTab]);

    useEffect(() => {
        if (!canSendOutletTransferNote) {
            setSelectMultipleSend(false);
            setSelectedForSend([]);
            setShowSendBulkConfirmationDialog(false);
        }
    }, [canSendOutletTransferNote]);

    useEffect(() => {
        if (!canReceiveToSorting) {
            setSelectMultipleReceive(false);
            setSelectedForReceive([]);
            setShowReceiveBulkConfirmationDialog(false);
            setShowReceiveConfirmationDialog(false);
        }
    }, [canReceiveToSorting]);

    // SuperAdmin/Customer Service Assistant/WIP: empty = All Branches (merge path). Otherwise selected branch or logged-in branch.
    const getBranchIdForFetch = () =>
        branchFilter ? Number(branchFilter) : 0;

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

    // Bag counting rule: each item type is packed separately (and by packing option),
    // then bag counts are summed across groups.
    const calculateBagsByItemType = (items = []) => {
        const maxItemsPerBag = Math.max(1, Number(settings?.bag_count) || 8);
        const groups = new Map();

        items.forEach((item) => {
            const serviceKey = String(item?.service_type_id || item?.service_id || "UnknownService");
            const packingKey = String(item?.packing_option || "UnknownPacking");
            const groupKey = `${serviceKey}__${packingKey}`;
            groups.set(groupKey, (groups.get(groupKey) || 0) + 1);
        });

        let totalBags = 0;
        groups.forEach((count) => {
            totalBags += Math.ceil(count / maxItemsPerBag);
        });

        return totalBags;
    };

    const fetchAllPendingProductions = async (offset = 0, append = false) => {
        const isAllBranches = !branchFilter || String(branchFilter).trim() === "";
        const isAllBranchesProductions = !branchFilter || String(branchFilter).trim() === "";
        try {
            if (append) {
                setPendingProductionsLoadingMore(true);
            } else if (isAllBranchesProductions) {
                setLoadingProductionsPage(true);
                setProductions([]);
            } else {
                setIsLoadingSend(true);
            }
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const extractProductionOrders = (response) => {
                if (!response?.data) return [];
                if (Array.isArray(response.data.pending_production)) return response.data.pending_production;
                if (Array.isArray(response.data)) return response.data;
                return response.data.pending_production ?? [];
            };
            const toFilteredOrders = (allOrders) => allOrders
                .filter((order) => order.status === "Active")
                .map((order) => ({
                    ...order,
                    items: order.items?.filter((item) => item.is_send_to_production === 0) ?? [],
                }));

            if (isAllBranchesProductions) {
                // Backend pages return up to 15 orders regardless of status, so a batch with
                // inactive orders can leave this page short. Keep pulling further raw pages
                // until we have a full page of Active orders or the backend runs out.
                let rawOffset = offset != null ? Number(offset) : 0;
                let collected = [];
                let total = null;
                let guard = 0;
                while (collected.length < 15 && guard < 20) {
                    const response = await getAllRetailPendingProductionsAllBranches(userId, rawOffset);
                    const allOrders = extractProductionOrders(response);
                    total = response?.data?.total_count ?? response?.data?.total_orders_count ?? response?.data?.count ?? total;
                    collected = collected.concat(toFilteredOrders(allOrders));
                    rawOffset += allOrders.length;
                    guard += 1;
                    if (allOrders.length === 0 || (total != null && rawOffset >= total)) break;
                }

                const sorted = collected.sort((a, b) => {
                    const timeA = new Date(a?.created_at || 0).getTime();
                    const timeB = new Date(b?.created_at || 0).getTime();
                    if (timeB !== timeA) return timeB - timeA;
                    const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                    const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                    return numB - numA;
                });

                setProductions(sorted.slice(0, 15));
                setTotalPendingProductionsCount(total);
                setPendingProductionsOffset(rawOffset);
                setPendingProductionsHasMore(total != null && total > 0 && rawOffset < total);
            } else {
                const branchId = getBranchIdForFetch();
                const response = await getAllRetailPendingProductions(userId, branchId, offset);
                const allOrders = extractProductionOrders(response);
                const count = response?.data?.count ?? allOrders.length;
                const filteredOrders = toFilteredOrders(allOrders);

                const ordersToSort = append ? [...productions, ...filteredOrders] : filteredOrders;
                const sorted = ordersToSort.sort((a, b) => {
                    const timeA = new Date(a?.created_at || 0).getTime();
                    const timeB = new Date(b?.created_at || 0).getTime();
                    if (timeB !== timeA) return timeB - timeA;
                    const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                    const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                    return numB - numA;
                });

                setProductions(sorted);
                const newOffset = offset + count;
                setPendingProductionsOffset(newOffset);
                setPendingProductionsHasMore(count >= 15);
            }
            return true;
        } catch (error) {
            console.error("Error fetching pending productions: ", error);
            if (!append) {
                setProductions([]);
                setTotalPendingProductionsCount(null);
                setPendingProductionsHasMore(false);
            }
            return false;
        } finally {
            setIsLoadingSend(false);
            setPendingProductionsLoadingMore(false);
            setLoadingProductionsPage(false);
        }
    };

    const handleLoadMorePendingProductions = () => {
        if (!pendingProductionsHasMore || pendingProductionsLoadingMore) return;
        fetchAllPendingProductions(pendingProductionsOffset, true);
    };

    const SEARCH_PAGE_SIZE = 15;
    const fetchTransferNoteSearchOrders = async (append = false) => {
        const q = searchQuery.trim();
        if (!q) return;
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        try {
            if (append) setTransferNoteSearchLoadingMore(true);
            else setIsSearchingTransferNote(true);
            const offset = append ? transferNoteSearchOffset : 0;
            const searchBranchId = (!branchFilter || String(branchFilter).trim() === "") ? -1 : Number(branchFilter);
            const response = await searchOrderById(userId, q, offset, searchBranchId, 50, "Order Entry");
            const raw = response?.data;
            // Support multiple response shapes so we always get the orders list
            let list = [];
            if (Array.isArray(raw?.orders)) list = raw.orders;
            else if (Array.isArray(raw?.data)) list = raw.data;
            else if (Array.isArray(raw?.results)) list = raw.results;
            else if (Array.isArray(raw)) list = raw;
            const count = raw?.count ?? list.length;
            // Show all orders returned by search API so user can search any order (not limited to table)
            // Only include orders that belong to Outlet Transfer Note (have at least one item not yet sent to production).
            // Exclude orders that are fully in Receive to Sorting (all items already sent to production).
            const normalizedOrders = list
                .map((order) => {
                    const items = order.items || [];
                    const hasSendField = items.some((item) => typeof item.is_send_to_production !== "undefined");
                    const filteredItems = hasSendField
                        ? items.filter((item) => Number(item.is_send_to_production) === 0)
                        : items;
                    return { ...order, items: filteredItems };
                })
                .filter((order) => order.items.length > 0 && order.status !== "Deactive");
            if (append) {
                setTransferNoteSearchResults((prev) => {
                    const seen = new Set(prev.map((o) => String(o.order_id ?? o.id ?? "")));
                    const merged = [...prev];
                    for (const o of normalizedOrders) {
                        const id = String(o.order_id ?? o.id ?? "");
                        if (id && !seen.has(id)) {
                            seen.add(id);
                            merged.push(o);
                        }
                    }
                    return merged;
                });
                setTransferNoteSearchOffset(offset + count);
                setTransferNoteSearchHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            } else {
                setTransferNoteSearchResults(normalizedOrders);
                setTransferNoteSearchOffset(count);
                setTransferNoteSearchHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            }
        } catch (err) {
            console.error("Error searching transfer note orders:", err);
            if (!append) setTransferNoteSearchResults([]);
        } finally {
            setIsSearchingTransferNote(false);
            setTransferNoteSearchLoadingMore(false);
        }
    };

    const handleLoadMoreTransferNoteSearch = () => {
        if (!transferNoteSearchHasMore || transferNoteSearchLoadingMore) return;
        fetchTransferNoteSearchOrders(true);
    };

    const fetchReceiveSearchOrders = async (append = false) => {
        const q = searchQuery.trim();
        if (!q) return;
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        try {
            if (append) setReceiveSearchLoadingMore(true);
            else setIsSearchingReceive(true);
            const offset = append ? receiveSearchOffset : 0;
            const searchBranchId = (!branchFilter || String(branchFilter).trim() === "") ? -1 : Number(branchFilter);
            const response = await searchOrderById(userId, q, offset, searchBranchId, 50, "Receive to Sorting");
            const raw = response?.data;
            let list = [];
            if (Array.isArray(raw?.orders)) list = raw.orders;
            else if (Array.isArray(raw?.data)) list = raw.data;
            else if (Array.isArray(raw?.results)) list = raw.results;
            else if (Array.isArray(raw)) list = raw;
            const count = raw?.count ?? list.length;
            // Only include orders that belong to Receive to Sorting (have at least one item: sent to production, not yet received).
            // Exclude orders that are only in Outlet Transfer Note (no items sent to production yet).
            const normalizedOrders = list
                .map((order) => {
                    const items = order.items || [];
                    const hasReceiveFields = items.some((item) => typeof item.is_send_to_production !== "undefined" || typeof item.is_recived_to_production !== "undefined");
                    const filteredItems = hasReceiveFields
                        ? items.filter((item) => Number(item.is_send_to_production) === 1 && Number(item.is_recived_to_production) === 0)
                        : items;
                    return { ...order, items: filteredItems };
                })
                .filter((order) => order.items.length > 0 && order.status !== "Deactive");
            if (append) {
                setReceiveSearchResults((prev) => {
                    const seen = new Set(prev.map((o) => String(o.order_id ?? o.id ?? "")));
                    const merged = [...prev];
                    for (const o of normalizedOrders) {
                        const id = String(o.order_id ?? o.id ?? "");
                        if (id && !seen.has(id)) {
                            seen.add(id);
                            merged.push(o);
                        }
                    }
                    return merged;
                });
                setReceiveSearchOffset(offset + count);
                setReceiveSearchHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            } else {
                setReceiveSearchResults(normalizedOrders);
                setReceiveSearchOffset(count);
                setReceiveSearchHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            }
        } catch (err) {
            console.error("Error searching receive orders:", err);
            if (!append) setReceiveSearchResults([]);
        } finally {
            setIsSearchingReceive(false);
            setReceiveSearchLoadingMore(false);
        }
    };

    const handleLoadMoreReceiveSearch = () => {
        if (!receiveSearchHasMore || receiveSearchLoadingMore) return;
        fetchReceiveSearchOrders(true);
    };

    const fetchWorkInProgressSearchOrders = async (append = false) => {
        const q = searchQuery.trim();
        if (!q) return;
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        try {
            if (append) setWorkInProgressSearchLoadingMore(true);
            else setIsSearchingWorkInProgress(true);
            const offset = append ? workInProgressSearchOffset : 0;
            const searchBranchId = (!branchFilter || String(branchFilter).trim() === "") ? -1 : Number(branchFilter);
            const response = await searchOrderById(userId, q, offset, searchBranchId, 50, "Outlet Dispatch Note");
            const raw = response?.data;
            let list = [];
            if (Array.isArray(raw?.orders)) list = raw.orders;
            else if (Array.isArray(raw?.data)) list = raw.data;
            else if (Array.isArray(raw?.results)) list = raw.results;
            else if (Array.isArray(raw)) list = raw;
            const count = raw?.count ?? list.length;
            // Only include orders that belong to Work in Progress (received to production, not yet sent back to outlet).
            const normalizedOrders = list
                .map((order) => {
                    const items = order.items || [];
                    const hasWipFields = items.some((item) => typeof item.is_recived_to_production !== "undefined" || typeof item.is_send_to_back_to_outlet !== "undefined");
                    const filteredItems = hasWipFields
                        ? items.filter((item) => Number(item.is_send_to_production) === 1 && Number(item.is_recived_to_production) === 1 && Number(item.is_send_to_back_to_outlet) === 0)
                        : items;
                    return { ...order, items: filteredItems };
                })
                .filter((order) => order.items.length > 0 && order.status !== "Deactive");
            if (append) {
                setWorkInProgressSearchResults((prev) => {
                    const seen = new Set(prev.map((o) => String(o.order_id ?? o.id ?? "")));
                    const merged = [...prev];
                    for (const o of normalizedOrders) {
                        const id = String(o.order_id ?? o.id ?? "");
                        if (id && !seen.has(id)) {
                            seen.add(id);
                            merged.push(o);
                        }
                    }
                    return merged;
                });
                setWorkInProgressSearchOffset(offset + count);
                setWorkInProgressSearchHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            } else {
                setWorkInProgressSearchResults(normalizedOrders);
                setWorkInProgressSearchOffset(count);
                setWorkInProgressSearchHasMore(count >= SEARCH_PAGE_SIZE && list.length > 0);
            }
        } catch (err) {
            console.error("Error searching work in progress orders:", err);
            if (!append) setWorkInProgressSearchResults([]);
        } finally {
            setIsSearchingWorkInProgress(false);
            setWorkInProgressSearchLoadingMore(false);
        }
    };

    const handleLoadMoreWorkInProgressSearch = () => {
        if (!workInProgressSearchHasMore || workInProgressSearchLoadingMore) return;
        fetchWorkInProgressSearchOrders(true);
    };

    const fetchAllPendingProductionsToRecieve = async (offset = 0, append = false) => {
        try {
            if (append) {
                setPendingProductionsReceivedLoadingMore(true);
            } else {
                setIsLoadingReceive(true);
            }
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            let response;
            let allOrders = [];
            let count = 0;

            const isAllBranchesReceive = !branchFilter || String(branchFilter).trim() === "";
            if (isAllBranchesReceive) {
                response = await getAllRetailPendingProductionsReceivedAllBranches(userId, offset);
            } else {
                const branchId = getBranchIdForFetch();
                response = await getAllRetailPendingProductionsReceived(userId, branchId, offset);
            }

            console.log("aaaaaaaaaaaa: Response:", response);

            // Extract orders and count from response
            if (response?.data) {
                if (Array.isArray(response.data.pending_back_to_outlet_production)) {
                    allOrders = response.data.pending_back_to_outlet_production;
                    count = response.data.count ?? allOrders.length;
                } else if (Array.isArray(response.data)) {
                    allOrders = response.data;
                    count = allOrders.length;
                } else {
                    allOrders = response.data.pending_back_to_outlet_production ?? [];
                    count = response.data.count ?? allOrders.length;
                }
            }

            // Filter active orders
            const filtered = allOrders.filter((order) => order.status === "Active");
            const filteredOrders = filtered.map((order) => ({
                ...order,
                items: order.items?.filter((item) => item.is_send_to_production === 1 && item.is_recived_to_production === 0) ?? [],
            }));

            // If appending, add to existing orders; otherwise replace
            const ordersToSort = append ? [...receiveProductions, ...filteredOrders] : filteredOrders;

            const sorted = ordersToSort.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });

            setReceiveProductions(sorted);

            // Update offset and hasMore - set to false when we got fewer than 15 orders (reached the end)
            const newOffset = offset + count;
            setPendingProductionsReceivedOffset(newOffset);
            setPendingProductionsReceivedHasMore(count >= 15);
            return true;
        } catch (error) {
            console.error("Error fetching receive productions: ", error);
            if (!append) {
                setReceiveProductions([]);
            }
            return false;
        } finally {
            setIsLoadingReceive(false);
            setPendingProductionsReceivedLoadingMore(false);
        }
    };

    const handleLoadMorePendingProductionsReceived = () => {
        if (!pendingProductionsReceivedHasMore || pendingProductionsReceivedLoadingMore) return;
        fetchAllPendingProductionsToRecieve(pendingProductionsReceivedOffset, true);
    };

    const fetchAllBackToOutletOrders = async (offset = 0, append = false) => {
        try {
            if (append) {
                setBackToOutletLoadingMore(true);
            } else {
                setIsLoadingAlreadyReceived(true);
            }
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            let response;
            let allOrders = [];
            let count = 0;

            const isAllBranchesBackToOutlet = !branchFilter || String(branchFilter).trim() === "";
            if (isAllBranchesBackToOutlet) {
                response = await getAllRetailBackToOutletOrdersAllBranches(userId, offset);
            } else {
                const branchId = getBranchIdForFetch();
                response = await getAllRetailBackToOutletOrders(userId, branchId, offset);
            }

            // Extract orders and count from response
            if (response?.data) {
                if (Array.isArray(response.data.pending_back_to_outlet_production)) {
                    allOrders = response.data.pending_back_to_outlet_production;
                    count = response.data.count ?? allOrders.length;
                } else if (Array.isArray(response.data)) {
                    allOrders = response.data;
                    count = allOrders.length;
                } else {
                    allOrders = response.data.pending_back_to_outlet_production ?? [];
                    count = response.data.count ?? allOrders.length;
                }
            }

            // Filter active orders
            const filtered = allOrders.filter((order) => order.status === "Active");
            const filteredOrders = filtered.map((order) => ({
                ...order,
                items: order.items?.filter((item) => item.is_recived_to_production === 1 && item.is_send_to_back_to_outlet === 0) ?? [],
            }));

            // If appending, add to existing orders; otherwise replace
            const ordersToSort = append ? [...backToOutlets, ...filteredOrders] : filteredOrders;

            const sorted = ordersToSort.sort((a, b) => {
                const timeA = new Date(a?.created_at || 0).getTime();
                const timeB = new Date(b?.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                const numA = parseInt(String(a?.order_id || "").replace("ORDER", ""), 10) || 0;
                const numB = parseInt(String(b?.order_id || "").replace("ORDER", ""), 10) || 0;
                return numB - numA;
            });

            setBackToOutlets(sorted);

            // Update offset and hasMore - set to false when we got fewer than 15 orders (reached the end)
            const newOffset = offset + count;
            setBackToOutletOffset(newOffset);
            setBackToOutletHasMore(count >= 15);
            return true;
        } catch (error) {
            console.error("Error fetching back to outlet orders: ", error);
            if (!append) {
                setBackToOutlets([]);
            }
            return false;
        } finally {
            setIsLoadingAlreadyReceived(false);
            setBackToOutletLoadingMore(false);
        }
    };

    const handleLoadMoreBackToOutlet = () => {
        if (!backToOutletHasMore || backToOutletLoadingMore) return;
        fetchAllBackToOutletOrders(backToOutletOffset, true);
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

    const fetchAllSettings = async () => {
        try {
            const response = await getAllSettings(localStorage.getItem("userId"));
            setSettings(response.data.settings[0]);
        } catch (error) {
            console.error("Error fetching settings: ", error);
        }
    };

    const handleBranchFilterChange = (e) => {
        setBranchFilter(e.target.value);
    };

    // Fetch branches for branch filter dropdown (same source as Order Entry / Service Order)
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
        fetchTotalOrders();
        fetchReadyForPickupOrders();
        fetchReleaseTodayOrders();
        fetchExpressOrders();
        fetchAllSettings();
        fetchAllBranches();
    }, []);

    const getTabScopeKey = (tab) => {
        const branchScope = !branchFilter || String(branchFilter).trim() === "" ? "all" : `branch:${branchFilter}`;
        const waitingForBranches = isSuperadmin && (!branchFilter || String(branchFilter).trim() === "") && branches.length === 0;
        return `${branchScope}|${waitingForBranches ? "branches-loading" : "branches-ready"}|tab:${tab}`;
    };

    const loadActiveTabData = async () => {
        const scopeKey = getTabScopeKey(selectedTab);
        const branchReady = !(isSuperadmin && (!branchFilter || String(branchFilter).trim() === "") && branches.length === 0);

        if (!branchReady) return;
        if (tabDataScopeRef.current[selectedTab] === scopeKey) return;

        let loaded = false;
        if (selectedTab === 1) {
            loaded = await fetchAllPendingProductions(0, false);
        } else if (selectedTab === 2) {
            loaded = await fetchAllPendingProductionsToRecieve(0, false);
        } else if (selectedTab === 3) {
            loaded = await fetchAllBackToOutletOrders(0, false);
        }

        if (loaded) {
            tabDataScopeRef.current[selectedTab] = scopeKey;
        }
    };

    // Reset transfer note data when the branch filter changes, then load only the active tab.
    useEffect(() => {
        // Reset pagination when branch filter changes
        setPendingProductionsOffset(0);
        setPendingProductionsHasMore(false);
        setPendingProductionsLoadingMore(false);
        setPendingProductionsReceivedOffset(0);
        setPendingProductionsReceivedHasMore(false);
        setPendingProductionsReceivedLoadingMore(false);
        setBackToOutletOffset(0);
        setBackToOutletHasMore(false);
        setBackToOutletLoadingMore(false);
        setTotalPendingProductionsCount(null);
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        lastProductionsAllBranchesFetchRef.current = { page: 1, branch: branchFilter };
        fetchedMoreOnPage3Ref.current = false;
        tabDataScopeRef.current = { 1: null, 2: null, 3: null };
        setProductions([]);
        setReceiveProductions([]);
        setBackToOutlets([]);
        setTransferNoteSearchResults([]);
        setReceiveSearchResults([]);
        setWorkInProgressSearchResults([]);
        setSubmittedSearchQuery("");
        setSearchQuery("");
    }, [branchFilter]);

    // Load the active tab once the branch list is ready for SuperAdmin "All Branches" mode.
    useEffect(() => {
        loadActiveTabData();
    }, [selectedTab, branchFilter, branches.length]);

    useEffect(() => {
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
    }, [searchQuery]);

    const handleDeliveryTypeFilterChange = (e) => {
        setDeliveryTypeFilter(e.target.value);
    };

    // effectiveTab is just selectedTab (no more role-based overrides)
    const effectiveTab = selectedTab;

    useEffect(() => {
        setCurrentPage(1);
        lastStableTotalPagesRef.current = 1;
        lastStableWindowRef.current = { start: 1, end: 5 };
        fetchedMoreOnPage3Ref.current = false;
    }, [effectiveTab]);

    // Clear submitted search when switching tabs
    useEffect(() => {
        setSubmittedSearchQuery("");
        setTransferNoteSearchResults([]);
        setReceiveSearchResults([]);
        setWorkInProgressSearchResults([]);
        setTransferNoteSearchOffset(0);
        setTransferNoteSearchHasMore(false);
        setReceiveSearchOffset(0);
        setReceiveSearchHasMore(false);
        setWorkInProgressSearchOffset(0);
        setWorkInProgressSearchHasMore(false);
    }, [effectiveTab]);

    //filtering
    const filteredOrders = effectiveTab === 1
        ? productions.filter((order) => {
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
                ? matchesQuery(order.order_id)
                : true;

            const matchesStatusFilter = deliveryTypeFilter
                ? order.delivery_type === deliveryTypeFilter
                : true;

            // Outlet Transfer Note (tab 1): use branch filter when SuperAdmin/WIP so selecting Panadura shows Panadura's orders
            const matchesBranchFilter = (() => {
                const raw = branchFilter;
                const storedId = raw != null && String(raw).trim() !== "" ? String(raw).trim() : null;
                if (!storedId) return true;

                const targetBranch = branches.find(b => String(b.value) === String(storedId));
                const targetName = targetBranch ? targetBranch.label : "";
                const outletName = String(order.delivery_outlet || "").toLowerCase().trim();
                if (targetName && outletName && outletName === targetName.toLowerCase().trim()) return true;
                if (String(order.delivery_outlet_id) === String(storedId) || String(order.branch_id) === String(storedId)) return true;
                return false;
            })();

            const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);

            return matchesSearch && matchesStatusFilter && matchesBranchFilter && matchesTodayFilter;
        })
        : effectiveTab === 2
            ? receiveProductions.filter((order) => {
                const matchesQuery = (field) => {
                    if (!submittedSearchQuery || (field !== 0 && field !== "0" && !field)) return false;

                    const fieldStr = String(field ?? "").toLowerCase().trim();
                    const searchWords = submittedSearchQuery
                        .toLowerCase()
                        .trim()
                        .split(/\s*\*\s*/)
                        .map((w) => w.trim())
                        .filter((w) => w.length > 0);

                    if (searchWords.length === 0) return true;
                    return searchWords.every((word) => fieldStr.includes(word));
                };
                const orderIdRaw = order.order_id ?? order.id ?? order.order_number ?? "";
                const matchesSearch = submittedSearchQuery.trim()
                    ? matchesQuery(orderIdRaw)
                    : true;

                const matchesStatusFilter = deliveryTypeFilter
                    ? order.delivery_type === deliveryTypeFilter
                    : true;

                // Receive to Sorting (tab 2): filter by delivery_outlet, fallback to ids
                const matchesBranchFilterSuperAdmin = !branchFilter || String(branchFilter).trim() === "" ? true : (() => {
                    const storedId = String(branchFilter);
                    const targetBranch = branches.find(b => String(b.value) === storedId);
                    const targetName = targetBranch ? targetBranch.label : "";
                    const outletName = String(order.delivery_outlet || "").toLowerCase().trim();
                    if (targetName && outletName && outletName === targetName.toLowerCase().trim()) return true;
                    if (String(order.delivery_outlet_id) === storedId || String(order.branch_id) === storedId) return true;
                    return false;
                })();

                const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);

                return matchesSearch && matchesStatusFilter && matchesBranchFilterSuperAdmin && matchesTodayFilter;
            })
            : backToOutlets.filter((order) => {
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
                    ? matchesQuery(order.order_id)
                    : true;

                const matchesStatusFilter = deliveryTypeFilter
                    ? order.delivery_type === deliveryTypeFilter
                    : true;

                // Work in Progress (tab 3): filter by delivery_outlet, fallback to ids
                const matchesBranchFilterSuperAdmin = !branchFilter || String(branchFilter).trim() === "" ? true : (() => {
                    const storedId = String(branchFilter);
                    const targetBranch = branches.find(b => String(b.value) === storedId);
                    const targetName = targetBranch ? targetBranch.label : "";
                    const outletName = String(order.delivery_outlet || "").toLowerCase().trim();
                    if (targetName && outletName && outletName === targetName.toLowerCase().trim()) return true;
                    if (String(order.delivery_outlet_id) === storedId || String(order.branch_id) === storedId) return true;
                    return false;
                })();

                const matchesTodayFilter = !isTodaySelected || isDateWithinRange(order.created_at, startDate, endDate);

                return matchesSearch && matchesStatusFilter && matchesBranchFilterSuperAdmin && matchesTodayFilter;
            });

    const isTransferNoteSearchMode = effectiveTab === 1 && submittedSearchQuery.trim().length > 0;
    const isReceiveSearchMode = effectiveTab === 2 && submittedSearchQuery.trim().length > 0;
    const isWorkInProgressSearchMode = effectiveTab === 3 && submittedSearchQuery.trim().length > 0;
    const getTodayFilter = (order) => {
        if (!isTodaySelected) return true;
        return isDateWithinRange(order.created_at, startDate, endDate);
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
    const toOrderId = (o) => String(o?.order_id ?? o?.id ?? o?.order_number ?? "");
    const mergeAndFilterSearch = (fromApi, fromLoaded, applyFilters) => {
        // Put already-loaded orders that match the search FIRST so the user sees the order they had on screen (e.g. after clicking More Orders)
        const seen = new Set(fromLoaded.map((o) => toOrderId(o)));
        const merged = [...fromLoaded];
        for (const o of fromApi) {
            const id = toOrderId(o);
            if (id && !seen.has(id)) {
                seen.add(id);
                merged.push(o);
            }
        }
        const filtered = merged.filter(applyFilters);
        const q = submittedSearchQuery.trim().toLowerCase();
        if (!q) return filtered;
        const searchStr = q.replace(/\s*\*\s*/g, " ").trim();
        filtered.sort((a, b) => {
            const idA = toOrderId(a);
            const idB = toOrderId(b);
            const exactA = idA === searchStr || idA.endsWith(searchStr) || idA === String(Number(searchStr) || searchStr);
            const exactB = idB === searchStr || idB.endsWith(searchStr) || idB === String(Number(searchStr) || searchStr);
            if (exactA && !exactB) return -1;
            if (!exactA && exactB) return 1;
            return 0;
        });
        return filtered;
    };
    // Order belongs to Outlet Transfer Note only if it has at least one item: is_send_to_production === 0 (not yet sent to production)
    const belongsToOutletTransferNote = (order) => {
        if (!order || !Array.isArray(order.items) || order.items.length === 0) return false;
        return order.items.some((item) => Number(item.is_send_to_production) === 0);
    };

    const belongsToReceiveToSorting = (order) => {
        if (!order || !Array.isArray(order.items) || order.items.length === 0) return false;
        return order.items.some(
            (item) => Number(item.is_send_to_production) === 1 && Number(item.is_recived_to_production) === 0
        );
    };

    // When searching: show API results directly. When not searching: show table-filtered results.
    const ordersForTable = isTransferNoteSearchMode
        ? transferNoteSearchResults
        : isReceiveSearchMode
            ? receiveSearchResults
            : isWorkInProgressSearchMode
                ? workInProgressSearchResults
                : filteredOrders;

    const isSearchMode = isTransferNoteSearchMode || isReceiveSearchMode || isWorkInProgressSearchMode;
    const isAllBranchesProductions = !branchFilter || String(branchFilter).trim() === "";

    //pagination (15 rows per page when All Branches, same as invoice)
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const totalPages = (() => {
        if (effectiveTab === 1 && !isSearchMode && isAllBranchesProductions && totalPendingProductionsCount != null && totalPendingProductionsCount > 0) {
            if (totalPendingProductionsCount <= 15) return 1;
            return Math.max(1, Math.ceil(totalPendingProductionsCount / itemsPerPage));
        }
        return ordersForTable.length === 0 ? 0 : Math.max(1, Math.ceil(ordersForTable.length / itemsPerPage));
    })();
    const safePage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
    const indexOfLastItem = safePage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentOrders = (effectiveTab === 1 && !isSearchMode && isAllBranchesProductions)
        ? ordersForTable
        : ordersForTable.slice(indexOfFirstItem, indexOfLastItem);
    const blankRows = itemsPerPage - currentOrders.length;

    // Outlet Transfer Note (Tab 1), All Branches: use get-all-pending-productions-all-branches — first time offset 0, page 2 offset 15 (same as invoice)
    useEffect(() => {
        if (effectiveTab !== 1 || isSearchMode || !isAllBranchesProductions) return;
        const prev = lastProductionsAllBranchesFetchRef.current;
        if (prev.page === currentPage && prev.branch === branchFilter) return;
        lastProductionsAllBranchesFetchRef.current = { page: currentPage, branch: branchFilter };
        const pageOffset = (currentPage - 1) * itemsPerPage;
        fetchAllPendingProductions(pageOffset, false);
    }, [effectiveTab, currentPage, isSearchMode, branchFilter, isAllBranchesProductions, itemsPerPage]);

    // Outlet Transfer Note (Tab 1), specific branch: when user goes to a page that needs more data, load more orders automatically
    useEffect(() => {
        if (effectiveTab !== 1 || isSearchMode || isAllBranchesProductions) return;
        const needed = currentPage * itemsPerPage;
        if (ordersForTable.length >= needed) return;
        if (!pendingProductionsHasMore || pendingProductionsLoadingMore) return;
        fetchAllPendingProductions(pendingProductionsOffset, true);
    }, [effectiveTab, currentPage, isSearchMode, isAllBranchesProductions, ordersForTable.length, pendingProductionsHasMore, pendingProductionsLoadingMore, pendingProductionsOffset, itemsPerPage]);

    // Receive to Sorting (Tab 2): when user goes to a page that needs more data, load more orders automatically
    useEffect(() => {
        if (effectiveTab !== 2 || isSearchMode) return;
        const needed = currentPage * itemsPerPage;
        if (ordersForTable.length >= needed) return;
        if (!pendingProductionsReceivedHasMore || pendingProductionsReceivedLoadingMore) return;
        fetchAllPendingProductionsToRecieve(pendingProductionsReceivedOffset, true);
    }, [effectiveTab, currentPage, isSearchMode, ordersForTable.length, pendingProductionsReceivedHasMore, pendingProductionsReceivedLoadingMore, pendingProductionsReceivedOffset, itemsPerPage]);

    // Work in Progress (Tab 3): when user goes to a page that needs more data, load more orders automatically
    useEffect(() => {
        if (effectiveTab !== 3 || isSearchMode) return;
        const needed = currentPage * itemsPerPage;
        if (ordersForTable.length >= needed) return;
        if (!backToOutletHasMore || backToOutletLoadingMore) return;
        fetchAllBackToOutletOrders(backToOutletOffset, true);
    }, [effectiveTab, currentPage, isSearchMode, ordersForTable.length, backToOutletHasMore, backToOutletLoadingMore, backToOutletOffset, itemsPerPage]);

    // When on page 3 (Tab 1, Tab 2, or Tab 3), fetch 15 more orders in the background if there are more (specific branch only; All Branches fetches by page)
    useEffect(() => {
        if (isSearchMode || currentPage !== 3) {
            fetchedMoreOnPage3Ref.current = false;
            return;
        }
        if (effectiveTab === 1) {
            if (isAllBranchesProductions) return;
            if (!pendingProductionsHasMore || pendingProductionsLoadingMore || fetchedMoreOnPage3Ref.current) return;
            fetchedMoreOnPage3Ref.current = true;
            fetchAllPendingProductions(pendingProductionsOffset, true);
        } else if (effectiveTab === 2) {
            if (!pendingProductionsReceivedHasMore || pendingProductionsReceivedLoadingMore || fetchedMoreOnPage3Ref.current) return;
            fetchedMoreOnPage3Ref.current = true;
            fetchAllPendingProductionsToRecieve(pendingProductionsReceivedOffset, true);
        } else if (effectiveTab === 3) {
            if (!backToOutletHasMore || backToOutletLoadingMore || fetchedMoreOnPage3Ref.current) return;
            fetchedMoreOnPage3Ref.current = true;
            fetchAllBackToOutletOrders(backToOutletOffset, true);
        }
    }, [effectiveTab, currentPage, isSearchMode, pendingProductionsHasMore, pendingProductionsLoadingMore, pendingProductionsOffset, pendingProductionsReceivedHasMore, pendingProductionsReceivedLoadingMore, pendingProductionsReceivedOffset, backToOutletHasMore, backToOutletLoadingMore, backToOutletOffset]);

    // When on the last page (Tab 1, Tab 2, or Tab 3), fetch next batch so more pages can appear (specific branch only)
    useEffect(() => {
        if (isSearchMode || totalPages === 0) return;
        if (currentPage !== totalPages) return;

        if (effectiveTab === 1) {
            if (isAllBranchesProductions) return;
            if (!pendingProductionsHasMore || pendingProductionsLoadingMore) return;
            fetchAllPendingProductions(pendingProductionsOffset, true);
        } else if (effectiveTab === 2) {
            if (!pendingProductionsReceivedHasMore || pendingProductionsReceivedLoadingMore) return;
            fetchAllPendingProductionsToRecieve(pendingProductionsReceivedOffset, true);
        } else if (effectiveTab === 3) {
            if (!backToOutletHasMore || backToOutletLoadingMore) return;
            fetchAllBackToOutletOrders(backToOutletOffset, true);
        }
    }, [effectiveTab, currentPage, totalPages, isSearchMode, pendingProductionsHasMore, pendingProductionsLoadingMore, pendingProductionsOffset, pendingProductionsReceivedHasMore, pendingProductionsReceivedLoadingMore, pendingProductionsReceivedOffset, backToOutletHasMore, backToOutletLoadingMore, backToOutletOffset]);

    // When clicking a page: set page; useEffect will fetch more until filtered list has enough
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handlePrint = useReactToPrint({
        contentRef: transferNoteRef,
        onAfterPrint: () => {
            setShowPrintDialog(false);
            setOrdersToPrint([]);
        },
    });

    const handleSendToProduction = async (order) => {
        if (!hasSalesRetailOutletTransferNoteSendAction(permissions, permissionTokens)) return;
        try {
            setIsLoadingSubmit(true);
            const itemIds = order.items.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: order.order_id,
                service_items: itemIds
            };
            const response = await sendToProductionOrder(payload);
            setShowConfirmationDialog(false);

            // Show print dialog after successful send
            setOrdersToPrint([order]);
            setShowPrintDialog(true);

            // Reflect the change immediately in search results if active
            setTransferNoteSearchResults(prev => prev.filter(o => o.order_id !== order.order_id));
            setReceiveSearchResults(prev => prev.filter(o => o.order_id !== order.order_id));

            tabDataScopeRef.current = { 1: null, 2: null, 3: null };
            loadActiveTabData();
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleReceiveToProduction = async (order) => {
        if (!canReceiveToSorting) return;
        try {
            setIsLoadingSubmit(true);
            const itemIds = order.items.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: order.order_id,
                service_items: itemIds
            };
            const response = await receiveToProductionOrder(payload);
            setShowReceiveConfirmationDialog(false);
            
            // Reflect the change immediately in search results if active
            setTransferNoteSearchResults(prev => prev.filter(o => o.order_id !== order.order_id));
            setReceiveSearchResults(prev => prev.filter(o => o.order_id !== order.order_id));
            tabDataScopeRef.current = { 1: null, 2: null, 3: null };
            loadActiveTabData();
        } catch (error) {
            console.error("Error receiving to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleAddToSelectedSend = (id) => {
        setSelectedForSend(prev => {
            if (prev.includes(id)) {
                // remove it if already in array
                return prev.filter(item => item !== id);
            } else {
                // add it if not in array
                return [...prev, id];
            }
        });
    };

    const handleAddToSelectedReceive = (id) => {
        setSelectedForReceive(prev => {
            if (prev.includes(id)) {
                // remove it if already in array
                return prev.filter(item => item !== id);
            } else {
                // add it if not in array
                return [...prev, id];
            }
        });
    };

    const handleSendBulkToProduction = async () => {
        if (!hasSalesRetailOutletTransferNoteSendAction(permissions, permissionTokens)) return;
        try {
            setIsLoadingSubmit(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_ids: selectedForSend,
                branch_id: Number(localStorage.getItem("selectedBranchId")) || 1
            };

            const response = await sendBulkToProductionOrder(payload);
            setShowSendBulkConfirmationDialog(false);

            // Get the selected orders for printing
            const selectedOrders = productions.filter(order => selectedForSend.includes(order.order_id));
            setOrdersToPrint(selectedOrders);
            setShowPrintDialog(true);

            // Reflect the change immediately in search results if active
            setTransferNoteSearchResults(prev => prev.filter(o => !selectedForSend.includes(o.order_id)));
            setReceiveSearchResults(prev => prev.filter(o => !selectedForSend.includes(o.order_id)));

            setSelectedForSend([]);
            setSelectMultipleSend(false);
            tabDataScopeRef.current = { 1: null, 2: null, 3: null };
            loadActiveTabData();
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleReceiveBulkToProduction = async () => {
        if (!canReceiveToSorting) return;
        try {
            setIsLoadingSubmit(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_ids: selectedForReceive,
                branch_id: Number(localStorage.getItem("selectedBranchId")) || 1
            };

            const response = await receiveBulkToProductionOrder(payload);
            setShowReceiveBulkConfirmationDialog(false);
            
            // Reflect the change immediately in search results if active
            setTransferNoteSearchResults(prev => prev.filter(o => !selectedForReceive.includes(o.order_id)));
            setReceiveSearchResults(prev => prev.filter(o => !selectedForReceive.includes(o.order_id)));

            setSelectedForReceive([]);
            setSelectMultipleReceive(false);
            tabDataScopeRef.current = { 1: null, 2: null, 3: null };
            loadActiveTabData();
        } catch (error) {
            console.error("Error receiving to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    if (!canAccessPage) {
        return <PermissionDenied label="Transfer Note Management" />;
    }

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Transfer Note Management</h1>
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
                {tnTabs.outlet ? (
                    <h2 className={`${(selectMultipleSend || selectMultipleReceive) ? "text-black/50" : "hover:border-b-3 cursor-pointer"} border-black px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => { !(selectMultipleSend || selectMultipleReceive) ? setSelectedTab(1) : null }}>Outlet Transfer Note</h2>
                ) : null}
                {tnTabs.receive && (
                    <h2 className={`${(selectMultipleSend || selectMultipleReceive) ? "text-black/50" : "hover:border-b-3 cursor-pointer"} border-black px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => { !(selectMultipleSend || selectMultipleReceive) ? setSelectedTab(2) : null }}>Receive to Sorting</h2>
                )}
                {tnTabs.wip && (
                    <h2 className={`${(selectMultipleSend || selectMultipleReceive) ? "text-black/50" : "hover:border-b-3 cursor-pointer"} border-black px-1 ${selectedTab === 3 ? 'border-b-3 font-semibold' : ''}`} onClick={() => { !(selectMultipleSend || selectMultipleReceive) ? setSelectedTab(3) : null }}>Work in Progress</h2>
                )}
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
                            if (!value.trim()) {
                                setSubmittedSearchQuery("");
                                setTransferNoteSearchResults([]);
                                setReceiveSearchResults([]);
                                setWorkInProgressSearchResults([]);
                                setTransferNoteSearchOffset(0);
                                setTransferNoteSearchHasMore(false);
                                setReceiveSearchOffset(0);
                                setReceiveSearchHasMore(false);
                                setWorkInProgressSearchOffset(0);
                                setWorkInProgressSearchHasMore(false);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const q = searchQuery.trim();
                            setSubmittedSearchQuery(q);
                            setCurrentPage(1);
                            lastStableTotalPagesRef.current = 1;
                            lastStableWindowRef.current = { start: 1, end: 5 };
                            fetchedMoreOnPage3Ref.current = false;
                            if (q) {
                                if (effectiveTab === 1) fetchTransferNoteSearchOrders(false);
                                else if (effectiveTab === 2) fetchReceiveSearchOrders(false);
                                else if (effectiveTab === 3) fetchWorkInProgressSearchOrders(false);
                            } else {
                                setTransferNoteSearchResults([]);
                                setReceiveSearchResults([]);
                                setWorkInProgressSearchResults([]);
                                setTransferNoteSearchOffset(0);
                                setTransferNoteSearchHasMore(false);
                                setReceiveSearchOffset(0);
                                setReceiveSearchHasMore(false);
                                setWorkInProgressSearchOffset(0);
                                setWorkInProgressSearchHasMore(false);
                            }
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
                        onChange={(e) => { if (!isBranchViewOnly) setBranchFilter(e.target.value); }}
                        placeholder="All Branches"
                        className="bg-transparent border-0 font-semibold text-primary focus:outline-none cursor-pointer appearance-none px-3"
                    />
                    <Icon icon="mdi:chevron-down" className="text-primary text-xl shrink-0" />
                </div>

                {!selectMultipleSend && !selectMultipleReceive && selectedTab !== 3 && (selectedTab === 1 ? canSendOutletTransferNote : canReceiveToSorting) &&
                    <button
                        className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 md:ms-auto"
                        onClick={() => {
                            selectedTab === 1
                                ? setSelectMultipleSend(true)
                                : setSelectMultipleReceive(true)
                        }}
                    >Select Multiple
                    </button>
                }

                {selectMultipleSend && canSendOutletTransferNote && selectedForSend.length < filteredOrders.length &&
                    <div className="flex flex-wrap gap-3 md:ms-auto items-center">
                        <p>Selected {selectedForSend.length} of {filteredOrders.length}</p>
                        <button
                            className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                            onClick={() => setSelectedForSend(filteredOrders.map(order => order.order_id))}
                        >Select All
                        </button>
                        <button
                            className={`${selectedForSend.length === 0 ? "bg-gray-500 cursor-not-allowed" : "bg-primary border-primary"} rounded-xl border font-semibold text-white px-3 py-1.5`}
                            onClick={() => setShowSendBulkConfirmationDialog(true)}
                            disabled={selectedForSend.length === 0}
                        >Send
                        </button>
                        <button
                            className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                            onClick={() => {
                                setSelectMultipleSend(false);
                                setSelectedForSend([]);
                            }}
                        >Cancel
                        </button>
                    </div>
                }

                {selectMultipleSend && canSendOutletTransferNote && selectedForSend.length === filteredOrders.length &&
                    <div className="flex flex-wrap gap-3 md:ms-auto items-center">
                        <p>Selected {selectedForSend.length} of {filteredOrders.length}</p>
                        <button
                            className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                            onClick={() => setSelectedForSend([])}
                        >Deselect All
                        </button>
                        <button
                            className="bg-primary rounded-xl border border-primary font-semibold text-white px-3 py-1.5"
                            onClick={() => setShowSendBulkConfirmationDialog(true)}
                        >Send
                        </button>
                        <button
                            className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                            onClick={() => {
                                setSelectMultipleSend(false);
                                setSelectedForSend([]);
                            }}
                        >Cancel
                        </button>
                    </div>
                }

                {selectMultipleReceive && canReceiveToSorting && selectedForReceive.length < filteredOrders.length &&
                    <div className="flex flex-wrap gap-3 md:ms-auto items-center">
                        <p>Selected {selectedForReceive.length} of {filteredOrders.length}</p>
                        <button
                            className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                            onClick={() => setSelectedForReceive(filteredOrders.map(order => order.order_id))}
                        >Select All
                        </button>
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
                                setSelectedForReceive([]);
                            }}
                        >Cancel
                        </button>
                    </div>
                }

                {selectMultipleReceive && canReceiveToSorting && selectedForReceive.length === filteredOrders.length &&
                    <div className="flex flex-wrap gap-3 md:ms-auto items-center">
                        <p>Selected {selectedForReceive.length} of {filteredOrders.length}</p>
                        <button
                            className="bg-white rounded-xl border border-primary font-semibold text-primary px-3 py-1.5"
                            onClick={() => setSelectedForReceive([])}
                        >Deselect All
                        </button>
                        <button
                            className="bg-primary rounded-xl border border-primary font-semibold text-white px-3 py-1.5"
                            onClick={() => setShowReceiveBulkConfirmationDialog(true)}
                        >Receive
                        </button>
                        <button
                            className="bg-white rounded-xl border border-red-500 font-semibold text-red-500 px-3 py-1.5"
                            onClick={() => {
                                setSelectMultipleReceive(false);
                                setSelectedForReceive([]);
                            }}
                        >Cancel
                        </button>
                    </div>
                }
            </div>

            {(isLoadingSend || isLoadingReceive || isLoadingAlreadyReceived) || (isTransferNoteSearchMode && isSearchingTransferNote) || (isReceiveSearchMode && isSearchingReceive) || (isWorkInProgressSearchMode && isSearchingWorkInProgress) ?
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="rounded-xl bg-white overflow-x-auto">
                    <div className="text-sm grid gap-x-5 divide-x divide-white/20 text-white bg-primary font-semibold py-2 px-3 min-w-[1300px] [&>*]:min-w-0 [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1" style={{ gridTemplateColumns: "1fr 2fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}>
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
                        <div
                            key={index}
                            className={`grid gap-x-5 divide-x divide-black/10 text-xs py-1.5 px-3 min-w-[1300px] whitespace-nowrap [&>*]:min-w-0 [&>*]:overflow-hidden [&>p]:text-ellipsis [&>p]:whitespace-nowrap [&>p]:text-center [&>p]:px-1 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center ${selectMultipleSend || selectMultipleReceive ? "cursor-pointer" : ""} ${selectedForSend.includes(order.order_id) || selectedForReceive.includes(order.order_id) ? "text-red-500" : ""}`}
                            style={{ gridTemplateColumns: "1fr 2fr 1.2fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}
                            onClick={() => {
                                if (selectMultipleSend && !canSendOutletTransferNote) return;
                                if (selectMultipleReceive && !canReceiveToSorting) return;
                                selectMultipleSend
                                    ? handleAddToSelectedSend(order.order_id)
                                    : selectMultipleReceive
                                        ? handleAddToSelectedReceive(order.order_id)
                                        : null
                            }}
                        >
                            <p className="!overflow-visible text-[10px] leading-tight">{order.order_id}</p>
                            <div className="min-w-0 overflow-hidden whitespace-normal break-normal leading-tight text-center px-1 text-[10px]">
                                {order.customer_name}
                            </div>
                            <p>{order.phone_number}</p>
                            <p>{order.delivery_type}</p>
                            <div className="flex flex-row flex-nowrap items-center justify-center whitespace-nowrap px-1">
                                {order.items.filter(o => o.service_type_id === 1 || o.service_type_name?.toLowerCase().includes("wash")).length > 0 ? (
                                    <div className="flex flex-row flex-nowrap items-center whitespace-nowrap">
                                        <p className="whitespace-nowrap">{calculateBagsByItemType(order.items.filter(o => o.service_type_id === 1 || o.service_type_name?.toLowerCase().includes("wash")))} Bag</p>
                                        <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500" />
                                    </div>
                                ) : (
                                    <div className="flex flex-row flex-nowrap items-center whitespace-nowrap">
                                        <p className="whitespace-nowrap">0 Bag</p>
                                        <Icon icon={"carbon:close-filled"} className="text-red-500" />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-row flex-nowrap items-center justify-center whitespace-nowrap px-1">
                                {order.items.filter(o => o.service_type_id === 2 || o.service_type_name?.toLowerCase().includes("press")).length > 0 ? (
                                    <div className="flex flex-row flex-nowrap items-center whitespace-nowrap">
                                        <p className="whitespace-nowrap">{calculateBagsByItemType(order.items.filter(o => o.service_type_id === 2 || o.service_type_name?.toLowerCase().includes("press")))} Bag</p>
                                        <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500" />
                                    </div>
                                ) : (
                                    <div className="flex flex-row flex-nowrap items-center whitespace-nowrap">
                                        <p className="whitespace-nowrap">0 Bag</p>
                                        <Icon icon={"carbon:close-filled"} className="text-red-500" />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-row flex-nowrap items-center justify-center whitespace-nowrap px-1">
                                {order.items.filter(o => o.service_type_id === 3 || o.service_type_name?.toLowerCase().includes("dry")).length > 0 ? (
                                    <div className="flex flex-row flex-nowrap items-center whitespace-nowrap">
                                        <p className="whitespace-nowrap">{calculateBagsByItemType(order.items.filter(o => o.service_type_id === 3 || o.service_type_name?.toLowerCase().includes("dry")))} Bag</p>
                                        <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500" />
                                    </div>
                                ) : (
                                    <div className="flex flex-row flex-nowrap items-center whitespace-nowrap">
                                        <p className="whitespace-nowrap">0 Bag</p>
                                        <Icon icon={"carbon:close-filled"} className="text-red-500" />
                                    </div>
                                )}
                            </div>
                            {/* <p>{(() => {
                                // Use filtered items based on current tab to ensure correct total
                                let filteredItems = order.items || [];
                                if (effectiveTab === 1) {
                                    // Outlet Transfer Note: items not yet sent to production
                                    filteredItems = filteredItems.filter((item) => item.is_send_to_production === 0);
                                } else if (effectiveTab === 2) {
                                    // Receive to Sorting: items sent but not received
                                    filteredItems = filteredItems.filter((item) => item.is_send_to_production === 1 && item.is_recived_to_production === 0);
                                } else if (effectiveTab === 3) {
                                    // Work in Progress: items received but not sent back to outlet
                                    filteredItems = filteredItems.filter((item) => item.is_recived_to_production === 1 && item.is_send_to_back_to_outlet === 0);
                                }
                                const total = filteredItems.reduce((sum, item) => {
                                    const price = Number(item.price) || 0;
                                    // item.price is already the total for that item (not unit price), so don't multiply by quantity
                                    return sum + price;
                                }, 0) + (Number(order.delivery_charge) || 0);
                                return total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}</p> */}
                            <p>{applyDiscountToAmount(order.total_amount, order.discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p>{order.advance_payment}</p>
                            <p>{order.remaining_amount}</p>
                            <p>{(() => { const raw = order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()}</p>
                            <p>{(() => { const raw = order.created_at; const d = new Date(raw); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); })()}</p>
                            <p>{order.delivery_date ? (() => { const d = new Date(order.delivery_date); return isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "—"}</p>
                            <div className="flex flex-row gap-x-1 justify-center">
                                <Link
                                    className="flex flex-col cursor-pointer items-center"
                                    to={`/salesCorporate/retail/to-production/${selectedTab === 1 ? "pending" : selectedTab === 2 ? "receive" : "complete"}/${order.order_id}`}
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

                                {selectedTab === 1 && canSendOutletTransferNote && (
                                    <>
                                        <div className="min-h-max border border-black/50 my-1" />
                                        <div
                                            className="flex flex-col cursor-pointer items-center"
                                            onClick={() => {
                                                setSelectedProductionOrder(order);
                                                setShowConfirmationDialog(true);
                                            }}>
                                            <Icon icon={"mynaui:send-solid"} className="text-green-500" />
                                            <p className="text-sm">Send</p>
                                        </div>
                                    </>
                                )}

                                

                                {selectedTab === 2 && canReceiveToSorting && (
                                    <>
                                        <div className="min-h-max border border-black/50 my-1" />
                                        <div
                                            className="flex flex-col cursor-pointer items-center"
                                            onClick={() => {
                                                setSelectedProductionOrder(order);
                                                setShowReceiveConfirmationDialog(true);
                                            }}>
                                            <Icon icon={"mynaui:send-solid"} className="text-green-500" />
                                            <p className="text-sm">Receive</p>
                                        </div>
                                    </>
                                )}
                                {/* edit option */}
                                {order.can_update === 1 && order.status !== "Deactive" && canEditCurrentTab &&
                                        <div className="min-h-max border border-black/50 my-1" />
                                    }

                                    {order.can_update === 1 && order.status !== "Deactive" && canEditCurrentTab &&
                                        <Link to={`update-order/${order.order_id}`} className="flex flex-col cursor-pointer">
                                            <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                            <p className="text-sm">Edit</p>
                                        </Link>
                                    }
                            </div>
                        </div>
                    ))}

                    {/* Render blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid gap-x-5 text-sm py-1.5 min-w-[1300px] [&>p]:min-w-0 [&>p]:break-words ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                            style={{ gridTemplateColumns: "1.6fr 1.5fr 1.2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1fr 1.2fr minmax(110px, 1.4fr)" }}
                        >
                            <div className="h-8" style={{ gridColumn: "1 / -1" }}></div>
                        </div>
                    ))}
                </div>
            }

            {/* Loading: below table when fetching more orders or loading another page (same as invoice) */}
            {(() => {
                const isLoadingMore = (effectiveTab === 1 && pendingProductionsLoadingMore) || (effectiveTab === 2 && pendingProductionsReceivedLoadingMore) || (effectiveTab === 3 && backToOutletLoadingMore);
                const hasMore = effectiveTab === 1 ? pendingProductionsHasMore : (effectiveTab === 2 ? pendingProductionsReceivedHasMore : (effectiveTab === 3 ? backToOutletHasMore : false));
                const loadingNextPage = effectiveTab === 1 && loadingProductionsPage;
                const shouldShowLoading = loadingNextPage || (isLoadingMore && hasMore && currentOrders.length < itemsPerPage);
                return shouldShowLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-primary/5 border-t border-primary/10 animate-pulse">
                        <BeatLoader color="#1470F9" size={12} />
                        <span className="text-primary font-medium text-sm">{loadingNextPage ? "Loading orders..." : "Loading more orders..."}</span>
                    </div>
                ) : null;
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
                        const isLoadingMore = (effectiveTab === 1 && pendingProductionsLoadingMore) || (effectiveTab === 2 && pendingProductionsReceivedLoadingMore) || (effectiveTab === 3 && backToOutletLoadingMore);
                        const rawTotal = totalPages || 1;
                        // Use stable total pages: never decrease while loading, always show at least current page
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

                        if (!isLoadingMore) {
                            // Ensure current page is always in range
                            if (currentPage < start) start = currentPage;
                            if (currentPage > end) end = currentPage;
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
                let hasMore = false;
                let isLoadingMore = false;
                let handleLoadMore = null;
                let showAllLoaded = false;

                if (isTransferNoteSearchMode) {
                    hasMore = transferNoteSearchHasMore;
                    isLoadingMore = transferNoteSearchLoadingMore;
                    handleLoadMore = handleLoadMoreTransferNoteSearch;
                    showAllLoaded = !hasMore && !isLoadingMore && ordersForTable.length > 0;
                } else if (isReceiveSearchMode) {
                    hasMore = receiveSearchHasMore;
                    isLoadingMore = receiveSearchLoadingMore;
                    handleLoadMore = handleLoadMoreReceiveSearch;
                    showAllLoaded = !hasMore && !isLoadingMore && ordersForTable.length > 0;
                } else if (isWorkInProgressSearchMode) {
                    hasMore = workInProgressSearchHasMore;
                    isLoadingMore = workInProgressSearchLoadingMore;
                    handleLoadMore = handleLoadMoreWorkInProgressSearch;
                    showAllLoaded = !hasMore && !isLoadingMore && ordersForTable.length > 0;
                } else if (effectiveTab === 1) {
                    // Tab 1 (Outlet Transfer Note): no "More Orders" button; more orders load automatically when user goes to next page
                    showAllLoaded = !pendingProductionsHasMore && !pendingProductionsLoadingMore && ordersForTable.length > 0;
                } else if (effectiveTab === 2) {
                    // Tab 2 (Receive to Sorting): no "More Orders" button; more orders load automatically when user goes to next page
                    showAllLoaded = !pendingProductionsReceivedHasMore && !pendingProductionsReceivedLoadingMore && ordersForTable.length > 0;
                } else if (effectiveTab === 3) {
                    // Tab 3 (Work in Progress): no "More Orders" button; more orders load automatically when user goes to next page
                    showAllLoaded = !backToOutletHasMore && !backToOutletLoadingMore && ordersForTable.length > 0;
                }

                if (hasMore) {
                    return (
                        <div className="flex justify-center mt-4">
                            <button
                                onClick={handleLoadMore}
                                disabled={isLoadingMore}
                                className="px-6 py-2 rounded-lg bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                            >
                                {isLoadingMore ? "Loading..." : "More search results"}
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

                return null;
            })()}

            {showConfirmationDialog && canSendOutletTransferNote &&
                <ConfirmationDialog
                    title={"Outlet Transfer Note"}
                    text={`Are you sure to create outlet transfer note for the order`}
                    item={selectedProductionOrder?.order_id}
                    onClose={() => {
                        setShowConfirmationDialog(false);
                        setSelectedProductionOrder(null);
                    }}
                    onSubmit={() => handleSendToProduction(selectedProductionOrder)}
                    isLoading={isLoadingSubmit}
                />
            }

            {showReceiveConfirmationDialog && canReceiveToSorting &&
                <ConfirmationDialog
                    title={"Receive to Production"}
                    text={`Are you sure to receive to production the order`}
                    item={selectedProductionOrder?.order_id}
                    onClose={() => {
                        setShowReceiveConfirmationDialog(false);
                        setSelectedProductionOrder(null);
                    }}
                    onSubmit={() => handleReceiveToProduction(selectedProductionOrder)}
                    isLoading={isLoadingSubmit}
                />
            }

            {showSendBulkConfirmationDialog && canSendOutletTransferNote &&
                <ConfirmationDialog
                    title={"Outlet Transfer Note"}
                    text={`Are you sure to create outlet transfer note for the selected orders`}
                    onClose={() => {
                        setShowSendBulkConfirmationDialog(false);
                    }}
                    onSubmit={() => handleSendBulkToProduction()}
                    isLoading={isLoadingSubmit}
                />
            }

            {showReceiveBulkConfirmationDialog && canReceiveToSorting &&
                <ConfirmationDialog
                    title={"Receive to Production"}
                    text={`Are you sure to receive to production the selected orders`}
                    onClose={() => {
                        setShowReceiveBulkConfirmationDialog(false);
                    }}
                    onSubmit={() => handleReceiveBulkToProduction()}
                    isLoading={isLoadingSubmit}
                />
            }

            {showPrintDialog && ordersToPrint.length > 0 &&
                <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
                    <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                        <h1 className="text-primary text-3xl font-bold text-center mb-2">Transfer Note</h1>

                        <RetailTransferNote
                            ref={transferNoteRef}
                            orders={ordersToPrint}
                            settings={settings}
                            transaction="Plant-Orugodawatta"
                            state="Transfer washing plant"
                        />

                        <div className="flex flex-row gap-x-5 mt-5">
                            <button
                                className="cursor-pointer bg-primary text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl"
                                onClick={handlePrint}
                            >
                                Print
                            </button>

                            <button
                                className="cursor-pointer bg-black/50 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl"
                                onClick={() => {
                                    setShowPrintDialog(false);
                                    setOrdersToPrint([]);
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

export default SalesRetailToProduction;
