import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { getAllRetailCompletedBackToOutletOrders, markItemAsDamaged, markItemAsReturned, unmarkItemAsReturned } from "../../../services/Retail/RetailBackToOutletServices";
import { getAllBranches, getRetailOrderById, searchOrderById } from "../../../services/Retail/RetailOrderServices";
import { BeatLoader } from "react-spinners";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { getAllRetailPendingInvoices, getServiceItemsByOrderId } from "../../../services/Retail/RetailInvoiceServices";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";

// Match extraction used in SalesRetailBackToOutlet so we read whatever key the API returns
const extractOrdersArray = (response) => {
    const d = response?.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    const arr = d.pending_back_to_outlet_orders ?? d.pending_confirm_back_to_outlet_orders ?? d.pending_back_to_outlet_production ?? d.confirmed_sent_back_to_outlet_orders ?? d.confirmed_orders ?? d.pending_back_to_outlet ?? d.pending_orders ?? d.orders ?? d.invoiced_orders ?? d.data;
    if (Array.isArray(arr)) return arr;
    for (const key of Object.keys(d)) {
        if (Array.isArray(d[key])) return d[key];
    }
    return [];
};

const extractSearchOrdersArray = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw?.orders)) return raw.orders.length > 0 && Array.isArray(raw.orders[0]) ? raw.orders.flat() : raw.orders;
    if (Array.isArray(raw?.data?.orders)) return raw.data.orders.length > 0 && Array.isArray(raw.data.orders[0]) ? raw.data.orders.flat() : raw.data.orders;
    if (Array.isArray(raw?.data)) return raw.data.length > 0 && Array.isArray(raw.data[0]) ? raw.data.flat() : raw.data;
    if (Array.isArray(raw)) return raw.length > 0 && Array.isArray(raw[0]) ? raw.flat() : raw;
    if (Array.isArray(raw?.result)) return raw.result.length > 0 && Array.isArray(raw.result[0]) ? raw.result.flat() : raw.result;
    if (Array.isArray(raw?.searchResults)) return raw.searchResults.length > 0 && Array.isArray(raw.searchResults[0]) ? raw.searchResults.flat() : raw.searchResults;
    if (raw?.order && typeof raw.order === "object") return [raw.order];
    if (raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)) return [raw.data];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return [raw];
    return [];
};

const SalesRetailViewBackToOutletComplete = () => {
    const { allowed } = usePagePermission("SalesRetail_Ready_to_Invoice_Edit");
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const [backToOutletOrder, setBackToOutletOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [itemTypes, setItemTypes] = useState([]);
    const [selectedServiceTypeId, setSelectedServiceTypeId] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [showItemConfirmationDialog, setShowItemConfirmationDialog] = useState(false);
    const [showServiceConfirmationDialog, setShowServiceConfirmationDialog] = useState(false);
    const [damagedItems, setDamagedItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState([]);
    const [returnLoadingItems, setReturnLoadingItems] = useState([]);
    const [returnedItems, setReturnedItems] = useState([]);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedForReturn, setSelectedForReturn] = useState([]);
    const [returnServiceTypeId, setReturnServiceTypeId] = useState(null);

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
        return (data || []).map((b) => b.branch_id ?? b.id).filter((bid) => bid != null && !Number.isNaN(Number(bid))).map(Number);
    };

    const fetchAllPendingInvoices = async () => {
        try {
            setIsLoading(true);
            let finalOrder = null;
            const userId = localStorage.getItem("userId");
            if (!userId) {
                setIsLoading(false);
                return;
            }

            // Primary source: search-order-by-id API for View flow
            try {
                const branchId = Number(location.state?.searchBranchId) || Number(location.state?.order?.branch_id) || Number(location.state?.order?.delivery_outlet_id) || Number(localStorage.getItem("selectedBranchId")) || 1;
                const searchRes = await searchOrderById(userId, String(id), 0, branchId, 50, "Pending Invoiced Order");
                const searchList = extractSearchOrdersArray(searchRes?.data);
                const searchedOrder = searchList.find((o) => String(o?.order_id ?? o?.id ?? "") === String(id));
                if (searchedOrder) {
                    finalOrder = {
                        ...searchedOrder,
                        items: Array.isArray(searchedOrder.items)
                            ? searchedOrder.items
                            : (searchedOrder.items && typeof searchedOrder.items === "object" ? [searchedOrder.items] : []),
                    };
                }
            } catch (err) {
                console.warn("search-order-by-id failed in complete view:", err);
            }

            const orderFromState = location.state?.order;
            const orderIdMatch = orderFromState && id != null &&
                String(orderFromState.order_id ?? orderFromState.id ?? "").trim() === String(id).trim();

            if (orderFromState && orderIdMatch) {
                let enrichedOrder = orderFromState;
                try {
                    const fullOrderResponse = await getRetailOrderById({ user_id: userId, order_id: orderFromState.order_id });
                    const fullOrder = fullOrderResponse?.order;
                    if (fullOrder) {
                        const preservedStatus = orderFromState.status || orderFromState.order_status;
                        const preservedOrderStatus = orderFromState.order_status || orderFromState.status;
                        const { status: _, order_status: __, items: ___, ...fullOrderWithoutStatusAndItems } = fullOrder;

                        enrichedOrder = {
                            ...orderFromState,
                            ...fullOrderWithoutStatusAndItems,
                            items: orderFromState.items || fullOrder.items || [],
                            status: preservedStatus || fullOrder.status || fullOrder.order_status,
                            order_status: preservedOrderStatus || fullOrder.order_status || fullOrder.status
                        };
                    }
                } catch (err) {
                    console.warn(`Failed to enrich order from state ${orderFromState.order_id}:`, err);
                }
                finalOrder = enrichedOrder;
            }

            if (!finalOrder) {
                try {
                    const branchId = Number(localStorage.getItem("selectedBranchId"));
                    const pendingResponse = await getAllRetailPendingInvoices(userId, branchId, 0);
                    const pendingList = extractOrdersArray(pendingResponse);
                    const pendingOrder = pendingList.find((o) => String(o.order_id) === String(id));
                    if (pendingOrder) {
                        finalOrder = pendingOrder;
                    }
                } catch (err) {
                    console.warn(`Failed to fetch from pending invoices:`, err);
                }
            }

            if (!finalOrder) {
                try {
                    const fullOrderResponse = await getRetailOrderById({ user_id: userId, order_id: id });
                    if (fullOrderResponse?.order) {
                        finalOrder = fullOrderResponse.order;
                    }
                } catch (err) {
                    console.warn(`Failed to fetch order by ID ${id}:`, err);
                }
            }

            if (!finalOrder) {
                const branchId = Number(localStorage.getItem("selectedBranchId"));
                const response = await getAllRetailCompletedBackToOutletOrders(userId, branchId);
                const list = extractOrdersArray(response);
                let order = list.find((o) => o.order_id === id);

                if (!order) {
                    const branchIds = await getBranchIdsFromApi();
                    for (const bid of branchIds) {
                        const res = await getAllRetailCompletedBackToOutletOrders(userId, bid);
                        const arr = extractOrdersArray(res);
                        const found = arr.find((o) => o.order_id === id);
                        if (found) {
                            order = found;
                            break;
                        }
                    }
                }
                finalOrder = order ?? null;
            }

            if (finalOrder && finalOrder.order_id) {
                try {
                    const itemsResponse = await getServiceItemsByOrderId({ user_id: userId, order_id: finalOrder.order_id });
                    let trueItems = [];
                    if (itemsResponse?.service_items && Array.isArray(itemsResponse.service_items)) {
                        trueItems = itemsResponse.service_items;
                    } else if (itemsResponse?.items && Array.isArray(itemsResponse.items)) {
                        trueItems = itemsResponse.items;
                    } else if (Array.isArray(itemsResponse)) {
                        trueItems = itemsResponse;
                    }
                    if (trueItems.length > 0) {
                        finalOrder.items = trueItems;
                    }
                } catch (err) {
                    console.warn(`Failed to fetch service items for order ${finalOrder.order_id}:`, err);
                }
            }

            setBackToOutletOrder(finalOrder);

        } catch (error) {
            console.error("Error fetching orders: ", error);
            setBackToOutletOrder(null);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Error fetching item types: ", error);
        }
    };

    useEffect(() => {
        fetchAllPendingInvoices();
        fetchItemTypes();
    }, [id, location.state]);

    // Helper to get service_item_id from item - consistent across all usages
    const getServiceItemId = (item) => item?.service_item_id ?? item?.serviceItemId ?? item?.id ?? item?.item_id;

    useEffect(() => {
        // Initialize damaged items from backend data
        if (backToOutletOrder?.items) {
            const damaged = backToOutletOrder.items
                .filter(item => item.is_damaged === 1 || item.is_damaged === "1" || item.is_damaged === true)
                .map(item => getServiceItemId(item));
            console.log("Initializing damaged items:", damaged);
            console.log("Items with is_damaged:", backToOutletOrder.items.map(i => ({ id: getServiceItemId(i), is_damaged: i.is_damaged })));
            setDamagedItems(damaged);
        }
    }, [backToOutletOrder]);

    useEffect(() => {
        if (backToOutletOrder?.items) {
            const returnedFromApi = backToOutletOrder.items
                .filter(item =>
                    item.is_returned === 1 ||
                    item.is_returned === "1" ||
                    item.is_returned === true
                )
                .map(item => getServiceItemId(item));

            // Merge API state with any client-side updates so we don't lose
            // the "Returned" mark immediately after clicking.
            setReturnedItems(prev => {
                const merged = new Set([...(prev || []), ...returnedFromApi]);
                return Array.from(merged);
            });
        }
    }, [backToOutletOrder]);

    if (!allowed) return <PermissionDenied required="SalesRetail_Ready_to_Invoice_Edit" label="Ready to Invoice" />;

    const handleItemReturn = async (serviceItemId) => {
        if (returnLoadingItems.includes(serviceItemId)) return;
        // Damaged items cannot be returned
        if (damagedItems.includes(serviceItemId)) return;
        try {
            setReturnLoadingItems(prev => [...prev, serviceItemId]);
            await markItemAsReturned({
                user_id: localStorage.getItem("userId"),
                order_id: backToOutletOrder.order_id,
                service_item_id: serviceItemId
            });

            // Immediately reflect in local UI
            setReturnedItems(prev => {
                const merged = new Set([...(prev || []), serviceItemId]);
                return Array.from(merged);
            });
            setBackToOutletOrder(prev => prev ? {
                ...prev,
                items: Array.isArray(prev.items)
                    ? prev.items.map(i =>
                        getServiceItemId(i) === serviceItemId
                            ? { ...i, is_returned: 1 }
                            : i
                    )
                    : prev.items
            } : prev);

            // Optionally refresh from server (will be merged with local state)
            await fetchAllPendingInvoices();
        } catch (error) {
            console.error("Error marking item as returned:", error);
            alert("Failed to mark item as returned. Please try again.");
        } finally {
            setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId));
        }
    };

    const handleUndoReturn = async (serviceItemId) => {
        if (returnLoadingItems.includes(serviceItemId)) return;
        try {
            setReturnLoadingItems(prev => [...prev, serviceItemId]);
            await unmarkItemAsReturned({
                user_id: localStorage.getItem("userId"),
                order_id: backToOutletOrder.order_id,
                service_item_id: serviceItemId
            });
            setReturnedItems(prev => prev.filter(id => id !== serviceItemId));
            setBackToOutletOrder(prev => prev ? {
                ...prev,
                items: Array.isArray(prev.items)
                    ? prev.items.map(i =>
                        getServiceItemId(i) === serviceItemId
                            ? { ...i, is_returned: 0 }
                            : i
                    )
                    : prev.items
            } : prev);
            await fetchAllPendingInvoices();
        } catch (error) {
            console.error("Error reverting returned status:", error);
            alert("Failed to revert returned status. Please try again.");
        } finally {
            setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId));
        }
    };

    const handleReturnSelected = async () => {
        if (!isSelectMode || selectedForReturn.length === 0 || isLoadingSubmit) return;
        try {
            setIsLoadingSubmit(true);
            for (const serviceItemId of selectedForReturn) {
                if (returnedItems.includes(serviceItemId) || damagedItems.includes(serviceItemId)) continue;
                try {
                    setReturnLoadingItems(prev => [...prev, serviceItemId]);
                    await markItemAsReturned({ user_id: localStorage.getItem("userId"), order_id: backToOutletOrder.order_id, service_item_id: serviceItemId });
                    // Immediately reflect in local UI for bulk return
                    setReturnedItems(prev => {
                        const merged = new Set([...(prev || []), serviceItemId]);
                        return Array.from(merged);
                    });
                    setBackToOutletOrder(prev => prev ? {
                        ...prev,
                        items: Array.isArray(prev.items)
                            ? prev.items.map(i =>
                                getServiceItemId(i) === serviceItemId
                                    ? { ...i, is_returned: 1 }
                                    : i
                            )
                            : prev.items
                    } : prev);
                } catch (err) { console.error("Error marking item as returned:", err); }
                finally { setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId)); }
            }
            await fetchAllPendingInvoices();
        } finally {
            setIsLoadingSubmit(false);
            setIsSelectMode(false);
            setSelectedForReturn([]);
            setReturnServiceTypeId(null);
        }
    };

    const handleToggleDamaged = async (item, orderId) => {
        // Get the service_item_id from the item object using the helper
        const serviceItemId = getServiceItemId(item);

        // Check if already loading
        if (loadingItems.includes(serviceItemId)) {
            return;
        }

        // Items already returned cannot be toggled as damaged
        if (returnedItems.includes(serviceItemId)) {
            return;
        }

        const isCurrentlyDamaged = damagedItems.includes(serviceItemId);

        try {
            // Add to loading state
            setLoadingItems(prev => [...prev, serviceItemId]);

            const payload = {
                user_id: String(localStorage.getItem("userId")),
                order_id: String(orderId),
                service_item_id: Number(serviceItemId)
            };

            console.log("Mark as damaged payload:", payload);
            console.log("Item object:", item);

            const response = await markItemAsDamaged(payload);

            if (response && response.message) {
                // Update damaged items state
                if (isCurrentlyDamaged) {
                    setDamagedItems(prev => prev.filter(id => id !== serviceItemId));
                    // Also update the item's is_damaged in backToOutletOrder
                    setBackToOutletOrder(prev => ({
                        ...prev,
                        items: prev.items.map(i =>
                            getServiceItemId(i) === serviceItemId
                                ? { ...i, is_damaged: 0 }
                                : i
                        )
                    }));
                } else {
                    setDamagedItems(prev => [...prev, serviceItemId]);
                    // Also update the item's is_damaged in backToOutletOrder
                    setBackToOutletOrder(prev => ({
                        ...prev,
                        items: prev.items.map(i =>
                            getServiceItemId(i) === serviceItemId
                                ? { ...i, is_damaged: 1 }
                                : i
                        )
                    }));
                }
            }
        } catch (error) {
            console.error("Error marking item as damaged:", error);
            // Optionally show error message to user
            alert("Failed to update damaged status. Please try again.");
        } finally {
            // Remove from loading state
            setLoadingItems(prev => prev.filter(id => id !== serviceItemId));
        }
    };

    //price per item = (price * quantity) / pics_count/// if not, use Number(order.price)
    const pricePerItem = (order) => {
        let price = (order.price * order.quantity) / order.pics_count;
        return price;
    };

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/back-to-outlet`)} />
                <h1 className="text-3xl text-primary font-bold">Dispatch Note/{id}</h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Mark items received.</p>

            {isLoading &&
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            }

            {!isLoading && !backToOutletOrder &&
                <div className="bg-white rounded-xl p-5 text-center text-black/60">Order not found.</div>
            }

            {!isLoading && backToOutletOrder && (
                <div className="bg-white rounded-xl p-5 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-lg">
                    <p><span className="text-black/50">Order ID:</span> {backToOutletOrder.order_id}</p>
                    <p><span className="text-black/50">Customer:</span> {backToOutletOrder.customer_name ?? "—"}</p>
                    <p><span className="text-black/50">Phone:</span> {backToOutletOrder.phone_number ?? "—"}</p>
                    <p><span className="text-black/50">Delivery outlet:</span> {backToOutletOrder.delivery_outlet ?? "—"}</p>
                </div>
            )}

            {!isLoading && backToOutletOrder?.items?.filter(o => o.service_type_id === 1 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-medium">Washing ({backToOutletOrder.items.filter(o => o.service_type_id === 1 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length} Items)</h2>
                        <div className="flex flex-row gap-x-2">
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2" onClick={() => { if (isSelectMode && returnServiceTypeId === 1) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); } else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(1); } }}><Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 1 ? "Cancel Select" : "Select More"}</span></button>
                            {isSelectMode && returnServiceTypeId === 1 && <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>{isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}<span>Return Selected ({selectedForReturn.length})</span></button>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p className="text-center">IS DAMAGED</p><p className="text-center">RETURN ITEM</p>
                        </div>

                        {backToOutletOrder.items.filter(o => o.service_type_id === 1 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).map((order, index) => (
                            <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p><p>{order.barcode}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className="flex justify-center items-center">
                                    {loadingItems.includes(getServiceItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getServiceItemId(order)) ? (damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500/40 size-5 cursor-not-allowed" title="Item already returned" /> : <ImCheckboxUnchecked className="text-black/20 size-5 cursor-not-allowed" title="Item already returned" />) : damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500 cursor-pointer size-5" onClick={() => handleToggleDamaged(order, backToOutletOrder.order_id)} /> : <ImCheckboxUnchecked className="text-black/50 cursor-pointer size-5" onClick={() => handleToggleDamaged(order, backToOutletOrder.order_id)} />}
                                </div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getServiceItemId(order)) ? "text-green-600 cursor-pointer" : damagedItems.includes(getServiceItemId(order)) ? "cursor-not-allowed" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(getServiceItemId(order))) return; if (returnedItems.includes(getServiceItemId(order))) { handleUndoReturn(getServiceItemId(order)); return; } if (damagedItems.includes(getServiceItemId(order))) return; if (isSelectMode && returnServiceTypeId === 1) setSelectedForReturn(prev => prev.includes(getServiceItemId(order)) ? prev.filter(id => id !== getServiceItemId(order)) : [...prev, getServiceItemId(order)]); else handleItemReturn(getServiceItemId(order)); }}>
                                    {returnLoadingItems.includes(getServiceItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxUnchecked className="text-black/20 size-5" /> : isSelectMode && returnServiceTypeId === 1 ? <p className="text-xs font-semibold">{selectedForReturn.includes(getServiceItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {!isLoading && backToOutletOrder?.items?.filter(o => o.service_type_id === 2 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-medium">Pressing ({backToOutletOrder.items.filter(o => o.service_type_id === 2 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length} Items)</h2>
                        <div className="flex flex-row gap-x-2">
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2" onClick={() => { if (isSelectMode && returnServiceTypeId === 2) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); } else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(2); } }}><Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 2 ? "Cancel Select" : "Select More"}</span></button>
                            {isSelectMode && returnServiceTypeId === 2 && <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>{isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}<span>Return Selected ({selectedForReturn.length})</span></button>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p className="text-center">IS DAMAGED</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {backToOutletOrder.items.filter(o => o.service_type_id === 2 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).map((order, index) => (
                            <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p><p>{order.barcode}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className="flex justify-center items-center">
                                    {loadingItems.includes(getServiceItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getServiceItemId(order)) ? (damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500/40 size-5 cursor-not-allowed" title="Item already returned" /> : <ImCheckboxUnchecked className="text-black/20 size-5 cursor-not-allowed" title="Item already returned" />) : damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500 cursor-pointer size-5" onClick={() => handleToggleDamaged(order, backToOutletOrder.order_id)} /> : <ImCheckboxUnchecked className="text-black/50 cursor-pointer size-5" onClick={() => handleToggleDamaged(order, backToOutletOrder.order_id)} />}
                                </div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getServiceItemId(order)) ? "text-green-600 cursor-pointer" : damagedItems.includes(getServiceItemId(order)) ? "cursor-not-allowed" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(getServiceItemId(order))) return; if (returnedItems.includes(getServiceItemId(order))) { handleUndoReturn(getServiceItemId(order)); return; } if (damagedItems.includes(getServiceItemId(order))) return; if (isSelectMode && returnServiceTypeId === 2) setSelectedForReturn(prev => prev.includes(getServiceItemId(order)) ? prev.filter(id => id !== getServiceItemId(order)) : [...prev, getServiceItemId(order)]); else handleItemReturn(getServiceItemId(order)); }}>
                                    {returnLoadingItems.includes(getServiceItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxUnchecked className="text-black/20 size-5" /> : isSelectMode && returnServiceTypeId === 2 ? <p className="text-xs font-semibold">{selectedForReturn.includes(getServiceItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {!isLoading && backToOutletOrder?.items?.filter(o => o.service_type_id === 3 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-medium">Dry Clean ({backToOutletOrder.items.filter(o => o.service_type_id === 3 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length} Items)</h2>
                        <div className="flex flex-row gap-x-2">
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2" onClick={() => { if (isSelectMode && returnServiceTypeId === 3) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); } else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(3); } }}><Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 3 ? "Cancel Select" : "Select More"}</span></button>
                            {isSelectMode && returnServiceTypeId === 3 && <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>{isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}<span>Return Selected ({selectedForReturn.length})</span></button>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p className="text-center">IS DAMAGED</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {backToOutletOrder.items.filter(o => o.service_type_id === 3 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).map((order, index) => (
                            <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p><p>{order.barcode}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className="flex justify-center items-center">
                                    {loadingItems.includes(getServiceItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getServiceItemId(order)) ? (damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500/40 size-5 cursor-not-allowed" title="Item already returned" /> : <ImCheckboxUnchecked className="text-black/20 size-5 cursor-not-allowed" title="Item already returned" />) : damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500 cursor-pointer size-5" onClick={() => handleToggleDamaged(order, backToOutletOrder.order_id)} /> : <ImCheckboxUnchecked className="text-black/50 cursor-pointer size-5" onClick={() => handleToggleDamaged(order, backToOutletOrder.order_id)} />}
                                </div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getServiceItemId(order)) ? "text-green-600 cursor-pointer" : damagedItems.includes(getServiceItemId(order)) ? "cursor-not-allowed" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(getServiceItemId(order))) return; if (returnedItems.includes(getServiceItemId(order))) { handleUndoReturn(getServiceItemId(order)); return; } if (damagedItems.includes(getServiceItemId(order))) return; if (isSelectMode && returnServiceTypeId === 3) setSelectedForReturn(prev => prev.includes(getServiceItemId(order)) ? prev.filter(id => id !== getServiceItemId(order)) : [...prev, getServiceItemId(order)]); else handleItemReturn(getServiceItemId(order)); }}>
                                    {returnLoadingItems.includes(getServiceItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getServiceItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : damagedItems.includes(getServiceItemId(order)) ? <ImCheckboxUnchecked className="text-black/20 size-5" /> : isSelectMode && returnServiceTypeId === 3 ? <p className="text-xs font-semibold">{selectedForReturn.includes(getServiceItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {/* Fallback: Show all items if no items match specific service type filters */}
            {!isLoading && backToOutletOrder?.items?.length > 0 &&
                backToOutletOrder.items.filter(o => o.service_type_id === 1 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length === 0 &&
                backToOutletOrder.items.filter(o => o.service_type_id === 2 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length === 0 &&
                backToOutletOrder.items.filter(o => o.service_type_id === 3 && (o.is_recived_to_back_to_outlet === 1 || o.is_recived_to_back_to_outlet == null)).length === 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <h2 className="text-2xl font-medium">All Items ({backToOutletOrder.items.length} Items)</h2>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>QTY</p><p>PRICE</p><p>SERVICE</p>
                        </div>
                        {backToOutletOrder.items.map((order, index) => (
                            <div key={index} className={`grid grid-cols-9 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name || order.item_type_name || "—"}</p>
                                <p>{order.color || "—"}</p>
                                <p>{order.brand || "—"}</p>
                                <p className="col-span-2">{order.remark || "—"}</p>
                                <p>{order.packing_option || "—"}</p>
                                <p>{order.quantity || 1}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p>{order.service_type_name || (Number(order.service_type_id) === 1 ? "Washing" : Number(order.service_type_id) === 2 ? "Pressing" : Number(order.service_type_id) === 3 ? "Dry Clean" : "-")}</p>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {showItemConfirmationDialog &&
                <ConfirmationDialog
                    title={"Outlet Transfer Note"}
                    text={`Are you sure to mark as received the item of order`}
                    item={backToOutletOrder?.order_id}
                    onClose={() => {
                        setShowItemConfirmationDialog(false);
                        setSelectedServiceTypeId(null);
                    }}
                    onSubmit={() => handleItemMarkAsReceived(selectedServiceTypeId)}
                    isLoading={isLoadingSubmit}
                />
            }

            {showServiceConfirmationDialog &&
                <ConfirmationDialog
                    title={"Outlet Transfer Note"}
                    text={`Are you sure to mark as received the ${selectedServiceTypeId === 1 ? "Washing" : selectedServiceTypeId === 2 ? "Pressing" : "Dry Clean"} of order`}
                    item={backToOutletOrder?.order_id}
                    onClose={() => {
                        setShowServiceConfirmationDialog(false);
                        setSelectedServiceTypeId(null);
                    }}
                    onSubmit={() => handleServiceMarkAsReceived(selectedServiceTypeId)}
                    isLoading={isLoadingSubmit}
                />
            }

        </div>
    );
};

export default SalesRetailViewBackToOutletComplete;