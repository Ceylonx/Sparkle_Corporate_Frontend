import { useEffect, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import { getCorporateInPackingPickupEntryById, markCorporateOrderItemsAsPacked } from "../../../services/corporate/PickupEntryServices";
import CorporateProductionPackingModal from "../../../components/dialogs/corporate/CorporateProductionPackingModal";

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

const CorporateProductionPacking = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [isLoading, setIsLoading] = useState(false);
    const [packingData, setPackingData] = useState(null);
    const [inputValues, setInputValues] = useState({});
    const [selectedItemForPacking, setSelectedItemForPacking] = useState(null);

    const [showBulkPacking, setShowBulkPacking] = useState(false);
    const [bulkPackingItems, setBulkPackingItems] = useState([]);
    const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
    const [expandedItems, setExpandedItems] = useState({});

    const toggleItemExpanded = (itemId) => {
        setExpandedItems(prev => ({
            ...prev,
            [itemId]: !prev[itemId]
        }));
    };

    const handleOpenBulkPackingModal = () => {
        const items = packingData?.items || [];
        const remainingItems = items.filter(item => Number(item.packing_qty) > 0);
        
        if (remainingItems.length === 0) {
            Swal.fire({
                icon: "info",
                title: "No remaining items",
                text: "All items in this order are already packed.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }

        const formatted = remainingItems.map(item => {
            const history = item?.transfer_history || [];
            const packingEntry = history.find(h => h?.go_to === "Packing");
            const totalQtyFromHistory = packingEntry ? Number(packingEntry.transfered_qty) : Number(item?.corp_item_quantity || 0);

            // Initialize manual BOM quantities to 0
            const bomQty = {};
            (item.corp_item_bom || []).forEach(b => {
                if (b?.raw_material_id) bomQty[`bom_${b.raw_material_id}`] = 0;
            });
            (item.corp_item_return_bom || []).forEach(b => {
                if (b?.raw_material_id) bomQty[`ret_${b.raw_material_id}`] = 0;
            });

            return {
                ...item,
                packingQty: item.packing_qty,
                damageQty: 0,
                rewashQty: 0,
                totalQtyFromHistory,
                bomQty
            };
        });

        setBulkPackingItems(formatted);
        setShowBulkPacking(true);
    };

    const handleBulkItemInputChange = (itemId, field, value) => {
        setBulkPackingItems(prev => prev.map(item => {
            if (item.order_item_auto_id === itemId) {
                return {
                    ...item,
                    [field]: value === "" ? "" : Number(value)
                };
            }
            return item;
        }));
    };

    const handleBulkItemBomQtyChange = (itemId, rawMaterialKey, value) => {
        setBulkPackingItems(prev => prev.map(item => {
            if (item.order_item_auto_id === itemId) {
                return {
                    ...item,
                    bomQty: {
                        ...item.bomQty,
                        [rawMaterialKey]: value === "" ? 0 : Number(value)
                    }
                };
            }
            return item;
        }));
    };

    const handleSubmitBulkPacking = async () => {
        try {
            setIsSubmittingBulk(true);

            // Filter out items with no updates
            const itemsToPack = bulkPackingItems.filter(
                item => Number(item.packingQty) > 0 || Number(item.damageQty) > 0 || Number(item.rewashQty) > 0
            );

            if (itemsToPack.length === 0) {
                await Swal.fire({
                    icon: "warning",
                    title: "No inputs provided",
                    text: "Please specify Packing, Damage, or Re-Wash quantities for at least one item.",
                    confirmButtonColor: "#1470F9"
                });
                setIsSubmittingBulk(false);
                return;
            }

            // Validations
            for (const item of itemsToPack) {
                const p = Number(item.packingQty || 0);
                const d = Number(item.damageQty || 0);
                const r = Number(item.rewashQty || 0);
                const limit = Number(item.packing_qty || 0);

                if (p < 0 || d < 0 || r < 0) {
                    await Swal.fire({
                        icon: "warning",
                        title: "Invalid quantities",
                        text: `Quantities cannot be negative for "${item.corp_item_name}".`,
                        confirmButtonColor: "#1470F9"
                    });
                    setIsSubmittingBulk(false);
                    return;
                }

                if (p + d + r > limit) {
                    await Swal.fire({
                        icon: "warning",
                        title: "Exceeded quantity limit",
                        text: `Total Packing, Damage, and Re-Wash quantities for "${item.corp_item_name}" (${p + d + r}) cannot exceed the remaining quantity (${limit}).`,
                        confirmButtonColor: "#1470F9"
                    });
                    setIsSubmittingBulk(false);
                    return;
                }
            }

            // Prepare payload with manual BOM arrays
            const payloadItems = itemsToPack.map(item => {
                const pQty = Number(item.packingQty || 0);

                const usedBom = (item.corp_item_bom || []).map(b => ({
                    raw_material_id: b.raw_material_id,
                    row_material_used_quantity: Number(item.bomQty[`bom_${b.raw_material_id}`] ?? 0)
                }));

                const usedReturnBom = (item.corp_item_return_bom || []).map(b => ({
                    raw_material_id: b.raw_material_id,
                    row_material_used_quantity: Number(item.bomQty[`ret_${b.raw_material_id}`] ?? 0)
                }));

                return {
                    corp_item_id: item.corp_item_id,
                    order_item_id: item.order_item_auto_id,
                    total_quantity: item.totalQtyFromHistory,
                    deliver_quantity: pQty,
                    damage_quantity: Number(item.damageQty || 0),
                    rewashing_quantity: Number(item.rewashQty || 0),
                    used_corp_item_bom: usedBom,
                    used_corp_item_return_bom: usedReturnBom
                };
            });

            const payload = {
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: id,
                items: payloadItems
            };

            await markCorporateOrderItemsAsPacked(payload);

            await Swal.fire({
                icon: "success",
                title: "Bulk Packing Success",
                text: "Selected items have been packed successfully.",
                confirmButtonColor: "#1470F9"
            });

            setShowBulkPacking(false);
            setBulkPackingItems([]);
            fetchPackingData();
        } catch (error) {
            console.error("Error bulk packing items:", error);
            await Swal.fire({
                icon: "error",
                title: "Bulk Packing Failed",
                text: "Failed to mark items as packed. Please try again.",
                confirmButtonColor: "#1470F9"
            });
        } finally {
            setIsSubmittingBulk(false);
        }
    };

    const fetchPackingData = async () => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: id
            };
            const response = await getCorporateInPackingPickupEntryById(payload);
            const data = response?.data?.packing_pickup_entry;
            
            const allPacked = !data || (data?.items || []).length === 0 || (data?.items || []).every(item => Number(item.packing_qty || 0) === 0);
            if (allPacked) {
                navigate("/salesCorporate/corporate/production", { state: { tab: "packing" } });
            } else {
                setPackingData(data);
            }
            
            // Initialize input values
            const initialInputs = {};
            if (data?.items) {
                data.items.forEach(item => {
                    initialInputs[item.order_item_auto_id] = {
                        packed: item.packing_qty, // Defaulting to packing quantity for convenience
                        damage: 0,
                        rewashing: 0
                    };
                });
            }
            setInputValues(initialInputs);
        } catch (error) {
            console.error("Error fetching packing data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPackingData();
    }, [id]);

    const handleInputChange = (itemId, field, value) => {
        setInputValues(prev => ({
            ...prev,
            [itemId]: {
                ...prev[itemId],
                [field]: value === "" ? "" : Number(value)
            }
        }));
    };

    const aggregatedBOM = Array.isArray(packingData?.items) ? packingData.items.reduce((acc, item) => {
        const returnBom = Array.isArray(item?.corp_item_return_bom) ? item.corp_item_return_bom : [];
        const normalBom = Array.isArray(item?.corp_item_bom) ? item.corp_item_bom : [];
        
        returnBom.forEach(b => {
            if (!b) return;
            const key = `${b.raw_material_id}_returnable`;
            if (!acc[key]) {
                acc[key] = { ...b, total_assigned: 0, total_used: 0, is_returnable: true };
            }
            acc[key].total_assigned += Number(b.row_material_assigned_quantity || 0);
            acc[key].total_used += Number(b.row_material_used_quantity || 0);
        });

        normalBom.forEach(b => {
            if (!b) return;
            const key = `${b.raw_material_id}_non_returnable`;
            if (!acc[key]) {
                acc[key] = { ...b, total_assigned: 0, total_used: 0, is_returnable: false };
            }
            acc[key].total_assigned += Number(b.row_material_assigned_quantity || 0);
            acc[key].total_used += Number(b.row_material_used_quantity || 0);
        });

        return acc;
    }, {}) : {};
    
    const packingMaterials = Object.values(aggregatedBOM);
    
    // Aggregating Packing Log
    const packingLogs = Array.isArray(packingData?.items) ? packingData.items.flatMap(item => {
        let logArray = [];
        if (typeof item.status_activity_log === 'string') {
            try {
                logArray = JSON.parse(item.status_activity_log);
            } catch (_) {
                logArray = [];
            }
        } else if (Array.isArray(item.status_activity_log)) {
            logArray = item.status_activity_log;
        }
        
        return logArray.filter(Boolean).map(log => ({
            ...log,
            product_name: `${item.corp_item_name} ${item.item_category_name ? `(${item.item_category_name})` : ""}`
        }));
    }) : [];

    // Sort in descending order (newest first) based on 'at' timestamp
    const sortedLogs = packingLogs.sort((a, b) => new Date(b.at) - new Date(a.at));

    return (
        <div className="flex flex-col gap-y-7">
            {/* Header */}
            <div className="flex flex-row gap-x-3 items-center justify-between">
                <div className="flex flex-row items-center gap-x-3">
                    <HiOutlineArrowCircleLeft className="size-8 text-primary cursor-pointer" onClick={() => navigate(-1)} />
                    <h1 className="text-3xl text-primary font-bold">Production / Packing / {id}</h1>
                </div>
                {/* <div className="text-2xl text-black/70">
                    Order ID : <span className="text-black">{id}</span>
                </div> */}
            </div>
            <p className="text-black/50 text-xl -mt-5">Record new laundry pickup with item counts by category</p>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <BeatLoader color="#1470F9" />
                </div>
            ) : packingData ? (
                <>
                    {/* Customer Info Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-y-4 shadow-sm w-full">
                        <h2 className="text-xl font-bold">Customer Information</h2>
                        <div className="grid grid-cols-5 items-center">
                            <div className="col-span-1 flex flex-row items-center gap-x-4">
                                <div className="bg-primary/20 text-primary p-2 rounded-full">
                                    <Icon icon="lucide:user" className="size-6" />
                                </div>
                                <div className="flex flex-col text-sm font-medium">
                                    <span className="text-black font-semibold text-base">{packingData.customer_company_name}</span>
                                    <span className="text-black/50">{packingData.customer_id || "—"}</span>
                                </div>
                            </div>
                            <div className="col-span-1 text-sm font-medium">{packingData.customer_address || "—"}</div>
                            <div className="col-span-1 text-sm font-medium">{packingData.customer_phone || "—"}</div>
                            <div className="col-span-1 text-sm font-medium">
                                {packingData.created_at && !isNaN(new Date(packingData.created_at).getTime()) 
                                    ? new Date(packingData.created_at).toISOString().split('T')[0].replace(/-/g, '/') 
                                    : "—"}
                            </div>
                            <div className="col-span-1"></div>
                        </div>
                    </div>

                    <div className="flex flex-row justify-between items-center w-full mt-4 -mb-2 px-2">
                        <h2 className="text-2xl font-bold text-primary">Items to Pack</h2>
                        <button
                            onClick={() => handleOpenBulkPackingModal()}
                            className="bg-primary text-white font-semibold px-6 py-2 rounded-full hover:bg-primary/95 transition-all cursor-pointer flex items-center gap-x-2 text-base shadow-sm shadow-primary/25"
                        >
                            <Icon icon="material-symbols:package-2" className="text-xl" />
                            <span>Bulk Packing</span>
                        </button>
                    </div>

                    {/* Items Table */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col w-full">
                        <div className="grid grid-cols-8 mb-2 px-2 text-lg font-semibold border-b border-blue-200 pb-2">
                            <div className="col-span-3">Item Name</div>
                            <div className="col-span-1">Quantity</div>
                            <div className="col-span-1">Packed</div>
                            <div className="col-span-2">Remaining</div>
                            <div className="col-span-1 text-center">Action</div>
                        </div>
                        
                        {(Array.isArray(packingData?.items) ? packingData.items.filter(item => Number(item.packing_qty) > 0) : []).map((item, idx) => {
                            if (!item) return null;
                            const status = String(item.production_status || "").toLowerCase();
                            const isPacked = status === "completed" || status === "packed" || Number(item.packing_qty) === 0;
                            
                            return (
                                <div key={idx} className="grid grid-cols-8 items-center px-2 py-3 border-b border-gray-100 last:border-0 text-base">
                                    <div className="col-span-3 text-black/70 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                                        {item.corp_item_name} {item.item_category_name ? `( ${item.item_category_name} )` : ""}
                                    </div>
                                    <div className="col-span-1 font-medium text-black/70">
                                        {item.corp_item_quantity}
                                    </div>
                                    <div className="col-span-1 font-medium text-black/70">
                                        {item.final_packed_qty ?? 0}
                                    </div>
                                    <div className="col-span-2 font-medium text-black/70">
                                        {item.packing_qty}
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        {isPacked ? (
                                            <div className="flex flex-col items-center">
                                                <Icon icon="mdi:check-circle" className="text-green-500 text-xl" />
                                                <span className="text-[10px] text-green-600 font-semibold mt-1">All Packed</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setSelectedItemForPacking(item)}
                                                className="flex flex-col items-center cursor-pointer hover:opacity-80"
                                            >
                                                <Icon icon="ic:round-archive" className="text-blue-500 text-xl" />
                                                <span className="text-[10px] text-black/50 font-semibold mt-1">Packing</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Packing Material Table */}
                    <div className="flex flex-col w-full">
                        <h2 className="text-2xl font-bold text-primary mb-4">Packing Material Table</h2>
                        <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
                            <div className="grid grid-cols-4 text-white font-semibold py-3 px-6 text-sm" style={{ backgroundColor: "#327ceaff" }}>
                                <div>PACKING MATERIALS</div>
                                <div>QUANTITY</div>
                                <div>MATERIAL TYPE</div>
                                <div>USED QUANTITY</div>
                            </div>
                            {packingMaterials.length > 0 ? packingMaterials.map((mat, idx) => (
                                <div key={idx} className="grid grid-cols-4 py-4 px-6 text-sm font-medium" style={{ backgroundColor: idx % 2 === 0 ? "white" : "#EAF1FF" }}>
                                    <div>{mat.raw_material_name || "—"}</div>
                                    <div className="font-bold">{mat.total_assigned || 0}</div>
                                    <div>{mat.is_returnable ? 'Returnable' : 'Non Returnable'}</div>
                                    <div className="font-bold">{mat.total_used || 0}</div>
                                </div>
                            )) : (
                                <div className="py-4 px-6 text-sm text-center text-gray-500">No packing materials defined.</div>
                            )}
                        </div>
                    </div>

                    {/* Activity Logs */}
                    <div className="flex flex-col w-full mb-10">
                        <h2 className="text-2xl font-bold text-primary mb-4">Activity Logs</h2>
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-y-4 shadow-sm">
                            {sortedLogs.length > 0 ? (
                                <div className="flex flex-col gap-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {sortedLogs.map((log, idx) => {
                                        const isPacking = log.action === "Packing";
                                        const isDamage = log.action === "Damage";
                                        
                                        return (
                                            <div key={idx} className="flex items-start gap-x-4 p-4 bg-primary/5 border border-primary/10 rounded-xl hover:bg-primary/10 transition-colors">
                                                <div className={`p-2.5 rounded-full flex items-center justify-center ${isDamage ? "bg-red-100 text-red-600" : isPacking ? "bg-primary/20 text-primary" : "bg-orange-100 text-orange-600"}`}>
                                                    {isDamage ? (
                                                        <Icon icon="material-symbols:broken-image-outline" className="size-6" />
                                                    ) : isPacking ? (
                                                        <Icon icon="material-symbols:package-2" className="size-6" />
                                                    ) : (
                                                        <Icon icon="mdi:swap-horizontal" className="size-6" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-y-0.5 text-base">
                                                    {isDamage ? (
                                                        <p className="text-black/80 font-medium">
                                                            <span className="font-bold text-primary">{log.user || "User"}</span> marked <span className="font-bold text-black">{log.qty}</span> units of <span className="font-semibold">{log.product_name || log.product}</span> as Damaged
                                                        </p>
                                                    ) : isPacking ? (
                                                         <p className="text-black/80 font-medium">
                                                             <span className="font-bold text-primary">{log.user || "User"}</span> marked <span className="font-bold text-black">{log.qty}</span> units of <span className="font-semibold">{log.product_name || log.product}</span> as packed
                                                         </p>
                                                    ) : (
                                                        <p className="text-black/80 font-medium">
                                                            <span className="font-bold text-primary">{log.user || "User"}</span> moved <span className="font-bold text-black">{log.qty}</span> units of <span className="font-semibold">{log.product_name}</span> from <span className="font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-sm">{log.from}</span> to <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-sm">{log.to}</span>
                                                        </p>
                                                    )}
                                                    <span className="text-sm text-black/40 font-semibold">{formatHistoryTimestamp(log.at)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="py-10 text-center text-gray-500 text-lg">No activities recorded yet.</div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="text-center py-20 text-gray-500">
                    Failed to fetch data for Order ID: {id}
                </div>
            )}

            {/* Packing Modal */}
            {selectedItemForPacking && (
                <CorporateProductionPackingModal
                    item={selectedItemForPacking}
                    pickupEntryId={id}
                    orderId={id}
                    customerName={packingData?.customer_company_name || ""}
                    onClose={() => setSelectedItemForPacking(null)}
                    onSuccess={() => {
                        setSelectedItemForPacking(null);
                        fetchPackingData();
                    }}
                />
            )}

            {/* Bulk Packing Modal */}
            {showBulkPacking && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBulkPacking(false)} />

                    {/* Modal Card */}
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 p-8 flex flex-col gap-y-6 max-h-[90vh] overflow-y-auto">
                        {/* Close button */}
                        <button
                            onClick={() => setShowBulkPacking(false)}
                            className="absolute top-4 right-4 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full p-2 transition-colors cursor-pointer"
                        >
                            <Icon icon="mdi:close" className="size-5" />
                        </button>

                        {/* Title */}
                        <div>
                            <h2 className="text-2xl font-bold text-primary">Bulk Packing / {id}</h2>
                            <p className="text-black/50 text-sm mt-0.5">{packingData?.customer_company_name}</p>
                        </div>

                        {/* Table */}
                        <div className="rounded-xl overflow-hidden border border-gray-200">
                            <div className="grid grid-cols-12 bg-primary text-white font-semibold py-3 px-4 text-sm sticky top-0">
                                <div className="col-span-1 text-center">BOM</div>
                                <div className="col-span-3">PRODUCT NAME</div>
                                <div className="col-span-2 text-center">REMAINING QTY</div>
                                <div className="col-span-2 text-center">PACKING QTY</div>
                                <div className="col-span-2 text-center">DAMAGE QTY</div>
                                <div className="col-span-2 text-center">RE-WASH QTY</div>
                            </div>

                            <div className="max-h-[40vh] overflow-y-auto">
                                {bulkPackingItems.map((item, idx) => (
                                    <div key={item.order_item_auto_id ?? idx} className="border-b border-gray-100 last:border-0">
                                        <div
                                            className="grid grid-cols-12 items-center py-3 px-4 text-sm font-medium"
                                            style={{ backgroundColor: idx % 2 === 0 ? "white" : "#EAF1FF" }}
                                        >
                                            {/* Expand/Collapse Chevron */}
                                            <div className="col-span-1 flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleItemExpanded(item.order_item_auto_id)}
                                                    className="p-1 rounded-full hover:bg-black/10 transition-colors cursor-pointer text-gray-500"
                                                >
                                                    <Icon
                                                        icon={expandedItems[item.order_item_auto_id] ? "mdi:chevron-up" : "mdi:chevron-down"}
                                                        className="text-xl"
                                                    />
                                                </button>
                                            </div>

                                            <div className="col-span-3 text-black/70 pr-2">
                                                {item.corp_item_name} {item.item_category_name ? `(${item.item_category_name})` : ""}
                                            </div>
                                            <div className="col-span-2 text-center font-bold text-black/60">
                                                {item.packing_qty}
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={item.packing_qty}
                                                    value={item.packingQty}
                                                    onChange={e => handleBulkItemInputChange(item.order_item_auto_id, 'packingQty', e.target.value)}
                                                    className="w-20 text-center border border-gray-300 rounded-full py-1 text-xs font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                                                />
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={item.damageQty}
                                                    onChange={e => handleBulkItemInputChange(item.order_item_auto_id, 'damageQty', e.target.value)}
                                                    className="w-20 text-center border border-gray-300 rounded-full py-1 text-xs font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                                                />
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={item.rewashQty}
                                                    onChange={e => handleBulkItemInputChange(item.order_item_auto_id, 'rewashQty', e.target.value)}
                                                    className="w-20 text-center border border-gray-300 rounded-full py-1 text-xs font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                                                />
                                            </div>
                                        </div>

                                        {/* Material Sub-Table */}
                                        {expandedItems[item.order_item_auto_id] && (
                                            <div className="pl-14 pr-8 py-3 bg-gray-50 border-t border-b border-gray-200">
                                                <div className="text-xs font-bold text-gray-500 mb-2 tracking-wider">PACKING MATERIALS (BOM)</div>
                                                <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                                                    <div className="grid grid-cols-3 bg-gray-100 text-gray-600 font-bold py-1.5 px-4 text-[11px]">
                                                        <div>MATERIAL NAME</div>
                                                        <div>MATERIAL TYPE</div>
                                                        <div className="text-right pr-6">USED QUANTITY</div>
                                                    </div>
                                                    
                                                    {(() => {
                                                        const materials = [
                                                            ...(item.corp_item_bom || []).map(b => ({ ...b, _key: `bom_${b.raw_material_id}`, type: "Non-Returnable" })),
                                                            ...(item.corp_item_return_bom || []).map(b => ({ ...b, _key: `ret_${b.raw_material_id}`, type: "Returnable" }))
                                                        ];
                                                        
                                                        if (materials.length === 0) {
                                                            return <div className="py-2 px-4 text-xs text-gray-400 italic text-center">No materials defined.</div>;
                                                        }
                                                        
                                                        return materials.map((m, mIdx) => {
                                                            return (
                                                                <div key={mIdx} className="grid grid-cols-3 items-center py-2 px-4 text-xs border-t border-gray-200 text-gray-600">
                                                                    <div>{m.raw_material_name || "—"}</div>
                                                                    <div>{m.type}</div>
                                                                    <div className="text-right">
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            value={item.bomQty[m._key] ?? 0}
                                                                            onChange={e => handleBulkItemBomQtyChange(item.order_item_auto_id, m._key, e.target.value)}
                                                                            className="w-24 text-center border border-gray-300 rounded-full py-0.5 text-[11px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white font-semibold inline-block"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-row gap-x-4 mt-2">
                            <button
                                onClick={() => setShowBulkPacking(false)}
                                disabled={isSubmittingBulk}
                                className="flex-1 py-3 rounded-full border border-primary text-primary font-semibold text-base hover:bg-primary/5 transition-colors cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleSubmitBulkPacking}
                                disabled={isSubmittingBulk}
                                className="flex-1 py-3 rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-x-2 shadow-lg shadow-primary/20"
                            >
                                {isSubmittingBulk ? (
                                    <>
                                        <BeatLoader color="#fff" size={8} />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Icon icon="mdi:check-circle" className="text-xl" />
                                        <span>Mark as Packed</span>
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

export default CorporateProductionPacking;
