import { useEffect, useRef, useState } from "react";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link } from "react-router-dom";
import { MdClose, MdSearch } from "react-icons/md";
import * as XLSX from "xlsx";
import CorporateCreateDiscountDialog from "../../components/dialogs/corporate/CorporateCreateDiscountDialog";
import CorporateEditDiscountDialog from "../../components/dialogs/corporate/CorporateEditDiscountDialog";
import RetailIssueVoucherDialog from "../../components/dialogs/retail/RetailIssueVoucherDialog";
import Select from "react-select";
import { 
    getAllCorporateItems, 
    getAllCorporatePriceLists, 
    getAllCorporateSettings, 
    updateCorporateSettings, 
    uploadCorporateDiscountList,
    getAllCorporateDiscounts,
    createCorporateItem,
    updateCorporateDiscountById,
    getAllCorporateRawMaterials,
    getAllCorporateItemCategories,
    getCorporateTaxes,
    deleteCorporateTax,
    createCorporateTax,
    updateCorporateTax,
} from "../../services/corporate/CorporateSettingsServices";
import { createItemType, deactivateItemType, getAllItemTypes, updateSettings } from "../../services/Retail/RetailSettingsServices";
import { BeatLoader } from "react-spinners";
import { getAllCustomers } from "../../services/CustomerServices";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import Swal from "sweetalert2";

const SalesCorporateSettings = () => {
    const [selectedTab, setSelectedTab] = useState(1);
    const fileInputRef = useRef(null);
    const timeoutRef = useRef(null);
    const discountFileInputRef = useRef(null);
    const [isLoadingItemTypes, setIsLoadingItemTypes] = useState(false);
    const [isLoadingAddItemType, setIsLoadingAddItemType] = useState(false);
    const [isLoadingDeactivateItemType, setIsLoadingDeactivateItemType] = useState(false);
    const [taxCalculation, setTaxCalculation] = useState(true);
    const [showCreateDiscountDialog, setShowCreateDiscountDialog] = useState(false);
    const [showEditDiscountDialog, setShowEditDiscountDialog] = useState(false);
    const [selectedDiscount, setSelectedDiscount] = useState(null);
    const [showDeleteDiscountDialog, setShowDeleteDiscountDialog] = useState(false);
    const [isLoadingDeleteDiscount, setIsLoadingDeleteDiscount] = useState(false);
    const [showIssueVoucherDialog, setShowIssueVoucherDialog] = useState(false);
    const [itemTypes, setItemTypes] = useState([]);
    const [itemCategoryOptions, setItemCategoryOptions] = useState([]);
    const [newItemType, setNewItemType] = useState("");
    const [itemTypeErrorMsg, setItemTypeErrorMsg] = useState("");
    const [priceList, setPriceList] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState("");
    const [showDeactivateItemTypeConfirmationDialog, setShowDeactivateItemTypeConfirmationDialog] = useState(false);
    const [selectedItemType, setSelectedItemType] = useState(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
    const [isLoadingDiscountUpload, setIsLoadingDiscountUpload] = useState(false);
    const [discountUploadMessage, setDiscountUploadMessage] = useState("");
    const [discounts, setDiscounts] = useState([]);
    const [isLoadingDiscounts, setIsLoadingDiscounts] = useState(false);
    const [corporateTaxes, setCorporateTaxes] = useState([]);
    const [isLoadingCorporateTaxes, setIsLoadingCorporateTaxes] = useState(false);
    const [showCorporateTaxModal, setShowCorporateTaxModal] = useState(false);
    const [corporateTaxModalMode, setCorporateTaxModalMode] = useState("create");
    const [selectedCorporateTax, setSelectedCorporateTax] = useState(null);
    const [taxModalName, setTaxModalName] = useState("");
    const [taxModalRate, setTaxModalRate] = useState("");
    const [taxModalIsActive, setTaxModalIsActive] = useState(true);
    const [taxModalSaving, setTaxModalSaving] = useState(false);
    const [taxModalError, setTaxModalError] = useState("");
    const [updateMessage, setUpdateMessage] = useState("");
    const [settings, setSettings] = useState(
        {
            user_id: "",
            settings_id: 1,
            receipt_notes: "",
            receipt_terms: "",
            is_tax_enabled: 0,
            tax_rate: "",
            tax_name: ""
        }
    );
    const [corporateItems, setCorporateItems] = useState([]);
    const [isLoadingCorporateItems, setIsLoadingCorporateItems] = useState(false);
    const [itemSearchQuery, setItemSearchQuery] = useState("");
    const [rawMaterials, setRawMaterials] = useState([]);
    const [showAddRawMaterialDialog, setShowAddRawMaterialDialog] = useState(false);
    const [isCreatingCorporateItem, setIsCreatingCorporateItem] = useState(false);
    const [createCorporateItemMessage, setCreateCorporateItemMessage] = useState("");
    const [newCorporateItemForm, setNewCorporateItemForm] = useState({
        corp_item_id: "Auto-generated",
        corp_item_name: "",
        corp_item_kg_amount: "",
        item_category_id: 1,
        discount: "",
        corp_item_price: "",
        corp_item_bom: [{ row_material_id: "", row_material_quantity: "" }],
        corp_item_return_bom: [{ row_material_id: "", row_material_quantity: "" }],
        service_type: "",
    });

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem", // rounded-xl
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db", // gray-300
            padding: "0rem 0.25rem", // py-2 px-3
            boxShadow: "none",
            "&:hover": {
                borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            },
        }),
        placeholder: (base) => ({
            ...base,
            color: "#6B7280", // gray-400
        }),
        singleValue: (base) => ({
            ...base,
            color: "#000000",
        }),
    };

    const fetchAllSettings = async () => {
        try {
            setIsLoadingReceipt(true);
            const response = await getAllCorporateSettings(localStorage.getItem("userId"));
            setSettings(response.data.settings[0]);
        } catch (error) {
            console.error("Error fetching settings: ", error);
        } finally {
            setIsLoadingReceipt(false);
        }
    };

    const fetchCorporateTaxes = async () => {
        try {
            setIsLoadingCorporateTaxes(true);
            const res = await getCorporateTaxes(localStorage.getItem("userId"));
            setCorporateTaxes(Array.isArray(res.taxes) ? res.taxes : []);
        } catch (error) {
            console.error("Error fetching corporate taxes:", error);
            setCorporateTaxes([]);
        } finally {
            setIsLoadingCorporateTaxes(false);
        }
    };

    const fetchAllPriceLists = async () => {
        try {
            const response = await getAllCorporatePriceLists(localStorage.getItem("userId"));
            const data = response?.data;
            if (Array.isArray(data)) {
                setPriceList(data);
            } else if (Array.isArray(data?.price_list)) {
                setPriceList(data.price_list);
            } else if (Array.isArray(data?.corporate_price_lists)) {
                setPriceList(data.corporate_price_lists);
            } else {
                setPriceList([]);
            }
        } catch (error) {
            console.error("Error fetching price lists: ", error);
            setPriceList([]);
        }
    };

    const fetchItemTypes = async () => {
        try {
            setIsLoadingItemTypes(true);
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Error fetching item types: ", error);
        } finally {
            setIsLoadingItemTypes(false);
        }
    };

    const fetchAllCustomers = async () => {
        try {
            // setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_type: "Cooperate",
                branch_id: -1,
            };

            const response = await getAllCustomers(payload);
            const filtered = response.data.allCustomers.filter(customer => customer.customer_type === "Cooperate");
            setCustomers(filtered);
            // Auto-select first customer so the Items view can render without a dropdown (matches screenshot).
            if (!selectedCustomer && filtered?.[0]?.customer_id) setSelectedCustomer(filtered[0].customer_id);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        } finally {
            // setIsLoading(false);
        }
    };

    const fetchCorporateItems = async () => {
        try {
            setIsLoadingCorporateItems(true);
            const response = await getAllCorporateItems(localStorage.getItem("userId"));
            setCorporateItems(response.data.corporate_items);
        } catch (error) {
            console.error("Error fetching corporate items: ", error);
        } finally {
            setIsLoadingCorporateItems(false);
        }
    };

    const fetchRawMaterials = async () => {
        try {
            const response = await getAllCorporateRawMaterials(localStorage.getItem("userId"));
            setRawMaterials(response.data.corporate_raw_materials || []);
        } catch (error) {
            console.error("Error fetching raw materials: ", error);
        }
    };

    const fetchItemCategories = async () => {
        try {
            const response = await getAllCorporateItemCategories(localStorage.getItem("userId"));
            const categories = response?.data?.corporate_item_categories || [];
            setItemCategoryOptions(categories.map(cat => ({
                value: cat.item_category_auto_id,
                label: cat.item_category_name
            })));
        } catch (error) {
            console.error("Error fetching item categories: ", error);
            setItemCategoryOptions([
                { value: 1, label: "King" },
                { value: 2, label: "Queen" },
                { value: 3, label: "Single" },
            ]); // Fallback
        }
    };

    useEffect(() => {
        fetchAllSettings();
        fetchAllPriceLists();
        fetchItemTypes();
        fetchAllCustomers();
        fetchCorporateItems();
        fetchRawMaterials();
        fetchItemCategories();
    }, []);

    useEffect(() => {
        if (selectedTab === 4) {
            fetchAllSettings();
            fetchCorporateTaxes();
        }
    }, [selectedTab]);

    const handleInputChange = (e) => {
        setSettings(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value
            }
        ));
    };

    const handleInputNumberChange = (e) => {
        setSettings(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value === "" ? "" : Math.max(0, Number(e.target.value))
            }
        ));
    };

    const handleUpdateSettings = async (e) => {
        e.preventDefault();

        try {
            setIsLoadingSettings(true);
            const payload = {
                ...settings,
                user_id: localStorage.getItem("userId"),
            };
            const response = await updateCorporateSettings(payload);

            setUpdateMessage("Updated successfully.");
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                setUpdateMessage("");
            }, 2000);
        } catch (error) {
            console.error("Error updating settings: ", error);
        } finally {
            setIsLoadingSettings(false);
            fetchAllSettings();
        }
    };

    /* Create-tax UI disabled — keep handler here to re-enable with the "Create New Tax" button if needed.
    const handleOpenCreateCorporateTax = () => {
        setCorporateTaxModalMode("create");
        setSelectedCorporateTax(null);
        setTaxModalName("");
        setTaxModalRate("");
        setTaxModalIsActive(true);
        setTaxModalError("");
        setShowCorporateTaxModal(true);
    };
    */

    const handleOpenEditCorporateTax = (tax) => {
        setCorporateTaxModalMode("edit");
        setSelectedCorporateTax(tax);
        setTaxModalName(tax.tax_name ?? "");
        setTaxModalRate(tax.tax_rate != null ? String(tax.tax_rate) : "");
        setTaxModalIsActive(!(tax.is_active === 0 || tax.is_active === false));
        setTaxModalError("");
        setShowCorporateTaxModal(true);
    };

    const handleCloseCorporateTaxModal = () => {
        setShowCorporateTaxModal(false);
        setSelectedCorporateTax(null);
        setTaxModalError("");
    };

    const handleSubmitCorporateTaxModal = async (e) => {
        e.preventDefault();
        setTaxModalError("");
        const name =
            corporateTaxModalMode === "edit" && selectedCorporateTax?.tax_name != null
                ? String(selectedCorporateTax.tax_name).trim()
                : taxModalName.trim();
        const rateNum = taxModalRate === "" ? NaN : Number(taxModalRate);
        if (!name) {
            setTaxModalError("Tax name is required.");
            return;
        }
        if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
            setTaxModalError("Tax rate must be a number between 0 and 100.");
            return;
        }
        const user_id = localStorage.getItem("userId");
        try {
            setTaxModalSaving(true);
            if (corporateTaxModalMode === "edit" && selectedCorporateTax?.tax_id != null) {
                await updateCorporateTax({
                    tax_id: selectedCorporateTax.tax_id,
                    user_id,
                    tax_name: name,
                    tax_rate: rateNum,
                    is_active: taxModalIsActive ? 1 : 0,
                });
            } else {
                await createCorporateTax({
                    user_id,
                    tax_name: name,
                    tax_rate: rateNum,
                    is_active: taxModalIsActive ? 1 : 0,
                });
            }
            fetchCorporateTaxes();
            handleCloseCorporateTaxModal();
        } catch (err) {
            const d = err?.response?.data;
            setTaxModalError(
                (typeof d === "string" && d) ||
                    d?.message ||
                    d?.error ||
                    err?.message ||
                    "Could not save tax."
            );
        } finally {
            setTaxModalSaving(false);
        }
    };

    const handleDeleteCorporateTax = async (tax) => {
        const result = await Swal.fire({
            title: "Delete tax?",
            text: `Remove "${tax.tax_name}"? Customers will lose this assignment on save.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#1470F9",
            confirmButtonText: "Delete",
        });
        if (!result.isConfirmed) return;
        try {
            await deleteCorporateTax({
                tax_id: tax.tax_id,
                user_id: localStorage.getItem("userId"),
            });
            await Swal.fire({ icon: "success", title: "Deleted", timer: 1500, showConfirmButton: false });
            fetchCorporateTaxes();
        } catch (error) {
            console.error(error);
            await Swal.fire({
                icon: "error",
                title: "Delete failed",
                text: error?.response?.data?.message || error?.message || "Could not delete tax.",
            });
        }
    };

    const handleAddItemType = async () => {
        try {
            if (newItemType.trim() === "") {
                setItemTypeErrorMsg("Item type name cannot be empty.");
                return;
            } else if (itemTypes.find(type => type.item_type_name === newItemType.trim())) {
                setItemTypeErrorMsg("Item type already exists.");
                return;
            } else {
                setItemTypeErrorMsg("");
            }
            setIsLoadingAddItemType(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                item_type_name: newItemType,
            }
            const response = await createItemType(payload);
            setNewItemType("");
            fetchItemTypes();
        } catch (error) {
            console.error("Error creating item type: ", error);
        } finally {
            setIsLoadingAddItemType(false);
        }
    };

    const handleDeactivateItemType = async () => {
        try {
            setIsLoadingDeactivateItemType(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                item_type_id: selectedItemType.item_type_id,
            }
            const response = await deactivateItemType(payload);
            setSelectedItemType(null);
            fetchItemTypes();
            fetchAllPriceLists();
            setShowDeactivateItemTypeConfirmationDialog(false);
        } catch (error) {
            console.error("Error deactivating item type: ", error);
        } finally {
            setIsLoadingDeactivateItemType(false);
        }
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    // filtering price lists (supports both grouped and flat API response shapes)
    const filteredPriceList = (() => {
        const source = Array.isArray(priceList) ? priceList : [];
        if (!selectedCustomer || source.length === 0) return [];

        const groupedList = source
            .filter((obj) =>
                obj &&
                typeof obj === "object" &&
                !Array.isArray(obj) &&
                Array.isArray(obj[selectedCustomer])
            )
            .flatMap((obj) => obj[selectedCustomer]);

        if (groupedList.length > 0) return groupedList;

        return source.filter((row) =>
            String(row?.customer_id ?? row?.customerId ?? "") === String(selectedCustomer)
        );
    })();

    const itemRows = filteredPriceList.flatMap((pl) => {
        const rows = [];
        const itemId = itemTypes.find(type => type.item_type_id === pl.item_type_id)?.item_type_code || `ID${pl.item_type_id}`;
        const itemName = itemTypes.find(type => type.item_type_id === pl.item_type_id)?.item_type_name || "-";
        const rawMaterials = pl.raw_materials_with_quantity || pl.raw_materials || "-";

        if (Number(pl.washing_price || 0) > 0) {
            rows.push({ itemId, itemName, rawMaterials, service: "Washing" });
        }
        if (Number(pl.pressing_price || 0) > 0) {
            rows.push({ itemId, itemName, rawMaterials, service: "Pressing" });
        }
        if (Number(pl.dry_clean_price || 0) > 0) {
            rows.push({ itemId, itemName, rawMaterials, service: "Dry Clean" });
        }

        if (rows.length === 0) {
            rows.push({ itemId, itemName, rawMaterials, service: "-" });
        }

        return rows;
    });


    const handleDownloadCorporateTemplate = () => {
        const headers = [
            "row_id",
            "item_type",
            "washing_price",
            "pressing_price",
            "dry_clean_price"
        ];

        const dataRows = filteredPriceList.map((pl, index) => {
            const typeName = itemTypes.find(type => type.item_type_id === pl.item_type_id)?.item_type_name || "Unknown";
            return {
                row_id: pl.row_id || `ROW${String(index + 1).padStart(3, '0')}`,
                item_type: typeName,
                washing_price: pl.washing_price || 0,
                pressing_price: pl.pressing_price || 0,
                dry_clean_price: pl.dry_clean_price || 0
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataRows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Price List Template");
        XLSX.writeFile(workbook, "corporate_price_list_template.xlsx");
    };

    const handleDownloadDiscountTemplate = () => {
        const headers = [
            "discount_row_id",
            "discount_name",
            "discount_type",
            "discount_condition",
            "discount_value_type",
            "discount_value",
            "discount_valid_from",
            "discount_valid_to"
        ];

        const formatForExcel = (dateStr) => {
            if (!dateStr) return "";
            const d = new Date(dateStr);
            if (isNaN(d)) return "";
            return d.toISOString().split("T")[0]; // YYYY-MM-DD format commonly accepted by uploads
        };

        const dataRows = discounts.map((discount, index) => ({
            "discount_row_id": discount.discount_row_id || `D${String(index + 1).padStart(3, '0')}`,
            "discount_name": discount.discount_name || "",
            "discount_type": discount.discount_type || "",
            "discount_condition": discount.discount_condition || "",
            "discount_value_type": discount.discount_value_type || "",
            "discount_value": discount.discount_value || "",
            "discount_valid_from": formatForExcel(discount.discount_valid_from),
            "discount_valid_to": formatForExcel(discount.discount_valid_to)
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataRows.length > 0 ? dataRows : [], { header: headers });

        if (worksheet['!ref']) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            // Extend formatting to 500 rows so new rows typed by users stay as Text type
            const targetEndRow = Math.max(range.e.r, 500);
            range.e.r = targetEndRow;
            worksheet['!ref'] = XLSX.utils.encode_range(range);

            for (let R = 0; R <= targetEndRow; ++R) {
                // Column G is index 6, H is index 7
                const validFromCell = XLSX.utils.encode_cell({ c: 6, r: R });
                const validToCell = XLSX.utils.encode_cell({ c: 7, r: R });
                
                if (!worksheet[validFromCell]) worksheet[validFromCell] = { t: 's', v: '' };
                worksheet[validFromCell].t = 's';
                worksheet[validFromCell].z = '@';

                if (!worksheet[validToCell]) worksheet[validToCell] = { t: 's', v: '' };
                worksheet[validToCell].t = 's';
                worksheet[validToCell].z = '@';
            }
        }
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Discount Template");
        XLSX.writeFile(workbook, "corporate_discount_template.xlsx");
    };

    const handleDiscountFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            setIsLoadingDiscountUpload(true);
            const formData = new FormData();
            formData.append("user_id", localStorage.getItem("userId"));
            formData.append("file", file);
            await uploadCorporateDiscountList(formData);
            setDiscountUploadMessage("Discount list uploaded successfully.");
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setDiscountUploadMessage(""), 3000);
            fetchAllDiscounts();
        } catch (error) {
            console.error("Error uploading discount list:", error);
            setDiscountUploadMessage("Upload failed. Please try again.");
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setDiscountUploadMessage(""), 3000);
        } finally {
            setIsLoadingDiscountUpload(false);
            e.target.value = "";
        }
    };

    const fetchAllDiscounts = async () => {
        try {
            setIsLoadingDiscounts(true);
            const response = await getAllCorporateDiscounts(localStorage.getItem("userId"));
            setDiscounts(response.data.settings || []);
        } catch (error) {
            console.error("Error fetching discounts:", error);
        } finally {
            setIsLoadingDiscounts(false);
        }
    };

    const handleEditDiscountClick = (discount) => {
        setSelectedDiscount(discount);
        setShowEditDiscountDialog(true);
    };

    const handleDeleteDiscountClick = (discount) => {
        setSelectedDiscount(discount);
        setShowDeleteDiscountDialog(true);
    };

    const handleConfirmDeleteDiscount = async () => {
        if (!selectedDiscount) return;
        try {
            setIsLoadingDeleteDiscount(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                discount_row_id: selectedDiscount.discount_row_id,
                discount_name: selectedDiscount.discount_name,
                discount_type: selectedDiscount.discount_type,
                discount_condition: selectedDiscount.discount_condition,
                discount_value_type: selectedDiscount.discount_value_type,
                discount_value: selectedDiscount.discount_value,
                discount_valid_from: selectedDiscount.discount_valid_from,
                discount_valid_to: selectedDiscount.discount_valid_to,
                discount_status: "Deleted"
            };
            await updateCorporateDiscountById(payload);
            fetchAllDiscounts();
            setShowDeleteDiscountDialog(false);
            setSelectedDiscount(null);
        } catch (error) {
            console.error("Error deleting discount:", error);
        } finally {
            setIsLoadingDeleteDiscount(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    };

    const handleChangeNewCorporateItemField = (field, value) => {
        setNewCorporateItemForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleChangeBomRow = (section, index, field, value) => {
        setNewCorporateItemForm((prev) => ({
            ...prev,
            [section]: prev[section].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
        }));
    };

    const addBomRow = (section) => {
        setNewCorporateItemForm((prev) => ({
            ...prev,
            [section]: [...prev[section], { row_material_id: "", row_material_quantity: "" }],
        }));
    };

    const removeBomRow = (section, index) => {
        setNewCorporateItemForm((prev) => ({
            ...prev,
            [section]: prev[section].length === 1 ? prev[section] : prev[section].filter((_, rowIndex) => rowIndex !== index),
        }));
    };


    const resetNewCorporateItemForm = () => {
        setNewCorporateItemForm({
            corp_item_id: "Auto-generated",
            corp_item_name: "",
            corp_item_kg_amount: "",
            item_category_id: 1,
            discount: "",
            corp_item_price: "",
            corp_item_bom: [{ row_material_id: "", row_material_quantity: "" }],
            corp_item_return_bom: [{ row_material_id: "", row_material_quantity: "" }],
            service_type: "",
        });
        setCreateCorporateItemMessage("");
    };

    const handleCreateCorporateItem = async () => {
        if (!newCorporateItemForm.corp_item_id || !newCorporateItemForm.corp_item_name) {
            setCreateCorporateItemMessage("Please fill Corp Item ID and Name.");
            return;
        }
        if (!newCorporateItemForm.service_type) {
            setCreateCorporateItemMessage("Please select a Service Type.");
            return;
        }

        const sanitizeBomRows = (rows) => rows
            .filter((row) => row.row_material_id && row.row_material_quantity !== "")
            .map((row) => ({
                row_material_id: String(row.row_material_id),
                row_material_quantity: Number(row.row_material_quantity),
            }));

        const payload = {
            user_id: localStorage.getItem("userId"),
            corp_item_id: String(newCorporateItemForm.corp_item_id),
            corp_item_name: String(newCorporateItemForm.corp_item_name),
            corp_item_kg_amount: Number(newCorporateItemForm.corp_item_kg_amount || 0),
            item_category_id: Number(newCorporateItemForm.item_category_id || 1),
            discount: Number(newCorporateItemForm.discount || 0),
            corp_item_bom: sanitizeBomRows(newCorporateItemForm.corp_item_bom),
            corp_item_return_bom: sanitizeBomRows(newCorporateItemForm.corp_item_return_bom),
            corp_item_price: Number(newCorporateItemForm.corp_item_price || 0),
            service_type: newCorporateItemForm.service_type,
        };

        try {
            setIsCreatingCorporateItem(true);
            setCreateCorporateItemMessage("");
            await createCorporateItem(payload);
            await fetchCorporateItems();
            setShowAddRawMaterialDialog(false);
            resetNewCorporateItemForm();
            await Swal.fire({
                icon: "success",
                title: "Item Created",
                text: "Corporate item was created successfully.",
                confirmButtonColor: "#1470F9",
            });
        } catch (error) {
            console.error("Error creating corporate item:", error);
            const message =
                error?.response?.data?.message ??
                error?.response?.data?.error ??
                (typeof error?.response?.data === "string" ? error.response.data : null) ??
                error?.message ??
                "Failed to create item. Please check values and try again.";
            setCreateCorporateItemMessage(message);
        } finally {
            setIsCreatingCorporateItem(false);
        }
    };

    return (
        <div className="flex flex-col gap-y-7">
            {/* Header Section */}
            <div className="flex flex-row justify-between items-start">
                <div className="flex flex-col">
                    <h1 className="text-blue-500 text-3xl font-bold">Settings</h1>
                    <p className="text-gray-400 text-lg mt-1 font-medium">Record new laundry pickup with item counts by category</p>
                </div>
                
                {/* Items tab header buttons */}
                {/* {selectedTab === 1 && (
                    <div className="flex flex-row gap-x-5 items-center">
                        <button
                            onClick={handleDownloadCorporateTemplate}
                            className="cursor-pointer bg-blue-600 text-white text-xl font-bold h-fit px-8 py-2.5 rounded-[2rem] flex items-center gap-x-2 shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                        >
                            <Icon icon="material-symbols:download" size={24} /> Download Template
                        </button>
                        <Link
                            className={`cursor-pointer border-2 border-blue-500 text-blue-500 text-xl font-bold h-fit px-8 py-2.5 rounded-[2rem] flex items-center gap-x-2 hover:bg-blue-50 transition-all ${selectedCustomer ? "" : "opacity-50 pointer-events-none"}`}
                            to={selectedCustomer ? `price-list-upload/${selectedCustomer}` : "#"}
                        >
                            <Icon icon="material-symbols:upload" size={24} /> Upload Items
                        </Link>
                    </div>
                )} */}

                {/* Discount tab header buttons */}
                {selectedTab === 3 && (
                    <div className="flex flex-row gap-x-5 items-center">
                        <button
                            onClick={handleDownloadDiscountTemplate}
                            className="cursor-pointer bg-blue-600 text-white text-xl font-bold h-fit px-8 py-2.5 rounded-[2rem] flex items-center gap-x-2 shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                        >
                            <Icon icon="material-symbols:download" size={24} /> Download Template
                        </button>
                        <button
                            onClick={() => discountFileInputRef.current?.click()}
                            disabled={isLoadingDiscountUpload}
                            className="cursor-pointer border-2 border-blue-500 text-blue-500 text-xl font-bold h-fit px-8 py-2.5 rounded-[2rem] flex items-center gap-x-2 hover:bg-blue-50 transition-all disabled:opacity-50"
                        >
                            {isLoadingDiscountUpload
                                ? <BeatLoader color="#3b82f6" size={8} />
                                : <><Icon icon="material-symbols:upload" size={24} /> Upload Items</>}
                        </button>
                        <input
                            ref={discountFileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={handleDiscountFileUpload}
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-row items-center border-b border-blue-200 w-full mb-2">
                <div className="flex flex-row gap-x-12 text-2xl font-medium text-gray-500">
                    <h2
                        className={`cursor-pointer pb-2 relative transition-all ${selectedTab === 1 ? "text-gray-900 border-b-4 border-gray-900" : "hover:text-gray-700"}`}
                        onClick={() => setSelectedTab(1)}
                    >
                        Items
                    </h2>
                    <h2
                        className={`cursor-pointer pb-2 relative transition-all ${selectedTab === 2 ? "text-gray-900 border-b-4 border-gray-900" : "hover:text-gray-700"}`}
                        onClick={() => { setSelectedTab(2); fetchAllSettings(); }}
                    >
                        Receipt
                    </h2>
                    <h2
                        className={`cursor-pointer pb-2 relative transition-all ${selectedTab === 3 ? "text-gray-900 border-b-4 border-gray-900" : "hover:text-gray-700"}`}
                        onClick={() => { setSelectedTab(3); fetchAllDiscounts(); }}
                    >
                        Discount
                    </h2>
                    <h2
                        className={`cursor-pointer pb-2 relative transition-all ${selectedTab === 4 ? "text-gray-900 border-b-4 border-gray-900" : "hover:text-gray-700"}`}
                        onClick={() => { setSelectedTab(4); fetchAllSettings(); }}
                    >
                        Tax
                    </h2>
                </div>
            </div>

            {/* Content Section */}
            {selectedTab === 1 &&
                <div>
                    <div className="bg-white rounded-xl mt-5 border border-dashed border-black/30 p-5">
                        <div className="flex flex-row justify-between items-center mb-4 gap-x-4 flex-wrap">
                            <div className="flex flex-row items-center gap-x-2 border border-black/20 rounded-full px-5 py-1.5 w-1/3 min-w-[280px]">
                                <MdSearch className="text-black/40 text-xl shrink-0" />
                                <input
                                    className="outline-none text-base w-full bg-transparent"
                                    placeholder="Search by item ID or item name"
                                    value={itemSearchQuery}
                                    onChange={(e) => setItemSearchQuery(e.target.value)}
                                />
                            </div>
                            <button
                                className="cursor-pointer border border-primary rounded-full font-bold text-lg text-primary flex flex-row gap-x-2 items-center py-2 px-5 ms-auto"
                                onClick={() => {
                                    resetNewCorporateItemForm();
                                    setShowAddRawMaterialDialog(true);
                                }}
                            >
                                <Icon icon={"mdi:plus"} />
                                Add Item
                            </button>
                        </div>
                        <div className="rounded-xl bg-white overflow-hidden min-h-[380px] border border-black/20">
                            <div className="text-base grid grid-cols-7 gap-x-3 text-black font-semibold py-2 px-5 border-b border-primary">
                                <p className="text-start">Item ID</p>
                                <p>Category</p>
                                <p>Item Name</p>    
                                <p>Raw Materials with Quantity</p>
                                <p>Service</p>
                                <p>Discount</p>
                                <p>Actions</p>
                            </div>

                            {isLoadingCorporateItems ? (
                                <div className="flex justify-center items-center py-20">
                                    <BeatLoader color="#1470F9" />
                                </div>
                            ) : (() => {
                                const filteredItems = (corporateItems || []).filter((item) => {
                                    const query = itemSearchQuery.trim().toLowerCase();
                                    if (!query) return true;
                                    const itemId = String(item.corp_item_id || "").toLowerCase();
                                    const itemName = String(item.corp_item_name || "").toLowerCase();
                                    return itemId.includes(query) || itemName.includes(query);
                                });
                                return filteredItems.length > 0 ? (
                                    filteredItems.map((item, index) => (
                                        <div
                                            key={item.corp_item_auto_id || index}
                                            className="grid grid-cols-7 gap-x-3 text-lg py-3 px-5 border-b border-black/10 items-center text-black/60"
                                        >
                                            <p className="text-start">{item.corp_item_id}</p>
                                            <p>{itemCategoryOptions.find(cat => cat.value === Number(item.item_category_id))?.label || item.category_name || "—"}</p>
                                            <p className="truncate">{item.corp_item_name}</p>   
                                            <div className="flex flex-col gap-y-1">
                                                {item.corp_item_bom?.map((bom, i) => {
                                                    const rm = rawMaterials.find(m => m.raw_material_id === bom.row_material_id);
                                                    return (
                                                        <p key={i} className="text-sm">
                                                            {rm ? rm.raw_material_name : bom.row_material_id}: {bom.row_material_quantity}
                                                        </p>
                                                    );
                                                })}
                                                {(!item.corp_item_bom || item.corp_item_bom.length === 0) && (
                                                    <p className="text-sm">-</p>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-y-1">
                                                <p className="text-sm">{item.service_type || (item.service_types && item.service_types[0]?.service_type_name) || "-"}</p>
                                            </div>
                                            <p>{item.discount != null ? item.discount : "0"}</p>
                                            <Link 
                                                className="text-red-500 font-semibold cursor-pointer"
                                                to={`/salesCorporate/corporate/settings/item-details/${item.corp_item_auto_id}`}
                                            >
                                                View All Materials
                                            </Link>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-black/50 py-10 text-xl">No items found.</div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            }

            {showAddRawMaterialDialog && (
                <div className="fixed inset-0 z-[9999] backdrop-blur-sm bg-white/50 flex items-center justify-center p-4">
                    <div className="w-[95%] max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl p-8 shadow-[0_0_20px_rgba(0,0,0,0.1)] relative">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-primary">Add New Item</h3>
                                <p className="text-sm">Corporate Item</p>
                            </div>
                            <button className="cursor-pointer rounded-full bg-[#E5F0FF] p-2 text-primary hover:bg-[#DDE8F8] transition-colors" onClick={() => setShowAddRawMaterialDialog(false)}>
                                <Icon icon={"mdi:close"} className="size-5" />
                            </button>
                        </div>

                        {/* Top Inputs */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-5 mb-8">
                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm">Corporate Item ID</label>
                                <input className="border border-black/20 rounded-lg px-3 py-2 text-black/50 bg-gray-100 cursor-not-allowed focus:outline-none" placeholder="COP_ITEM_3" value={newCorporateItemForm.corp_item_id} disabled readOnly />
                            </div>
                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm">Corporate Item Name</label>
                                <input className="border border-black/20 rounded-lg px-3 py-2 text-black focus:outline-none focus:border-primary" placeholder="Bed Sheet" value={newCorporateItemForm.corp_item_name} onChange={(e) => handleChangeNewCorporateItemField("corp_item_name", e.target.value)} />
                            </div>

                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm">Corporate Item KG Amount</label>
                                <input className="border border-black/20 rounded-lg px-3 py-2 text-black focus:outline-none focus:border-primary" placeholder="2.4 Kg" type="number" step="0.01" value={newCorporateItemForm.corp_item_kg_amount} onChange={(e) => handleChangeNewCorporateItemField("corp_item_kg_amount", e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-y-1">
                                <label className="text-sm">Item Category</label>
                                <Select
                                    styles={selectStyles}
                                    options={itemCategoryOptions}
                                    value={
                                        newCorporateItemForm.item_category_id ? itemCategoryOptions.find(cat => cat.value === newCorporateItemForm.item_category_id) : null
                                    }
                                    onChange={(option) => handleChangeNewCorporateItemField("item_category_id", option.value)}
                                    placeholder="Select Category"
                                    components={{ IndicatorSeparator: () => null }}
                                />
                            </div>
                            {/* <div className="flex flex-col gap-y-1">
                                <label className="text-sm">Discount</label>
                                <input className="border border-black/20 rounded-lg px-3 py-2 text-black focus:outline-none focus:border-primary" placeholder="0.00" type="number" step="0.01" value={newCorporateItemForm.discount} onChange={(e) => handleChangeNewCorporateItemField("discount", e.target.value)} />
                            </div> */}
                            {/* <div className="flex flex-col gap-y-1">
                                <label className="text-sm">Corporate Item Price.</label>
                                <input className="border border-black/20 rounded-lg px-3 py-2 text-black focus:outline-none focus:border-primary" placeholder="560" type="number" step="0.01" value={newCorporateItemForm.corp_item_price} onChange={(e) => handleChangeNewCorporateItemField("corp_item_price", e.target.value)} />
                            </div> */}
                        </div>

                        {/* BOM Section */}
                        <div className="mb-8">
                            <h4 className="text-[1.1rem] text-black/80 mb-1 border-b-[1.5px] border-[#7CAEF2] pb-1 font-medium">Corporate Item BOM</h4>
                            {newCorporateItemForm.corp_item_bom.map((row, index) => (
                                <div key={`bom-${index}`} className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4">
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-sm">Raw Material</label>
                                        <Select
                                            styles={selectStyles}
                                            options={rawMaterials.map(rm => ({ value: rm.raw_material_id, label: rm.raw_material_name }))}
                                            value={
                                                row.row_material_id 
                                                    ? { value: row.row_material_id, label: rawMaterials.find(rm => rm.raw_material_id === row.row_material_id)?.raw_material_name || row.row_material_id } 
                                                    : null
                                            }
                                            onChange={(option) => handleChangeBomRow("corp_item_bom", index, "row_material_id", option.value)}
                                            placeholder="Select Raw Material"
                                            components={{ IndicatorSeparator: () => null }}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-sm">Quantity</label>
                                        <div className="flex items-center gap-x-3">
                                            <input 
                                                className="border border-black/20 rounded-lg px-3 py-2 text-black w-full focus:outline-none focus:border-primary" 
                                                type="number" 
                                                placeholder="2" 
                                                value={row.row_material_quantity} 
                                                onChange={(e) => handleChangeBomRow("corp_item_bom", index, "row_material_quantity", e.target.value)} 
                                            />
                                            {newCorporateItemForm.corp_item_bom.length > 1 && (
                                                <button className="text-red-500 font-semibold cursor-pointer shrink-0 ml-2" onClick={() => removeBomRow("corp_item_bom", index)}>
                                                    <Icon icon={"mdi:trash-can-outline"} className="size-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button className="text-primary font-medium mt-3 cursor-pointer hover:underline text-[0.95rem]" onClick={() => addBomRow("corp_item_bom")}>
                                + Add Another Raw Material
                            </button>
                        </div>

                        {/* Return BOM Section */}
                        <div className="mb-8">
                            <h4 className="text-[1.1rem] text-black/80 mb-1 border-b-[1.5px] border-[#7CAEF2] pb-1 font-medium">Corporate Item Return BOM</h4>
                            {newCorporateItemForm.corp_item_return_bom.map((row, index) => (
                                <div key={`return-bom-${index}`} className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4">
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-sm">Raw Material</label>
                                        <Select
                                            styles={selectStyles}
                                            options={rawMaterials.map(rm => ({ value: rm.raw_material_id, label: rm.raw_material_name }))}
                                            value={
                                                row.row_material_id 
                                                    ? { value: row.row_material_id, label: rawMaterials.find(rm => rm.raw_material_id === row.row_material_id)?.raw_material_name || row.row_material_id } 
                                                    : null
                                            }
                                            onChange={(option) => handleChangeBomRow("corp_item_return_bom", index, "row_material_id", option.value)}
                                            placeholder="Select Raw Material"
                                            components={{ IndicatorSeparator: () => null }}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-y-1">
                                        <label className="text-sm">Quantity</label>
                                        <div className="flex items-center gap-x-3">
                                            <input 
                                                className="border border-black/20 rounded-lg px-3 py-2 text-black w-full focus:outline-none focus:border-primary" 
                                                type="number" 
                                                placeholder="2" 
                                                value={row.row_material_quantity} 
                                                onChange={(e) => handleChangeBomRow("corp_item_return_bom", index, "row_material_quantity", e.target.value)} 
                                            />
                                            {newCorporateItemForm.corp_item_return_bom.length > 1 && (
                                                <button className="text-red-500 font-semibold cursor-pointer shrink-0 ml-2" onClick={() => removeBomRow("corp_item_return_bom", index)}>
                                                    <Icon icon={"mdi:trash-can-outline"} className="size-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button className="text-primary font-medium mt-3 cursor-pointer hover:underline text-[0.95rem]" onClick={() => addBomRow("corp_item_return_bom")}>
                                + Add Another Raw Material
                            </button>
                        </div>

                        {/* Service Type Section */}
                        <div className="mb-6">
                            <h4 className="text-[1.1rem] text-black/80 mb-1 border-b-[1.5px] border-[#7CAEF2] pb-1 font-medium">Corporate Item Service Type</h4>
                            <div className="mt-4 flex flex-col gap-y-3 max-w-[400px]">
                                <label className="text-sm">Service Type</label>
                                <Select
                                    styles={selectStyles}
                                    options={[
                                        { value: "Washing", label: "Washing" },
                                        { value: "Pressing", label: "Pressing" },
                                        { value: "Dry Clean", label: "Dry Clean" }
                                    ]}
                                    value={
                                        newCorporateItemForm.service_type
                                            ? { value: newCorporateItemForm.service_type, label: newCorporateItemForm.service_type }
                                            : null
                                    }
                                    onChange={(option) => handleChangeNewCorporateItemField("service_type", option.value)}
                                    placeholder="Select Service Type"
                                    components={{ IndicatorSeparator: () => null }}
                                />
                            </div>
                        </div>

                        {createCorporateItemMessage ? (
                            <p className="text-red-500 font-medium my-3">{createCorporateItemMessage}</p>
                        ) : null}

                        <hr className="border-black/20 my-6" />

                        {/* Footer Buttons */}
                        <div className="grid grid-cols-2 gap-x-6 pb-2">
                            <button
                                className="cursor-pointer bg-primary text-white rounded-full py-2.5 font-semibold text-[1.1rem] flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-60"
                                onClick={handleCreateCorporateItem}
                                disabled={isCreatingCorporateItem}
                            >
                                {isCreatingCorporateItem ? <BeatLoader color="#FFFFFF" size={8} /> : "Create New Item"}
                            </button>
                            <button 
                                className="cursor-pointer bg-white text-primary border border-primary rounded-full py-2.5 font-semibold text-[1.1rem] flex items-center justify-center transition-colors hover:bg-primary/5" 
                                onClick={() => setShowAddRawMaterialDialog(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedTab === 2 &&
                <div className="flex flex-col bg-white rounded-xl p-5">
                    <h3 className="text-2xl font-semibold">Receipt Settings</h3>
                    <p className="text-lg text-black/50">Add Default Note and Terms & Conditions</p>

                    {isLoadingReceipt ? (
                        <div className="flex flex-col gap-y-4 mt-4 animate-pulse">
                            <div className="h-5 w-24 bg-gray-200 rounded-md" />
                            <div className="h-28 w-full bg-gray-200 rounded-lg" />
                            <div className="h-5 w-36 bg-gray-200 rounded-md mt-2" />
                            <div className="h-28 w-full bg-gray-200 rounded-lg" />
                            <div className="h-10 w-1/2 bg-gray-200 rounded-full mt-2" />
                        </div>
                    ) : (
                        <form onSubmit={handleUpdateSettings} className="flex flex-col">
                            <label className="text-xl font-semibold w-1/3 mt-3" htmlFor="receipt_notes">Note</label>
                            <textarea
                                id="receipt_notes"
                                name="receipt_notes"
                                placeholder="Enter Default Note here..."
                                className="px-4 py-1 text-xl border border-black/20 rounded-lg"
                                rows={4}
                                value={settings?.receipt_notes ?? ""}
                                onChange={handleInputChange}
                            />

                            <label className="text-xl font-semibold w-1/3 mt-3" htmlFor="receipt_terms">Terms & Conditions</label>
                            <textarea
                                id="receipt_terms"
                                name="receipt_terms"
                                placeholder="Enter Default Terms & Conditions here..."
                                className="px-4 py-1 text-xl border border-black/20 rounded-lg"
                                rows={4}
                                value={settings?.receipt_terms ?? ""}
                                onChange={handleInputChange}
                            />

                            <div className="flex flex-row items-center gap-x-5">
                                <button type="submit" className="bg-primary text-white font-bold text-xl h-fit rounded-full px-5 py-1 mt-3 w-1/2 cursor-pointer" disabled={isLoadingSettings}>{isLoadingSettings ? <BeatLoader color="#fff" size={10} /> : "Change"}</button>
                                <p className="text-xl text-green-500 font-semibold">{updateMessage}</p>
                            </div>
                        </form>
                    )}
                </div>
            }

            {selectedTab === 3 &&
                <div className="bg-white rounded-2xl p-5 border border-black/10">
                    <div className="flex flex-row items-center justify-between mb-4">
                        <h3 className="text-3xl font-semibold text-black/80">Discount List Table</h3>
                        <button
                            className="cursor-pointer border border-primary rounded-full font-bold text-2xl text-primary flex flex-row gap-x-2 items-center py-2 px-6"
                            onClick={() => setShowCreateDiscountDialog(true)}
                        >
                            <Icon icon={"gridicons:create"} />
                            Create New Discount
                        </button>
                    </div>

                    <div className="rounded-xl overflow-hidden bg-white border border-black/10">
                        <div className="text-sm grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-3 px-4 uppercase">
                            <p>Discount Name</p>
                            <p>Type</p>
                            <p>Condition</p>
                            <p>Value</p>
                            <p>Valid From</p>
                            <p>Valid To</p>
                            <p>Status</p>
                            <p className="text-center">Action</p>
                        </div>

                        {isLoadingDiscounts ? (
                            <div className="flex flex-col gap-y-2 p-4 animate-pulse">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="grid grid-cols-8 gap-x-3">
                                        {[...Array(8)].map((_, j) => (
                                            <div key={j} className="h-6 bg-gray-200 rounded-md" />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ) : discounts.length === 0 ? (
                            <div className="text-center text-black/50 py-10 text-xl">No discounts found.</div>
                        ) : (
                            discounts.map((discount, index) => (
                                <div
                                    key={discount.discount_auto_id}
                                    className={`grid grid-cols-8 gap-x-3 text-base py-2 px-4 items-center ${index % 2 === 0 ? "bg-white" : "bg-[#DDE8F8]"}`}
                                >
                                    <p>{discount.discount_name}</p>
                                    <p>{discount.discount_type}</p>
                                    <p>{discount.discount_condition}</p>
                                    <p>{discount.discount_value_type === "Percentage" ? `${discount.discount_value}%` : discount.discount_value}</p>
                                    <p>{formatDate(discount.discount_valid_from)}</p>
                                    <p>{formatDate(discount.discount_valid_to)}</p>
                                    <div>
                                        <p className={`w-fit px-3 rounded-full text-sm font-semibold ${discount.discount_status === "Active" ? "text-green-600 bg-green-500/20" : "text-red-500 bg-red-500/20"}`}>
                                            {discount.discount_status ?? "Active"}
                                        </p>
                                    </div>
                                    <div className="flex flex-row items-center justify-center gap-x-3">
                                        <div 
                                            className="flex flex-col items-center text-red-500 cursor-pointer"
                                            onClick={() => handleDeleteDiscountClick(discount)}
                                        >
                                            <Icon icon={"mdi:delete"} />
                                            <p className="text-[10px]">Delete</p>
                                        </div>
                                        <div className="h-6 border-r border-black/20"></div>
                                        <div 
                                            className="flex flex-col items-center text-green-500 cursor-pointer"
                                            onClick={() => handleEditDiscountClick(discount)}
                                        >
                                            <Icon icon={"iconamoon:edit-fill"} />
                                            <p className="text-[10px]">Edit</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                        <div className="h-10 bg-[#DDE8F8]"></div>
                    </div>

                    {discountUploadMessage && (
                        <p className={`text-lg font-semibold mt-3 ${discountUploadMessage.includes("failed") ? "text-red-500" : "text-green-500"}`}>
                            {discountUploadMessage}
                        </p>
                    )}
                </div>
            }

            {selectedTab === 4 &&
                <div className="flex flex-col bg-white rounded-xl p-5">
                    <div className="flex flex-row flex-wrap justify-between items-start gap-4 mb-2">
                        <div>
                            <h3 className="text-2xl font-semibold">Tax Settings</h3>
                            <p className="text-lg text-black/50">Enable tax calculation, then edit tax rates and status for defined taxes (e.g. SSCL, VAT). Assign taxes per customer in customer registration.</p>
                        </div>
                        {/* Tax names (e.g. SSCL, VAT) are fixed for billing logic — creation disabled */}
                        {/*
                        <button
                            type="button"
                            onClick={handleOpenCreateCorporateTax}
                            className="cursor-pointer border border-primary rounded-full font-bold text-lg text-primary flex flex-row gap-x-2 items-center py-2 px-5 shrink-0"
                        >
                            <Icon icon={"gridicons:create"} />
                            Create New Tax
                        </button>
                        */}
                    </div>

                    {isLoadingReceipt ? (
                        <div className="flex flex-col gap-y-4 mt-4 animate-pulse">
                            <div className="h-5 w-24 bg-gray-200 rounded-md" />
                            <div className="h-10 w-full bg-gray-200 rounded-lg" />
                            <div className="h-10 w-1/2 bg-gray-200 rounded-full mt-2" />
                        </div>
                    ) : (
                        <form onSubmit={handleUpdateSettings} className="flex flex-col border-b border-gray-200 pb-6 mb-6">
                            <div className="flex flex-row gap-x-3 items-center my-2">
                                {settings?.is_tax_enabled ?
                                    <ImCheckboxChecked
                                        className="text-green-500 cursor-pointer size-5"
                                        onClick={() => setSettings(prev => ({ ...prev, is_tax_enabled: prev?.is_tax_enabled ? 0 : 1 }))}
                                    /> :
                                    <ImCheckboxUnchecked
                                        className="text-black/50 cursor-pointer size-5"
                                        onClick={() => setSettings(prev => ({ ...prev, is_tax_enabled: prev?.is_tax_enabled ? 0 : 1 }))}
                                    />
                                }
                                <p className="text-xl font-medium select-none cursor-pointer" onClick={() => setSettings(prev => ({ ...prev, is_tax_enabled: prev?.is_tax_enabled ? 0 : 1 }))}>Enable Tax Calculation</p>
                            </div>
                            <div className="flex flex-row items-center gap-x-5 mt-4">
                                <button type="submit" className="bg-primary text-white font-bold text-xl h-fit rounded-full px-5 py-2.5 w-full max-w-xs cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60" disabled={isLoadingSettings}>{isLoadingSettings ? <BeatLoader color="#fff" size={10} /> : "Save tax toggle"}</button>
                                <p className="text-xl text-green-500 font-semibold">{updateMessage}</p>
                            </div>
                        </form>
                    )}

                    <h4 className="text-xl font-semibold mb-3">Defined taxes</h4>
                    {isLoadingCorporateTaxes ? (
                        <div className="flex justify-center py-12">
                            <BeatLoader color="#1470F9" size={12} />
                        </div>
                    ) : (
                        <div className="rounded-xl bg-white overflow-hidden border border-gray-200">
                            <div className="text-lg grid grid-cols-5 gap-x-3 text-white bg-primary font-semibold py-2 px-4 items-center">
                                <p className="text-start col-span-2">TAX NAME</p>
                                <p>RATE (%)</p>
                                <p>STATUS</p>
                                <p className="text-center">ACTIONS</p>
                            </div>
                            {corporateTaxes.length === 0 ? (
                                <div className="text-center text-black/50 py-10 text-lg">No taxes found.</div>
                            ) : (
                                corporateTaxes.map((tax, index) => (
                                    <div
                                        key={tax.tax_id ?? index}
                                        className={`grid grid-cols-5 gap-x-3 text-base py-2 px-4 items-center ${index % 2 === 0 ? "bg-white" : "bg-[#DDE8F8]"}`}
                                    >
                                        <p className="col-span-2 font-medium">{tax.tax_name}</p>
                                        <p>{Number(tax.tax_rate).toFixed(2)}</p>
                                        <div>
                                            <span className={`w-fit px-3 rounded-full text-sm font-semibold inline-block ${tax.is_active === 0 || tax.is_active === false ? "text-red-600 bg-red-500/20" : "text-green-600 bg-green-500/20"}`}>
                                                {tax.is_active === 0 || tax.is_active === false ? "Inactive" : "Active"}
                                            </span>
                                        </div>
                                        <div className="flex flex-row items-center justify-center gap-x-4">
                                            <button
                                                type="button"
                                                className="flex flex-col items-center text-red-500 cursor-pointer bg-transparent border-0 p-0"
                                                onClick={() => handleDeleteCorporateTax(tax)}
                                            >
                                                <Icon icon={"mdi:delete"} />
                                                <span className="text-[10px]">Delete</span>
                                            </button>
                                            <div className="h-6 border-r border-black/20" />
                                            <button
                                                type="button"
                                                className="flex flex-col items-center text-green-500 cursor-pointer bg-transparent border-0 p-0"
                                                onClick={() => handleOpenEditCorporateTax(tax)}
                                            >
                                                <Icon icon={"iconamoon:edit-fill"} />
                                                <span className="text-[10px]">Edit</span>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {showCorporateTaxModal && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl relative p-8">
                                <button
                                    type="button"
                                    onClick={handleCloseCorporateTaxModal}
                                    className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                                    aria-label="Close"
                                >
                                    <MdClose size={22} />
                                </button>
                                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                                    {corporateTaxModalMode === "edit" ? "Edit tax" : "Create new tax"}
                                </h2>
                                <p className="text-sm text-gray-500 mb-6">
                                    {corporateTaxModalMode === "edit"
                                        ? "Tax name cannot be changed (SSCL / VAT). Update rate or status only."
                                        : "Tax name and rate apply to corporate billing for this account."}
                                </p>

                                <form onSubmit={handleSubmitCorporateTaxModal} className="flex flex-col gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Tax name</label>
                                        <input
                                            readOnly={corporateTaxModalMode === "edit"}
                                            aria-readonly={corporateTaxModalMode === "edit"}
                                            className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary ${
                                                corporateTaxModalMode === "edit"
                                                    ? "bg-gray-100 text-gray-800 cursor-not-allowed"
                                                    : ""
                                            }`}
                                            value={taxModalName}
                                            onChange={(e) => setTaxModalName(e.target.value)}
                                            placeholder="e.g. VAT"
                                            maxLength={255}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Tax rate (%)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-primary"
                                            value={taxModalRate}
                                            onChange={(e) => setTaxModalRate(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={taxModalIsActive}
                                            onChange={(e) => setTaxModalIsActive(e.target.checked)}
                                            className="rounded border-gray-300 size-4"
                                        />
                                        <span className="text-sm font-medium text-gray-800">Active (available for customer assignment)</span>
                                    </label>

                                    {taxModalError && <p className="text-sm text-red-600 font-medium">{taxModalError}</p>}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={handleCloseCorporateTaxModal}
                                            className="flex-1 py-2.5 rounded-xl border border-gray-300 font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={taxModalSaving}
                                            className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-60 cursor-pointer flex justify-center"
                                        >
                                            {taxModalSaving ? <BeatLoader color="#fff" size={8} /> : corporateTaxModalMode === "edit" ? "Save" : "Create"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            }

            {/* {selectedTab === 3 &&
                <div className="bg-white rounded-xl p-5">
                    <div className="flex flex-row justify-between items-center mb-3">
                        <h3 className="text-2xl font-semibold">Discount List Table</h3>

                        <button className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5" onClick={() => setShowCreateDiscountDialog(true)}><Icon icon={"gridicons:create"} />Create New Discount</button>
                    </div>
                    <div className="rounded-xl bg-white overflow-hidden">
                        <div className="text-xl grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                            <p className="text-start">DISCOUNT NAME</p>
                            <p>TYPE</p>
                            <p>CONDITION</p>
                            <p>VALUE</p>
                            <p>VALID FROM</p>
                            <p>VALID TO</p>
                            <p>STATUS</p>
                            <p>ACTION</p>
                        </div>

                        {discounts.map((discount, index) => (
                            <div key={index} className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 text-center px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <p className="text-start">{discount.discountName}</p>
                                <p>{discount.type}</p>
                                <p>{discount.condition}</p>
                                <p>{discount.value}</p>
                                <p>{discount.validFrom}</p>
                                <p>{discount.validTo}</p>
                                {discount.status === "Active" &&
                                    <p className="text-green-500 bg-green-500/20 rounded-full">{discount.status}</p>
                                }
                                {discount.status === "Pending" &&
                                    <p className="text-red-500 bg-red-500/20 rounded-full">{discount.status}</p>
                                }
                                <div className="flex flex-row gap-x-1 justify-center">
                                    <div className="flex flex-col cursor-pointer items-center">
                                        <Icon icon={"mdi:delete"} className="text-red-500" />
                                        <p className="text-sm">Delete</p>
                                    </div>

                                    <div className="min-h-max border border-black/50 my-1" />

                                    <div className="flex flex-col cursor-pointer items-center" onClick={() => { }}>
                                        <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                        <p className="text-sm">Edit</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            } */}

            {showCreateDiscountDialog &&
                <CorporateCreateDiscountDialog 
                    handleClose={() => setShowCreateDiscountDialog(false)} 
                    refreshDiscounts={fetchAllDiscounts}
                />
            }

            {showEditDiscountDialog && selectedDiscount &&
                <CorporateEditDiscountDialog 
                    handleClose={() => {
                        setShowEditDiscountDialog(false);
                        setSelectedDiscount(null);
                    }} 
                    refreshDiscounts={fetchAllDiscounts}
                    initialData={selectedDiscount}
                />
            }

            {showDeleteDiscountDialog && selectedDiscount &&
                <ConfirmationDialog
                    title={"Delete Discount"}
                    text={"Are you sure you want to delete the discount"}
                    item={selectedDiscount.discount_name}
                    onClose={() => {
                        setShowDeleteDiscountDialog(false);
                        setSelectedDiscount(null);
                    }}
                    onSubmit={handleConfirmDeleteDiscount}
                    isLoading={isLoadingDeleteDiscount}
                />
            }

            {showDeactivateItemTypeConfirmationDialog &&
                <ConfirmationDialog
                    title={"Deactivate Item Type"}
                    text={"Are you sure to deactivate the item type"}
                    item={selectedItemType?.item_type_name}
                    onClose={() => {
                        setShowDeactivateItemTypeConfirmationDialog(false);
                        setSelectedItemType(null);
                    }}
                    onSubmit={handleDeactivateItemType}
                    isLoading={isLoadingDeactivateItemType}
                />
            }

        </div>
    );
};

export default SalesCorporateSettings;