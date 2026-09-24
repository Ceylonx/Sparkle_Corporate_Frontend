import { useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import { markCorporateOrderItemsAsPacked } from "../../../services/corporate/PickupEntryServices";

const CorporateProductionPackingModal = ({ item, pickupEntryId, customerName, orderId, onClose, onSuccess }) => {
    const [packingQty, setPackingQty] = useState(item?.packing_qty || 0);
    const [damage, setDamage] = useState(0);
    const [rewashing, setRewashing] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Combined BOM materials (bom + return_bom) with per-material quantity inputs
    const [bomQty, setBomQty] = useState(() => {
        const init = {};
        (item?.corp_item_bom || []).forEach(b => {
            if (b?.raw_material_id) init[`bom_${b.raw_material_id}`] = b.row_material_used_quantity || 0;
        });
        (item?.corp_item_return_bom || []).forEach(b => {
            if (b?.raw_material_id) init[`ret_${b.raw_material_id}`] = b.row_material_used_quantity || 0;
        });
        return init;
    });

    // Get total_quantity from transfer_history (Packing transfer)
    const totalQtyFromHistory = (() => {
        const history = item?.transfer_history || [];
        const packingEntry = history.find(h => h?.go_to === "Packing");
        return packingEntry ? Number(packingEntry.transfered_qty) : Number(item?.corp_item_quantity || 0);
    })();

    const handleBomQtyChange = (key, value) => {
        setBomQty(prev => ({ ...prev, [key]: value === "" ? 0 : Number(value) }));
    };

    const handleSubmit = async () => {
        try {
            setIsSubmitting(true);
            setErrorMsg("");

            if (Number(packingQty) > Number(item?.packing_qty || 0)) {
                setErrorMsg(`Packing quantity cannot exceed remaining quantity (${item?.packing_qty || 0}).`);
                setIsSubmitting(false);
                return;
            }

            const usedBom = (item?.corp_item_bom || []).map(b => ({
                raw_material_id: b.raw_material_id,
                row_material_used_quantity: bomQty[`bom_${b.raw_material_id}`] ?? 0
            }));

            const usedReturnBom = (item?.corp_item_return_bom || []).map(b => ({
                raw_material_id: b.raw_material_id,
                row_material_used_quantity: bomQty[`ret_${b.raw_material_id}`] ?? 0
            }));

            const payload = {
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: pickupEntryId,
                items: [
                    {
                        corp_item_id: item.corp_item_id,
                        order_item_id: item.order_item_auto_id,
                        total_quantity: totalQtyFromHistory,
                        deliver_quantity: Number(packingQty),
                        damage_quantity: Number(damage),
                        rewashing_quantity: Number(rewashing),
                        used_corp_item_bom: usedBom,
                        used_corp_item_return_bom: usedReturnBom
                    }
                ]
            };

            await markCorporateOrderItemsAsPacked(payload);

            const isReWash = Number(packingQty) === 0 && Number(rewashing) > 0;
            await Swal.fire({
                icon: "success",
                title: isReWash ? "Moved to Re Wash" : "Marked as Packed",
                text: isReWash 
                    ? "Item moved back to re-wash successfully." 
                    : "Item marked as packed successfully.",
                confirmButtonColor: "#1470F9",
            });

            onSuccess && onSuccess();
            onClose();
        } catch (error) {
            console.error("Error marking as packed:", error);
            setErrorMsg("Failed to mark as packed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const itemLabel = `${item?.corp_item_name || ""}${item?.item_category_name ? ` ( ${item.item_category_name} )` : ""}`;
    const allBomItems = [
        ...(item?.corp_item_bom || []).map(b => ({ ...b, _key: `bom_${b.raw_material_id}`, _type: "bom" })),
        ...(item?.corp_item_return_bom || []).map(b => ({ ...b, _key: `ret_${b.raw_material_id}`, _type: "return_bom" })),
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            {/* Modal Card */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-8 flex flex-col gap-y-6 max-h-[90vh] overflow-y-auto">
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full p-2 transition-colors cursor-pointer"
                >
                    <Icon icon="mdi:close" className="size-5" />
                </button>

                {/* Title */}
                <div>
                    <h2 className="text-2xl font-bold text-primary">Packing Details / {orderId}</h2>
                    <p className="text-black/50 text-sm mt-0.5">{customerName}</p>
                </div>

                {/* Item row */}
                <div>
                    <div className="grid grid-cols-5 font-bold text-base mb-3 px-2">
                        <div className="col-span-2">Product Name</div>
                        <div>Remaining</div>
                        <div className="text-center">Packing Quantity</div>
                        <div className="text-center">Damage</div>
                    </div>
                    <div className="grid grid-cols-5 items-center px-2 gap-x-2">
                        <div className="col-span-2 text-sm font-medium text-black/70">{itemLabel}</div>
                        <div className="text-sm font-medium">{item?.packing_qty}</div>
                        <div>
                            <input
                                type="number"
                                min={0}
                                max={item?.packing_qty || 0}
                                value={packingQty}
                                onChange={e => {
                                    const val = e.target.value === "" ? "" : Number(e.target.value);
                                    if (val === "" || val <= (item?.packing_qty || 0)) {
                                        setPackingQty(e.target.value);
                                    }
                                }}
                                className="w-full text-center border border-gray-300 rounded-full py-1 text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div>
                            <input
                                type="number"
                                min={0}
                                value={damage}
                                onChange={e => setDamage(e.target.value)}
                                className="w-full text-center border border-gray-300 rounded-full py-1 text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                    </div>
                    {/* Re Washing as a second row */}
                    <div className="grid grid-cols-5 items-center px-2 mt-3 gap-x-2">
                        <div className="col-span-2 text-sm font-medium text-black/50">Re Washing</div>
                        <div />
                        <div />
                        <div>
                            <input
                                type="number"
                                min={0}
                                value={rewashing}
                                onChange={e => setRewashing(e.target.value)}
                                className="w-full text-center border border-gray-300 rounded-full py-1 text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                    </div>
                </div>

                {/* Packing Materials Table */}
                {allBomItems.length > 0 && (
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                        <div className="grid grid-cols-3 text-white font-semibold py-2.5 px-4 text-sm" style={{ backgroundColor: "#327ceaff" }}>
                            <div>PACKING MATERIALS</div>
                            <div className="text-center">QUANTITY</div>
                            <div>MATERIAL TYPE</div>
                        </div>
                        {allBomItems.map((mat, idx) => (
                            <div
                                key={idx}
                                className="grid grid-cols-3 items-center py-3 px-4 text-sm font-medium"
                                style={{ backgroundColor: idx % 2 === 0 ? "white" : "#EAF1FF" }}
                            >
                                <div>{mat.raw_material_name || "—"}</div>
                                <div className="flex justify-center">
                                    <input
                                        type="number"
                                        min={0}
                                        value={bomQty[mat._key] ?? 0}
                                        onChange={e => handleBomQtyChange(mat._key, e.target.value)}
                                        className="w-24 text-center border border-gray-300 rounded-full py-1 text-sm focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>{mat._type === "bom" ? "Non-Returnable" : "Returnable"}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Error */}
                {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}

                {/* Actions */}
                <div className="flex flex-row gap-x-4 mt-2">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 py-3 rounded-full border border-primary text-primary font-semibold text-base hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                        Back
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex-1 py-3 rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60"
                    >
                        {isSubmitting ? (
                            <BeatLoader color="#fff" size={8} />
                        ) : (Number(packingQty) === 0 && Number(rewashing) > 0) ? (
                            "Re Wash"
                        ) : (
                            "Mark as Packed"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CorporateProductionPackingModal;
