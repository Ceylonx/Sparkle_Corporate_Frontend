import { useEffect, useMemo, useRef, useState } from "react";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import RetailCreateDiscountDialog from "../../components/dialogs/retail/RetailCreateDiscountDialog";
import RetailCreateDriverDialog from "../../components/dialogs/retail/RetailCreateDriverDialog";
import RetailUpdateDriverDialog from "../../components/dialogs/retail/RetailUpdateDriverDialog";
import RetailCreateVehicleDialog from "../../components/dialogs/retail/RetailCreateVehicleDialog";
import RetailUpdateVehicleDialog from "../../components/dialogs/retail/RetailUpdateVehicleDialog";
import RetailIssueVoucherDialog from "../../components/dialogs/retail/RetailIssueVoucherDialog";
import RetailItemTypeWeightUploadDialog from "../../components/dialogs/retail/RetailItemTypeWeightUploadDialog";
import RetailItemTypeEditDialog from "../../components/dialogs/retail/RetailItemTypeEditDialog";
import { createItemType, deactivateItemType, getAllItemTypes, getAllPriceLists, getAllSettings, updateSettings, dayEndRetail } from "../../services/Retail/RetailSettingsServices";
import { markPosAttendance } from "../../services/Retail/RetailEmployeeServices";
import { BeatLoader } from "react-spinners";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import { deleteRetailDiscount, getAllRetailDiscounts, updateRetailDiscountStatus } from "../../services/Retail/RetailDiscountServices";
import { getAllRetailDrivers, deleteRetailDriver } from "../../services/Retail/RetailDriverServices";
import { getAllRetailVehicles, deleteRetailVehicle } from "../../services/Retail/RetailVehicleServices";
import RetailUpdateDiscountDialog from "../../components/dialogs/retail/RetailUpdateDiscountDialog";
import { getAllRetailVouchers } from "../../services/Retail/RetailVoucherServices";
import RetailUpdateVoucherDialog from "../../components/dialogs/retail/RetailUpdateVoucherDialog";
import Input from "../../components/ui/Input";
import FilterSelector from "../../components/ui/FilterSelector";
import { MdSearch } from "react-icons/md";
import Swal from "sweetalert2";
import PermissionDenied from "../../components/ui/PermissionDenied";
import {
    canAccessSettingsManagement,
    getSettingsTabActions,
    getSettingsTabVisibility,
    parsePermissionTokens,
} from "../../utils/retailSubTabPermissions";

const SalesRetailSettings = () => {
    const [isLoadingPriceList, setIsLoadingPriceList] = useState(false);
    const [isLoadingItemTypes, setIsLoadingItemTypes] = useState(false);
    const [isLoadingAddItemType, setIsLoadingAddItemType] = useState(false);
    const [isLoadingDeactivateItemType, setIsLoadingDeactivateItemType] = useState(false);
    const [isLoadingDiscounts, setIsLoadingDiscounts] = useState(false);
    const [isLoadingDeleteDiscount, setIsLoadingDeleteDiscount] = useState(false);
    const [isLoadingVouchers, setIsLoadingVouchers] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [selectedTab, setSelectedTab] = useState(1);
    const [showCreateDiscountDialog, setShowCreateDiscountDialog] = useState(false);
    const [showUpdateDiscountDialog, setShowUpdateDiscountDialog] = useState(false);
    const [showIssueVoucherDialog, setShowIssueVoucherDialog] = useState(false);
    const [showUpdateVoucherDialog, setShowUpdateVoucherDialog] = useState(false);
    const [priceList, setPriceList] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [newItemType, setNewItemType] = useState("");
    const [showItemTypeNameSuggestions, setShowItemTypeNameSuggestions] = useState(false);
    const [newItemTypeWeight, setNewItemTypeWeight] = useState("");
    const [isItemTypeCodeEditable, setIsItemTypeCodeEditable] = useState(false);
    const [customItemTypeCode, setCustomItemTypeCode] = useState("");
    const [showItemWeightUploadDialog, setShowItemWeightUploadDialog] = useState(false);
    const [itemTypeSearchQuery, setItemTypeSearchQuery] = useState("");
    const [editingItemType, setEditingItemType] = useState(null);
    const [showEditItemTypeDialog, setShowEditItemTypeDialog] = useState(false);
    const [showDeactivateItemTypeConfirmationDialog, setShowDeactivateItemTypeConfirmationDialog] = useState(false);
    const [showDeleteDiscountConfirmationDialog, setShowDeleteDiscountConfirmationDialog] = useState(false);
    const [selectedItemType, setSelectedItemType] = useState(null);
    const [discounts, setDiscounts] = useState([]);
    const [selectedDiscount, setSelectedDiscount] = useState(null);
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [showCreateDriverDialog, setShowCreateDriverDialog] = useState(false);
    const [showUpdateDriverDialog, setShowUpdateDriverDialog] = useState(false);
    const [showDeleteDriverConfirmationDialog, setShowDeleteDriverConfirmationDialog] = useState(false);
    const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
    const [isLoadingDeleteDriver, setIsLoadingDeleteDriver] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [showCreateVehicleDialog, setShowCreateVehicleDialog] = useState(false);
    const [showUpdateVehicleDialog, setShowUpdateVehicleDialog] = useState(false);
    const [showDeleteVehicleConfirmationDialog, setShowDeleteVehicleConfirmationDialog] = useState(false);
    const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
    const [isLoadingDeleteVehicle, setIsLoadingDeleteVehicle] = useState(false);
    const [vouchers, setVouchers] = useState([]);
    const [selectedVoucher, setSelectedVoucher] = useState(null);
    const location = useLocation();
    const navigate = useNavigate();
    const currentPage = location.pathname;
    const [itemTypeErrorMsg, setItemTypeErrorMsg] = useState("");
    const [searchQueryVoucher, setSearchQueryVoucher] = useState("");
    const [statusFilterVoucher, setStatusFilterVoucher] = useState("");
    const [updateMessage, setUpdateMessage] = useState("");
    const timeoutRef = useRef(null);
    const itemTypesScrollRef = useRef(null);
    const [isLoadingDayEnd, setIsLoadingDayEnd] = useState(false);
    const [settings, setSettings] = useState(
        {
            discount_id: 2,
            discount_name: "Test",
            discount_type: "Min Bill",
            discount_condition: "5000",
            value: 500,
            valid_from: "2025-09-18T00:00:00.000Z",
            valid_to: "2025-10-08T00:00:00.000Z",
            status: "Active",
            bag_count: 0,
            sticker_count_per_page: 6,
            auto_apply: 1,
            created_at: "2025-09-17T12:27:18.000Z",
            enable_tax_calculations: false,
            tax_rate: "",
            tax_name: "",
            receipt_notes: "",
            receipt_terms: "",
            delivery_charge: 0
        }
    );

    const permissions = localStorage.getItem("permissions") || "";
    const permissionTokens = parsePermissionTokens(permissions);
    const settingsTabVisibility = getSettingsTabVisibility(permissionTokens);
    const settingsTabActions = getSettingsTabActions(permissionTokens);
    const canAccessSettingsPage = canAccessSettingsManagement(permissionTokens);
    // Legacy tabs (Tax, Vouchers) are hidden from the nav and not part of the granular
    // sub-tab scheme above - they still gate on the parent's own tokens.
    const canCreate = permissions.includes("SalesRetail_Settings_Create");
    const canEdit = permissions.includes("SalesRetail_Settings_Edit");

    useEffect(() => {
        const settingsTabOrder = ["priceList", "items", "receipt", "discount", "drivers", "otherSettings"];
        const tabNumberFor = { priceList: 1, items: 2, receipt: 4, discount: 5, drivers: 8, otherSettings: 7 };
        const isVisible = (tabNumber) => Object.entries(tabNumberFor).some(
            ([key, num]) => num === tabNumber && settingsTabVisibility[key]
        );
        if (selectedTab === 3 || selectedTab === 6 || isVisible(selectedTab)) return;
        const nextKey = settingsTabOrder.find((key) => settingsTabVisibility[key]);
        if (nextKey) setSelectedTab(tabNumberFor[nextKey]);
    }, [permissions, selectedTab]);

    useEffect(() => {
        document.querySelectorAll('input[type=number]').forEach((input) => {
            input.addEventListener("wheel", function (e) {
                e.preventDefault(); // disable scroll changing value
            });
        });
    }, []);

    const fetchAllSettings = async () => {
        try {
            const response = await getAllSettings(localStorage.getItem("userId"));
            if (response && response.data && response.data.settings && response.data.settings[0]) {
                setSettings(response.data.settings[0]);
            }
        } catch (error) {
            console.error("Error fetching settings: ", error);
        }
    };

    const fetchPriceList = async () => {
        try {
            setIsLoadingPriceList(true);
            const response = await getAllPriceLists(localStorage.getItem("userId"));
            if (response && response.data && response.data.price_lists) {
                setPriceList(response.data.price_lists);
            } else {
                setPriceList([]);
            }
        } catch (error) {
            console.error("Error fetching price list: ", error);
            setPriceList([]);
        } finally {
            setIsLoadingPriceList(false);
        }
    };

    const splitItemTypeNameCode = (item_type_name) => {
        const parts = (item_type_name || '').split(' - ');
        const code = parts.length > 1 ? parts[parts.length - 1] : '';
        const name = parts.length > 1 ? parts.slice(0, -1).join(' - ') : item_type_name;
        return { code, name };
    };

    const getNextItemTypeCode = () => {
        let maxNum = 0;
        (itemTypes || []).forEach((type) => {
            const { code } = splitItemTypeNameCode(type.item_type_name);
            const match = (code || '').match(/^R(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `R${String(maxNum + 1).padStart(6, '0')}`;
    };

    const validateItemTypeCode = (codeValue) => {
        const trimmed = (codeValue || '').trim().toUpperCase();
        if (!/^R\d{6}$/.test(trimmed)) {
            return { valid: false, available: false, message: "Code must follow the pattern R000000 (R followed by 6 digits)." };
        }
        const isDuplicate = (itemTypes || []).some((type) => {
            const { code } = splitItemTypeNameCode(type.item_type_name);
            return (code || '').toUpperCase() === trimmed;
        });
        if (isDuplicate) {
            return { valid: false, available: false, message: `Code ${trimmed} is already in use.` };
        }
        return { valid: true, available: true, message: `Code ${trimmed} is available.` };
    };

    const itemTypeNamePrefixSuggestions = useMemo(() => {
        const prefixes = new Set();
        (itemTypes || []).forEach((type) => {
            const { name } = splitItemTypeNameCode(type.item_type_name);
            const segments = (name || '').split(' - ');
            if (segments.length > 1) {
                prefixes.add(segments.slice(0, -1).join(' - ') + ' - ');
            }
        });
        return Array.from(prefixes).sort();
    }, [itemTypes]);

    const fetchItemTypes = async () => {
        try {
            setIsLoadingItemTypes(true);
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            if (response && response.data && response.data.item_types) {
                setItemTypes(response.data.item_types);
            } else {
                setItemTypes([]);
            }
        } catch (error) {
            console.error("Error fetching item types: ", error);
            setItemTypes([]);
        } finally {
            setIsLoadingItemTypes(false);
        }
    };

    const fetchDiscounts = async () => {
        try {
            setIsLoadingDiscounts(true);
            const response = await getAllRetailDiscounts(localStorage.getItem("userId"));
            if (response && response.data && response.data.discounts && Array.isArray(response.data.discounts)) {
                const filtered = response.data.discounts.filter(discount => discount.customer_type === "Retail");
                setDiscounts(filtered);
            } else {
                setDiscounts([]);
            }
        } catch (error) {
            console.error("Error fetching discounts: ", error);
            setDiscounts([]);
        } finally {
            setIsLoadingDiscounts(false);
        }
    };

    const fetchDrivers = async () => {
        try {
            setIsLoadingDrivers(true);
            const res = await getAllRetailDrivers();
            if (res && res.success) {
                setDrivers(res.drivers);
            } else {
                setDrivers([]);
            }
        } catch (err) {
            console.error("Error fetching drivers: ", err);
            setDrivers([]);
        } finally {
            setIsLoadingDrivers(false);
        }
    };

    const fetchVehicles = async () => {
        try {
            setIsLoadingVehicles(true);
            const res = await getAllRetailVehicles();
            if (res && res.success) {
                setVehicles(res.vehicles);
            } else {
                setVehicles([]);
            }
        } catch (err) {
            console.error("Error fetching vehicles: ", err);
            setVehicles([]);
        } finally {
            setIsLoadingVehicles(false);
        }
    };

    const fetchVouchers = async () => {
        try {
            setIsLoadingVouchers(true);
            const response = await getAllRetailVouchers(localStorage.getItem("userId"));
            if (!response || !response.data || !response.data.vouchers || !Array.isArray(response.data.vouchers)) {
                setVouchers([]);
                return;
            }
            const filtered = response.data.vouchers.filter(voucher => voucher.status !== "Deactive");

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const updatedVouchers = filtered.map(voucher => {
                const issuedDate = new Date(voucher.issued_date);
                const expireDate = new Date(voucher.expire_date);

                let status = voucher.status;

                // Calculate status dynamically based on business rules
                if (Number(voucher.balance) === 0) {
                    status = "Redeemed";
                } else if (expireDate < today) {
                    status = "Expired";
                } else if (issuedDate > today) {
                    status = "Inactive";
                } else {
                    status = "Pending";
                }

                return {
                    ...voucher,
                    status
                };
            });

            const statusOrder = {
                Pending: 0,
                Inactive: 2,
                Redeemed: 3,
                Expired: 4
            };

            const sortedVouchers = [...updatedVouchers].sort(
                (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
            );

            setVouchers(sortedVouchers);
        } catch (error) {
            console.error("Error fetching vouchers: ", error);
        } finally {
            setIsLoadingVouchers(false);
        }
    };

    useEffect(() => {
        fetchAllSettings();
        fetchPriceList();
        fetchItemTypes();
        fetchDiscounts();
        fetchVouchers();
        fetchDrivers();
        fetchVehicles();
    }, []);

    useEffect(() => {
        if (selectedTab === 8) {
            fetchDrivers();
            fetchVehicles();
        }
    }, [selectedTab]);

    useEffect(() => {
        if (location.state?.openVoucherTab) {
            setSelectedTab(6);
            navigate(location.pathname, { replace: true, state: {} });
            const t = setTimeout(() => fetchVouchers(), 100);
            return () => clearTimeout(t);
        }
    }, [location.state]);

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
            const response = await updateSettings(payload);

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

    const handleDayEnd = async (e) => {
        e.preventDefault();

        try {
            // Ask cash in hand from user (clean popup)
            const { value: cashInHand } = await Swal.fire({
                title: "Day End",
                text: "Enter cash in hand amount",
                input: "number",
                inputPlaceholder: "Enter amount",
                inputAttributes: {
                    min: 0,
                    step: "0.01"
                },
                showCancelButton: true,
                confirmButtonText: "Submit",
                cancelButtonText: "Cancel",
                confirmButtonColor: "#2070F9",
                inputValidator: (value) => {
                    if (!value || value <= 0) {
                        return "Please enter a valid cash amount";
                    }
                }
            });

            // If user cancels
            if (!cashInHand) return;

            setIsLoadingDayEnd(true);

            const payload = {
                branch_id: 1,
                user_id: localStorage.getItem("userId"),
                cash_in_hand: Number(cashInHand),
                last_4_digits_of_card: last4DigitsOfCard || 0,
            };

            const response = await dayEndRetail(payload);

            // Success
            if (response.message === 'Day closing balance created successfully') {
                // Also call HR pos_attendance API for day end 
                try {
                    const userId = localStorage.getItem("userId");
                    const branchId = Number(localStorage.getItem("selectedBranchId")) || 1;
                    const branchName = localStorage.getItem("selectedBranchName") || "";
                    await markPosAttendance({
                        employeeId: localStorage.getItem("employeeId") || userId,
                        timestamp: new Date().toISOString(),
                        cashAmount: Number(cashInHand),
                        shift: "Day End",
                        branchId: String(branchId),
                        branchName,
                    });
                } catch (posErr) {
                    console.warn("HR pos_attendance call during day end:", posErr?.response?.data || posErr?.message);
                }
                //Show dialog and auto logout
                await Swal.fire({
                    icon: "success",
                    title: "Day End Successful",
                    text: "The day has been ended successfully. You will be logged out now.",
                    confirmButtonText: "OK",
                    confirmButtonColor: "#2070F9",
                });
                // Logout (day end clears everything including attendance)
                localStorage.clear();
                window.location.href = `${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/login`;
            }

            // Clear message after 2s
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                setUpdateMessage("");
            }, 2000);

        } catch (error) {

            const response = error.response;

            // Business validation error
            if (error.status === 400) {
                await Swal.fire({
                    icon: "warning",
                    title: "Day End Failed",
                    text: response.data?.message || "Day end balance mismatch",
                });
                return;
            } else {
                // System error
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: "Something went wrong. Please try again.",
                });
            }

        } finally {
            setIsLoadingDayEnd(false);
        }
    };

    const handleAddItemType = async () => {
        try {
            if (newItemType.trim() === "") {
                setItemTypeErrorMsg("Item type name cannot be empty.");
                return;
            } else if (newItemTypeWeight.trim() !== "" && (isNaN(Number(newItemTypeWeight)) || Number(newItemTypeWeight) < 0)) {
                setItemTypeErrorMsg("Weight must be a non-negative number.");
                return;
            } else if (isItemTypeCodeEditable && !validateItemTypeCode(customItemTypeCode).valid) {
                setItemTypeErrorMsg(validateItemTypeCode(customItemTypeCode).message);
                return;
            } else {
                setItemTypeErrorMsg("");
            }
            setIsLoadingAddItemType(true);
            const itemTypeCode = isItemTypeCodeEditable ? customItemTypeCode.trim().toUpperCase() : getNextItemTypeCode();
            const payload = {
                user_id: localStorage.getItem("userId"),
                item_type_name: `${newItemType.trim()} - ${itemTypeCode}`,
                item_type_weight: newItemTypeWeight.trim() === "" ? null : Number(newItemTypeWeight),
            }
            const response = await createItemType(payload);
            setNewItemType("");
            setNewItemTypeWeight("");
            setIsItemTypeCodeEditable(false);
            setCustomItemTypeCode("");
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
            setShowDeactivateItemTypeConfirmationDialog(false);
        } catch (error) {
            console.error("Error deactivating item type: ", error);
        } finally {
            setIsLoadingDeactivateItemType(false);
        }
    };

    const handleDeleteDiscount = async () => {
        try {
            setIsLoadingDeleteDiscount(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                discount_id: selectedDiscount.discount_id,
            }
            const response = await deleteRetailDiscount(payload);
            setSelectedDiscount(null);
            fetchDiscounts();
            setShowDeleteDiscountConfirmationDialog(false);
        } catch (error) {
            console.error("Error deleting discount: ", error);
        } finally {
            setIsLoadingDeleteDiscount(false);
        }
    };

    const handleToggleDiscountStatus = async (discount) => {
        const newStatus = discount.status === "Active" ? "Deactive" : "Active";
        try {
            const userId = localStorage.getItem("userId");
            await updateRetailDiscountStatus({
                user_id: userId,
                discount_id: discount.discount_id,
                status: newStatus
            });
            fetchDiscounts();
            Swal.fire({
                icon: "success",
                title: "Status Updated",
                text: `Discount is now ${newStatus}`,
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Error updating discount status:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to update discount status"
            });
        }
    };

    const handleDeleteDriver = async () => {
        try {
            setIsLoadingDeleteDriver(true);
            const response = await deleteRetailDriver(selectedDriver.id);
            setSelectedDriver(null);
            fetchDrivers();
            setShowDeleteDriverConfirmationDialog(false);
            Swal.fire({
                icon: "success",
                title: "Deleted",
                text: "Driver deleted successfully!",
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Error deleting driver: ", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to delete driver"
            });
        } finally {
            setIsLoadingDeleteDriver(false);
        }
    };

    const handleDeleteVehicle = async () => {
        try {
            setIsLoadingDeleteVehicle(true);
            const response = await deleteRetailVehicle(selectedVehicle.id);
            setSelectedVehicle(null);
            fetchVehicles();
            setShowDeleteVehicleConfirmationDialog(false);
            Swal.fire({
                icon: "success",
                title: "Deleted",
                text: "Vehicle deleted successfully!",
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Error deleting vehicle: ", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to delete vehicle"
            });
        } finally {
            setIsLoadingDeleteVehicle(false);
        }
    };

    const voucherStatusOptions = [
        { value: '', label: 'All' },
        { value: 'Pending', label: 'Pending' },
        { value: 'Inactive', label: 'Inactive' },
        { value: 'Redeemed', label: 'Redeemed' },
        { value: 'Expired', label: 'Expired' },
    ];

    const handleStatusFilterChangeVoucher = (e) => {
        setStatusFilterVoucher(e.target.value);
    };

    const voucherCsvColumns = "voucher_id,voucher_code,value,balance,issued_to,issued_date,expire_date,validity_period,status,created_at";

    const escapeCsv = (val) => {
        const s = val == null ? "" : String(val);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const handleExportVouchers = () => {
        const headers = voucherCsvColumns;
        const rows = vouchers.map((v) => {
            const issued = v.issued_date ? new Date(v.issued_date).toISOString().split("T")[0] : "";
            const expire = v.expire_date ? new Date(v.expire_date).toISOString().split("T")[0] : "";
            const created = v.created_at ? new Date(v.created_at).toISOString().split("T")[0] : "";
            return [v.voucher_id, v.voucher_code, v.value, v.balance, v.issued_to, issued, expire, v.validity_period ?? "", v.status || "", created].map(escapeCsv).join(",");
        });
        const csvContent = [headers, ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "voucher_list_export.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    //filtering vouchers
    const filteredVouchers = vouchers.filter((voucher) => {
        const matchesQuery = (field) => {
            if (!searchQueryVoucher || !field) return false;

            const fieldStr = field.toString().toLowerCase();
            const searchWords = searchQueryVoucher
                .toLowerCase()
                .split(/\s*\*\s*/) // split by `*` with optional spaces
                .filter(word => word.trim().length > 0);

            return searchWords.every(word => fieldStr.includes(word));
        };

        const matchesSearch = searchQueryVoucher
            ? matchesQuery(voucher.voucher_code) ||
            matchesQuery(voucher.issued_to)
            : true;

        const matchesStatusFilter = statusFilterVoucher
            ? voucher.status === statusFilterVoucher
            : true;

        return matchesSearch && matchesStatusFilter;
    });

    if (!canAccessSettingsPage) {
        return <PermissionDenied label="Settings" />;
    }

    const handleDownloadTemplate = () => {
        const headers = [
            "row_id",
            "item_type",
            "express_washing_price",
            "one_day_washing_price",
            "normal_washing_price",
            "express_pressing_price",
            "one_day_pressing_price",
            "normal_pressing_price",
            "express_dry_clean_price",
            "one_day_dry_clean_price",
            "normal_dry_clean_price",
            "urgent_washing_price",
            "urgent_pressing_price",
            "urgent_dry_clean_price",
            "two_day_washing_price",
            "two_day_pressing_price",
            "two_day_dry_clean_price"
        ];

        const dataRows = priceList.map((pl, index) => {
            return {
                row_id: pl.row_id || `ROW${String(index + 1).padStart(3, '0')}`,
                item_type: pl.item_type_name,
                express_washing_price: pl.express_washing_price || 0,
                one_day_washing_price: pl.one_day_washing_price || 0,
                normal_washing_price: pl.normal_washing_price || 0,
                express_pressing_price: pl.express_pressing_price || 0,
                one_day_pressing_price: pl.one_day_pressing_price || 0,
                normal_pressing_price: pl.normal_pressing_price || 0,
                express_dry_clean_price: pl.express_dry_clean_price || 0,
                one_day_dry_clean_price: pl.one_day_dry_clean_price || 0,
                normal_dry_clean_price: pl.normal_dry_clean_price || 0,
                urgent_washing_price: pl.urgent_washing_price || 0,
                urgent_pressing_price: pl.urgent_pressing_price || 0,
                urgent_dry_clean_price: pl.urgent_dry_clean_price || 0,
                two_day_washing_price: pl.two_day_washing_price || 0,
                two_day_pressing_price: pl.two_day_pressing_price || 0,
                two_day_dry_clean_price: pl.two_day_dry_clean_price || 0
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataRows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Price List Template");
        XLSX.writeFile(workbook, "price_list_template.xlsx");
    };

    const handleDownloadItemTypeWeightTemplate = () => {
        const headers = ["item_type_id", "item_code", "item_name", "weight"];

        const dataRows = (itemTypes || []).map((type) => {
            const { code, name } = splitItemTypeNameCode(type.item_type_name);
            return {
                item_type_id: type.item_type_id,
                item_code: code,
                item_name: name,
                weight: type.weight !== null && type.weight !== undefined && type.weight !== "" ? Number(type.weight) : "",
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataRows, { header: headers });

        const weightColumnIndex = headers.indexOf("weight");
        dataRows.forEach((row, rowIndex) => {
            if (row.weight === "") return;
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: weightColumnIndex });
            if (worksheet[cellRef]) {
                worksheet[cellRef].z = "0.00";
            }
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Item Weights Template");
        XLSX.writeFile(workbook, "item_weights_template.xlsx");
    };

    const nextItemTypeCode = getNextItemTypeCode();
    const customItemTypeCodeValidation = isItemTypeCodeEditable ? validateItemTypeCode(customItemTypeCode) : null;

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Settings</h1>
                    <p className="text-xl text-black/50">Manage your organization's customer resources efficiently.</p>
                </div>
                {/* <div>
                    <button className="cursor-pointer bg-red-500 rounded-full px-5 font-bold text-white text-xl py-1" onClick={handleDayEnd} disabled={isLoadingDayEnd}>{isLoadingDayEnd ? <BeatLoader color="#fff" size={10} /> : "Day End"}</button>
                </div> */}
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-5">
                {settingsTabVisibility.priceList &&
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(1)}>Price List</h2>
                }
                {settingsTabVisibility.items &&
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(2)}>Items</h2>
                }
                {/* Tax tab temporarily hidden — not needed yet, re-enable when ready to use.
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 3 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(3)}>Tax</h2>
                */}
                {settingsTabVisibility.receipt &&
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 4 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(4)}>Receipt</h2>
                }
                {settingsTabVisibility.discount &&
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 5 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(5)}>Discount</h2>
                }
                {settingsTabVisibility.drivers &&
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 8 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(8)}>Drivers & Vehicles</h2>
                }
                {/* Vouchers tab temporarily hidden — not needed yet, re-enable when ready to use.
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 6 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(6)}>Vouchers</h2>
                */}
                {settingsTabVisibility.otherSettings &&
                    <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 7 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(7)}>Other Settings</h2>
                }
            </div>

            {/* Content Section */}
            {selectedTab === 1 &&
                <div className="flex flex-col gap-y-10">
                    <div className="bg-white rounded-xl p-5">
                        <div className="flex flex-row gap-x-5 items-center mb-3">
                            <h3 className="text-2xl font-semibold">Price List</h3>

                            <button onClick={handleDownloadTemplate} className="cursor-pointer ms-auto border border-primary text-primary text-xl font-bold h-fit px-5 py-2 rounded-full hover:bg-primary hover:text-white">File Template</button>
                            {settingsTabActions.priceList.create && <Link className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5 hover:bg-primary hover:text-white" to={'price-list-upload'}><Icon icon={"material-symbols:upload"} /> Upload New Price List</Link>}
                        </div>

                        {isLoadingPriceList
                            ? <div className="flex rounded-xl bg-white items-center justify-center py-10">
                                <BeatLoader color="#1470F9" size={20} />
                            </div>
                            : <div className="rounded-xl bg-white overflow-x-auto border border-black/20">
                                <div className="min-w-[1600px] text-sm grid text-white bg-primary font-semibold py-2 px-3 [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1" style={{ gridTemplateColumns: "1.6fr repeat(15, minmax(0, 1fr))" }}>
                                    <p></p>
                                    <p className="col-span-5 border-l-2 border-black">WASHING</p>
                                    <p className="col-span-5 border-l-2 border-black">PRESSING</p>
                                    <p className="col-span-5 border-l-2 border-black">DRY CLEAN</p>

                                </div>
                                <div className="min-w-[1600px] text-sm grid text-white bg-primary font-semibold py-2 px-3 [&>p]:whitespace-normal [&>p]:break-normal [&>p]:leading-tight [&>p]:text-center [&>p]:px-1" style={{ gridTemplateColumns: "1.6fr repeat(15, minmax(0, 1fr))" }}>
                                    <p className="text-start">ITEM</p>
                                    <p className="border-l-2 border-black">NORMAL</p>
                                    <p className="border-l border-white/20">TWO DAY</p>
                                    <p className="border-l border-white/20">ONE DAY</p>
                                    <p className="border-l border-white/20">EXPRESS</p>
                                    <p className="border-l border-white/20">URGENT</p>
                                    <p className="border-l-2 border-black">NORMAL</p>
                                    <p className="border-l border-white/20">TWO DAY</p>
                                    <p className="border-l border-white/20">ONE DAY</p>
                                    <p className="border-l border-white/20">EXPRESS</p>
                                    <p className="border-l border-white/20">URGENT</p>
                                    <p className="border-l-2 border-black">NORMAL</p>
                                    <p className="border-l border-white/20">TWO DAY</p>
                                    <p className="border-l border-white/20">ONE DAY</p>
                                    <p className="border-l border-white/20">EXPRESS</p>
                                    <p className="border-l border-white/20">URGENT</p>



                                </div>

                                {priceList && Array.isArray(priceList) ? priceList.map((pl, index) => (
                                    <div key={index} className={`min-w-[1600px] grid text-xs py-1.5 px-3 whitespace-nowrap [&>p]:whitespace-nowrap [&>p]:text-center [&>p]:px-1 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`} style={{ gridTemplateColumns: "1.6fr repeat(15, minmax(0, 1fr))" }}>
                                        <div className="min-w-0 overflow-hidden whitespace-normal break-words leading-tight text-start px-1">{pl.item_type_name}</div>
                                        <p className="border-l-2 border-black">Rs. {pl.normal_washing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.two_day_washing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.one_day_washing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.express_washing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.urgent_washing_price}</p>
                                        <p className="border-l-2 border-black">Rs. {pl.normal_pressing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.two_day_pressing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.one_day_pressing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.express_pressing_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.urgent_pressing_price}</p>
                                        <p className="border-l-2 border-black">Rs. {pl.normal_dry_clean_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.two_day_dry_clean_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.one_day_dry_clean_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.express_dry_clean_price}</p>
                                        <p className="border-l border-black/10">Rs. {pl.urgent_dry_clean_price}</p>




                                    </div>
                                )) : null}
                            </div>
                        }
                    </div>
                </div>
            }

            {selectedTab === 2 &&
                <div className="flex flex-col gap-y-10">
                    <div className="flex flex-col bg-white rounded-xl p-5">
                        <div className="flex flex-row gap-x-5 items-center mb-5">
                            <h3 className="text-2xl font-semibold">Item Types</h3>

                            <button onClick={handleDownloadItemTypeWeightTemplate} className="cursor-pointer ms-auto border border-primary text-primary text-xl font-bold h-fit px-5 py-2 rounded-full hover:bg-primary hover:text-white">File Template</button>
                            {settingsTabActions.items.create && <button type="button" onClick={() => setShowItemWeightUploadDialog(true)} className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5 hover:bg-primary hover:text-white"><Icon icon={"material-symbols:upload"} /> Edit</button>}
                        </div>
                        {isLoadingItemTypes
                            ? <div className="flex rounded-xl bg-white items-center justify-center py-10">
                                <BeatLoader color="#1470F9" size={20} />
                            </div>
                            : <div className="relative">
                                <button
                                    className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full shadow hover:bg-gray-100 transition-all"
                                    onClick={() => itemTypesScrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                                >
                                    <Icon icon="mingcute:left-fill" className="text-gray-500 text-sm" />
                                </button>
                                <div
                                    ref={itemTypesScrollRef}
                                    className="flex flex-row gap-x-3 overflow-x-auto mx-9 py-4"
                                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#a0aec0 #edf2f7' }}
                                >
                                    {itemTypes && Array.isArray(itemTypes) ? itemTypes.map((type, index) => {
                                        const { code, name } = splitItemTypeNameCode(type.item_type_name);
                                        return (
                                            <div
                                                key={index}
                                                className="relative flex-shrink-0 flex flex-col items-center justify-center text-center bg-primary/5 border border-primary/20 rounded-xl px-4 py-5 min-w-[130px] shadow-sm hover:shadow-md hover:bg-primary/10 hover:border-primary/40 transition-all group cursor-default"
                                            >
                                                {settingsTabActions.items.delete && <Icon
                                                    icon={"mingcute:close-fill"}
                                                    className="absolute top-1 right-1 text-xs cursor-pointer text-red-400 hover:text-red-600 transition-colors"
                                                    onClick={() => {
                                                        setSelectedItemType(type);
                                                        setShowDeactivateItemTypeConfirmationDialog(true);
                                                    }}
                                                />}
                                                <p className="text-sm font-semibold text-gray-800 leading-tight">{name}</p>
                                                {code && <p className="text-xs font-bold text-primary mt-1">{code}</p>}
                                                {type.weight != null && type.weight !== '' && <p className="text-xs text-gray-500 mt-1">{type.weight} g</p>}
                                            </div>
                                        );
                                    }) : null}
                                </div>
                                <button
                                    className="absolute -right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full shadow hover:bg-gray-100 transition-all"
                                    onClick={() => itemTypesScrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                                >
                                    <Icon icon="mingcute:right-fill" className="text-gray-500 text-sm" />
                                </button>
                            </div>
                        }

                        {settingsTabActions.items.create && <label className="text-xl mt-5 mb-3 font-semibold">Add New Item Type</label>}
                        {settingsTabActions.items.create && <div className="flex flex-row gap-x-5 items-start flex-wrap">
                            <div className="relative w-1/3">
                                <input
                                    className="rounded-full text-xl border vorder-black/20 px-5 py-1 w-full"
                                    placeholder="Add meaningful name"
                                    value={newItemType}
                                    onChange={(e) => setNewItemType(e.target.value)}
                                    onFocus={() => setShowItemTypeNameSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowItemTypeNameSuggestions(false), 150)}
                                />
                                {showItemTypeNameSuggestions &&
                                    <div className="absolute z-20 top-full left-0 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-black/20 rounded-xl shadow-lg">
                                        {itemTypeNamePrefixSuggestions.map((prefix, index) => (
                                            <div
                                                key={index}
                                                className="px-5 py-2 text-lg hover:bg-primary/10 cursor-pointer"
                                                onMouseDown={() => {
                                                    setNewItemType(prefix);
                                                    setShowItemTypeNameSuggestions(false);
                                                }}
                                            >
                                                {prefix}
                                            </div>
                                        ))}
                                        <div
                                            className="px-5 py-2 text-lg italic text-primary hover:bg-primary/10 cursor-pointer border-t border-black/10"
                                            onMouseDown={() => {
                                                setNewItemType("");
                                                setShowItemTypeNameSuggestions(false);
                                            }}
                                        >
                                            Custom Name
                                        </div>
                                    </div>
                                }
                            </div>
                            <input type="number" min="0" step="0.01" className="rounded-full text-xl border vorder-black/20 px-5 py-1 w-1/4" placeholder="Weight (g)" value={newItemTypeWeight} onChange={(e) => setNewItemTypeWeight(e.target.value)} />
                            <div className="flex flex-col gap-y-1 flex-1 min-w-[220px]">
                                <div className="flex flex-row items-center gap-x-2 border border-black/20 rounded-full px-5 py-1 text-black/50 w-fit flex-wrap">
                                    <span className="font-semibold">Code:</span>
                                    {isItemTypeCodeEditable
                                        ? <input
                                            className="bg-transparent outline-none text-primary font-bold w-28"
                                            value={customItemTypeCode}
                                            onChange={(e) => setCustomItemTypeCode(e.target.value.toUpperCase())}
                                            placeholder="R000000"
                                        />
                                        : <span className="text-primary font-bold">{nextItemTypeCode}</span>
                                    }
                                    <input
                                        type="checkbox"
                                        className="size-4 cursor-pointer accent-primary ms-2"
                                        title="Tick to manually edit the code"
                                        checked={isItemTypeCodeEditable}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setIsItemTypeCodeEditable(checked);
                                            setCustomItemTypeCode(checked ? nextItemTypeCode : "");
                                        }}
                                    />
                                </div>
                                {isItemTypeCodeEditable && customItemTypeCode.trim() !== "" &&
                                    <p className={`text-sm font-medium break-words max-w-md ${customItemTypeCodeValidation?.available ? 'text-green-600' : 'text-red-500'}`}>
                                        {customItemTypeCodeValidation?.message}
                                    </p>
                                }
                            </div>
                            <button className="cursor-pointer bg-primary rounded-full font-bold text-white text-xl px-10 py-1" onClick={handleAddItemType} disabled={isLoadingAddItemType}>{isLoadingAddItemType ? <BeatLoader color="#fff" size={10} /> : "Add"}</button>
                            <p className="text-red-500 font-medium text-lg">{itemTypeErrorMsg}</p>
                        </div>}
                    </div>

                    <div className="bg-white rounded-xl p-5">
                        <div className="flex flex-row gap-x-5 items-center mb-3 flex-wrap">
                            <h3 className="text-2xl font-semibold">All Item Types</h3>
                            <div className="ms-auto flex flex-row items-center gap-x-2 border border-black/20 rounded-full px-5 py-1.5 w-1/3">
                                <MdSearch className="text-black/40 text-xl" />
                                <input
                                    className="outline-none text-lg w-full"
                                    placeholder="Search by item name or code"
                                    value={itemTypeSearchQuery}
                                    onChange={(e) => setItemTypeSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {isLoadingItemTypes
                            ? <div className="flex rounded-xl bg-white items-center justify-center py-10">
                                <BeatLoader color="#1470F9" size={20} />
                            </div>
                            : <div className="rounded-xl bg-white overflow-x-auto border border-black/20">
                                <div className="grid grid-cols-4 text-white bg-primary font-semibold py-2 px-3">
                                    <p>Item Name</p>
                                    <p>New Code</p>
                                    <p>Weight (g)</p>
                                    <p className="text-center">Action</p>
                                </div>
                                {(itemTypes || [])
                                    .filter((type) => {
                                        const query = itemTypeSearchQuery.trim().toLowerCase();
                                        if (!query) return true;
                                        const { code, name } = splitItemTypeNameCode(type.item_type_name);
                                        const itemTypeId = String(type.item_type_id || '').toLowerCase();
                                        return (name || '').toLowerCase().includes(query) || (code || '').toLowerCase().includes(query) || itemTypeId.includes(query);
                                    })
                                    .map((type, index) => {
                                        const { code, name } = splitItemTypeNameCode(type.item_type_name);
                                        return (
                                            <div key={type.item_type_id ?? index} className={`grid grid-cols-4 px-3 py-2 items-center ${index % 2 === 0 ? "bg-white" : "bg-primary/10"}`}>
                                                <p>{name}</p>
                                                <p className="text-primary font-bold">{code}</p>
                                                <p>{type.weight ?? '-'}</p>
                                                <p className="flex flex-row gap-x-2 justify-center">
                                                    {settingsTabActions.items.edit && <button
                                                        className="cursor-pointer border border-primary rounded-full font-bold text-primary px-5 py-1 hover:bg-primary hover:text-white"
                                                        onClick={() => {
                                                            setEditingItemType(type);
                                                            setShowEditItemTypeDialog(true);
                                                        }}
                                                    >Edit</button>}
                                                    {settingsTabActions.items.delete && <button
                                                        className="cursor-pointer border border-red-500 rounded-full font-bold text-red-500 px-5 py-1 hover:bg-red-500 hover:text-white"
                                                        onClick={() => {
                                                            setSelectedItemType(type);
                                                            setShowDeactivateItemTypeConfirmationDialog(true);
                                                        }}
                                                    >Delete</button>}
                                                </p>
                                            </div>
                                        );
                                    })}
                            </div>
                        }
                    </div>
                </div>
            }

            {selectedTab === 3 &&
                <form onSubmit={handleUpdateSettings} className="flex flex-col bg-white rounded-xl p-5">
                    <h3 className="text-2xl font-semibold">Tax Settings</h3>
                    <p className="text-lg text-black/50">Configure tax rates and application rules for your business.</p>

                    <div className="flex flex-row gap-x-3 items-center my-3">
                        {settings?.enable_tax_calculations ?
                            <ImCheckboxChecked
                                className={`text-green-500 size-4 ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                                onClick={() => canEdit && setSettings(prev => ({ ...prev, enable_tax_calculations: !prev?.enable_tax_calculations }))}
                            /> :
                            <ImCheckboxUnchecked
                                className={`text-black/50 size-4 ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                                onClick={() => canEdit && setSettings(prev => ({ ...prev, enable_tax_calculations: !prev?.enable_tax_calculations }))}
                            />
                        }
                        <p className="text-xl font-medium">Enable Tax Calculation</p>
                    </div>
                    <div className="flex flex-row w-full gap-x-5">
                        <label className="text-xl font-semibold w-1/3" htmlFor="tax_rate">Tax Rate (%)</label>
                        <label className="text-xl font-semibold w-1/3" htmlFor="tax_name">Tax Name</label>
                    </div>
                    <div className="flex flex-row w-full gap-x-5 items-center">
                        <input
                            id="tax_rate"
                            name="tax_rate"
                            placeholder="Enter tax rate here..."
                            className={`px-4 py-1 text-xl border border-black/20 rounded-lg w-1/3`}
                            type="number"
                            step={0.01}
                            onChange={handleInputNumberChange}
                            value={settings?.tax_rate || ""}
                        />

                        <input
                            id="tax_name"
                            name="tax_name"
                            placeholder="Enter tax name here..."
                            className={`px-4 py-1 text-xl border border-black/20 rounded-lg w-1/3`}
                            type="text"
                            onChange={handleInputChange}
                            value={settings?.tax_name || ""}
                        />

                        {canEdit && <div className="flex flex-row items-center gap-x-5">
                            <button type="submit" className="bg-primary text-white font-bold text-xl h-fit rounded-full px-5 py-1 cursor-pointer" disabled={isLoadingSettings} >{isLoadingSettings ? <BeatLoader color="#fff" size={10} /> : "Change"}</button>
                            <p className="text-xl text-green-500 font-semibold">{updateMessage}</p>
                        </div>}
                    </div>
                </form>
            }

            {selectedTab === 4 &&
                <form onSubmit={handleUpdateSettings} className="flex flex-col bg-white rounded-xl p-5">
                    <h3 className="text-2xl font-semibold">Receipt Settings</h3>
                    <p className="text-lg text-black/50">Add Default Note and Terms & Conditions</p>


                    <label className="text-xl font-semibold w-1/3 mt-3" htmlFor="receipt_notes">Note</label>
                    <textarea
                        id="receipt_notes"
                        name="receipt_notes"
                        placeholder="Enter Default Note here..."
                        className="px-4 py-1 text-xl border border-black/20 rounded-lg"
                        rows={4}
                        value={settings?.receipt_notes || ""}
                        onChange={handleInputChange}
                    />

                    <label className="text-xl font-semibold w-1/3 mt-3" htmlFor="receipt_terms">Terms & Conditions</label>
                    <textarea
                        id="receipt_terms"
                        name="receipt_terms"
                        placeholder="Enter Default Terms & Conditions here..."
                        className="px-4 py-1 text-xl border border-black/20 rounded-lg"
                        rows={4}
                        value={settings?.receipt_terms || ""}
                        onChange={handleInputChange}
                    />

                    {settingsTabActions.receipt.edit && <div className="flex flex-row items-center gap-x-5 mt-3">
                        <button type="submit" className="bg-primary text-white font-bold text-xl h-fit rounded-full px-5 py-1 w-fit cursor-pointer" disabled={isLoadingSettings} >{isLoadingSettings ? <BeatLoader color="#fff" size={10} /> : "Change"}</button>
                        <p className="text-xl text-green-500 font-semibold">{updateMessage}</p>
                    </div>}
                </form>
            }

            {selectedTab === 5 &&
                <div className="bg-white rounded-xl p-5">
                    <div className="flex flex-row justify-between items-center mb-3">
                        <h3 className="text-2xl font-semibold">Discount List Table</h3>

                        {settingsTabActions.discount.create && <button className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5" onClick={() => setShowCreateDiscountDialog(true)}><Icon icon={"gridicons:create"} />Create New Discount</button>}
                    </div>

                    {isLoadingDiscounts
                        ? <div className="flex rounded-xl bg-white items-center justify-center py-10">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                        :
                        <div className="rounded-xl bg-white overflow-hidden border border-primary">
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

                            {discounts && Array.isArray(discounts) ? discounts.map((discount, index) => (
                                <div key={index} className={`grid grid-cols-8 gap-x-3 text-lg py-1.5 text-center px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                    <p className="text-start">{discount.discount_name}</p>
                                    <p>{discount.discount_type}</p>
                                    <p>{discount.discount_condition}</p>
                                    <p>{discount.value_type === "Value" ? discount.value : `${discount.value}%`}</p>
                                    <p>{new Date(discount.valid_from).toISOString().split("T")[0]}</p>
                                    <p>{new Date(discount.valid_to).toISOString().split("T")[0]}</p>
                                    <div className="flex items-center justify-center gap-x-2">
                                        <button
                                            type="button"
                                            disabled={!settingsTabActions.discount.edit}
                                            onClick={() => handleToggleDiscountStatus(discount)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                discount.status === "Active" ? "bg-green-500" : "bg-gray-300"
                                            } ${!settingsTabActions.discount.edit ? "cursor-not-allowed opacity-50" : ""}`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    discount.status === "Active" ? "translate-x-5" : "translate-x-0"
                                                }`}
                                            />
                                        </button>
                                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
                                            discount.status === "Active" ? "text-green-600 bg-green-100" : "text-red-500 bg-red-100"
                                        }`}>
                                            {discount.status === "Active" ? "Active" : "Deactive"}
                                        </span>
                                    </div>
                                    <div className="flex flex-row gap-x-1 justify-center">
                                        {settingsTabActions.discount.delete && <div
                                            className="flex flex-col cursor-pointer items-center"
                                            onClick={() => {
                                                setSelectedDiscount(discount);
                                                setShowDeleteDiscountConfirmationDialog(true);
                                            }}
                                        >
                                            <Icon icon={"mdi:delete"} className="text-red-500" />
                                            <p className="text-sm">Delete</p>
                                        </div>}

                                        {settingsTabActions.discount.delete && settingsTabActions.discount.edit && <div className="min-h-max border border-black/50 my-1" />}

                                        {settingsTabActions.discount.edit && <div
                                            className="flex flex-col cursor-pointer items-center"
                                            onClick={() => {
                                                setSelectedDiscount(discount);
                                                setShowUpdateDiscountDialog(true);
                                            }}
                                        >
                                            <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                            <p className="text-sm">Edit</p>
                                        </div>}
                                    </div>
                                </div>
                            )) : null}
                        </div>
                    }
                </div>
            }

            {selectedTab === 8 &&
                <div className="flex flex-col gap-y-6">
                    {/* Driver List Section */}
                    <div className="bg-white rounded-xl p-5">
                        <div className="flex flex-row justify-between items-center mb-3">
                            <h3 className="text-2xl font-semibold">Driver List Table</h3>

                            {settingsTabActions.drivers.create && (
                                <button
                                    className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5 hover:bg-primary hover:text-white"
                                    onClick={() => setShowCreateDriverDialog(true)}
                                >
                                    <Icon icon={"gridicons:create"} />
                                    Add New Driver
                                </button>
                            )}
                        </div>

                        {isLoadingDrivers ? (
                            <div className="flex rounded-xl bg-white items-center justify-center py-10">
                                <BeatLoader color="#1470F9" size={20} />
                            </div>
                        ) : (
                            <div className="rounded-xl bg-white overflow-hidden border border-primary">
                                <div className="text-xl grid grid-cols-4 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                                    <p className="text-start">No</p>
                                    <p className="text-start">DRIVER NAME</p>
                                    <p>NIC NUMBER</p>
                                    <p>ACTION</p>
                                </div>

                                {drivers && Array.isArray(drivers) && drivers.length > 0 ? (
                                    drivers.map((driver, index) => (
                                        <div
                                            key={index}
                                            className={`grid grid-cols-4 gap-x-3 text-lg py-2.5 text-center px-3 ${
                                                index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                            } items-center`}
                                        >
                                            <p className="text-start">{index + 1}</p>
                                            <p className="text-start font-semibold">{driver.name}</p>
                                            <p>{driver.nic}</p>
                                            <div className="flex flex-row gap-x-1 justify-center">
                                                {settingsTabActions.drivers.edit && (
                                                    <div
                                                        className="flex flex-col cursor-pointer items-center"
                                                        onClick={() => {
                                                            setSelectedDriver(driver);
                                                            setShowUpdateDriverDialog(true);
                                                        }}
                                                    >
                                                        <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                                        <p className="text-sm">Edit</p>
                                                    </div>
                                                )}

                                                {settingsTabActions.drivers.edit && settingsTabActions.drivers.delete && <div className="min-h-max border border-black/50 my-1" />}

                                                {settingsTabActions.drivers.delete && (
                                                    <div
                                                        className="flex flex-col cursor-pointer items-center"
                                                        onClick={() => {
                                                            setSelectedDriver(driver);
                                                            setShowDeleteDriverConfirmationDialog(true);
                                                        }}
                                                    >
                                                        <Icon icon={"mdi:delete"} className="text-red-500" />
                                                        <p className="text-sm">Delete</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10 text-lg text-black/50 bg-white">
                                        No drivers found.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Vehicle List Section */}
                    <div className="bg-white rounded-xl p-5">
                        <div className="flex flex-row justify-between items-center mb-3">
                            <h3 className="text-2xl font-semibold">Vehicle List Table</h3>

                            {settingsTabActions.drivers.create && (
                                <button
                                    className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5 hover:bg-primary hover:text-white"
                                    onClick={() => setShowCreateVehicleDialog(true)}
                                >
                                    <Icon icon={"gridicons:create"} />
                                    Add New Vehicle
                                </button>
                            )}
                        </div>

                        {isLoadingVehicles ? (
                            <div className="flex rounded-xl bg-white items-center justify-center py-10">
                                <BeatLoader color="#1470F9" size={20} />
                            </div>
                        ) : (
                            <div className="rounded-xl bg-white overflow-hidden border border-primary">
                                <div className="text-xl grid grid-cols-3 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                                    <p className="text-start">No</p>
                                    <p className="text-start">VEHICLE NUMBER</p>
                                    <p>ACTION</p>
                                </div>

                                {vehicles && Array.isArray(vehicles) && vehicles.length > 0 ? (
                                    vehicles.map((vehicle, index) => (
                                        <div
                                            key={index}
                                            className={`grid grid-cols-3 gap-x-3 text-lg py-2.5 text-center px-3 ${
                                                index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                            } items-center`}
                                        >
                                            <p className="text-start">{index + 1}</p>
                                            <p className="text-start font-semibold">{vehicle.vehicle_number}</p>
                                            <div className="flex flex-row gap-x-1 justify-center">
                                                {settingsTabActions.drivers.edit && (
                                                    <div
                                                        className="flex flex-col cursor-pointer items-center"
                                                        onClick={() => {
                                                            setSelectedVehicle(vehicle);
                                                            setShowUpdateVehicleDialog(true);
                                                        }}
                                                    >
                                                        <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                                        <p className="text-sm">Edit</p>
                                                    </div>
                                                )}

                                                {settingsTabActions.drivers.edit && settingsTabActions.drivers.delete && <div className="min-h-max border border-black/50 my-1" />}

                                                {settingsTabActions.drivers.delete && (
                                                    <div
                                                        className="flex flex-col cursor-pointer items-center"
                                                        onClick={() => {
                                                            setSelectedVehicle(vehicle);
                                                            setShowDeleteVehicleConfirmationDialog(true);
                                                        }}
                                                    >
                                                        <Icon icon={"mdi:delete"} className="text-red-500" />
                                                        <p className="text-sm">Delete</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10 text-lg text-black/50 bg-white">
                                        No vehicles found.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            }

            {selectedTab === 6 &&
                <div className="bg-white rounded-xl p-5">
                    <div className="flex flex-row gap-x-5 items-center mb-3 flex-wrap">
                        <h3 className="text-2xl font-semibold">Voucher List Table</h3>
                        <button type="button" onClick={handleExportVouchers} className="ms-auto border border-primary text-primary text-xl font-bold h-fit px-5 py-2 rounded-full hover:bg-primary hover:text-white">File Template</button>
                        {canCreate && <Link className="cursor-pointer border border-primary rounded-full font-bold text-xl text-primary flex flex-row gap-x-3 items-center py-2 px-5 hover:bg-primary hover:text-white" to="voucher-upload"><Icon icon={"material-symbols:upload"} /> Upload New Voucher List</Link>}
                    </div>

                    {/* Filter Section */}
                    <div className="flex flex-row gap-x-5 mb-5">
                        <div className="flex flex-row border border-primary rounded-full h-fit w-1/2 bg-white">
                            <div className="flex justify-center items-center rounded-l-full px-5">
                                <MdSearch className="size-6 text-primary" />
                            </div>

                            <input
                                className={`grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none`}
                                type="text"
                                value={searchQueryVoucher}
                                onChange={(e) => setSearchQueryVoucher(e.target.value)}
                                placeholder="Search Vouchers here..."
                            />
                        </div>

                        <FilterSelector
                            options={voucherStatusOptions}
                            value={statusFilterVoucher}
                            onChange={handleStatusFilterChangeVoucher}
                        />
                    </div>

                    {isLoadingVouchers
                        ? <div className="flex rounded-xl bg-white items-center justify-center py-10">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                        :
                        <div className="rounded-xl bg-white overflow-hidden border border-primary">
                            <div className="text-xl grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                                <p className="text-start">VOUCHER CODE</p>
                                <p>VALUE</p>
                                <p>BALANCE</p>
                                <p>ISSUED TO</p>
                                <p>ISSUED DATE</p>
                                <p>EXPIRY DATE</p>
                                <p>VALIDITY PERIOD</p>
                                <p>STATUS</p>
                                <p>ACTION</p>
                            </div>

                            {filteredVouchers && Array.isArray(filteredVouchers) ? filteredVouchers.map((voucher, index) => (
                                <div key={index} className={`grid grid-cols-9 gap-x-3 text-lg py-1.5 text-center px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                    <p className="text-start">{voucher.voucher_code}</p>
                                    <p>{Number(voucher.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p>{Number(voucher.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p>{voucher.issued_to}</p>
                                    <p>{voucher.issued_date ? (() => { const d = new Date(voucher.issued_date); return isNaN(d.getTime()) ? "-" : d.toISOString().split("T")[0]; })() : "-"}</p>
                                    <p>{voucher.expire_date ? (() => { const d = new Date(voucher.expire_date); return isNaN(d.getTime()) ? "-" : d.toISOString().split("T")[0]; })() : "-"}</p>
                                    <p>{voucher.validity_period != null && voucher.validity_period !== "" ? voucher.validity_period : "-"}</p>
                                    {voucher.status === "Pending" &&
                                        <p className="text-amber-600 bg-amber-500/20 rounded-full">{voucher.status}</p>
                                    }
                                    {voucher.status === "Inactive" &&
                                        <p className="text-green-500 bg-green-500/20 rounded-full">{voucher.status}</p>
                                    }
                                    {voucher.status === "Redeemed" &&
                                        <p className="text-red-500 bg-red-500/20 rounded-full">{voucher.status}</p>
                                    }
                                    {voucher.status === "Expired" &&
                                        <p className="text-red-500 bg-red-500/20 rounded-full">{voucher.status}</p>
                                    }
                                    {!["Pending", "Inactive", "Redeemed", "Expired"].includes(voucher.status) &&
                                        <p className="text-gray-600 bg-gray-500/20 rounded-full">{voucher.status || "Pending"}</p>
                                    }
                                    <div className="flex flex-row gap-x-1 justify-center">
                                        {canEdit && <div
                                            className="flex flex-col cursor-pointer items-center"
                                            onClick={() => {
                                                setSelectedVoucher(voucher);
                                                setShowUpdateVoucherDialog(true);
                                            }}
                                        >
                                            <Icon icon={"iconamoon:edit-fill"} className="text-green-500" />
                                            <p className="text-sm">Edit</p>
                                        </div>}
                                    </div>
                                </div>
                            )) : null}
                        </div>
                    }
                </div>
            }

            {selectedTab === 7 &&
                <div className="bg-white rounded-xl p-5 flex flex-col gap-y-3">
                    <h3 className="text-2xl font-semibold">Other Settings</h3>
                    <p className="text-lg text-black/50">Configure the default delivery charge applied to new orders.</p>

                    <div className="max-w-sm">
                        <Input
                            variant="number"
                            label={"Delivery Charge (LKR)"}
                            placeholder={"Please enter delivery charge here..."}
                            name={"delivery_charge"}
                            onChange={handleInputNumberChange}
                            value={settings?.delivery_charge || ""}
                        />
                    </div>

                    {/* Fixed Sticker Count per Page temporarily hidden — not needed yet, re-enable when ready to use.
                    <Input
                        variant="number"
                        label={"Fixed Sticker Count per Page"}
                        placeholder={"Please enter sticker count per page..."}
                        name={"sticker_count_per_page"}
                        onChange={handleInputNumberChange}
                        value={settings?.sticker_count_per_page || ""}
                    />
                    */}

                    {/* Number of Items per Bag temporarily hidden — not needed yet, re-enable when ready to use.
                    <Input
                        variant="number"
                        label={"Number of Items per Bag"}
                        placeholder={"Please enter number of items per bag..."}
                        name={"bag_count"}
                        onChange={handleInputNumberChange}
                        value={settings?.bag_count || ""}
                    />
                    */}

                    {settingsTabActions.otherSettings.edit && <div className="flex flex-row items-center gap-x-5 mt-2">
                        <button type="button" className="w-fit bg-primary text-white font-bold text-xl h-fit rounded-full px-5 py-1 cursor-pointer" disabled={isLoadingSettings} onClick={handleUpdateSettings}>{isLoadingSettings ? <BeatLoader color="#fff" size={10} /> : "Save Changes"}</button>
                        <p className="text-xl text-green-500 font-semibold">{updateMessage}</p>
                    </div>}
                </div>
            }

            {showCreateDiscountDialog &&
                <RetailCreateDiscountDialog handleClose={() => setShowCreateDiscountDialog(false)} refreshDiscounts={fetchDiscounts} />
            }

            {showUpdateDiscountDialog &&
                <RetailUpdateDiscountDialog discount={selectedDiscount} handleClose={() => setShowUpdateDiscountDialog(false)} refreshDiscounts={fetchDiscounts} />
            }

            {showIssueVoucherDialog &&
                <RetailIssueVoucherDialog handleClose={() => setShowIssueVoucherDialog(false)} refreshVouchers={fetchVouchers} />
            }

            {showUpdateVoucherDialog &&
                <RetailUpdateVoucherDialog voucher={selectedVoucher} handleClose={() => setShowUpdateVoucherDialog(false)} refreshVouchers={fetchVouchers} />
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

            {showItemWeightUploadDialog &&
                <RetailItemTypeWeightUploadDialog
                    onClose={() => setShowItemWeightUploadDialog(false)}
                    onUploaded={fetchItemTypes}
                />
            }

            {showEditItemTypeDialog && editingItemType &&
                <RetailItemTypeEditDialog
                    itemType={editingItemType}
                    onClose={() => {
                        setShowEditItemTypeDialog(false);
                        setEditingItemType(null);
                    }}
                    onSaved={fetchItemTypes}
                />
            }

            {showDeleteDiscountConfirmationDialog &&
                <ConfirmationDialog
                    title={"Delete Discount"}
                    text={"Are you sure to delete the discount"}
                    item={selectedDiscount?.discount_name}
                    onClose={() => {
                        setShowDeleteDiscountConfirmationDialog(false);
                        setSelectedDiscount(null);
                    }}
                    onSubmit={handleDeleteDiscount}
                    isLoading={isLoadingDeleteDiscount}
                />
            }

            {showCreateDriverDialog &&
                <RetailCreateDriverDialog handleClose={() => setShowCreateDriverDialog(false)} refreshDrivers={fetchDrivers} />
            }

            {showUpdateDriverDialog &&
                <RetailUpdateDriverDialog driver={selectedDriver} handleClose={() => setShowUpdateDriverDialog(false)} refreshDrivers={fetchDrivers} />
            }

            {showDeleteDriverConfirmationDialog &&
                <ConfirmationDialog
                    title={"Delete Driver"}
                    text={"Are you sure to delete the driver"}
                    item={selectedDriver?.name}
                    onClose={() => {
                        setShowDeleteDriverConfirmationDialog(false);
                        setSelectedDriver(null);
                    }}
                    onSubmit={handleDeleteDriver}
                    isLoading={isLoadingDeleteDriver}
                />
            }

            {showCreateVehicleDialog &&
                <RetailCreateVehicleDialog handleClose={() => setShowCreateVehicleDialog(false)} refreshVehicles={fetchVehicles} />
            }

            {showUpdateVehicleDialog &&
                <RetailUpdateVehicleDialog vehicle={selectedVehicle} handleClose={() => setShowUpdateVehicleDialog(false)} refreshVehicles={fetchVehicles} />
            }

            {showDeleteVehicleConfirmationDialog &&
                <ConfirmationDialog
                    title={"Delete Vehicle"}
                    text={"Are you sure to delete the vehicle"}
                    item={selectedVehicle?.vehicle_number}
                    onClose={() => {
                        setShowDeleteVehicleConfirmationDialog(false);
                        setSelectedVehicle(null);
                    }}
                    onSubmit={handleDeleteVehicle}
                    isLoading={isLoadingDeleteVehicle}
                />
            }
        </div>
    );
};

export default SalesRetailSettings;