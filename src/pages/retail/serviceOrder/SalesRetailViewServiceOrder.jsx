import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import RetailServiceOrderBulk from "../../../components/printables/RetailServiceOrderBulk";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { markAsCompletedServiceOrder } from "../../../services/Retail/RetailServiceOrderServices";
import { BeatLoader } from "react-spinners";
import { getAllItemTypes, getAllSettings } from "../../../services/Retail/RetailSettingsServices";
import { getServiceItemsByOrderId } from "../../../services/Retail/RetailInvoiceServices";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";
import { hasPermission } from "../../../utils/permissionHelper";

const SalesRetailViewServiceOrder = () => {
    const { allowed } = usePagePermission("SalesRetail_Service_View");
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const orderFromState = location.state?.order;
    const componentRef = useRef(null);
    const [printKey, setPrintKey] = useState(Date.now());
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
    const [serviceOrder, setServiceOrder] = useState({items: []});
    const [itemTypes, setItemTypes] = useState([]);
    const [isPendingServiceOrder, setIsPendingServiceOrder] = useState(false);
    const [settings, setSettings] = useState(null);

    const fetchServiceOrder = async () => {
        try {
            setIsLoading(true);

            const userId = localStorage.getItem("userId");
            if (!userId || !id) {
                setServiceOrder({ order_id: id, items: [] });
                setIsLoading(false);
                return;
            }

            // Call get-all-service-items-by-order-id API for table data
            const response = await getServiceItemsByOrderId({ user_id: userId, order_id: id });

            // Extract items from API response (support multiple response shapes)
            let rawItems = [];
            if (response?.service_items && Array.isArray(response.service_items)) {
                rawItems = response.service_items;
            } else if (response?.items && Array.isArray(response.items)) {
                rawItems = response.items;
            } else if (Array.isArray(response?.data)) {
                rawItems = response.data;
            } else if (Array.isArray(response)) {
                rawItems = response;
            }

            // Normalize items: ensure barcode and other display fields are available
            const normalizeItems = (list) =>
                list.map((item) => ({
                    ...item,
                    barcode: item.barcode ?? item.barcode_no ?? item.barcodeNo ?? item.service_item_id ?? "",
                }));

            const items = normalizeItems(rawItems);

            // Merge with order from navigation state for header fields (redo_order_reference, etc.)
            const baseOrder = orderFromState && (orderFromState.order_id === id || orderFromState.id === id)
                ? { ...orderFromState }
                : { order_id: id, ...response };

            setServiceOrder({
                ...baseOrder,
                order_id: baseOrder.order_id ?? id,
                items,
            });
        } catch (error) {
            console.error("Error fetching service order:", error);
            setServiceOrder({ order_id: id, items: [] });
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

    const fetchAllSettings = async () => {
        try {
            const response = await getAllSettings(localStorage.getItem("userId"));
            if (response && response.data && response.data.settings && response.data.settings[0]) {
                const settingsData = response.data.settings[0];
                // Ensure numeric values are properly converted
                if (settingsData.sticker_count_per_page !== undefined) {
                    settingsData.sticker_count_per_page = Number(settingsData.sticker_count_per_page) || 6;
                }
                if (settingsData.bag_count !== undefined) {
                    settingsData.bag_count = Number(settingsData.bag_count) || 8;
                }
                setSettings(settingsData);
            }
        } catch (error) {
            console.error("Error fetching settings: ", error);
        }
    };

    useEffect(() => {
        fetchServiceOrder();
        fetchItemTypes();
        fetchAllSettings();
    }, [id]);

    // Service order print (invoice-style format, like screenshot)
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        onAfterPrint: () => {
            setPrintKey(Date.now());
        },
        onPrintError: () => {
            setPrintKey(Date.now());
        },
    });

    const handleMarkAsComplete = async () => {
        if (!hasPermission("SalesRetail_Service_Edit")) {
            return;
        }
        try {
            setIsLoadingSubmit(true);
            const itemIds = serviceOrder.items.map(item => item.service_item_id);

            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: serviceOrder.order_id,
                service_items: itemIds
            };

            const response = await markAsCompletedServiceOrder(payload);
            setShowConfirmationDialog(false);
            navigate("/salesCorporate/retail/service-order");
        } catch (error) {
            console.error("Error marking as complete: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const expandedItems = serviceOrder.items;

    // Group expanded items by service type for display: Washing (1), Pressing (2), Dry Clean (3)
    const SERVICE_TYPE_LABELS = { 1: "Washing", 2: "Pressing", 3: "Dry Clean" };
    const itemsByServiceType = useMemo(() => {
        const groups = { 1: [], 2: [], 3: [], other: [] };
        expandedItems.forEach((item) => {
            const sid = Number(item.service_type_id);
            if (sid === 1 || sid === 2 || sid === 3) groups[sid].push(item);
            else groups.other.push(item);
        });
        [1, 2, 3].forEach((sid) => {
            groups[sid].sort((a, b) => (a.packing_option === "Fold" ? 0 : 1) - (b.packing_option === "Fold" ? 0 : 1));
        });
        groups.other.sort((a, b) => (a.packing_option === "Fold" ? 0 : 1) - (b.packing_option === "Fold" ? 0 : 1));
        return groups;
    }, [serviceOrder]);

    // Flat sorted list for print and for "total items" (kept for groupedResult and any legacy use)
    const allItemsSorted = serviceOrder.items.sort((a, b) => {
        if (a.service_type_id !== b.service_type_id) return a.service_type_id - b.service_type_id;
        return (a.packing_option === "Fold" ? 0 : 1) - (b.packing_option === "Fold" ? 0 : 1);
    });
    const itemsPerPage = Number(settings?.sticker_count_per_page) || 8;
    const itemChunks = [];
    for (let i = 0; i < allItemsSorted.length; i += itemsPerPage) {
        itemChunks.push(allItemsSorted.slice(i, i + itemsPerPage));
    }

    // Build groupedResult from expanded items: group by service_type_id + packing_option, chunk into 8 per page (for print)
    const ITEMS_PER_PAGE = 8;
    const groupedResult = useMemo(() => {
        if (!expandedItems.length) return [];
        const grouped = {};
        expandedItems.forEach((item) => {
            const key = `${item.service_type_id}-${item.packing_option}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });
        const result = [];
        Object.keys(grouped).forEach((key) => {
            const [service_type_id, packing_option] = key.split("-");
            const groupItems = grouped[key];
            for (let i = 0; i < groupItems.length; i += ITEMS_PER_PAGE) {
                result.push({
                    service_type_id: Number(service_type_id),
                    packing_option: packing_option,
                    items: groupItems.slice(i, i + ITEMS_PER_PAGE),
                });
            }
        });
        return result;
    }, [serviceOrder]);

    if (!allowed) return <PermissionDenied required="SalesRetail_Service_View" label="Service Order" />;

    //price per item = (price * quantity) / pics_count/// if not, use Number(order.price)
    const pricePerItem = (order) => {
        let price = (order.price * order.quantity) / order.pics_count;
        return price;
    };

    return (
        <div>
            <div className="flex flex-row justify-between items-center">
                <div className="flex flex-col">
                    <div className="flex flex-row gap-x-3 items-center">
                        <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/service-order`)} />
                        <h1 className="text-3xl text-primary font-bold">Service Order/{id}</h1>
                    </div>
                    <p className="text-xl text-black/50 mb-5">Print service orders for selected order.</p>
                    {serviceOrder?.redo_order_reference && (
                        <div className="bg-white rounded-xl p-5 mb-3">
                            <p className="font-bold text-base">REDO: {serviceOrder.redo_order_reference}</p>
                        </div>
                    )}
                </div>

                {!isLoading &&
                    <button
                        className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-5 py-2 bg-white"
                        onClick={() => {
                            handlePrint();
                        }}
                    >
                        <Icon icon={"material-symbols:print"} /> Print Service Order
                    </button>
                }

                {isPendingServiceOrder &&
                    <button
                        className="flex flex-row gap-x-3 items-center font-bold text-xl text-primary border border-primary rounded-full px-3 py-2 bg-white cursor-pointer"
                        onClick={() => setShowConfirmationDialog(true)}
                    >
                        <Icon icon={"mage:home-check-fill"} /> Mark as Completed
                    </button>
                }
            </div>

            {isLoading &&
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            }

            {!isLoading && (!serviceOrder || !serviceOrder.items || serviceOrder.items.length === 0) && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl">
                    <Icon icon="mdi:package-variant-remove" className="text-6xl text-gray-400 mb-4" />
                    <p className="text-xl text-gray-500">No items found for this order</p>
                    <p className="text-sm text-gray-400 mt-2">Order ID: {id}</p>
                </div>
            )}

            {!isLoading && allItemsSorted.length > 0 && [...[1, 2, 3], "other"].map((serviceTypeId) => {
                const items = itemsByServiceType[serviceTypeId] || [];
                if (items.length === 0) return null;
                const label = serviceTypeId === "other" ? "Other" : SERVICE_TYPE_LABELS[serviceTypeId];
                return (
                    <div key={serviceTypeId} className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                        <h2 className="text-2xl font-medium">
                            {label} ({items.length} {items.length === 1 ? "Item" : "Items"})
                        </h2>
                        <div className="rounded-xl border border-black/50 overflow-hidden">
                            <div className="text-base grid gap-x-3 text-white bg-primary font-semibold py-2 px-3 [&>p]:text-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr 1fr 3fr 1fr" }}>
                                <p>ITEM</p>
                                <p>COLOUR</p>
                                <p>BRAND</p>
                                <p>REMARK</p>
                                <p>PACKING</p>
                                <p>BARCODE NO</p>
                                <p>PRICE</p>
                            </div>
                            {items.map((order, index) => (
                                <div key={order._rowKey ?? order.service_item_id ?? index} className={`grid gap-x-3 text-sm py-3 px-3 [&>p]:text-center ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`} style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr 1fr 3fr 1fr" }}>
                                    <p className="!text-start">{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name || "-"}</p>
                                    <p>{order.color}</p>
                                    <p>{order.brand}</p>
                                    <p>{order.remark}</p>
                                    <p>{order.packing_option}</p>
                                    <p className="whitespace-nowrap overflow-hidden text-ellipsis">{order.barcode != null && order.barcode !== "" ? String(order.barcode) : "-"}</p>
                                    <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Hidden service order printable - same structure as order entry (group by service type + packing, 8 per page) */}
            <div key={printKey} className="hidden">
                {serviceOrder && groupedResult.length > 0 && (
                    <div ref={componentRef}>
                        {groupedResult.map((group, index) => (
                            <RetailServiceOrderBulk
                                key={`${serviceOrder.order_id}-${group.service_type_id}-${group.packing_option}-${index}`}
                                order={serviceOrder}
                                serviceType={group.service_type_id}
                                itemTypes={itemTypes}
                                foldType={group.packing_option}
                                itemsFormatted={group.items}
                                serialStart={groupedResult.slice(0, index).filter(prevGroup => prevGroup.service_type_id === group.service_type_id && prevGroup.packing_option === group.packing_option).reduce((sum, prevGroup) => sum + prevGroup.items.length, 0) + 1}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showConfirmationDialog &&
                <ConfirmationDialog
                    title={"Mark Order as Completed"}
                    text={"Are you sure to mark as completed the order"}
                    item={serviceOrder?.order_id}
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

export default SalesRetailViewServiceOrder;