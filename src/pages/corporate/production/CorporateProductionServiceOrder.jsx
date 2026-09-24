import { useEffect, useMemo, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useNavigate, useParams } from "react-router-dom";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import Select from "react-select";
import { changePickupEntryItemsProductionStatus, getInProductionPickupEntryById } from "../../../services/corporate/ProductionServices";

const getStatusDotClass = (statusStr) => {
    if (!statusStr) return "bg-gray-400";
    if (statusStr.startsWith("Washing")) return "bg-blue-500";
    if (statusStr.startsWith("Pressing")) return "bg-blue-500";
    if (statusStr.startsWith("Dry Clean") || statusStr.startsWith("Dry Cleaning")) return "bg-purple-500";
    if (statusStr === "Completed") return "bg-green-500";
    if (statusStr === "Pending") return "bg-yellow-400";
    if (statusStr === "No Items") return "bg-red-500";
    return "bg-gray-400";
};

const checkItemHasService = (item, stageName) => {
    if (!item || !stageName) return false;
    const normName = String(stageName).toLowerCase();

    // 1. Direct string check
    const primary = String(item?.service_type || item?.service_type_name || item?.service_name || "").toLowerCase();
    if (normName.includes("dry")) {
        if (primary.includes("dry")) return true;
    } else if (normName.includes("wash")) {
        if (primary.includes("wash")) return true;
    } else if (normName.includes("press")) {
        if (primary.includes("press")) return true;
    } else if (primary === normName) {
        return true;
    }

    // 2. Check service_types array or JSON string
    let parsedTypes = item?.service_types;
    if (typeof parsedTypes === 'string') {
        try { parsedTypes = JSON.parse(parsedTypes); } catch (_) { parsedTypes = []; }
    }
    if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
        return parsedTypes.some((s) => {
            const sName = String(s?.service_type_name ?? s?.name ?? "").toLowerCase();
            const sId = Number(s?.service_type_id ?? s?.id ?? 0);
            if (normName.includes("dry")) {
                return sName.includes("dry") || sId === 3;
            } else if (normName.includes("wash")) {
                return sName.includes("wash") || sId === 1;
            } else if (normName.includes("press")) {
                return sName.includes("press") || sId === 2;
            }
            return sName === normName;
        });
    }

    return false;
};

const getItemServiceStatus = (item, serviceTypeName) => {
    let qty = 0;
    let downstream = 0;

    const normName = serviceTypeName.toLowerCase();
    const isPrimary = checkItemHasService(item, serviceTypeName);

    if (normName === "washing") {
        qty = Number(item?.washing_qty || 0) + (isPrimary ? Number(item?.pending_qty || 0) : 0);
        downstream = Number(item?.pressing_qty || 0) + Number(item?.dry_clean_qty || 0) + Number(item?.packing_qty || 0);
    } else if (normName === "pressing") {
        qty = Number(item?.pressing_qty || 0) + (isPrimary ? Number(item?.pending_qty || 0) : 0);
        downstream = Number(item?.dry_clean_qty || 0) + Number(item?.packing_qty || 0);
    } else if (normName === "dry clean" || normName === "dry cleaning") {
        qty = Number(item?.dry_clean_qty || 0) + (isPrimary ? Number(item?.pending_qty || 0) : 0);
        downstream = Number(item?.packing_qty || 0);
    }

    if (qty > 0) {
        return `${serviceTypeName} (${qty})`;
    }

    if (qty === 0 && downstream > 0) {
        return "Completed";
    }

    if (!isPrimary) return "No Items";

    return "Pending";
};

const selectStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: "white",
        borderRadius: "9999px", // full rounded
        borderColor: state.isFocused ? "#1470F9" : "#00000033", // black/20
        padding: "0.25rem 0.5rem", // py-1 px-2
        fontSize: "1.25rem", // text-xl
        boxShadow: "none",
        "&:hover": {
            borderColor: state.isFocused ? "#1470F9" : "#00000033",
        },
    }),
    placeholder: (base) => ({
        ...base,
        color: "#6B7280", // gray-400
    }),
    singleValue: (base) => ({
        ...base,
        color: "#000000",
        fontWeight: "500",
    }),
};

const statusOptions = [
    { value: "Washing", label: "Washing" },
    { value: "Pressing", label: "Pressing" },
    { value: "Dry Clean", label: "Dry Clean" },
    { value: "Packing", label: "Packing" },
];

const formatHistoryTimestamp = (dateString) => {
    if (!dateString) return "";
    try {
        let date;
        if (dateString.includes('T') || dateString.endsWith('Z')) {
            date = new Date(dateString);
        } else {
            const normalized = dateString.replace(' ', 'T');
            date = new Date(normalized);
        }
        if (isNaN(date.getTime())) {
            return dateString;
        }
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${yyyy}-${mm}-${dd} ${hours}:${minutes} ${ampm}`;
    } catch (_) {
        return dateString;
    }
};

const CorporateProductionServiceOrder = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [isLoading, setIsLoading] = useState(false);
    const [order, setOrder] = useState(null);
    const [viewItem, setViewItem] = useState(null);
    const [changeItem, setChangeItem] = useState(null);
    const [changeQty, setChangeQty] = useState("");
    const [changeStatus, setChangeStatus] = useState("Washing");
    const [changeSourceStatus, setChangeSourceStatus] = useState("Pending");
    const [changeSourceQty, setChangeSourceQty] = useState(0);
    const [isSendingStatus, setIsSendingStatus] = useState(false);

    const [bulkStage, setBulkStage] = useState(null);
    const [bulkItems, setBulkItems] = useState([]);
    const [isSendingBulk, setIsSendingBulk] = useState(false);

    const getStageQty = (item, stageName) => {
        let qty = 0;
        const normName = stageName.toLowerCase();
        const isPrimary = checkItemHasService(item, stageName);

        if (normName === "washing") {
            qty = Number(item?.washing_qty || 0) + (isPrimary ? Number(item?.pending_qty || 0) : 0);
        } else if (normName === "pressing") {
            qty = Number(item?.pressing_qty || 0) + (isPrimary ? Number(item?.pending_qty || 0) : 0);
        } else if (normName === "dry clean" || normName === "dry cleaning") {
            qty = Number(item?.dry_clean_qty || 0) + (isPrimary ? Number(item?.pending_qty || 0) : 0);
        }
        return qty;
    };

    const handleOpenBulkModal = (stageName) => {
        const stageItems = [];
        const items = order?.items ?? [];
        items.forEach((item) => {
            const qty = getStageQty(item, stageName);
            if (qty > 0) {
                let defaultNewStatus = "Washing";
                if (stageName === "Washing") {
                    defaultNewStatus = "Pressing";
                } else if (stageName === "Pressing") {
                    defaultNewStatus = "Packing";
                } else if (stageName === "Dry Clean" || stageName === "Dry Cleaning") {
                    defaultNewStatus = "Packing";
                }

                stageItems.push({
                    order_item_auto_id: item.order_item_auto_id,
                    corp_item_id: item.corp_item_id,
                    corp_item_name: item.corp_item_name,
                    item_category_name: item.item_category_name,
                    current_qty: qty,
                    change_qty: qty,
                    new_status: defaultNewStatus,
                });
            }
        });

        if (stageItems.length === 0) {
            Swal.fire({
                icon: "info",
                title: `No items in ${stageName}`,
                text: `There are currently no items in the "${stageName}" stage for this order.`,
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        setBulkItems(stageItems);
        setBulkStage(stageName);
    };

    const handleBulkItemQtyChange = (orderItemAutoId, value) => {
        setBulkItems((prev) =>
            prev.map((item) =>
                item.order_item_auto_id === orderItemAutoId
                    ? { ...item, change_qty: value === "" ? "" : Number(value) }
                    : item
            )
        );
    };

    const handleBulkItemStatusChange = (orderItemAutoId, value) => {
        setBulkItems((prev) =>
            prev.map((item) =>
                item.order_item_auto_id === orderItemAutoId
                    ? { ...item, new_status: value }
                    : item
            )
        );
    };

    const handleSubmitBulkTransfer = async () => {
        const itemsToTransfer = bulkItems.filter((i) => Number(i.change_qty) > 0);
        if (itemsToTransfer.length === 0) {
            await Swal.fire({
                icon: "warning",
                title: "No items selected",
                text: "Please enter a quantity greater than 0 for at least one item.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        for (const item of itemsToTransfer) {
            const qty = item.change_qty;
            if (!Number.isInteger(qty) || qty <= 0) {
                await Swal.fire({
                    icon: "warning",
                    title: "Invalid quantity",
                    text: `Please enter a valid positive integer for item "${item.corp_item_name}".`,
                    confirmButtonColor: "#1470F9",
                });
                return;
            }

            if (qty > item.current_qty) {
                await Swal.fire({
                    icon: "warning",
                    title: "Exceeded quantity",
                    text: `Transfer quantity for "${item.corp_item_name}" cannot exceed current stage quantity (${item.current_qty}).`,
                    confirmButtonColor: "#1470F9",
                });
                return;
            }
        }

        const confirmation = await Swal.fire({
            title: "Are you sure?",
            text: `Do you want to transfer ${itemsToTransfer.reduce((sum, i) => sum + i.change_qty, 0)} item(s) from "${bulkStage}" stage?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#1470F9",
            cancelButtonColor: "#6B7280",
            confirmButtonText: "Yes, Transfer Items",
            cancelButtonText: "Cancel",
        });

        if (!confirmation.isConfirmed) return;

        const payload = {
            user_id: localStorage.getItem("userId"),
            pickup_entry_id: order.pickup_entry_id,
            items: itemsToTransfer.map((item) => ({
                corp_item_id: item.corp_item_id,
                order_item_id: item.order_item_auto_id,
                quantity: item.change_qty,
                source_status: bulkStage,
                new_status: item.new_status,
            })),
        };

        try {
            setIsSendingBulk(true);
            const response = await changePickupEntryItemsProductionStatus(payload);
            
            await Swal.fire({
                icon: "success",
                title: "Bulk Transfer Complete",
                text: response?.data?.message || "Items successfully transferred to new stages.",
                confirmButtonColor: "#1470F9",
            });

            setBulkStage(null);
            setBulkItems([]);
            
            const updatedOrder = await fetchOrderById({ withLoading: false });
            
            if (!updatedOrder) {
                navigate("/salesCorporate/corporate/production", { state: { tab: "pending" } });
            } else {
                const totalRemainingProductionQty = (updatedOrder.items ?? []).reduce((sum, item) => {
                    return sum + 
                        Number(item.pending_qty || 0) + 
                        Number(item.washing_qty || 0) + 
                        Number(item.pressing_qty || 0) + 
                        Number(item.dry_clean_qty || 0);
                }, 0);
                
                if (totalRemainingProductionQty === 0) {
                    navigate("/salesCorporate/corporate/production", { state: { tab: "pending" } });
                }
            }
        } catch (error) {
            const message =
                error?.response?.data?.message ??
                error?.response?.data?.error ??
                "Failed to complete bulk transfer.";
            await Swal.fire({
                icon: "error",
                title: "Bulk Transfer Failed",
                text: message,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsSendingBulk(false);
        }
    };

    const viewItemLogs = useMemo(() => {
        if (!viewItem?.status_activity_log) return [];
        let parsed = [];
        if (typeof viewItem.status_activity_log === 'string') {
            try {
                parsed = JSON.parse(viewItem.status_activity_log);
            } catch (e) {
                console.error("Failed to parse status_activity_log:", e);
                parsed = [];
            }
        } else if (Array.isArray(viewItem.status_activity_log)) {
            parsed = viewItem.status_activity_log;
        }
        return parsed;
    }, [viewItem]);

    const fetchOrderById = async ({ withLoading = true } = {}) => {
        try {
            if (withLoading) setIsLoading(true);
            const response = await getInProductionPickupEntryById({
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: id,
            });
            const data = response?.data;
            const picked =
                data?.in_production_pickup_entry?.[0] ??
                data?.pickup_entry?.[0] ??
                data?.in_production_pickup_entries?.[0] ??
                null;
            setOrder(picked);
            return picked;
        } catch (error) {
            console.error("Error loading service order:", error);
            setOrder(null);
            return null;
        } finally {
            if (withLoading) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrderById({ withLoading: true });
    }, [id]);

    const rows = useMemo(() => order?.items ?? [], [order]);
    const orderLabel = order?.pickup_entry_id ? `${String(order.pickup_entry_id).padStart(4, "0")}` : "—";

    const handleOpenStatusModal = (item, sourceStatus, currentQty) => {
        setChangeItem(item);
        setChangeSourceStatus(sourceStatus);
        setChangeSourceQty(currentQty);
        setChangeQty(String(currentQty));

        // Default New Status selection logic:
        let defaultNewStatus = "Washing";
        if (sourceStatus === "Pending") {
            let originalServiceType = item?.service_type;
            if (!originalServiceType && item?.service_types) {
                let parsedTypes = item.service_types;
                if (typeof parsedTypes === 'string') {
                    try { parsedTypes = JSON.parse(parsedTypes); } catch (_) { parsedTypes = []; }
                }
                if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
                    originalServiceType = parsedTypes[0]?.service_type_name;
                }
            }
            if (originalServiceType) {
                const lower = originalServiceType.toLowerCase();
                if (lower.includes("wash")) {
                    defaultNewStatus = "Washing";
                } else if (lower.includes("press")) {
                    defaultNewStatus = "Pressing";
                } else if (lower.includes("dry")) {
                    defaultNewStatus = "Dry Clean";
                } else if (lower.includes("pack")) {
                    defaultNewStatus = "Packing";
                }
            }
        } else if (sourceStatus === "Washing") {
            defaultNewStatus = "Pressing";
        } else if (sourceStatus === "Pressing") {
            defaultNewStatus = "Packing";
        } else if (sourceStatus === "Dry Clean") {
            defaultNewStatus = "Packing";
        }
        setChangeStatus(defaultNewStatus);
    };

    const handleSubmitStatusChange = async () => {
        if (!changeItem || !order?.pickup_entry_id) return;
        const qty = Number(changeQty);
        if (!Number.isInteger(qty) || qty <= 0) {
            await Swal.fire({
                icon: "warning",
                title: "Invalid quantity",
                text: "Please enter a valid positive integer quantity.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        if (qty > changeSourceQty) {
            await Swal.fire({
                icon: "warning",
                title: "Exceeded quantity",
                text: `Transfer quantity cannot exceed current stage quantity (${changeSourceQty}).`,
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        const confirmation = await Swal.fire({
            title: "Are you sure?",
            text: `Do you want to transfer ${qty} item(s) from ${changeSourceStatus} to ${changeStatus}?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#1470F9",
            cancelButtonColor: "#6B7280",
            confirmButtonText: "Yes, Update Status",
            cancelButtonText: "Cancel"
        });

        if (!confirmation.isConfirmed) return;

        const payload = {
            user_id: localStorage.getItem("userId"),
            pickup_entry_id: order.pickup_entry_id,
            source_status: changeSourceStatus,
            new_status: changeStatus,
            items: [
                {
                    corp_item_id: changeItem.corp_item_id,
                    order_item_id: changeItem.order_item_auto_id,
                    quantity: qty,
                },
            ],
        };

        try {
            setIsSendingStatus(true);
            await changePickupEntryItemsProductionStatus(payload);
            const updatedOrder = await fetchOrderById({ withLoading: false });
            setChangeItem(null);

            let shouldNavigateBack = false;
            if (changeStatus === "Packing") {
                if (!updatedOrder) {
                    shouldNavigateBack = true;
                } else {
                    const totalRemainingProductionQty = (updatedOrder.items ?? []).reduce((sum, item) => {
                        return sum + 
                            Number(item.pending_qty || 0) + 
                            Number(item.washing_qty || 0) + 
                            Number(item.pressing_qty || 0) + 
                            Number(item.dry_clean_qty || 0);
                    }, 0);
                    
                    if (totalRemainingProductionQty === 0) {
                        shouldNavigateBack = true;
                    }
                }
            }

            await Swal.fire({
                icon: "success",
                title: "Status updated",
                text: "Item status and quantity updated successfully.",
                confirmButtonColor: "#1470F9",
            });

            if (shouldNavigateBack) {
                navigate("/salesCorporate/corporate/production", { state: { tab: "pending" } });
            }
        } catch (error) {
            const message =
                error?.response?.data?.message ??
                error?.response?.data?.error ??
                "Failed to update item status.";
            await Swal.fire({
                icon: "error",
                title: "Update failed",
                text: message,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsSendingStatus(false);
        }
    };

    return (
        <div className="flex flex-col gap-y-5">
            <div className="flex flex-row items-center gap-x-3">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate("/salesCorporate/corporate/production")} />
                <h1 className="text-3xl text-primary font-bold">Production/{order?.pickup_entry_id ?? "—"}/View</h1>
                {/* <div className="ms-auto border border-black/50 rounded-full px-10 py-1 text-xl font-medium">
                    Order ID : <span className="text-black/40">{order?.pickup_entry_id ?? "—"}</span>
                </div> */}
            </div>

            <p className="text-black/50 text-xl">Record new laundry pickup with item counts by category.</p>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={18} />
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl border border-black/10 p-8">
                        <h2 className="text-2xl font-medium mb-5">Customer Information</h2>
                        <div className="grid grid-cols-5 items-center gap-x-6">
                            <div className="flex flex-row items-center gap-x-4">
                                <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-10 p-1.5" />
                                <div>
                                    <p className="text-xl font-medium">{order?.customer_company_name ?? "—"}</p>
                                    <p className="text-xl text-black/50">{order?.customer_id ?? "—"}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-black font-medium">Address</p>
                                <p className="font-medium text-black/50">{order?.customer_address ?? "—"}</p>
                            </div>
                            <div>
                                <p className="text-black font-medium">Telephone Number</p>
                                <p className="font-medium text-black/50">{order?.customer_phone ?? "—"}</p>
                            </div>
                            <div>
                                <p className="text-black font-medium">Pickup Date</p>
                                <p className="font-medium text-black/50">
                                    {order?.created_at ? new Date(order.created_at).toISOString().split("T")[0].replace(/-/g, "/") : "—"}
                                </p>
                            </div>
                        </div>
                    </div>
                                  <div className="bg-white rounded-2xl border border-black/10 p-6">
                        <div className="rounded-2xl overflow-hidden border border-black/10">
                            <div className="grid grid-cols-12 bg-primary text-white font-semibold py-2 px-4 text-lg">
                                <p className="col-span-3">ITEM</p>
                                <p className="col-span-1">QTY</p>
                                <p className="col-span-2 flex items-center gap-x-1.5">
                                    <span>WASHING</span>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenBulkModal("Washing")}
                                        className="hover:bg-white/20 rounded-full p-1 transition-colors cursor-pointer text-white flex items-center justify-center"
                                        title="Bulk Transfer Washing Items"
                                    >
                                        <Icon icon="mdi:arrow-right-circle" className="text-lg" />
                                    </button>
                                </p>
                                <p className="col-span-2 flex items-center gap-x-1.5">
                                    <span>PRESSING</span>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenBulkModal("Pressing")}
                                        className="hover:bg-white/20 rounded-full p-1 transition-colors cursor-pointer text-white flex items-center justify-center"
                                        title="Bulk Transfer Pressing Items"
                                    >
                                        <Icon icon="mdi:arrow-right-circle" className="text-lg" />
                                    </button>
                                </p>
                                <p className="col-span-2 flex items-center gap-x-1.5">
                                    <span>DRY CLEAN</span>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenBulkModal("Dry Clean")}
                                        className="hover:bg-white/20 rounded-full p-1 transition-colors cursor-pointer text-white flex items-center justify-center"
                                        title="Bulk Transfer Dry Clean Items"
                                    >
                                        <Icon icon="mdi:arrow-right-circle" className="text-lg" />
                                    </button>
                                </p>
                                <p className="col-span-2 text-center">ACTION</p>
                            </div>

                            {rows.map((item, index) => {
                                return (
                                    <div key={item.order_item_auto_id ?? index} className={`grid grid-cols-12 py-2 px-4 text-lg items-center ${index % 2 === 0 ? "bg-white" : "bg-primary/10"}`}>
                                        <p className="col-span-3">
                                            {item.corp_item_name ?? "—"} ({item.item_category_name ?? "—"})
                                        </p>
                                        <p className="col-span-1">{item.corp_item_quantity ?? 0}</p>
                                        
                                        {/* Washing */}
                                        <div className="col-span-2 flex items-center gap-x-2">
                                            {(() => {
                                                const s = getItemServiceStatus(item, "Washing");
                                                const dot = getStatusDotClass(s);
                                                return (
                                                    <>
                                                        <span className={`inline-block size-3 rounded-full ${dot}`} />
                                                        <p className="text-base">{s}</p>
                                                    </>
                                                )
                                            })()}
                                        </div>

                                        {/* Pressing */}
                                        <div className="col-span-2 flex items-center gap-x-2">
                                            {(() => {
                                                const s = getItemServiceStatus(item, "Pressing");
                                                const dot = getStatusDotClass(s);
                                                return (
                                                    <>
                                                        <span className={`inline-block size-3 rounded-full ${dot}`} />
                                                        <p className="text-base">{s}</p>
                                                    </>
                                                )
                                            })()}
                                        </div>

                                        {/* Dry Clean */}
                                        <div className="col-span-2 flex items-center gap-x-2">
                                            {(() => {
                                                const s = getItemServiceStatus(item, "Dry Clean");
                                                const dot = getStatusDotClass(s);
                                                return (
                                                    <>
                                                        <span className={`inline-block size-3 rounded-full ${dot}`} />
                                                        <p className="text-base">{s}</p>
                                                    </>
                                                )
                                            })()}
                                        </div>

                                        <div className="col-span-2 flex items-center justify-center text-primary">
                                            <div
                                                className="flex flex-col items-center cursor-pointer"
                                                onClick={() => setViewItem(item)}
                                            >
                                                <Icon icon={"mdi:eye"} className="text-blue-500 text-xl" />
                                                <p className="text-xs text-black/70">View</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {rows.length === 0 && (
                                <div className="py-10 text-center text-black/50">No items available for this order.</div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {changeItem && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-black/5 p-10 relative">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-3xl font-bold text-primary flex items-center gap-x-2">
                                    <Icon icon="mdi:cached-circle" className="text-4xl" />
                                    Change Status
                                </h3>
                                <p className="text-black/40 text-lg font-medium mt-1 pl-2">Order ID: {orderLabel} • {order?.customer_company_name}</p>
                            </div>
                            <button
                                className="size-12 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center cursor-pointer transition-colors"
                                onClick={() => setChangeItem(null)}
                            >
                                <Icon icon="mdi:close" className="text-primary text-2xl" />
                            </button>
                        </div>

                        <div className="bg-primary/5 rounded-3xl p-6 border border-primary/10 mb-8">
                            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                                <div className="col-span-2 flex justify-between items-center bg-white/50 p-4 rounded-2xl border border-black/5">
                                    <div>
                                        <p className="text-sm font-bold text-black/40 uppercase tracking-wider mb-1">Product Name</p>
                                        <p className="text-xl font-semibold text-black/80">{changeItem.corp_item_name} ({changeItem.item_category_name})</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-black/40 uppercase tracking-wider mb-1">Current Stage Quantity</p>
                                        <p className="text-2xl font-bold text-primary">{changeSourceQty}</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-y-2">
                                    <label className="text-sm font-bold text-black/40 uppercase tracking-wider">Transfer Quantity</label>
                                    <input
                                        value={changeQty}
                                        onChange={(e) => setChangeQty(e.target.value)}
                                        type="number"
                                        min="1"
                                        max={changeSourceQty}
                                        className="w-full border border-black/10 rounded-full py-3 px-6 text-xl font-semibold bg-white focus:outline-none focus:border-primary transition-all shadow-sm"
                                        placeholder="Enter qty"
                                    />
                                </div>
                                <div className="flex flex-col gap-y-2">
                                    <label className="text-sm font-bold text-black/40 uppercase tracking-wider">New Status</label>
                                    <Select
                                        styles={{
                                            ...selectStyles,
                                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                        }}
                                        options={statusOptions}
                                        value={statusOptions.find((opt) => opt.value === changeStatus)}
                                        onChange={(opt) => setChangeStatus(opt.value)}
                                        isSearchable={false}
                                        menuPortalTarget={document.body}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-x-4">
                            <button
                                className="flex-1 border-2 border-black/10 text-black/60 rounded-full py-4 text-xl font-bold hover:bg-black/5 hover:text-black transition-all cursor-pointer disabled:opacity-50"
                                onClick={() => setChangeItem(null)}
                                disabled={isSendingStatus}
                            >
                                Cancel
                            </button>
                            <button
                                className="flex-1 bg-primary text-white rounded-full py-4 text-xl font-bold hover:bg-primary-dark shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all cursor-pointer disabled:opacity-70 flex items-center justify-center gap-x-2"
                                onClick={handleSubmitStatusChange}
                                disabled={isSendingStatus}
                            >
                                {isSendingStatus ? (
                                    <BeatLoader color="white" size={10} />
                                ) : (
                                    <>
                                        <Icon icon="mdi:check-circle" className="text-2xl" />
                                        Update Status
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {viewItem && (
                <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl bg-canvas rounded-2xl border border-black/15 p-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-2xl font-semibold text-primary">Production / {orderLabel}</p>
                                <p className="text-black/50 text-lg">{order?.customer_company_name ?? "—"}</p>
                            </div>
                            <button className="size-10 rounded-full bg-primary/20 flex items-center justify-center cursor-pointer" onClick={() => setViewItem(null)}>
                                <Icon icon="mdi:close" className="text-primary text-xl" />
                            </button>
                        </div>

                        <div className="mt-8">
                            <div className="grid grid-cols-12 text-lg border-b border-primary pb-2">
                                <p className="col-span-3">Product Name</p>
                                <p className="col-span-1">Total Qty</p>
                                <p className="col-span-3 text-center">Washing</p>
                                <p className="col-span-2 text-center">Pressing</p>
                                <p className="col-span-2 text-center">Dry Clean</p>
                                <p className="col-span-1 text-center">Packing</p>
                            </div>
                            <div className="grid grid-cols-12 text-xl py-3 border-b border-black/20 items-center">
                                <p className="col-span-3 text-black/50">{viewItem.corp_item_name} ({viewItem.item_category_name})</p>
                                <p className="col-span-1 text-black/50">{viewItem.corp_item_quantity}</p>
                                <p className="col-span-3 text-center text-black/50">
                                    {Number(viewItem.washing_qty ?? 0) + (checkItemHasService(viewItem, "Washing") ? Number(viewItem.pending_qty ?? 0) : 0)}
                                </p>
                                <p className="col-span-2 text-center text-black/50">
                                    {Number(viewItem.pressing_qty ?? 0) + (checkItemHasService(viewItem, "Pressing") ? Number(viewItem.pending_qty ?? 0) : 0)}
                                </p>
                                <p className="col-span-2 text-center text-black/50">
                                    {Number(viewItem.dry_clean_qty ?? 0) + (checkItemHasService(viewItem, "Dry Clean") ? Number(viewItem.pending_qty ?? 0) : 0)}
                                </p>
                                <p className="col-span-1 text-center text-black/50">{viewItem.packing_qty ?? 0}</p>
                            </div>
                        </div>

                        <div className="mt-8 border-t border-black/10 pt-6">
                            <h4 className="text-xl font-bold text-primary mb-4 flex items-center gap-x-2">
                                <Icon icon="mdi:history" className="text-2xl" />
                                Status Update History
                            </h4>
                            <div className="max-h-48 overflow-y-auto flex flex-col gap-y-3 pr-2">
                                {viewItemLogs.length === 0 ? (
                                    <p className="text-black/40 text-base italic pl-2">No status history logged yet.</p>
                                ) : (
                                    viewItemLogs.map((log, index) => (
                                        <div key={index} className="flex items-start gap-x-3 bg-primary/5 border border-primary/10 rounded-xl p-3 shadow-sm hover:bg-primary/10 transition-colors">
                                            <Icon 
                                                icon={log.action === "Damage" ? "material-symbols:broken-image-outline" : log.action === "Packing" ? "material-symbols:package-2" : "mdi:circle-double"} 
                                                className={`text-lg mt-0.5 ${log.action === "Damage" ? "text-red-500" : "text-primary"}`} 
                                            />
                                            {log.action === "Damage" ? (
                                                <p className="text-base text-black/70 leading-relaxed">
                                                    At <span className="font-semibold text-black/85">{formatHistoryTimestamp(log.at)}</span>,{" "}
                                                    <span className="font-semibold text-primary">{log.user}</span> marked{" "}
                                                    <span className="font-bold text-black">{log.qty}</span> units of <span className="font-semibold">{log.product || viewItem?.corp_item_name || "item"}</span> as Damaged
                                                </p>
                                            ) : log.action === "Packing" ? (
                                                <p className="text-base text-black/70 leading-relaxed">
                                                    At <span className="font-semibold text-black/85">{formatHistoryTimestamp(log.at)}</span>,{" "}
                                                    <span className="font-semibold text-primary">{log.user}</span> marked{" "}
                                                    <span className="font-bold text-black">{log.qty}</span> units of <span className="font-semibold">{log.product || viewItem?.corp_item_name || "item"}</span> as packed
                                                </p>
                                            ) : (
                                                <p className="text-base text-black/70 leading-relaxed">
                                                    At <span className="font-semibold text-black/85">{formatHistoryTimestamp(log.at)}</span>,{" "}
                                                    <span className="font-semibold text-primary">{log.user}</span> moved{" "}
                                                    <span className="font-semibold text-black/90 bg-primary/10 px-2 py-0.5 rounded-full text-sm">{log.qty}</span> items from{" "}
                                                    <span className="font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-sm">{log.from}</span> to{" "}
                                                    <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-sm">{log.to}</span>
                                                </p>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="mt-12">
                            <button className="w-40 border border-primary text-primary rounded-full py-1.5 text-xl font-medium cursor-pointer" onClick={() => setViewItem(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {bulkStage && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl border border-black/5 p-10 relative">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-3xl font-bold text-primary flex items-center gap-x-2">
                                    <Icon icon="mdi:cached-circle" className="text-4xl animate-spin-slow" />
                                    Bulk Transfer - {bulkStage}
                                </h3>
                                <p className="text-black/40 text-lg font-medium mt-1 pl-2">
                                    Transfer all items in the "{bulkStage}" stage for Order ID: {orderLabel}
                                </p>
                            </div>
                            <button
                                className="size-12 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center cursor-pointer transition-colors"
                                onClick={() => {
                                    setBulkStage(null);
                                    setBulkItems([]);
                                }}
                            >
                                <Icon icon="mdi:close" className="text-primary text-2xl" />
                            </button>
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-black/10 mb-8">
                            <div className="grid grid-cols-12 bg-primary text-white font-semibold py-3 px-4 text-base sticky top-0">
                                <p className="col-span-6">ITEM / CATEGORY</p>
                                <p className="col-span-2 text-center">CURRENT QTY</p>
                                <p className="col-span-2 text-center">TRANSFER QTY</p>
                                <p className="col-span-2 text-center">NEW STATUS</p>
                            </div>

                            {bulkItems.map((item, index) => (
                                <div
                                    key={item.order_item_auto_id ?? index}
                                    className={`grid grid-cols-12 py-3 px-4 text-base items-center border-b border-black/5 ${
                                        index % 2 === 0 ? "bg-white" : "bg-primary/5"
                                    }`}
                                >
                                    <div className="col-span-6 flex flex-col pr-4">
                                        <p className="font-semibold text-black/80">
                                            {item.corp_item_name}
                                        </p>
                                        <p className="text-xs text-black/50 truncate font-medium">
                                            Category: {item.item_category_name}
                                        </p>
                                    </div>

                                    <p className="col-span-2 text-center font-bold text-lg text-black/70">
                                        {item.current_qty}
                                    </p>

                                    <div className="col-span-2 flex justify-center">
                                        <input
                                            type="number"
                                            min={0}
                                            max={item.current_qty}
                                            value={item.change_qty}
                                            onChange={(e) =>
                                                handleBulkItemQtyChange(item.order_item_auto_id, e.target.value)
                                            }
                                            className="w-20 rounded-full border border-black/20 text-center py-1 text-base font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                        />
                                    </div>

                                    <div className="col-span-2 flex justify-center">
                                        <select
                                            value={item.new_status}
                                            onChange={(e) =>
                                                handleBulkItemStatusChange(item.order_item_auto_id, e.target.value)
                                            }
                                            className="w-28 rounded-full border border-black/20 text-center py-1 px-2 text-sm font-semibold focus:outline-none focus:border-primary bg-white cursor-pointer"
                                        >
                                            <option value="Washing">Washing</option>
                                            <option value="Pressing">Pressing</option>
                                            <option value="Dry Clean">Dry Clean</option>
                                            <option value="Packing">Packing</option>
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end gap-x-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setBulkStage(null);
                                    setBulkItems([]);
                                }}
                                className="px-8 py-3 rounded-full border border-black/25 text-black/60 font-semibold hover:bg-black/5 transition-colors cursor-pointer text-lg"
                                disabled={isSendingBulk}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitBulkTransfer}
                                className="px-8 py-3 rounded-full bg-primary text-white font-semibold hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-x-2 cursor-pointer text-lg disabled:opacity-50"
                                disabled={isSendingBulk}
                            >
                                {isSendingBulk ? (
                                    <>
                                        <BeatLoader color="#FFFFFF" size={8} />
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    <>
                                        <Icon icon="mdi:send-circle" className="text-xl" />
                                        <span>Send Transfer</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorporateProductionServiceOrder;
