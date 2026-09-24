import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { sendToProductionOrder } from "../../../services/Retail/RetailToProductionServices";
import { getAllBranches, searchOrderById } from "../../../services/Retail/RetailOrderServices";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { BeatLoader } from "react-spinners";
import { getAllRetailBackToOutletOrders, markItemAsReturned, unmarkItemAsReturned } from "../../../services/Retail/RetailBackToOutletServices";
import { getTransferNoteTabActions, parsePermissionTokens } from "../../../utils/retailSubTabPermissions";
import { isSuperadminRole } from "../../../utils/permissionHelper";

const SalesRetailViewToProductionComplete = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const orderFromState = location.state?.order;
    const isSuperadmin = isSuperadminRole(localStorage.getItem("role"));
    const permissions = localStorage.getItem("permissions") || "";
    const permissionTokens = useMemo(() => parsePermissionTokens(permissions), [permissions]);
    const tnActions = useMemo(
        () => getTransferNoteTabActions(permissionTokens, isSuperadmin, permissions),
        [permissionTokens, isSuperadmin, permissions]
    );
    /** Marking/undoing a Return on Work in Progress items requires this tab's own Edit permission. */
    const canReturnItems = tnActions.wip.edit;
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
    const getReturnItemId = (item) => String(item?.service_item_id ?? item?.serviceItemId ?? item?.item_id ?? item?.barcode ?? "");

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
                let searchRes = await searchOrderById(userId, String(id), 0, branchId, 50, "Outlet Dispatch Note");
                let list = extractSearchOrdersArray(searchRes?.data);
                let found = list.find((o) => String(o?.order_id ?? o?.id ?? "") === String(id));

                if (!found) {
                    searchRes = await searchOrderById(userId, String(id), 0, branchId, 50, "Work in Progress");
                    list = extractSearchOrdersArray(searchRes?.data);
                    found = list.find((o) => String(o?.order_id ?? o?.id ?? "") === String(id));
                }

                if (found) {
                    setProductionOrder({ ...found, items: normalizeItems(found) });
                    hasLoadedLiveDataRef.current = true;
                    setIsLoading(false);
                    return;
                }
            } catch (err) {
                console.warn("search-order-by-id failed in to-production complete view:", err);
            }

            // The navigation-time snapshot (location.state.order) is only a bootstrap fallback
            if (!hasLoadedLiveDataRef.current && orderFromState && String(orderFromState.order_id ?? orderFromState.id ?? "") === String(id)) {
                setProductionOrder({ ...orderFromState, items: normalizeItems(orderFromState) });
                setIsLoading(false);
                return;
            }

            const branchId = Number(localStorage.getItem("selectedBranchId"));
            const responseBackToOutlet = await getAllRetailBackToOutletOrders(userId, branchId);
            let backToOutletOrder = responseBackToOutlet?.data?.pending_back_to_outlet_production?.find(o => o.order_id === id);

            if (!backToOutletOrder) {
                const branchIds = await getBranchIdsFromApi();
                for (const bid of branchIds) {
                    const res = await getAllRetailBackToOutletOrders(userId, bid);
                    const found = res?.data?.pending_back_to_outlet_production?.find(o => o.order_id === id);
                    if (found) {
                        backToOutletOrder = found;
                        break;
                    }
                }
            }

            if (backToOutletOrder) {
                setProductionOrder({ ...backToOutletOrder, items: normalizeItems(backToOutletOrder) });
                hasLoadedLiveDataRef.current = true;
            } else if (!hasLoadedLiveDataRef.current) {
                if (orderFromState) {
                    setProductionOrder({ ...orderFromState, items: normalizeItems(orderFromState) });
                } else {
                    setProductionOrder(null);
                }
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
            console.error("Error fetching item types: ", error);
            setItemTypes([]);
        }
    };

    useEffect(() => {
        fetchAllToProductionOrders();
        fetchItemTypes();
    }, [id, orderFromState]);

    // Initialize returned items from backend data if flag exists
    useEffect(() => {
        if (productionOrder?.items) {
            const returned = productionOrder.items
                .filter(item => Number(item.is_returned) === 1)
                .map(item => getReturnItemId(item))
                .filter(Boolean);
            setReturnedItems(returned);
        }
    }, [productionOrder]);

    const handleSendToProduction = async (serviceTypeId) => {
        try {
            setIsLoadingSubmit(true);
            const filteredItems = productionOrder?.items?.filter(o => o.service_type_id === serviceTypeId);
            const itemIds = filteredItems.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: productionOrder.order_id,
                service_items: itemIds
            };
            const response = await sendToProductionOrder(payload);
            setShowConfirmationDialog(false);
            navigate("/salesCorporate/retail/to-production");
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleItemReturn = async (serviceItemId) => {
        if (!canReturnItems || returnLoadingItems.includes(serviceItemId)) return;

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

    const handleUndoReturn = async (serviceItemId) => {
        if (!canReturnItems || returnLoadingItems.includes(serviceItemId)) return;

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
                if (returnedItems.includes(serviceItemId)) continue;

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
                    console.error("Error marking item as returned in bulk:", error);
                } finally {
                    setReturnLoadingItems(prev => prev.filter(id => id !== serviceItemId));
                }
            }
        } finally {
            setIsLoadingSubmit(false);
            setIsSelectMode(false);
            setSelectedForReturn([]);
            setReturnServiceTypeId(null);
        }
    };

    const getDisplayPrice = (order) => {
        const price = Number(order?.price) || 0;
        const qty = Number(order?.quantity) || 0;
        const pcs = Number(order?.pics_count) || 0;
        if (pcs <= 0) return price;
        return (price * qty) / pcs;
    };

    const pricePerItem = getDisplayPrice;

    const getItemNameByItemId = (order) => {
        if (order?.item_name) return String(order.item_name);
        if (order?.item_type_name) return String(order.item_type_name);
        const byItemId = itemTypes?.find(type => Number(type.item_type_id) === Number(order?.item_id));
        if (byItemId?.item_type_name) return byItemId.item_type_name;
        const byItemTypeId = itemTypes?.find(type => Number(type.item_type_id) === Number(order?.item_type_id));
        return byItemTypeId?.item_type_name || "-";
    };

    const getServiceName = (order) => {
        if (order?.service_type_name) return String(order.service_type_name);
        const id = Number(order?.service_type_id);
        if (id === 1) return "Washing";
        if (id === 2) return "Pressing";
        if (id === 3) return "Dry Clean";
        return "-";
    };

    const wipByService = (serviceTypeId) => {
        const items = productionOrder?.items || [];
        return items.filter((o) => {
            if (Number(o?.service_type_id) !== Number(serviceTypeId)) return false;
            const sentBackToOutlet = o?.is_send_to_back_to_outlet;
            return sentBackToOutlet == null || Number(sentBackToOutlet) === 0;
        });
    };

    const allWipItems = (productionOrder?.items || []).filter((o) => {
        const sentBackToOutlet = o?.is_send_to_back_to_outlet;
        return sentBackToOutlet == null || Number(sentBackToOutlet) === 0;
    });

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/to-production`)} />
                <h1 className="text-3xl text-primary font-bold">Transfer Note/{id}</h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Send orders to production.</p>

            {isLoading &&
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            }

            {wipByService(1).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center">
                        <h2 className="text-2xl font-medium">
                            Washing ({wipByService(1).length} Items)
                        </h2>
                        <div className="flex flex-row gap-x-3">
                            {canReturnItems && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                    onClick={() => {
                                        if (isSelectMode && returnServiceTypeId === 1) {
                                            setIsSelectMode(false);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(null);
                                        } else {
                                            setIsSelectMode(true);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(1);
                                        }
                                    }}
                                >
                                    <Icon icon={"mdi:undo-variant"} />
                                    <span>{isSelectMode && returnServiceTypeId === 1 ? "Cancel Select" : "Select More"}</span>
                                </button>
                            )}
                            {canReturnItems && isSelectMode && returnServiceTypeId === 1 && (
                                <button
                                    className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2"
                                    onClick={handleReturnSelected}
                                    disabled={isLoadingSubmit || selectedForReturn.length === 0}
                                >
                                    {isLoadingSubmit ? (
                                        <BeatLoader color="#FFFFFF" size={8} />
                                    ) : (
                                        <Icon icon={"mage:home-check-fill"} />
                                    )}
                                    <span>Return Selected ({selectedForReturn.length})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p>
                            <p>COLOUR</p>
                            <p>BRAND</p>
                            <p className="col-span-2">REMARK</p>
                            <p>PACKING</p>
                            <p>PRICE</p>
                            <p className="text-center">RETURN ITEM</p>
                        </div>

                        {wipByService(1).map((order, index) => (
                            <div
                                key={index}
                                className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 px-3 ${
                                    index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                } items-center`}
                            >
                                <p>{getItemNameByItemId(order)}</p>
                                <p>{order.color || "-"}</p>
                                <p>{order.brand || "-"}</p>
                                <p className="col-span-2">{order.remark || "-"}</p>
                                <p>{order.packing_option || "-"}</p>
                                <p>
                                    Rs{" "}
                                    {Number(pricePerItem(order)).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </p>
                                <div
                                    className={`flex flex-col items-center justify-center ${
                                        returnedItems.includes(getReturnItemId(order))
                                            ? "text-green-600 cursor-pointer"
                                            : "cursor-pointer"
                                    }`}
                                    onClick={() => {
                                        const returnId = getReturnItemId(order);
                                        if (!returnId || returnLoadingItems.includes(returnId)) {
                                            return;
                                        }
                                        if (returnedItems.includes(returnId)) {
                                            handleUndoReturn(returnId);
                                            return;
                                        }
                                        if (isSelectMode && returnServiceTypeId === 1) {
                                            setSelectedForReturn(prev =>
                                                prev.includes(returnId)
                                                    ? prev.filter(id => id !== returnId)
                                                    : [...prev, returnId]
                                            );
                                        } else if (!isSelectMode) {
                                            handleItemReturn(returnId);
                                        }
                                    }}
                                >
                                    {returnLoadingItems.includes(getReturnItemId(order)) ? (
                                        <BeatLoader color="#1470F9" size={8} />
                                    ) : returnedItems.includes(getReturnItemId(order)) ? (
                                        <ImCheckboxChecked className="text-green-500 size-5" />
                                    ) : isSelectMode && returnServiceTypeId === 1 ? (
                                        <p className="text-xs font-semibold">
                                            {selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}
                                        </p>
                                    ) : (
                                        <ImCheckboxUnchecked className="text-black/40 size-5" />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {wipByService(2).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center">
                        <h2 className="text-2xl font-medium">
                            Pressing ({wipByService(2).length} Items)
                        </h2>
                        <div className="flex flex-row gap-x-3">
                            {canReturnItems && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                    onClick={() => {
                                        if (isSelectMode && returnServiceTypeId === 2) {
                                            setIsSelectMode(false);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(null);
                                        } else {
                                            setIsSelectMode(true);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(2);
                                        }
                                    }}
                                >
                                    <Icon icon={"mdi:undo-variant"} />
                                    <span>{isSelectMode && returnServiceTypeId === 2 ? "Cancel Select" : "Select More"}</span>
                                </button>
                            )}
                            {canReturnItems && isSelectMode && returnServiceTypeId === 2 && (
                                <button
                                    className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2"
                                    onClick={handleReturnSelected}
                                    disabled={isLoadingSubmit || selectedForReturn.length === 0}
                                >
                                    {isLoadingSubmit ? (
                                        <BeatLoader color="#FFFFFF" size={8} />
                                    ) : (
                                        <Icon icon={"mage:home-check-fill"} />
                                    )}
                                    <span>Return Selected ({selectedForReturn.length})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p>
                            <p>COLOUR</p>
                            <p>BRAND</p>
                            <p className="col-span-2">REMARK</p>
                            <p>PACKING</p>
                            <p>PRICE</p>
                            <p className="text-center">RETURN ITEM</p>
                        </div>

                        {wipByService(2).map((order, index) => (
                            <div
                                key={index}
                                className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 px-3 ${
                                    index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                } items-center`}
                            >
                                <p>{getItemNameByItemId(order)}</p>
                                <p>{order.color || "-"}</p>
                                <p>{order.brand || "-"}</p>
                                <p className="col-span-2">{order.remark || "-"}</p>
                                <p>{order.packing_option || "-"}</p>
                                <p>
                                    Rs{" "}
                                    {Number(pricePerItem(order)).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </p>
                                <div
                                    className={`flex flex-col items-center justify-center ${
                                        returnedItems.includes(getReturnItemId(order))
                                            ? "text-green-600 cursor-pointer"
                                            : "cursor-pointer"
                                    }`}
                                    onClick={() => {
                                        const returnId = getReturnItemId(order);
                                        if (!returnId || returnLoadingItems.includes(returnId)) {
                                            return;
                                        }
                                        if (returnedItems.includes(returnId)) {
                                            handleUndoReturn(returnId);
                                            return;
                                        }
                                        if (isSelectMode && returnServiceTypeId === 2) {
                                            setSelectedForReturn(prev =>
                                                prev.includes(returnId)
                                                    ? prev.filter(id => id !== returnId)
                                                    : [...prev, returnId]
                                            );
                                        } else if (!isSelectMode) {
                                            handleItemReturn(returnId);
                                        }
                                    }}
                                >
                                    {returnLoadingItems.includes(getReturnItemId(order)) ? (
                                        <BeatLoader color="#1470F9" size={8} />
                                    ) : returnedItems.includes(getReturnItemId(order)) ? (
                                        <ImCheckboxChecked className="text-green-500 size-5" />
                                    ) : isSelectMode && returnServiceTypeId === 2 ? (
                                        <p className="text-xs font-semibold">
                                            {selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}
                                        </p>
                                    ) : (
                                        <ImCheckboxUnchecked className="text-black/40 size-5" />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {wipByService(3).length > 0 &&
                <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                    <div className="flex flex-row justify-between items-center">
                        <h2 className="text-2xl font-medium">
                            Dry Clean ({wipByService(3).length} Items)
                        </h2>
                        <div className="flex flex-row gap-x-3">
                            {canReturnItems && (
                                <button
                                    className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                    onClick={() => {
                                        if (isSelectMode && returnServiceTypeId === 3) {
                                            setIsSelectMode(false);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(null);
                                        } else {
                                            setIsSelectMode(true);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(3);
                                        }
                                    }}
                                >
                                    <Icon icon={"mdi:undo-variant"} />
                                    <span>{isSelectMode && returnServiceTypeId === 3 ? "Cancel Select" : "Select More"}</span>
                                </button>
                            )}
                            {canReturnItems && isSelectMode && returnServiceTypeId === 3 && (
                                <button
                                    className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2"
                                    onClick={handleReturnSelected}
                                    disabled={isLoadingSubmit || selectedForReturn.length === 0}
                                >
                                    {isLoadingSubmit ? (
                                        <BeatLoader color="#FFFFFF" size={8} />
                                    ) : (
                                        <Icon icon={"mage:home-check-fill"} />
                                    )}
                                    <span>Return Selected ({selectedForReturn.length})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-black/50 overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p>ITEM</p>
                            <p>COLOUR</p>
                            <p>BRAND</p>
                            <p className="col-span-2">REMARK</p>
                            <p>PACKING</p>
                            <p>PRICE</p>
                            <p className="text-center">RETURN ITEM</p>
                        </div>

                        {wipByService(3).map((order, index) => (
                            <div
                                key={index}
                                className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 px-3 ${
                                    index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                } items-center`}
                            >
                                <p>{getItemNameByItemId(order)}</p>
                                <p>{order.color || "-"}</p>
                                <p>{order.brand || "-"}</p>
                                <p className="col-span-2">{order.remark || "-"}</p>
                                <p>{order.packing_option || "-"}</p>
                                <p>
                                    Rs{" "}
                                    {Number(pricePerItem(order)).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </p>
                                <div
                                    className={`flex flex-col items-center justify-center ${
                                        returnedItems.includes(getReturnItemId(order))
                                            ? "text-green-600 cursor-pointer"
                                            : "cursor-pointer"
                                    }`}
                                    onClick={() => {
                                        const returnId = getReturnItemId(order);
                                        if (!returnId || returnLoadingItems.includes(returnId)) {
                                            return;
                                        }
                                        if (returnedItems.includes(returnId)) {
                                            handleUndoReturn(returnId);
                                            return;
                                        }
                                        if (isSelectMode && returnServiceTypeId === 3) {
                                            setSelectedForReturn(prev =>
                                                prev.includes(returnId)
                                                    ? prev.filter(id => id !== returnId)
                                                    : [...prev, returnId]
                                            );
                                        } else if (!isSelectMode) {
                                            handleItemReturn(returnId);
                                        }
                                    }}
                                >
                                    {returnLoadingItems.includes(getReturnItemId(order)) ? (
                                        <BeatLoader color="#1470F9" size={8} />
                                    ) : returnedItems.includes(getReturnItemId(order)) ? (
                                        <ImCheckboxChecked className="text-green-500 size-5" />
                                    ) : isSelectMode && returnServiceTypeId === 3 ? (
                                        <p className="text-xs font-semibold">
                                            {selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}
                                        </p>
                                    ) : (
                                        <ImCheckboxUnchecked className="text-black/40 size-5" />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }

            {allWipItems.length > 0 &&
                wipByService(1).length === 0 &&
                wipByService(2).length === 0 &&
                wipByService(3).length === 0 && (
                    <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                        <div className="flex flex-row justify-between items-center">
                            <h2 className="text-2xl font-medium">All Items ({allWipItems.length} Items)</h2>
                            <div className="flex flex-row gap-x-3">
                                {canReturnItems && (!isSelectMode ? (
                                    <button
                                        className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                        onClick={() => {
                                            const detectedServiceTypeId = Number(allWipItems?.[0]?.service_type_id) || 1;
                                            setIsSelectMode(true);
                                            setSelectedForReturn([]);
                                            setReturnServiceTypeId(detectedServiceTypeId);
                                        }}
                                    >
                                        <Icon icon={"mdi:undo-variant"} />
                                        <span>Select More</span>
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-2 border border-primary rounded-full px-3 py-2"
                                            onClick={() => {
                                                setIsSelectMode(false);
                                                setSelectedForReturn([]);
                                                setReturnServiceTypeId(null);
                                            }}
                                        >
                                            <Icon icon={"mdi:undo-variant"} />
                                            <span>Cancel Select</span>
                                        </button>
                                        <button
                                            className="cursor-pointer flex flex-row text-white font-bold text-xl items-center gap-x-2 bg-primary rounded-full px-3 py-2"
                                            onClick={handleReturnSelected}
                                            disabled={isLoadingSubmit || selectedForReturn.length === 0}
                                        >
                                            {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={8} /> : <Icon icon={"mage:home-check-fill"} />}
                                            <span>Return Selected ({selectedForReturn.length})</span>
                                        </button>
                                    </>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border border-black/50 overflow-hidden">
                            <div className="text-base grid gap-x-3 text-white bg-primary font-semibold py-2 px-3 [&>p]:text-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr 1fr 1fr 1fr 1fr" }}>
                                <p>ITEM</p><p>COLOUR</p><p>BRAND</p><p>REMARK</p><p>PACKING</p><p>PRICE</p><p>SERVICE</p><p>RETURN ITEM</p>
                            </div>
                            {allWipItems.map((order, index) => (
                                <div key={index} className={`grid gap-x-3 text-sm py-3 px-3 [&>p]:text-center ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`} style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr 1fr 1fr 1fr 1fr" }}>
                                    <p className="!text-start">{getItemNameByItemId(order)}</p>
                                    <p>{order.color || "-"}</p><p>{order.brand || "-"}</p><p>{order.remark || "-"}</p><p>{order.packing_option || "-"}</p>
                                    <p>Rs {Number(getDisplayPrice(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p>{getServiceName(order)}</p>
                                    <div className={`flex flex-col items-center justify-center ${returnedItems.includes(getReturnItemId(order)) ? "text-green-600 cursor-pointer" : "cursor-pointer"}`} onClick={() => { const returnId = getReturnItemId(order); if (!returnId || returnLoadingItems.includes(returnId)) return;
                                        if (returnedItems.includes(returnId)) { handleUndoReturn(returnId); return; } if (isSelectMode) setSelectedForReturn(prev => prev.includes(returnId) ? prev.filter(id => id !== returnId) : [...prev, returnId]); else handleItemReturn(returnId); }}>
                                        {returnLoadingItems.includes(getReturnItemId(order)) ? <BeatLoader color="#1470F9" size={8} /> : returnedItems.includes(getReturnItemId(order)) ? <ImCheckboxChecked className="text-green-500 size-5" /> : isSelectMode ? <p className="text-xs font-semibold">{selectedForReturn.includes(getReturnItemId(order)) ? "Selected" : "Select"}</p> : <ImCheckboxUnchecked className="text-black/40 size-5" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            {showConfirmationDialog &&
                <ConfirmationDialog
                    title={"Outlet Transfer Note"}
                    text={`Are you sure to send to production the ${selectedServiceTypeId === 1 ? "Washing" : selectedServiceTypeId === 2 ? "Pressing" : "Dry Clean"} of order`}
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

export default SalesRetailViewToProductionComplete;