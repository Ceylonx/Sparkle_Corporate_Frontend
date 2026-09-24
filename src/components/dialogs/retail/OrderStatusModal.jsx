import { useEffect, useState } from "react";
import { trackOrderById, getAllBranches } from "../../../services/Retail/RetailOrderServices";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { getAllServiceTypes } from "../../../services/ServiceTypeServices";

const OrderStatusModal = ({ orderId, onClose }) => {
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [branches, setBranches] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);

    useEffect(() => {
        fetchBranches();
    }, []);

    useEffect(() => {
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        Promise.all([
            getAllItemTypes(userId).then((r) => r?.data?.item_types ?? []).catch(() => []),
            getAllServiceTypes().then((r) => r?.data?.service_types ?? []).catch(() => []),
        ]).then(([itemTypesList, serviceTypesList]) => {
            setItemTypes(Array.isArray(itemTypesList) ? itemTypesList : []);
            setServiceTypes(Array.isArray(serviceTypesList) ? serviceTypesList : []);
        });
    }, []);

    useEffect(() => {
        if (orderId) {
            fetchOrderStatus();
        }
    }, [orderId]);

    const fetchBranches = async () => {
        try {
            const response = await getAllBranches();
            const list = Array.isArray(response) ? response : response?.data ?? response?.branches ?? response?.results ?? [];
            setBranches(list);
        } catch (err) {
            console.error("Error fetching branches:", err);
        }
    };

    const fetchOrderStatus = async () => {
        setIsLoading(true);
        setError(null);
        const userId = localStorage.getItem("userId");
        if (!userId) {
            setError("Please log in to find order status.");
            setIsLoading(false);
            return;
        }
        try {
            const orderData = await trackOrderById({ user_id: userId, order_id: orderId });
            if (orderData) {
                const normalized = orderData.status == null && orderData.order_status != null
                    ? { ...orderData, status: orderData.order_status }
                    : orderData;
                setOrder(normalized);
            } else {
                setError("Order not found");
            }
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || "Please enter valid order ID");
            console.error("Error fetching order status:", err);
        } finally {
            setIsLoading(false);
        }
    };

    // price per item = (price * quantity) / group_count
    // group_count = number of items sharing the same item_id
    const pricePerItem = (item) => {
        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);
        const allItems = order?.items || [];
        const groupCount = allItems.filter(i => i.item_id === item.item_id).length || 1;
        return (price * quantity) / groupCount;
    };

    // Normalize API flags (may come as 1, "1", true or 0, "0", null)
    const isOn = (v) => v === 1 || v === "1" || v === true || (typeof v === "string" && v.toLowerCase() === "true");

    const getItemStatus = (item) => {
        if (!item) return "—";
        const statusStr = item.status != null ? String(item.status).trim() : "";
        const statusLower = statusStr.toLowerCase();
        if (statusLower === "invoiced") {
            return "Already Invoiced Order";
        }
        const receivedBackToOutlet = isOn(item.is_recived_to_back_to_outlet);
        const sendToBackToOutlet = isOn(item.is_send_to_back_to_outlet);
        const receivedToProduction = isOn(item.is_recived_to_production);
        const sendToProduction = isOn(item.is_send_to_production);

        if (receivedBackToOutlet) return "Pending Invoiced Order";
        if (sendToBackToOutlet) return "Outlet Received Note (Outlet)";
        if (receivedToProduction) return "Outlet Dispatch Note (Plant)";
        if (sendToProduction) return "Receive to Sorting (Plant)";
        if (statusLower === "pending_production") return "Receive to Sorting (Plant)";
        return "Outlet Transfer Note (Outlet)";
    };

    const getOrderStatusDisplay = (order) => {
        if (!order) return "Outlet Transfer Note (Outlet)";
        const orderStatus = order.status != null ? String(order.status).trim().toLowerCase() : "";
        if (orderStatus === "invoiced") {
            return "Already Invoiced Order";
        }
        if (!order.items || order.items.length === 0) {
            return "Outlet Transfer Note (Outlet)";
        }

        const items = order.items;
        const statuses = items.map((item) => getItemStatus(item));

        const allSameStatus = statuses.every((s) => s === statuses[0]);
        let status = allSameStatus
            ? statuses[0]
            : statuses.includes("Already Invoiced Order")
                ? "Already Invoiced Order"
                : statuses.includes("Pending Invoiced Order")
                ? "Pending Invoiced Order"
                : statuses.includes("Outlet Received Note (Outlet)")
                    ? "Outlet Received Note"
                    : statuses.includes("Outlet Dispatch Note (Plant)")
                        ? "Outlet Dispatch Note"
                        : statuses.includes("Receive to Sorting (Plant)")
                            ? "Receive to Sorting"
                            : "Outlet Transfer Note";

        if (status === "Already Invoiced Order") {
            return "Already Invoiced Order";
        }
        if (status === "Receive to Sorting" || status === "Outlet Dispatch Note") {
            return `${status} (Plant)`;
        }
        if (status === "Outlet Received Note" || status === "Ready to Invoice" || status === "Outlet Transfer Note") {
            return `${status} (Outlet)`;
        }
        return status;
    };

    const getProgressStage = (order) => {
        if (!order) return 0;
        const orderStatus = order.status != null ? String(order.status).trim().toLowerCase() : "";
        if (orderStatus === "invoiced") return 5;
        if (!order.items || order.items.length === 0) return 0;

        const items = order.items;
        const allItemsInvoiced = items.every((item) => {
            const s = item.status != null ? String(item.status).trim().toLowerCase() : "";
            return s === "invoiced";
        });
        if (allItemsInvoiced) return 5;

        const allReceivedBackToOutlet = items.every((item) => isOn(item.is_recived_to_back_to_outlet));
        const allSentBackToOutlet = items.every((item) => isOn(item.is_send_to_back_to_outlet));
        const allReceivedToProduction = items.every((item) => isOn(item.is_recived_to_production));
        const someInSorting = items.some((item) => isOn(item.is_send_to_production));

        if (allReceivedBackToOutlet) return 4;
        if (allSentBackToOutlet) return 3;
        if (allReceivedToProduction) return 2;
        if (someInSorting) return 1;
        return 0;
    };

    const progressStages = [
        "Outlet Transfer Note",
        "Receive to Sorting",
        "Outlet Dispatch Note",
        "Outlet Received Note",
        "Ready to Invoice",
        "Already Invoiced Order"
    ];

    const formatDate = (dateString) => {
        if (!dateString) return "—";
        const date = new Date(dateString);
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    };

    const getBranchName = (branchId) => {
        if (!branchId) return "—";
        const branch = branches.find(b => String(b.branch_id || b.id || b.branchId) === String(branchId));
        return branch ? (branch.branch_name || branch.name || branch.branchName) : `Branch ${branchId}`;
    };

    const truncateToTwo = (num) => {
        return Math.floor(num * 100) / 100;
    };

    if (!orderId) return null;

    return (
        <>
            <div className="fixed z-50 top-0 left-0 bg-black/50 w-screen h-screen" onClick={onClose}></div>
            <div className="fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-[90%] max-w-4xl max-h-[90vh] overflow-y-auto">
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <p className="text-lg text-black/50">Loading order status...</p>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center py-20 px-5">
                        <p className="text-lg text-red-500 mb-4">{error}</p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80"
                        >
                            Close
                        </button>
                    </div>
                )}

                {order && !isLoading && (
                    <div className="p-6">
                        {/* Order Status Section */}
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-black mb-4">Order Status</h2>
                            <div className="flex gap-16">
                                {/* Left column */}
                                <div className="space-y-3 flex-1">
                                    <div className="flex gap-4">
                                        <span className="text-black/70 min-w-[140px] shrink-0">Order ID</span>
                                        <span className="font-bold text-black">{order.order_id || "—"}</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="text-black/70 min-w-[140px] shrink-0">Created Outlet</span>
                                        <span className="font-bold text-black">{getBranchName(order.branch_id)}</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="text-black/70 min-w-[140px] shrink-0">Collection Date</span>
                                        <span className="font-bold text-black">{formatDate(order.created_at)}</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="text-black/70 min-w-[140px] shrink-0">Delivery Outlet</span>
                                        <span className="font-bold text-black">{order.delivery_outlet || "—"}</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="text-black/70 min-w-[140px] shrink-0">Delivery Date</span>
                                        <span className="font-bold text-black">{formatDate(order.delivery_date)}</span>
                                    </div>
                                </div>
                                {/* Right column */}
                                <div className="flex flex-1 justify-end">
                                    <div className="space-y-3">
                                        <div className="flex gap-4">
                                            <span className="text-black/70 min-w-[140px] shrink-0">Total Amount</span>
                                            <span className="font-bold text-black">Rs {Number(order.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <span className="text-black/70 min-w-[140px] shrink-0">Advance Payment</span>
                                            <span className="font-bold text-black">Rs {Number(order.advance_payment ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <span className="text-black/70 min-w-[140px] shrink-0">Remaining Amount</span>
                                            <span className="font-bold text-black">Rs {Number(order.remaining_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <span className="text-black/70 min-w-[140px] shrink-0">Status</span>
                                            <span className="font-bold text-black">{progressStages[getProgressStage(order)]}</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <span className="text-black/70 min-w-[140px] shrink-0">Order Status</span>
                                            <span className={`font-bold ${order.status === "Deactive" ? "text-red-600" : order.status === "Active" ? "text-green-600" : "text-black"}`}>
                                                {order.status === "Deactive" ? "CANCELLED" : order.status === "Active" ? "ACTIVE" : (order.status || "—")}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Order Items Section */}
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-black mb-4">Order Items</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-primary text-white">
                                            <th className="px-4 py-3 text-left font-semibold">ITEM TYPE</th>
                                            <th className="px-4 py-3 text-left font-semibold">COLOR</th>
                                            <th className="px-4 py-3 text-left font-semibold">BRAND</th>
                                            {/* <th className="px-4 py-3 text-left font-semibold">REMARK</th> */}
                                            <th className="px-4 py-3 text-left font-semibold">PACKING</th>
                                            <th className="px-4 py-3 text-left font-semibold">PCS</th>
                                            <th className="px-4 py-3 text-left font-semibold">SERVICE</th>
                                            <th className="px-4 py-3 text-left font-semibold">STATUS</th>
                                            <th className="px-4 py-3 text-left font-semibold">PRICE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {order.items && order.items.length > 0 ? (
                                            order.items.map((item, index) => (
                                                <tr key={item.service_item_id || index} className={index % 2 === 0 ? "bg-blue-50" : "bg-blue-100"}>
                                                    <td className="px-4 py-3 text-black">{item.item_type_name ?? itemTypes?.find((t) => String(t.item_type_id) === String(item.item_type_id))?.item_type_name ?? "—"}</td>
                                                    <td className="px-4 py-3 text-black">{item.color || "—"}</td>
                                                    <td className="px-4 py-3 text-black">{item.brand || "—"}</td>
                                                    {/* <td className="px-4 py-3 text-black">{item.remark || "—"}</td> */}
                                                    <td className="px-4 py-3 text-black">{item.packing_option || "—"}</td>
                                                    {/* <td className="px-4 py-3 text-black">{Math.max(0, Number(item.quantity ?? item.qty ?? 1) || 1)}</td> */}
                                                    <td className="px-4 py-3 text-black">1</td>
                                                    <td className="px-4 py-3 text-black">{item.service_type_name ?? serviceTypes?.find((t) => String(t.service_type_id) === String(item.service_type_id))?.service_type_name ?? "—"}</td>
                                                    <td className="px-4 py-3 text-black">{progressStages[getProgressStage(order)]}</td>
                                                    <td className="px-4 py-3 text-black">Rs {truncateToTwo(pricePerItem(item)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="9" className="px-4 py-3 text-center text-black/50">No items found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Order Progress Tracker */}
                        <div className="mb-4">
                            <h2 className="text-2xl font-bold text-black mb-4">Order Progress</h2>
                            <div className="relative flex items-center py-4">
                                {/* Background line */}
                                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-300 transform -translate-y-1/2"></div>
                                
                                {/* Completed line */}
                                {(() => {
                                    const currentStage = getProgressStage(order);
                                    const totalStages = progressStages.length;
                                    const isLastStage = currentStage >= totalStages - 1;
                                    const lineWidth = totalStages > 0
                                        ? (isLastStage ? 100 : ((currentStage * 2 + 1) / (totalStages * 2)) * 100)
                                        : 0;
                                    return (
                                        <div 
                                            className="absolute top-1/2 left-0 h-0.5 bg-primary transform -translate-y-1/2 z-0"
                                            style={{ width: `${lineWidth}%` }}
                                        ></div>
                                    );
                                })()}

                                {progressStages.map((stage, index) => {
                                    const currentStage = getProgressStage(order);
                                    const isCompleted = index <= currentStage;
                                    const isCurrent = index === currentStage;

                                    return (
                                        <div key={index} className="flex flex-col items-center flex-1 relative z-10">
                                            <div className={`w-3 h-3 rounded-full ${isCompleted ? "bg-primary" : "bg-gray-300"} ${isCurrent ? "ring-2 ring-primary ring-offset-1" : ""}`}></div>
                                            <span className={`text-xs mt-2 text-center whitespace-nowrap ${isCompleted ? "text-primary font-semibold" : "text-gray-400"}`}>
                                                {stage}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Close Button */}
                        <div className="flex justify-end mt-6">
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default OrderStatusModal;
