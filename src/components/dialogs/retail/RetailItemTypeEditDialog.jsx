import { Icon } from "@iconify/react/dist/iconify.js";
import { useState } from "react";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import { updateItemType } from "../../../services/Retail/RetailSettingsServices";
import ConfirmationDialog from "../ConfirmationDialog";

const RetailItemTypeEditDialog = ({ itemType, onClose, onSaved }) => {
    const parts = (itemType?.item_type_name || '').split(' - ');
    const initialCode = parts.length > 1 ? parts[parts.length - 1] : '';
    const initialName = parts.length > 1 ? parts.slice(0, -1).join(' - ') : (itemType?.item_type_name || '');

    const [name, setName] = useState(initialName);
    const [code] = useState(initialCode);
    const [weight, setWeight] = useState(itemType?.weight ?? "");
    const [isNameEditable, setIsNameEditable] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmSaveDialog, setShowConfirmSaveDialog] = useState(false);

    const handleSaveClick = () => {
        if (name.trim() === "") {
            setErrorMsg("Item name cannot be empty.");
            return;
        }
        if (weight.toString().trim() !== "" && (isNaN(Number(weight)) || Number(weight) < 0)) {
            setErrorMsg("Weight must be a non-negative number.");
            return;
        }
        setErrorMsg("");
        setShowConfirmSaveDialog(true);
    };

    const handleConfirmSave = async () => {
        setIsLoading(true);
        try {
            const item_type_name = code.trim() !== "" ? `${name.trim()} - ${code.trim()}` : name.trim();
            await updateItemType({
                user_id: localStorage.getItem("userId"),
                item_type_id: itemType.item_type_id,
                item_type_name,
                item_type_weight: weight.toString().trim() === "" ? null : Number(weight),
            });
            await Swal.fire({
                icon: "success",
                title: "Updated",
                text: "Item type has been updated successfully.",
                confirmButtonColor: "#1470F9",
            });
            setShowConfirmSaveDialog(false);
            onSaved?.();
            onClose?.();
        } catch (error) {
            console.error("Error updating item type:", error);
            const errorMessage = error?.response?.data?.message || "There was an error updating the item type. Please try again.";
            setShowConfirmSaveDialog(false);
            await Swal.fire({
                icon: "error",
                title: "Update Failed",
                text: errorMessage,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-[90] backdrop-blur-sm bg-black/20">
            <div className="relative top-1/2 left-1/2 w-[90%] max-w-xl transform -translate-x-1/2 -translate-y-1/2 bg-canvas rounded-2xl p-8">
                <div className="flex items-start justify-between">
                    <h2 className="text-3xl font-bold text-primary">Edit Item Type</h2>
                    <button className="cursor-pointer rounded-full bg-primary/20 p-3 text-primary" onClick={onClose} aria-label="Close">
                        <Icon icon={"mdi:close"} className="size-7" />
                    </button>
                </div>

                <div className="flex flex-col gap-y-4 mt-5">
                    <div className="flex flex-col gap-y-1">
                        <div className="flex flex-row items-center gap-x-2">
                            <label className="font-semibold text-lg">Item Name</label>
                            <input
                                type="checkbox"
                                className="size-4 cursor-pointer accent-primary"
                                checked={isNameEditable}
                                onChange={(e) => setIsNameEditable(e.target.checked)}
                            />
                            <span className="text-sm text-black/50">Edit</span>
                        </div>
                        <input
                            className={`rounded-full text-lg border border-black/20 px-5 py-2 ${!isNameEditable ? 'bg-gray-100 text-black/60 cursor-not-allowed' : ''}`}
                            value={name}
                            disabled={!isNameEditable}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-y-1">
                        <label className="font-semibold text-lg">New Code</label>
                        <input className="rounded-full text-lg border border-black/20 px-5 py-2 bg-gray-100 text-black/60 cursor-not-allowed" value={code} disabled readOnly />
                    </div>
                    <div className="flex flex-col gap-y-1">
                        <label className="font-semibold text-lg">Weight (g)</label>
                        <input type="number" min="0" step="0.01" className="rounded-full text-lg border border-black/20 px-5 py-2" value={weight} onChange={(e) => setWeight(e.target.value)} />
                    </div>
                    {errorMsg && <p className="text-red-500 font-medium">{errorMsg}</p>}
                    <button
                        className="cursor-pointer bg-primary rounded-full font-bold text-white text-xl px-10 py-2 mt-2 self-end"
                        onClick={handleSaveClick}
                        disabled={isLoading}
                    >
                        {isLoading ? <BeatLoader color="#fff" size={10} /> : "Save"}
                    </button>
                </div>
            </div>

            {showConfirmSaveDialog &&
                <ConfirmationDialog
                    title={"Update Item Type"}
                    text={"Are you sure you want to save changes to"}
                    item={name}
                    onClose={() => setShowConfirmSaveDialog(false)}
                    onSubmit={handleConfirmSave}
                    isLoading={isLoading}
                />
            }
        </div>
    );
};

export default RetailItemTypeEditDialog;
