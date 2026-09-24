import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BeatLoader } from "react-spinners";
import Select from "react-select";
import { getCorporateItemById, updateCorporateItem, getAllCorporateRawMaterials, getAllCorporateItemCategories } from "../../../services/corporate/CorporateSettingsServices";

const emptyBomRow = () => ({ row_material_id: "", row_material_quantity: "" });

const normalizeBomForForm = (bom) => {
    if (!Array.isArray(bom) || bom.length === 0) return [emptyBomRow()];
    return bom.map((row) => ({
        row_material_id: row?.row_material_id ?? "",
        row_material_quantity: row?.row_material_quantity ?? "",
    }));
};

const buildEditFormFromItem = (item, itemIdParam) => ({
    corp_item_raw_id: String(item.corp_item_raw_id ?? item.corp_item_auto_id ?? itemIdParam ?? ""),
    corp_item_id: item.corp_item_id ?? "",
    corp_item_name: item.corp_item_name ?? "",
    corp_item_kg_amount: item.corp_item_kg_amount ?? "",
    corp_item_price: item.corp_item_price ?? "",
    item_category_id: item.item_category_id ?? "",
    corp_item_bom: normalizeBomForForm(item.corp_item_bom),
    corp_item_return_bom: normalizeBomForForm(item.corp_item_return_bom),
    service_type: item.service_type || (item.service_types && item.service_types[0]?.service_type_name) || "",
});

const selectStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: "white",
        borderRadius: "0.5rem", // rounded-lg to match other inputs
        borderColor: state.isFocused ? "#1470F9" : "#e5e7eb", // gray-200
        padding: "0.125rem",
        boxShadow: "none",
        "&:hover": {
            borderColor: state.isFocused ? "#1470F9" : "#e5e7eb",
        },
    }),
    placeholder: (base) => ({
        ...base,
        color: "#9CA3AF", // gray-400
        fontSize: "1.125rem", // text-lg
    }),
    singleValue: (base) => ({
        ...base,
        color: "#000000",
        fontSize: "1.125rem", // text-lg
    }),
};

const SalesCorporateItemDetails = () => {
    const { itemId } = useParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [item, setItem] = useState(null);
    const [showAddRawMaterialDialog, setShowAddRawMaterialDialog] = useState(false);
    const [addRawMaterialTarget, setAddRawMaterialTarget] = useState("bom"); // "bom" | "return_bom"
    const [newRawMaterial, setNewRawMaterial] = useState({ row_material_id: "", row_material_quantity: "" });
    const [rawMaterialError, setRawMaterialError] = useState("");
    const [isSubmittingRawMaterial, setIsSubmittingRawMaterial] = useState(false);

    const [showEditItemDialog, setShowEditItemDialog] = useState(false);
    const [editForm, setEditForm] = useState(() => buildEditFormFromItem({}, itemId));
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editError, setEditError] = useState("");
    const [rawMaterials, setRawMaterials] = useState([]);
    const [categories, setCategories] = useState([]);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState({ section: "", index: -1 });
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchItemDetails = useCallback(async () => {
        if (!itemId) return;
        try {
            setIsLoading(true);
            const response = await getCorporateItemById({
                user_id: localStorage.getItem("userId"),
                corp_item_auto_id: itemId,
            });
            if (response?.data?.corporate_item) {
                setItem(response.data.corporate_item);
            } else {
                console.warn("API returned successfully but corporate_item is missing:", response?.data);
                setItem(null);
            }
        } catch (error) {
            console.error("Error fetching item details: ", error);
        } finally {
            setIsLoading(false);
        }
    }, [itemId]);

    const fetchRawMaterials = useCallback(async () => {
        try {
            const response = await getAllCorporateRawMaterials(localStorage.getItem("userId"));
            setRawMaterials(response.data.corporate_raw_materials || []);
        } catch (error) {
            console.error("Error fetching raw materials: ", error);
        }
    }, []);

    const fetchCategories = useCallback(async () => {
        try {
            const response = await getAllCorporateItemCategories(localStorage.getItem("userId"));
            const list = response?.data?.corporate_item_categories
                || response?.data?.categories 
                || response?.data?.item_categories 
                || response?.data?.allCategories 
                || response?.data?.data 
                || [];
            setCategories(list);
        } catch (error) {
            console.error("Error fetching categories: ", error);
        }
    }, []);

    useEffect(() => {
        fetchItemDetails();
        fetchRawMaterials();
        fetchCategories();
    }, [fetchItemDetails, fetchRawMaterials, fetchCategories]);

    const openEditItemDialog = () => {
        if (!item) return;
        setEditForm(buildEditFormFromItem(item, itemId));
        setEditError("");
        setShowEditItemDialog(true);
    };

    const handleChangeEditField = (field, value) => {
        setEditForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleChangeEditBomRow = (section, index, field, value) => {
        setEditForm((prev) => ({
            ...prev,
            [section]: prev[section].map((row, rowIndex) =>
                rowIndex === index ? { ...row, [field]: value } : row
            ),
        }));
    };

    const addEditBomRow = (section) => {
        setEditForm((prev) => ({
            ...prev,
            [section]: [...prev[section], emptyBomRow()],
        }));
    };

    const removeEditBomRow = (section, index) => {
        setEditForm((prev) => ({
            ...prev,
            [section]: prev[section].length === 1 ? prev[section] : prev[section].filter((_, rowIndex) => rowIndex !== index),
        }));
    };


    const sanitizeBomRows = (rows) =>
        rows
            .filter((row) => row.row_material_id && row.row_material_quantity !== "")
            .map((row) => ({
                row_material_id: String(row.row_material_id),
                row_material_quantity: Number(row.row_material_quantity),
            }));

    const handleSaveEditItem = async () => {
        if (!editForm.corp_item_raw_id || !editForm.corp_item_id || !editForm.corp_item_name) {
            setEditError("Please fill Corp Item Raw ID, Corp Item ID and Name.");
            return;
        }
        if (!editForm.service_type) {
            setEditError("Please select a Service Type.");
            return;
        }

        const payload = {
            user_id: localStorage.getItem("userId"),
            corp_item_raw_id: String(editForm.corp_item_raw_id),
            corp_item_id: String(editForm.corp_item_id),
            corp_item_name: String(editForm.corp_item_name),
            corp_item_kg_amount: Number(editForm.corp_item_kg_amount || 0),
            corp_item_bom: sanitizeBomRows(editForm.corp_item_bom),
            corp_item_return_bom: sanitizeBomRows(editForm.corp_item_return_bom),
            corp_item_price: Number(editForm.corp_item_price || 0),
            service_type: editForm.service_type,
            item_category_id: editForm.item_category_id ? Number(editForm.item_category_id) : null,
        };

        try {
            setIsSavingEdit(true);
            setEditError("");
            await updateCorporateItem(payload);
            setShowEditItemDialog(false);
            await fetchItemDetails();
        } catch (error) {
            console.error("Error updating corporate item:", error);
            const message =
                error?.response?.data?.message ??
                error?.response?.data?.error ??
                (typeof error?.response?.data === "string" ? error.response.data : null) ??
                error?.message ??
                "Failed to save. Please check values and try again.";
            setEditError(message);
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleSubmitRawMaterial = async () => {
        const rowMaterialId = String(newRawMaterial.row_material_id || "").trim();
        const rowMaterialQuantity = Number(newRawMaterial.row_material_quantity);

        if (!rowMaterialId || !Number.isFinite(rowMaterialQuantity) || rowMaterialQuantity <= 0) {
            setRawMaterialError("Please enter valid Raw Material ID and Quantity.");
            return;
        }

        const existingBom = Array.isArray(item?.corp_item_bom) ? item.corp_item_bom : [];
        const existingReturnBom = Array.isArray(item?.corp_item_return_bom) ? item.corp_item_return_bom : [];
        const newEntry = { row_material_id: rowMaterialId, row_material_quantity: rowMaterialQuantity };

        const updatedBom = addRawMaterialTarget === "bom"
            ? [...existingBom, newEntry]
            : existingBom;
        const updatedReturnBom = addRawMaterialTarget === "return_bom"
            ? [...existingReturnBom, newEntry]
            : existingReturnBom;

        const payload = {
            user_id: localStorage.getItem("userId"),
            corp_item_raw_id: String(item.corp_item_raw_id ?? item.corp_item_auto_id ?? itemId ?? ""),
            corp_item_id: String(item.corp_item_id ?? ""),
            corp_item_name: String(item.corp_item_name ?? ""),
            corp_item_kg_amount: Number(item.corp_item_kg_amount || 0),
            corp_item_price: Number(item.corp_item_price || 0),
            corp_item_bom: updatedBom
                .filter((row) => row.row_material_id && row.row_material_quantity !== "")
                .map((row) => ({
                    row_material_id: String(row.row_material_id),
                    row_material_quantity: Number(row.row_material_quantity),
                })),
            corp_item_return_bom: updatedReturnBom
                .filter((row) => row.row_material_id && row.row_material_quantity !== "")
                .map((row) => ({
                    row_material_id: String(row.row_material_id),
                    row_material_quantity: Number(row.row_material_quantity),
                })),
            service_type: item.service_type || (item.service_types && item.service_types[0]?.service_type_name) || "Washing",
        };

        try {
            setIsSubmittingRawMaterial(true);
            setRawMaterialError("");
            await updateCorporateItem(payload);
            setNewRawMaterial({ row_material_id: "", row_material_quantity: "" });
            setShowAddRawMaterialDialog(false);
            await fetchItemDetails();
        } catch (error) {
            console.error("Error adding raw material:", error);
            const message =
                error?.response?.data?.message ??
                error?.response?.data?.error ??
                (typeof error?.response?.data === "string" ? error.response.data : null) ??
                error?.message ??
                "Failed to add raw material. Please try again.";
            setRawMaterialError(message);
        } finally {
            setIsSubmittingRawMaterial(false);
        }
    };

    const handleDeleteClick = (section, index) => {
        setDeleteTarget({ section, index });
        setShowDeleteConfirm(true);
    };

    const handleConfirmDeleteRawMaterial = async () => {
        if (!item || deleteTarget.index === -1) return;

        const { section, index } = deleteTarget;
        const currentBom = Array.isArray(item.corp_item_bom) ? item.corp_item_bom : [];
        const currentReturnBom = Array.isArray(item.corp_item_return_bom) ? item.corp_item_return_bom : [];

        let updatedBom = [...currentBom];
        let updatedReturnBom = [...currentReturnBom];

        if (section === "bom") {
            updatedBom = updatedBom.filter((_, i) => i !== index);
        } else if (section === "return_bom") {
            updatedReturnBom = updatedReturnBom.filter((_, i) => i !== index);
        }

        const payload = {
            user_id: localStorage.getItem("userId"),
            corp_item_raw_id: String(item.corp_item_raw_id ?? item.corp_item_auto_id ?? itemId ?? ""),
            corp_item_id: String(item.corp_item_id ?? ""),
            corp_item_name: String(item.corp_item_name ?? ""),
            corp_item_kg_amount: Number(item.corp_item_kg_amount || 0),
            corp_item_price: Number(item.corp_item_price || 0),
            corp_item_bom: updatedBom
                .filter((row) => row.row_material_id && row.row_material_quantity !== "")
                .map((row) => ({
                    row_material_id: String(row.row_material_id),
                    row_material_quantity: Number(row.row_material_quantity),
                })),
            corp_item_return_bom: updatedReturnBom
                .filter((row) => row.row_material_id && row.row_material_quantity !== "")
                .map((row) => ({
                    row_material_id: String(row.row_material_id),
                    row_material_quantity: Number(row.row_material_quantity),
                })),
            service_type: item.service_type || (item.service_types && item.service_types[0]?.service_type_name) || "Washing",
        };

        try {
            setIsDeleting(true);
            await updateCorporateItem(payload);
            setShowDeleteConfirm(false);
            setDeleteTarget({ section: "", index: -1 });
            await fetchItemDetails();
        } catch (error) {
            console.error("Error deleting raw material:", error);
            alert("Failed to delete raw material. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <BeatLoader color="#1470F9" size={20} />
            </div>
        );
    }

    if (!item) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-y-5">
                <p className="text-2xl font-bold text-gray-500">Item not found.</p>
                <button
                    onClick={() => navigate("/salesCorporate/corporate/settings")}
                    className="bg-primary text-white px-5 py-2 rounded-full font-bold"
                >
                    Back to Settings
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-6">
            {/* Header / Breadcrumbs & Add Button */}
            <div className="flex justify-between items-start">
                <div className="flex flex-col gap-y-1">
                    <div className="flex flex-row items-center gap-x-3">
                        <Icon icon="heroicons:arrow-left-circle-20-solid" className="size-10 text-primary cursor-pointer" onClick={() => navigate("/salesCorporate/corporate/settings")} />
                        <h1 className="text-[1.75rem] font-bold text-primary flex items-center gap-x-2">
                            Settings / Items / <span className="text-[#1470F9] uppercase">{item.corp_item_id}</span>
                        </h1>
                    </div>
                    <p className="text-black/40 text-[1.1rem] ml-[3.25rem] font-medium leading-none">View Item Details</p>
                </div>
                {/* <button 
                    className="flex items-center gap-x-3 text-primary font-medium text-[1.1rem] py-1.5 px-6 rounded-full border border-primary bg-white hover:bg-primary/5 transition-colors" 
                    onClick={() => navigate("/salesCorporate/corporate/settings")} 
                >
                    <span className="text-xl">+</span> Add New Item
                </button> */}
            </div>

            {/* Item ID Header Line */}
            <div className="mt-2 border-b border-[#A6C8FF]">
                <h2 className="text-[1.2rem] font-medium text-black border-b-[3px] border-black w-fit pb-1.5 uppercase relative top-[2px]">
                    {item.corp_item_id}
                </h2>
            </div>

            {/* Content Container */}
            <div className="mt-4 border border-dashed border-gray-500 rounded-3xl p-8 bg-white shadow-sm min-h-[500px]">
                {/* Item Summary Info */}
                <div className="flex flex-row items-center gap-x-12 mb-10 flex-wrap">
                    <span className="text-[1.35rem] font-medium text-black">{item.corp_item_id}</span>
                    <span className="text-[1.35rem] font-medium text-black/40">{item.corp_item_name}</span>
                    <div className="flex flex-row items-center gap-x-2">
                        <span className="text-[1.35rem] font-medium text-black">Service :</span>
                        <span className="text-[1.35rem] font-medium text-black/40">
                            {item.service_type || (item.service_types && item.service_types[0]?.service_type_name) || "-"}
                        </span>
                    </div>
                    <div className="flex flex-row items-center gap-x-2">
                        <span className="text-[1.35rem] font-medium text-black">Category :</span>
                        <span className="text-[1.35rem] font-medium text-black/40">
                            {categories.find(cat => cat.item_category_auto_id === Number(item.item_category_id))?.item_category_name || item.category_name || "-"}
                        </span>
                    </div>
                    <div className="flex flex-row items-center gap-x-2">
                        <span className="text-[1.35rem] font-medium text-black">Weight :</span>
                        <span className="text-[1.35rem] font-medium text-black/40">
                            {item.corp_item_kg_amount != null && item.corp_item_kg_amount !== "" ? `${item.corp_item_kg_amount} kg` : "-"}
                        </span>
                    </div>
                </div>

                {/* Cooperate Item Bom */}
                <div className="flex flex-col mb-10">
                    <h3 className="text-[1.2rem] font-medium text-black mb-5 border-b border-[#A6C8FF] pb-2">Cooperate Item Bom</h3>
                    <div className="grid grid-cols-3 gap-x-8 pb-3 border-b border-black/20">
                        <span className="text-[1.15rem] font-medium text-black">Raw Materials</span>
                        <span className="text-[1.15rem] font-medium text-black">Measuring Type</span>
                        <span className="text-[1.15rem] font-medium text-black">Value</span>
                    </div>

                    <div className="flex flex-col">
                        {item.corp_item_bom?.map((bom, index) => {
                            const rm = rawMaterials.find(m => m.raw_material_id === bom.row_material_id);
                            return (
                                <div key={`bom-${index}`} className="grid grid-cols-3 gap-x-8 py-4 border-b border-black/20 items-center">
                                    <span className="text-[1.1rem] text-black/40">{rm ? rm.raw_material_name : bom.row_material_id}</span>
                                    <span className="text-[1.1rem] text-black/40">{rm?.raw_material_uom || "-"}</span>
                                    <span className="text-[1.1rem] text-black/40">{bom.row_material_quantity}</span>
                                </div>
                            );
                        })}
                    </div>

                    <button 
                        className="mt-6 flex items-center gap-x-2 text-primary text-[1.1rem] font-medium hover:underline w-fit" 
                        onClick={() => { setAddRawMaterialTarget("bom"); setShowAddRawMaterialDialog(true); }}
                    >
                        + Add Raw Materials
                    </button>
                </div>

                {/* Cooperate Return Item Bom */}
                <div className="flex flex-col">
                    <h3 className="text-[1.2rem] font-medium text-black mb-5 border-b border-[#A6C8FF] pb-2">Cooperate Return Item Bom</h3>
                    <div className="grid grid-cols-3 gap-x-8 pb-3 border-b border-black/20">
                        <span className="text-[1.15rem] font-medium text-black">Raw Materials</span>
                        <span className="text-[1.15rem] font-medium text-black">Measuring Type</span>
                        <span className="text-[1.15rem] font-medium text-black">Value</span>
                    </div>

                    <div className="flex flex-col">
                        {item.corp_item_return_bom?.map((bom, index) => {
                            const rm = rawMaterials.find(m => m.raw_material_id === bom.row_material_id);
                            return (
                                <div key={`return-bom-${index}`} className="grid grid-cols-3 gap-x-8 py-4 border-b border-black/20 items-center">
                                    <span className="text-[1.1rem] text-black/40">{rm ? rm.raw_material_name : bom.row_material_id}</span>
                                    <span className="text-[1.1rem] text-black/40">{rm?.raw_material_uom || "-"}</span>
                                    <span className="text-[1.1rem] text-black/40">{bom.row_material_quantity}</span>
                                </div>
                            );
                        })}
                    </div>

                    <button 
                        className="mt-6 flex items-center gap-x-2 text-primary text-[1.1rem] font-medium hover:underline w-fit" 
                        onClick={() => { setAddRawMaterialTarget("return_bom"); setShowAddRawMaterialDialog(true); }}
                    >
                        + Add Raw Materials
                    </button>
                </div>

                <div className="flex justify-end mt-8">
                    <button
                        className="cursor-pointer bg-primary text-white rounded-full px-6 py-2.5 font-bold flex flex-row items-center gap-x-2 hover:bg-primary/90 transition-colors shadow-md"
                        onClick={openEditItemDialog}
                    >
                        <Icon icon="mdi:pencil-outline" className="size-5" />
                        Edit Item
                    </button>
                </div>
            </div>

            {showAddRawMaterialDialog && (
                <div className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-2xl font-bold text-primary">Add Raw Materials</h3>
                            <button
                                className="cursor-pointer rounded-full bg-primary/20 p-2 text-primary"
                                onClick={() => {
                                    setShowAddRawMaterialDialog(false);
                                    setRawMaterialError("");
                                }}
                            >
                                <Icon icon={"mdi:close"} className="size-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <Select
                                styles={selectStyles}
                                options={rawMaterials.map(rm => ({
                                    value: rm.raw_material_id,
                                    label: `${rm.raw_material_name} (${rm.raw_material_id})`
                                }))}
                                value={newRawMaterial.row_material_id ? {
                                    value: newRawMaterial.row_material_id,
                                    label: (() => {
                                        const rm = rawMaterials.find(m => m.raw_material_id === newRawMaterial.row_material_id);
                                        return rm ? `${rm.raw_material_name} (${rm.raw_material_id})` : newRawMaterial.row_material_id;
                                    })()
                                } : null}
                                onChange={(option) => setNewRawMaterial((prev) => ({ ...prev, row_material_id: option.value }))}
                                placeholder="Select Raw Material"
                                isSearchable
                                components={{ IndicatorSeparator: () => null }}
                            />
                            <input
                                className="border border-black/20 rounded-lg px-3 py-2 text-lg"
                                type="number"
                                placeholder="Raw Material Quantity"
                                value={newRawMaterial.row_material_quantity}
                                onChange={(e) => setNewRawMaterial((prev) => ({ ...prev, row_material_quantity: e.target.value }))}
                            />
                        </div>

                        {rawMaterialError ? <p className="text-red-500 font-medium mt-3">{rawMaterialError}</p> : null}

                        <div className="flex justify-end gap-3 mt-5">
                            <button
                                className="cursor-pointer border border-black/20 rounded-full px-5 py-2 font-semibold"
                                onClick={() => {
                                    setShowAddRawMaterialDialog(false);
                                    setRawMaterialError("");
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="cursor-pointer bg-primary text-white rounded-full px-6 py-2 font-semibold disabled:opacity-60 flex items-center gap-x-2"
                                onClick={handleSubmitRawMaterial}
                                disabled={isSubmittingRawMaterial}
                            >
                                {isSubmittingRawMaterial ? <BeatLoader color="#FFFFFF" size={8} /> : "Submit"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEditItemDialog && (
                <div className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-2xl font-bold text-primary">Edit Item</h3>
                            <button
                                type="button"
                                className="cursor-pointer rounded-full bg-primary/20 p-2 text-primary"
                                onClick={() => {
                                    setShowEditItemDialog(false);
                                    setEditError("");
                                }}
                            >
                                <Icon icon={"mdi:close"} className="size-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm font-semibold text-black/70 mb-1">Corp Item Raw ID</label>
                                <input
                                    className="border border-black/20 rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
                                    placeholder="Corp Item Raw ID"
                                    value={editForm.corp_item_raw_id}
                                    disabled
                                />
                            </div>
                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm font-semibold text-black/70 mb-1">Corp Item ID</label>
                                <input
                                    className="border border-black/20 rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
                                    placeholder="Corp Item ID"
                                    value={editForm.corp_item_id}
                                    disabled
                                />
                            </div>
                            <div className="flex flex-col gap-y-1 col-span-2">
                                <label className="text-sm font-semibold text-black/70 mb-1">Corp Item Name</label>
                                <input
                                    className="border border-black/20 rounded-lg px-3 py-2 w-full"
                                    placeholder="Corp Item Name"
                                    value={editForm.corp_item_name}
                                    onChange={(e) => handleChangeEditField("corp_item_name", e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm font-semibold text-black/70 mb-1">KG Amount</label>
                                <input
                                    className="border border-black/20 rounded-lg px-3 py-2"
                                    type="number"
                                    step="0.01"
                                    placeholder="KG Amount"
                                    value={editForm.corp_item_kg_amount}
                                    onChange={(e) => handleChangeEditField("corp_item_kg_amount", e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm font-semibold text-black/70 mb-1">Item Category</label>
                                <Select
                                    styles={selectStyles}
                                    options={categories.map(cat => ({ value: cat.item_category_auto_id, label: cat.item_category_name }))}
                                    value={
                                        editForm.item_category_id 
                                            ? { 
                                                value: editForm.item_category_id, 
                                                label: categories.find(cat => cat.item_category_auto_id === Number(editForm.item_category_id))?.item_category_name || editForm.item_category_id 
                                              } 
                                            : null
                                    }
                                    onChange={(option) => handleChangeEditField("item_category_id", option.value)}
                                    placeholder="Select Category"
                                    components={{ IndicatorSeparator: () => null }}
                                />
                            </div>
                        </div>

                        <div className="mt-5 max-w-[400px]">
                            <p className="font-semibold mb-2">Service Type</p>
                            <Select
                                styles={selectStyles}
                                options={[
                                    { value: "Washing", label: "Washing" },
                                    { value: "Pressing", label: "Pressing" },
                                    { value: "Dry Clean", label: "Dry Clean" }
                                ]}
                                value={
                                    editForm.service_type 
                                        ? { value: editForm.service_type, label: editForm.service_type } 
                                        : null
                                }
                                onChange={(option) => handleChangeEditField("service_type", option.value)}
                                placeholder="Select Service Type"
                                components={{ IndicatorSeparator: () => null }}
                            />
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold">BOM</p>
                                <button
                                    type="button"
                                    className="text-primary font-semibold cursor-pointer"
                                    onClick={() => addEditBomRow("corp_item_bom")}
                                >
                                    + Add Row
                                </button>
                            </div>
                            {editForm.corp_item_bom.length > 0 && (
                                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-black/60 mb-2 px-1">
                                    <div className="col-span-6">Raw Material</div>
                                    <div className="col-span-4">Quantity</div>
                                </div>
                            )}
                            {editForm.corp_item_bom.map((row, index) => (
                                <div key={`edit-bom-${index}`} className="grid grid-cols-12 gap-2 mb-2">
                                    <div className="col-span-6">
                                        <Select
                                            styles={selectStyles}
                                            options={rawMaterials.map(rm => ({
                                                value: rm.raw_material_id,
                                                label: `${rm.raw_material_name} (${rm.raw_material_id})`
                                            }))}
                                            value={row.row_material_id ? {
                                                value: row.row_material_id,
                                                label: (() => {
                                                    const rm = rawMaterials.find(m => m.raw_material_id === row.row_material_id);
                                                    return rm ? `${rm.raw_material_name} (${rm.raw_material_id})` : row.row_material_id;
                                                })()
                                            } : null}
                                            onChange={(option) =>
                                                handleChangeEditBomRow("corp_item_bom", index, "row_material_id", option.value)
                                            }
                                            placeholder="Select Material"
                                            isSearchable
                                            components={{ IndicatorSeparator: () => null }}
                                        />
                                    </div>
                                    <input
                                        className="col-span-4 border border-black/20 rounded-lg px-3 py-2"
                                        type="number"
                                        placeholder="quantity"
                                        value={row.row_material_quantity}
                                        onChange={(e) =>
                                            handleChangeEditBomRow("corp_item_bom", index, "row_material_quantity", e.target.value)
                                        }
                                    />
                                    <button
                                        type="button"
                                        className="col-span-2 text-red-500 font-semibold cursor-pointer"
                                        onClick={() => removeEditBomRow("corp_item_bom", index)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold">Return BOM</p>
                                <button
                                    type="button"
                                    className="text-primary font-semibold cursor-pointer"
                                    onClick={() => addEditBomRow("corp_item_return_bom")}
                                >
                                    + Add Row
                                </button>
                            </div>
                            {editForm.corp_item_return_bom.length > 0 && (
                                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-black/60 mb-2 px-1">
                                    <div className="col-span-6">Raw Material</div>
                                    <div className="col-span-4">Quantity</div>
                                </div>
                            )}
                            {editForm.corp_item_return_bom.map((row, index) => (
                                <div key={`edit-ret-${index}`} className="grid grid-cols-12 gap-2 mb-2">
                                    <div className="col-span-6">
                                        <Select
                                            styles={selectStyles}
                                            options={rawMaterials.map(rm => ({
                                                value: rm.raw_material_id,
                                                label: `${rm.raw_material_name} (${rm.raw_material_id})`
                                            }))}
                                            value={row.row_material_id ? {
                                                value: row.row_material_id,
                                                label: (() => {
                                                    const rm = rawMaterials.find(m => m.raw_material_id === row.row_material_id);
                                                    return rm ? `${rm.raw_material_name} (${rm.raw_material_id})` : row.row_material_id;
                                                })()
                                            } : null}
                                            onChange={(option) =>
                                                handleChangeEditBomRow("corp_item_return_bom", index, "row_material_id", option.value)
                                            }
                                            placeholder="Select Material"
                                            isSearchable
                                            components={{ IndicatorSeparator: () => null }}
                                        />
                                    </div>
                                    <input
                                        className="col-span-4 border border-black/20 rounded-lg px-3 py-2"
                                        type="number"
                                        placeholder="quantity"
                                        value={row.row_material_quantity}
                                        onChange={(e) =>
                                            handleChangeEditBomRow("corp_item_return_bom", index, "row_material_quantity", e.target.value)
                                        }
                                    />
                                    <button
                                        type="button"
                                        className="col-span-2 text-red-500 font-semibold cursor-pointer"
                                        onClick={() => removeEditBomRow("corp_item_return_bom", index)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>

                        {editError ? <p className="text-red-500 font-medium mt-3">{editError}</p> : null}

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                type="button"
                                className="cursor-pointer border border-black/20 rounded-full px-5 py-2 font-semibold"
                                onClick={() => {
                                    setShowEditItemDialog(false);
                                    setEditError("");
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="cursor-pointer bg-primary text-white rounded-full px-6 py-2 font-semibold disabled:opacity-60"
                                onClick={handleSaveEditItem}
                                disabled={isSavingEdit}
                            >
                                {isSavingEdit ? <BeatLoader color="#FFFFFF" size={8} /> : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex flex-col items-center text-center">
                            <div className="bg-red-100 p-4 rounded-full mb-4">
                                <Icon icon="mdi:trash-can-outline" className="size-10 text-red-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Confirm Delete</h3>
                            <p className="text-gray-500 mb-8">
                                Are you sure you want to remove this raw material? This action cannot be undone.
                            </p>
                            
                            <div className="flex w-full gap-3">
                                <button
                                    className="flex-1 cursor-pointer border border-gray-300 rounded-full py-2.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteTarget({ section: "", index: -1 });
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="flex-1 cursor-pointer bg-red-600 text-white rounded-full py-2.5 font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-x-2"
                                    onClick={handleConfirmDeleteRawMaterial}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? <BeatLoader color="#FFFFFF" size={8} /> : "Delete"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesCorporateItemDetails;
