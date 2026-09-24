import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { getAllRetailPendingProductionsReceived, receiveToProductionOrder } from "../../../services/Retail/RetailToProductionServices";
import { getAllBranches, searchOrderById } from "../../../services/Retail/RetailOrderServices";
import { markItemAsReturned, unmarkItemAsReturned } from "../../../services/Retail/RetailBackToOutletServices";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { BeatLoader } from "react-spinners";
import { getTransferNoteTabActions, parsePermissionTokens } from "../../../utils/retailSubTabPermissions";
import { isSuperadminRole } from "../../../utils/permissionHelper";

const SalesRetailViewToProductionReceive = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const userRole = localStorage.getItem("role") || "";
    const isSuperadmin = isSuperadminRole(userRole);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [productionOrder, setProductionOrder] = useState(null);
    const [itemTypes, setItemTypes] = useState([]);
    const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
    const [selectedServiceTypeId, setSelectedServiceTypeId] = useState(null);
    const [returnLoadingItems, setReturnLoadingItems] = useState([]);
    const [returnedItems, setReturnedItems] = useState([]);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedForReturn, setSelectedForReturn] = useState([]);
    const [returnServiceTypeId, setReturnServiceTypeId] = useState(null);
    const hasLoadedLiveDataRef = useRef(false);

    const permissions = localStorage.getItem("permissions") || "";
    const permissionTokens = useMemo(() => parsePermissionTokens(permissions), [permissions]);
    const tnActions = useMemo(
        () => getTransferNoteTabActions(permissionTokens, isSuperadmin, permissions),
        [permissionTokens, isSuperadmin, permissions]
    );
    const canReceiveToSorting = tnActions.receive.approve;
    /** Marking/undoing a Return on Receive to Sorting items requires this tab's own Edit permission. */
    const canReturnItems = tnActions.receive.edit;

    const extractSearchOrdersArray = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw?.orders)) return raw.orders.length > 0 && Array.isArray(raw.orders[0]) ? raw.orders.flat() : raw.orders;
        if (Array.isArray(raw?.data?.orders)) return raw.data.orders.length > 0 && Array.isArray(raw.data.orders[0]) ? raw.data.orders.flat() : raw.data.orders;
        if (Array.isArray(raw?.data)) return raw.data.length > 0 && Array.isArray(raw.data[0]) ? raw.data.flat() : raw.data;
        if (Array.isArray(raw)) return raw.length > 0 && Array.isArray(raw[0]) ? raw.flat() : raw;
        if (raw?.order && typeof raw.order === "object") return [raw.order];
        if (raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)) return [raw.data];
        if (raw && typeof raw === "object" && !Array.isArray(raw)) return [raw];
        return [];
    };

    const normalizeItems = (order) => {
        if (Array.isArray(order?.items)) return order.items;
        if (order?.items && typeof order.items === "object") return [order.items];
        if (Array.isArray(order?.service_items)) return order.service_items;
        if (order?.service_items && typeof order.service_items === "object") return [order.service_items];
        return [];
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
        return (data || []).map((b) => b.branch_id ?? b.id).filter((bid) => bid != null && !Number.isNaN(Number(bid))).map(Number);
    };

    const fetchAllToProductionOrders = async () => {
        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            // Primary source for View after search: search-order-by-id API
            try {
                const branchId = Number(location.state?.searchBranchId) || Number(location.state?.order?.branch_id) || Number(location.state?.order?.delivery_outlet_id) || Number(localStorage.getItem("selectedBranchId")) || 1;
                const searchRes = await searchOrderById(userId, String(id), 0, branchId, 50, "Receive to Sorting");
                const list = extractSearchOrdersArray(searchRes?.data);
                const found = list.find((o) => String(o?.order_id ?? o?.id ?? "") === String(id));
                if (found) {
                    setProductionOrder({ ...found, items: normalizeItems(found) });
                    hasLoadedLiveDataRef.current = true;
                    setIsLoading(false);
                    return;
                }
            } catch (err) {
                console.warn("search-order-by-id failed in to-production receive view:", err);
            }

            // The navigation-time snapshot (location.state.order) is only a bootstrap
            // fallback for the very first paint. Once we've successfully loaded live
            // data, a later refetch that fails to find the order (e.g. after an action
            // like marking an item returned) must NOT regress the UI back to that
            // frozen pre-action snapshot — that would silently undo the just-applied
            // optimistic update even though the change was actually saved.
            if (!hasLoadedLiveDataRef.current) {
                const orderFromState = location.state?.order;
                if (orderFromState && String(orderFromState.order_id ?? orderFromState.id ?? "") === String(id)) {
                    setProductionOrder({ ...orderFromState, items: normalizeItems(orderFromState) });
                    setIsLoading(false);
                    return;
                }
            }

            const branchId = Number(localStorage.getItem("selectedBranchId"));
            const response = await getAllRetailPendingProductionsReceived(userId, branchId);
            let order = response?.data?.pending_back_to_outlet_production?.find(o => o.order_id === id);

            if (!order) {
                const branchIds = await getBranchIdsFromApi();
                for (const bid of branchIds) {
                    const res = await getAllRetailPendingProductionsReceived(userId, bid);
                    const found = res?.data?.pending_back_to_outlet_production?.find(o => o.order_id === id);
                    if (found) {
                        order = found;
                        break;
                    }
                }
            }

            if (order) {
                setProductionOrder(order);
                hasLoadedLiveDataRef.current = true;
            } else if (!hasLoadedLiveDataRef.current) {
                setProductionOrder(null);
            }
        } catch (error) {
            console.error("Error fetching production orders: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response?.data?.item_types || []);
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
            setItemTypes([]); // Ensure it's always an array even on error
        }
    };

    useEffect(() => {
        fetchAllToProductionOrders();
        fetchItemTypes();
    }, [id, location.state]);

    useEffect(() => {
        if (productionOrder?.items) {
            const returned = productionOrder.items
                .filter(item => Number(item.is_returned) === 1)
                .map(item => getReturnItemId(item));
            setReturnedItems(returned);
        }
    }, [productionOrder]);

    const handleItemReturn = async (item) => {
        const serviceItemId = getReturnItemId(item);
        if (!canReturnItems || !serviceItemId || returnLoadingItems.includes(serviceItemId)) return;
        try {
            setReturnLoadingItems(prev => [...prev, serviceItemId]);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: productionOrder.order_id,
                service_item_id: serviceItemId
            };
            await markItemAsReturned(payload);
            setReturnedItems(prev => [...prev, serviceItemId]);
        } catch (error) {
            console.error("Error marking item as returned:", error);
            alert("Failed to mark item as returned. Please try again.");
        } finally {
            setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId));
        }
    };

    const handleUndoReturn = async (item) => {
        const serviceItemId = getReturnItemId(item);
        if (!canReturnItems || !serviceItemId || returnLoadingItems.includes(serviceItemId)) return;
        try {
            setReturnLoadingItems(prev => [...prev, serviceItemId]);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: productionOrder.order_id,
                service_item_id: serviceItemId
            };
            await unmarkItemAsReturned(payload);
            setReturnedItems(prev => prev.filter(id => id !== serviceItemId));
        } catch (error) {
            console.error("Error reverting returned status:", error);
            alert("Failed to revert returned status. Please try again.");
        } finally {
            setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId));
        }
    };

    const handleReturnSelected = async () => {
        if (!canReturnItems || !isSelectMode || selectedForReturn.length === 0 || isLoadingSubmit) return;
        try {
            setIsLoadingSubmit(true);
            for (const serviceItemId of selectedForReturn) {
                if (returnedItems.includes(String(serviceItemId))) continue;
                try {
                    setReturnLoadingItems(prev => [...prev, String(serviceItemId)]);
                    const payload = {
                        user_id: localStorage.getItem("userId"),
                        order_id: productionOrder.order_id,
                        service_item_id: serviceItemId
                    };
                    await markItemAsReturned(payload);
                    setReturnedItems(prev => [...prev, String(serviceItemId)]);
                } catch (err) {
                    console.error("Error marking item as returned in bulk:", err);
                } finally {
                    setReturnLoadingItems(prev => prev.filter(id => id !== String(serviceItemId)));
                }
            }
        } finally {
            setIsLoadingSubmit(false);
            setIsSelectMode(false);
            setSelectedForReturn([]);
            setReturnServiceTypeId(null);
        }
    };

    const handleSendToProduction = async (serviceTypeId) => {
        if (!canReceiveToSorting) return;
        try {
            setIsLoadingSubmit(true);
            const filteredItems = productionOrder?.items?.filter(o => o.service_type_id === serviceTypeId);
            const itemIds = filteredItems.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: productionOrder.order_id,
                service_items: itemIds
            };
            const response = await receiveToProductionOrder(payload);
            setShowConfirmationDialog(false);
            navigate("/salesCorporate/retail/to-production");
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    //price per item = (price * quantity) / pics_count/// if not, use Number(order.price)
    const pricePerItem = (order) => {
        let price = (order.price * order.quantity) / order.pics_count;
        return price;
    };
    const getReturnItemId = (item) => String(item?.service_item_id ?? item?.serviceItemId ?? item?.item_id ?? item?.barcode ?? "");
    const getItemNameByItemId = (order) => {
        if (order?.item_name) return String(order.item_name);
        if (order?.item_type_name) return String(order.item_type_name);
        const byItemId = itemTypes?.find(type => Number(type.item_type_id) === Number(order?.item_id));
        if (byItemId?.item_type_name) return byItemId.item_type_name;
        const byItemTypeId = itemTypes?.find(type => Number(type.item_type_id) === Number(order?.item_type_id));
        return byItemTypeId?.item_type_name || "-";
    };
    const receiveByService = (serviceTypeId) => {
        const items = productionOrder?.items || [];
        return items.filter((o) => {
            if (Number(o?.service_type_id) !== Number(serviceTypeId)) return false;
            const sentToProduction = o?.is_send_to_production;
            const receivedToProduction = o?.is_recived_to_production;
            const sentOk = sentToProduction == null || Number(sentToProduction) === 1;
            const notReceivedYet = receivedToProduction == null || Number(receivedToProduction) === 0;
            return sentOk && notReceivedYet;
        });
    };
    const allReceiveItems = productionOrder?.items || [];

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/to-production`, { state: { activeTab: "receiveSorting" } })} />
                <h1 className="text-3xl text-primary font-bold">Transfer Note/{id}</h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Receive orders to production.</p>

            {isLoading &&
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            }

            {receiveByService(1).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center">
                        <h2 className="text-2xl font-medium">Washing ({receiveByService(1).length} Items)</h2>
                        <div className="flex flex-row gap-x-3">
                            {canReceiveToSorting && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2"
                                    onClick={() => { setSelectedServiceTypeId(1); setShowConfirmationDialog(true); }}
                                ><Icon icon={"mynaui:send-solid"} /> Receive to Sorting</button>
                            )}
                            {canReturnItems && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                    onClick={() => {
                                        if (isSelectMode && returnServiceTypeId === 1) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); }
                                        else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(1); }
                                    }}
                                >
                                    <Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 1 ? "Cancel Select" : "Select More"}</span>
                                </button>
                            )}
                            {canReturnItems && isSelectMode && returnServiceTypeId === 1 && (
                                <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>
                                    {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}
                                    <span>Return Selected ({selectedForReturn.length})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>PRICE</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {receiveByService(1).map((order, index) => (
                            <div key={index} className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{getItemNameByItemId(order)}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getReturnItemId(order)) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`}
                                    onClick={() => {
                                        const itemId = getReturnItemId(order);
                                        if (returnLoadingItems.includes(itemId)) return;
                                        if (returnedItems.includes(itemId)) { handleUndoReturn(order); return; }
                                        if (isSelectMode && returnServiceTypeId === 1) setSelectedForReturn(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
                                        else if (!isSelectMode) handleItemReturn(order);
                                    }}>
                                    {returnLoadingItems.includes(getReturnItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getReturnItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === 1 ? <p className="text-xs font-semibold">{selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {receiveByService(2).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center">
                        <h2 className="text-2xl font-medium">Pressing ({receiveByService(2).length} Items)</h2>
                        <div className="flex flex-row gap-x-3">
                            {canReceiveToSorting && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2"
                                    onClick={() => { setSelectedServiceTypeId(2); setShowConfirmationDialog(true); }}
                                ><Icon icon={"mynaui:send-solid"} /> Receive to Sorting</button>
                            )}
                            {canReturnItems && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                    onClick={() => {
                                        if (isSelectMode && returnServiceTypeId === 2) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); }
                                        else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(2); }
                                    }}
                                >
                                    <Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 2 ? "Cancel Select" : "Select More"}</span>
                                </button>
                            )}
                            {canReturnItems && isSelectMode && returnServiceTypeId === 2 && (
                                <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>
                                    {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}
                                    <span>Return Selected ({selectedForReturn.length})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>PRICE</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {receiveByService(2).map((order, index) => (
                            <div key={index} className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{getItemNameByItemId(order)}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getReturnItemId(order)) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`}
                                    onClick={() => {
                                        const itemId = getReturnItemId(order);
                                        if (returnLoadingItems.includes(itemId)) return;
                                        if (returnedItems.includes(itemId)) { handleUndoReturn(order); return; }
                                        if (isSelectMode && returnServiceTypeId === 2) setSelectedForReturn(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
                                        else if (!isSelectMode) handleItemReturn(order);
                                    }}>
                                    {returnLoadingItems.includes(getReturnItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getReturnItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === 2 ? <p className="text-xs font-semibold">{selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {receiveByService(3).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center">
                        <h2 className="text-2xl font-medium">Dry Clean ({receiveByService(3).length} Items)</h2>
                        <div className="flex flex-row gap-x-3">
                            {canReceiveToSorting && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2"
                                    onClick={() => { setSelectedServiceTypeId(3); setShowConfirmationDialog(true); }}
                                ><Icon icon={"mynaui:send-solid"} /> Receive to Sorting</button>
                            )}
                            {canReturnItems && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                    onClick={() => {
                                        if (isSelectMode && returnServiceTypeId === 3) { setIsSelectMode(false); setSelectedForReturn([]); setReturnServiceTypeId(null); }
                                        else { setIsSelectMode(true); setSelectedForReturn([]); setReturnServiceTypeId(3); }
                                    }}
                                >
                                    <Icon icon={"mdi:undo-variant"} /><span>{isSelectMode && returnServiceTypeId === 3 ? "Cancel Select" : "Select More"}</span>
                                </button>
                            )}
                            {canReturnItems && isSelectMode && returnServiceTypeId === 3 && (
                                <button className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2" onClick={handleReturnSelected} disabled={isLoadingSubmit || selectedForReturn.length === 0}>
                                    {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}
                                    <span>Return Selected ({selectedForReturn.length})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>PRICE</p><p className="text-center">RETURN ITEM</p>
                        </div>
                        {receiveByService(3).map((order, index) => (
                            <div key={index} className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p>{getItemNameByItemId(order)}</p>
                                <p>{order.color}</p><p>{order.brand}</p><p className="col-span-2">{order.remark}</p><p>{order.packing_option}</p>
                                <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getReturnItemId(order)) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`}
                                    onClick={() => {
                                        const itemId = getReturnItemId(order);
                                        if (returnLoadingItems.includes(itemId)) return;
                                        if (returnedItems.includes(itemId)) { handleUndoReturn(order); return; }
                                        if (isSelectMode && returnServiceTypeId === 3) setSelectedForReturn(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
                                        else if (!isSelectMode) handleItemReturn(order);
                                    }}>
                                    {returnLoadingItems.includes(getReturnItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getReturnItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode && returnServiceTypeId === 3 ? <p className="text-xs font-semibold">{selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {allReceiveItems.length > 0 &&
                receiveByService(1).length === 0 &&
                receiveByService(2).length === 0 &&
                receiveByService(3).length === 0 && (
                    <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                        <div className="flex flex-row justify-between items-center">
                            <h2 className="text-2xl font-medium">All Items ({allReceiveItems.length} Items)</h2>
                            <div className="flex flex-row gap-x-3">
                                {canReturnItems && (
                                    <button
                                        className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                        onClick={() => {
                                            const detectedServiceTypeId = Number(allReceiveItems?.[0]?.service_type_id) || 1;
                                            if (isSelectMode) {
                                                setIsSelectMode(false);
                                                setSelectedForReturn([]);
                                                setReturnServiceTypeId(null);
                                            } else {
                                                setIsSelectMode(true);
                                                setSelectedForReturn([]);
                                                setReturnServiceTypeId(detectedServiceTypeId);
                                            }
                                        }}
                                    >
                                        <Icon icon={"mdi:undo-variant"} />
                                        <span>{isSelectMode ? "Cancel Select" : "Select More"}</span>
                                    </button>
                                )}
                                {canReturnItems && isSelectMode && (
                                    <button
                                        className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2"
                                        onClick={handleReturnSelected}
                                        disabled={isLoadingSubmit || selectedForReturn.length === 0}
                                    >
                                        {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}
                                        <span>Return Selected ({selectedForReturn.length})</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="rounded-xl border border-black/50 overflow-hidden">
                            <div className="text-xl grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p className="col-span-2">REMARK</p><p>PACKING</p><p>PRICE</p><p>SERVICE</p><p className="text-center">RETURN ITEM</p>
                            </div>
                            {allReceiveItems.map((order, index) => (
                                <div key={index} className={`grid grid-cols-9 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                    <p>{getItemNameByItemId(order)}</p>
                                    <p>{order.color || "-"}</p><p>{order.brand || "-"}</p><p className="col-span-2">{order.remark || "-"}</p><p>{order.packing_option || "-"}</p>
                                    <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p>{order.service_type_name || (Number(order.service_type_id) === 1 ? "Washing" : Number(order.service_type_id) === 2 ? "Pressing" : Number(order.service_type_id) === 3 ? "Dry Clean" : "-")}</p>
                                    <div
                                        className={`flex flex-col items-center justify-center ${returnedItems.includes(getReturnItemId(order)) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`}
                                        onClick={() => {
                                            const returnId = getReturnItemId(order);
                                            if (!returnId || returnLoadingItems.includes(returnId)) return;
                                            if (returnedItems.includes(returnId)) { handleUndoReturn(order); return; }
                                            if (isSelectMode) {
                                                setSelectedForReturn(prev => prev.includes(returnId) ? prev.filter(id => id !== returnId) : [...prev, returnId]);
                                            } else {
                                                handleItemReturn(order);
                                            }
                                        }}
                                    >
                                        {returnLoadingItems.includes(getReturnItemId(order)) ? (
                                            <BeatLoader color="#1470F9" size={8} />
                                        ) : returnedItems.includes(getReturnItemId(order)) ? (
                                            <ImCheckboxChecked className="text-green-500 size-5" />
                                        ) : isSelectMode ? (
                                            <p className="text-xs font-semibold">{selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}</p>
                                        ) : (
                                            <ImCheckboxUnchecked className="text-black/40 size-5" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            {showConfirmationDialog && canReceiveToSorting &&
                <ConfirmationDialog
                    title={"Receive to Sorting"}
                    text={`Are you sure to receive to production the ${selectedServiceTypeId === 1 ? "Washing" : selectedServiceTypeId === 2 ? "Pressing" : "Dry Clean"} of order`}
                    item={productionOrder?.order_id}
                    onClose={() => {
                        setShowConfirmationDialog(false);
                        setSelectedServiceTypeId(null);
                    }}
                    onSubmit={() => handleSendToProduction(selectedServiceTypeId)}
                    isLoading={isLoadingSubmit}
                />
            }

        </div>
    );
};

export default SalesRetailViewToProductionReceive;