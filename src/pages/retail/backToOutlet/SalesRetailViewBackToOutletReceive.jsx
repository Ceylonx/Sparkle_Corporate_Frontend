import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { getAllRetailRecieveBackToOutletOrders, markAsReceivedBackToOutletOrder, markItemAsReturned, unmarkItemAsReturned } from "../../../services/Retail/RetailBackToOutletServices";
import { getAllBranches, getRetailOrderById, searchOrderById } from "../../../services/Retail/RetailOrderServices";
import { BeatLoader } from "react-spinners";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { getServiceItemsByOrderId } from "../../../services/Retail/RetailInvoiceServices";
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

const normalizeItemsFromOrder = (order) => {
    if (!order || typeof order !== "object") return [];
    if (Array.isArray(order.items)) return order.items;
    if (order.items && typeof order.items === "object") return [order.items];
    if (Array.isArray(order.service_items)) return order.service_items;
    if (order.service_items && typeof order.service_items === "object") return [order.service_items];
    if (Array.isArray(order.data?.items)) return order.data.items;
    if (order.data?.items && typeof order.data.items === "object") return [order.data.items];
    return [];
};

const SalesRetailViewBackToOutletReceive = () => {
    const { allowed } = usePagePermission("SalesRetail_Outlet_Received_Note_Receive");
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
    const [returnLoadingItems, setReturnLoadingItems] = useState([]);
    const [returnedItems, setReturnedItems] = useState([]);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedForReturn, setSelectedForReturn] = useState([]);
    const [returnServiceTypeId, setReturnServiceTypeId] = useState(null);

    const fetchAllBackToOutletOrders = async () => {
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
                const searchRes = await searchOrderById(userId, String(id), 0, branchId, 50, "Outlet Received Note");
                const searchList = extractSearchOrdersArray(searchRes?.data);
                const searchedOrder = searchList.find((o) => String(o?.order_id ?? o?.id ?? "") === String(id));
                if (searchedOrder) {
                    finalOrder = {
                        ...searchedOrder,
                        items: normalizeItemsFromOrder(searchedOrder),
                    };
                }
            } catch (err) {
                console.warn("search-order-by-id failed in receive view:", err);
            }

            const orderFromState = location.state?.order;
            const orderIdMatch = orderFromState && id != null &&
                String(orderFromState.order_id ?? orderFromState.id ?? "").trim() === String(id).trim();

            if (orderFromState && orderIdMatch) {
                let enrichedOrder = orderFromState;
                try {
                    const fullOrderResponse = await getRetailOrderById({ user_id: userId, order_id: orderFromState.order_id });
                    const fullOrder = fullOrderResponse?.order;
                    if (fullOrder && Array.isArray(fullOrder.items) && fullOrder.items.length > 0) {
                        const hasCompleteItems = fullOrder.items.some(item =>
                            item.service_type_id != null &&
                            (item.is_send_to_back_to_outlet != null || item.is_recived_to_back_to_outlet != null || item.service_item_id != null)
                        );
                        if (hasCompleteItems) {
                            const preservedStatus = orderFromState.status || orderFromState.order_status;
                            const preservedOrderStatus = orderFromState.order_status || orderFromState.status;
                            const { status: _, order_status: __, ...fullOrderWithoutStatus } = fullOrder;

                            enrichedOrder = {
                                ...orderFromState,
                                ...fullOrderWithoutStatus,
                                items: fullOrder.items,
                                status: preservedStatus || fullOrder.status || fullOrder.order_status,
                                order_status: preservedOrderStatus || fullOrder.order_status || fullOrder.status
                            };
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to enrich order from state ${orderFromState.order_id}:`, err);
                }
                finalOrder = enrichedOrder;
            }

            if (!finalOrder) {
                const branchId = Number(localStorage.getItem("selectedBranchId")) || 0;
                let response = await getAllRetailRecieveBackToOutletOrders(userId, branchId);
                let list = extractOrdersArray(response);
                let order = list.find((o) => o.order_id === id);

                if (!order) {
                    const branchesRes = await getAllBranches();
                    let branchIds = [];
                    if (Array.isArray(branchesRes)) branchIds = (branchesRes || []).map((b) => b.branch_id ?? b.id).filter(Boolean);
                    else if (branchesRes?.data) branchIds = (branchesRes.data || []).map((b) => b.branch_id ?? b.id).filter(Boolean);
                    else if (branchesRes?.branches) branchIds = (branchesRes.branches || []).map((b) => b.branch_id ?? b.id).filter(Boolean);
                    if (branchIds.length > 0) {
                        const responses = await Promise.all(branchIds.map((bid) => getAllRetailRecieveBackToOutletOrders(userId, bid)));
                        for (const res of responses) {
                            const arr = extractOrdersArray(res);
                            order = arr.find((o) => o.order_id === id);
                            if (order) break;
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
        fetchAllBackToOutletOrders();
        fetchItemTypes();
    }, [id, location.state]);

    useEffect(() => {
        if (backToOutletOrder?.items) {
            const returned = backToOutletOrder.items.filter(item => Number(item.is_returned) === 1).map(item => item.service_item_id);
            setReturnedItems(returned);
        }
    }, [backToOutletOrder]);

    if (!allowed) return <PermissionDenied required="SalesRetail_Outlet_Received_Note_Receive" label="Outlet Received Note" />;

    const handleItemReturn = async (serviceItemId) => {
        if (returnLoadingItems.includes(serviceItemId)) return;
        try {
            setReturnLoadingItems(prev => [...prev, serviceItemId]);
            await markItemAsReturned({ user_id: localStorage.getItem("userId"), order_id: backToOutletOrder.order_id, service_item_id: serviceItemId });
            setReturnedItems(prev => [...prev, serviceItemId]);
            await fetchAllBackToOutletOrders();
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
            await unmarkItemAsReturned({ user_id: localStorage.getItem("userId"), order_id: backToOutletOrder.order_id, service_item_id: serviceItemId });
            setReturnedItems(prev => prev.filter(id => id !== serviceItemId));
            await fetchAllBackToOutletOrders();
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
                if (returnedItems.includes(serviceItemId)) continue;
                try {
                    setReturnLoadingItems(prev => [...prev, serviceItemId]);
                    await markItemAsReturned({ user_id: localStorage.getItem("userId"), order_id: backToOutletOrder.order_id, service_item_id: serviceItemId });
                    setReturnedItems(prev => [...prev, serviceItemId]);
                } catch (err) { console.error("Error marking item as returned:", err); }
                finally { setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId)); }
            }
            await fetchAllBackToOutletOrders();
        } finally {
            setIsLoadingSubmit(false);
            setIsSelectMode(false);
            setSelectedForReturn([]);
            setReturnServiceTypeId(null);
        }
    };

    const handleItemMarkAsReceived = async () => {
        try {
            setIsLoadingSubmit(true);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: backToOutletOrder.order_id,
                service_items: [selectedItem.service_item_id]
            };
            const response = await markAsReceivedBackToOutletOrder(payload);
            setShowItemConfirmationDialog(false);
            fetchAllBackToOutletOrders();
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleServiceMarkAsReceived = async (serviceTypeId) => {
        try {
            setIsLoadingSubmit(true);
            const filteredItems = backToOutletOrder?.items?.filter(o => o.service_type_id === serviceTypeId);
            const itemIds = filteredItems.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: backToOutletOrder.order_id,
                service_items: itemIds
            };
            const response = await markAsReceivedBackToOutletOrder(payload);
            setShowServiceConfirmationDialog(false);
            navigate("/salesCorporate/retail/back-to-outlet");
        } catch (error) {
            console.error("Error sending to back to outlet: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    //price per item = (price * quantity) / pics_count/// if not, use Number(order.price)
    const pricePerItem = (order) => {
        let price = (order.price * order.quantity) / order.pics_count;
        return price;
    };

    const receiveItemsByService = (serviceTypeId) => {
        const items = backToOutletOrder?.items || [];
        return items.filter((o) => {
            if (Number(o?.service_type_id) !== Number(serviceTypeId)) return false;
            const sentBackToOutlet = o?.is_send_to_back_to_outlet;
            const receivedBackToOutlet = o?.is_recived_to_back_to_outlet;
            const sentOk = sentBackToOutlet == null || Number(sentBackToOutlet) === 1;
            const notReceivedYet = receivedBackToOutlet == null || Number(receivedBackToOutlet) === 0;
            return sentOk && notReceivedYet;
        });
    };
    const allReceiveItems = backToOutletOrder?.items || [];

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

            {!isLoading && receiveItemsByService(1).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-medium">Washing ({receiveItemsByService(1).length} Items)</h2>
                        <div className="flex flex-row gap-x-2">
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2" onClick={() => { setSelectedServiceTypeId(1); setShowServiceConfirmationDialog(true); }}><Icon icon={"mage:home-check-fill"} /> Mark as All Received</button>
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2" onClick={() => { if (isSelectMode && returnServiceTypeId === 1) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); } else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(1); } }}><Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 1 ? "Cancel Select" : "Select More"}</span></button>
                            {isSelectMode && returnServiceTypeId === 1 && <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>{isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}<span>Return Selected ({selectedForReturn.length})</span></button>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p className="text-center">ACTION</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {receiveItemsByService(1).map((order, index) => (
                            <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p><p>{order.barcode}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className="flex flex-col cursor-pointer items-center" onClick={() => { setSelectedItem(order); setShowItemConfirmationDialog(true); }}><Icon icon={"mage:home-check-fill"} className="text-green-500" /><p className="text-sm">Mark as Recieved</p></div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(order.service_item_id) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(order.service_item_id)) return; if (returnedItems.includes(order.service_item_id)) { handleUndoReturn(order.service_item_id); return; } if (isSelectMode && returnServiceTypeId === 1) setSelectedForReturn(prev => prev.includes(order.service_item_id) ? prev.filter(id => id !== order.service_item_id) : [...prev, order.service_item_id]); else handleItemReturn(order.service_item_id); }}>
                                    {returnLoadingItems.includes(order.service_item_id) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(order.service_item_id) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === 1 ? <p className="text-xs font-semibold">{selectedForReturn.includes(order.service_item_id) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {!isLoading && receiveItemsByService(2).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-medium">Pressing ({receiveItemsByService(2).length} Items)</h2>
                        <div className="flex flex-row gap-x-2">
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2" onClick={() => { setSelectedServiceTypeId(2); setShowServiceConfirmationDialog(true); }}><Icon icon={"mage:home-check-fill"} /> Mark as All Received</button>
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2" onClick={() => { if (isSelectMode && returnServiceTypeId === 2) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); } else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(2); } }}><Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 2 ? "Cancel Select" : "Select More"}</span></button>
                            {isSelectMode && returnServiceTypeId === 2 && <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>{isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}<span>Return Selected ({selectedForReturn.length})</span></button>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p className="text-center">ACTION</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {receiveItemsByService(2).map((order, index) => (
                            <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p><p>{order.barcode}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className="flex flex-col cursor-pointer items-center" onClick={() => { setSelectedItem(order); setShowItemConfirmationDialog(true); }}><Icon icon={"mage:home-check-fill"} className="text-green-500" /><p className="text-sm">Mark as Recieved</p></div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(order.service_item_id) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(order.service_item_id)) return; if (returnedItems.includes(order.service_item_id)) { handleUndoReturn(order.service_item_id); return; } if (isSelectMode && returnServiceTypeId === 2) setSelectedForReturn(prev => prev.includes(order.service_item_id) ? prev.filter(id => id !== order.service_item_id) : [...prev, order.service_item_id]); else handleItemReturn(order.service_item_id); }}>
                                    {returnLoadingItems.includes(order.service_item_id) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(order.service_item_id) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === 2 ? <p className="text-xs font-semibold">{selectedForReturn.includes(order.service_item_id) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {!isLoading && receiveItemsByService(3).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-medium">Dry Clean ({receiveItemsByService(3).length} Items)</h2>
                        <div className="flex flex-row gap-x-2">
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2" onClick={() => { setSelectedServiceTypeId(3); setShowServiceConfirmationDialog(true); }}><Icon icon={"mage:home-check-fill"} /> Mark as All Received</button>
                            <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2" onClick={() => { if (isSelectMode && returnServiceTypeId === 3) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); } else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(3); } }}><Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 3 ? "Cancel Select" : "Select More"}</span></button>
                            {isSelectMode && returnServiceTypeId === 3 && <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>{isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}<span>Return Selected ({selectedForReturn.length})</span></button>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p className="text-center">ACTION</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {receiveItemsByService(3).map((order, index) => (
                            <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p><p>{order.barcode}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className="flex flex-col cursor-pointer items-center" onClick={() => { setSelectedItem(order); setShowItemConfirmationDialog(true); }}><Icon icon={"mage:home-check-fill"} className="text-green-500" /><p className="text-sm">Mark as Recieved</p></div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(order.service_item_id) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(order.service_item_id)) return; if (returnedItems.includes(order.service_item_id)) { handleUndoReturn(order.service_item_id); return; } if (isSelectMode && returnServiceTypeId === 3) setSelectedForReturn(prev => prev.includes(order.service_item_id) ? prev.filter(id => id !== order.service_item_id) : [...prev, order.service_item_id]); else handleItemReturn(order.service_item_id); }}>
                                    {returnLoadingItems.includes(order.service_item_id) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(order.service_item_id) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === 3 ? <p className="text-xs font-semibold">{selectedForReturn.includes(order.service_item_id) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {!isLoading && allReceiveItems.length > 0 &&
                receiveItemsByService(1).length === 0 &&
                receiveItemsByService(2).length === 0 &&
                receiveItemsByService(3).length === 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <h2 className="text-2xl font-medium">All Items ({allReceiveItems.length} Items)</h2>
                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-11 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>BARCODE</p><p>PRICE</p><p>SERVICE</p><p className="text-center">ACTION</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {allReceiveItems.map((order, index) => (
                            <div key={index} className={`grid grid-cols-11 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{itemTypes?.find(type => Number(type.item_type_id) === Number(order.item_type_id))?.item_type_name || order.item_type_name || "-"}</p>
                                <p>{order.color || "-"}</p><p>{order.brand || "-"}</p><p className="col-span-2">{order.remark || "-"}</p><p>{order.packing_option || "-"}</p><p>{order.barcode || "-"}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p>{order.service_type_name || (Number(order.service_type_id) === 1 ? "Washing" : Number(order.service_type_id) === 2 ? "Pressing" : Number(order.service_type_id) === 3 ? "Dry Clean" : "-")}</p>
                                <div className="flex flex-col cursor-pointer items-center" onClick={() => { setSelectedItem(order); setShowItemConfirmationDialog(true); }}>
                                    <Icon icon={"mage:home-check-fill"} className="text-green-500" /><p className="text-sm">Mark as Recieved</p>
                                </div>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(order.service_item_id) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`} onClick={() => { if (returnLoadingItems.includes(order.service_item_id)) return; if (returnedItems.includes(order.service_item_id)) { handleUndoReturn(order.service_item_id); return; } if (isSelectMode && returnServiceTypeId === Number(order.service_type_id)) setSelectedForReturn(prev => prev.includes(order.service_item_id) ? prev.filter(id => id !== order.service_item_id) : [...prev, order.service_item_id]); else handleItemReturn(order.service_item_id); }}>
                                    {returnLoadingItems.includes(order.service_item_id) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(order.service_item_id) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === Number(order.service_type_id) ? <p className="text-xs font-semibold">{selectedForReturn.includes(order.service_item_id) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {showItemConfirmationDialog &&
                <ConfirmationDialog
                    title={"Mark as Received"}
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
                    title={"Mark as Received"}
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

export default SalesRetailViewBackToOutletReceive;