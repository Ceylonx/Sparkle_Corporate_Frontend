import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import RetailCustomerCreateDialog from "../../../components/dialogs/retail/RetailCustomerCreateDialog";
import { BiPlus, BiMinus } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import RetailAddItemToOrderDialog from "../../../components/dialogs/retail/RetailAddItemToOrderDialog";
import Input from "../../../components/ui/Input";
import RetailSalesOrder from "../../../components/printables/RetailSalesOrder";
import { useReactToPrint } from "react-to-print";
import { getAllCustomers } from "../../../services/CustomerServices";
import { getAllItemTypes, getAllPriceLists, getAllSettings } from "../../../services/Retail/RetailSettingsServices";
import { getAllServiceTypes } from "../../../services/ServiceTypeServices";
import { createRetailOrder, getAllBranches, getAllOrdersByCustomerId, incrementRetailOrderPrintCount } from "../../../services/Retail/RetailOrderServices";
import { getBranchesForAttendance } from "../../../services/Retail/RetailEmployeeServices";
import { BeatLoader } from "react-spinners";
import { useHotkeys } from "react-hotkeys-hook";
import { getAllRetailDiscounts } from "../../../services/Retail/RetailDiscountServices";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import RetailServiceOrderBulk from "../../../components/printables/RetailServiceOrderBulk";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";

const RetailAddNewOrder = () => {
    const { allowed } = usePagePermission("SalesRetail_Order_Create");
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [stage, setStage] = useState(1);
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddItemToOrderDialog, setShowAddItemToOrderDialog] = useState(false);
    const salesOrderRef = useRef(null);
    const componentRefBulk = useRef(null);
    const [customers, setCustomers] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [priceList, setPriceList] = useState([]);
    const [settings, setSettings] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [discounts, setDiscounts] = useState([]);
    const [selectedDiscount, setSelectedDiscount] = useState(null);
    const [selectedDiscountType, setSelectedDiscountType] = useState("");
    const [selectedDiscountCondition, setSelectedDiscountCondition] = useState("");
    const [availableDiscounts, setAvailableDiscounts] = useState([]);
    const [redoToggle, setRedoToggle] = useState(false);
    const [groupedResult, setGroupedResult] = useState([]);
    const [filteredItemTypes, setFilteredItemTypes] = useState([]);
    const [branches, setBranches] = useState([]);
    const [branchesData, setBranchesData] = useState([]);
    const [outletInfoForPrint, setOutletInfoForPrint] = useState(null);
    const [attendanceBranchesList, setAttendanceBranchesList] = useState([]);
    const [customerOrders, setCustomerOrders] = useState([]);
    const [selectedRedoOrders, setSelectedRedoOrders] = useState([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [orderCreateSuccess, setOrderCreateSuccess] = useState(false);

    useEffect(() => {
        document.querySelectorAll('input[type=number]').forEach((input) => {
            input.addEventListener("wheel", function (e) {
                e.preventDefault(); // disable scroll changing value
            });
        });
    }, []);

    const [formData, setFormData] = useState(
        {
            user_id: localStorage.getItem("userId"),
            customer_id: "",
            branch_id: Number(localStorage.getItem("selectedBranchId")),
            items: [],
            delivery_type: "",
            delivery_date: "",
            delivery_charge: 0,
            delivery_outlet: localStorage.getItem("selectedBranchName"),
            order_id: "",
            advance_payment: 0,
            total_amount: "",
            remaining_amount: "",
            discount: "",
            discount_remark: "",
            order_status: "Order_Placed",
            order_type: "Outlet Order",
            payment_method: "CASH",
            notes: "",
            terms_and_conditions: "",
            card_type: "",
            bank: "",
            payment: [
                { payment_method: "CASH", card_type: "", bank: "", paid_amount: "", card_last_4_digits: "" },
            ],
            redo_order_reference: "",
        }
    );

    const [orders, setOrders] = useState([]);

    const deliveryTypeOptions = [
        { value: "Normal", label: "Normal" },
        { value: "Two Day", label: "Two Day" },
        { value: "One Day", label: "One Day" },
        { value: "Express", label: "Express" },
        { value: "Urgent", label: "Urgent" },



    ];

    // Fetch branches from API
    const fetchAllBranches = async () => {
        try {
            const response = await getAllBranches();

            if (response) {
                let branchesData = [];

                // Handle different possible response structures
                if (Array.isArray(response)) {
                    branchesData = response;
                } else if (response.data && Array.isArray(response.data)) {
                    branchesData = response.data;
                } else if (response.branches && Array.isArray(response.branches)) {
                    branchesData = response.branches;
                } else if (response.results && Array.isArray(response.results)) {
                    branchesData = response.results;
                } else {
                    // Try to find any array property
                    const keys = Object.keys(response);
                    for (const key of keys) {
                        if (Array.isArray(response[key])) {
                            branchesData = response[key];
                            break;
                        }
                    }
                }

                // Store raw branches data
                if (Array.isArray(branchesData) && branchesData.length > 0) {
                    setBranchesData(branchesData);
                    // Transform to Select component format
                    const branchesOptions = branchesData
                        .filter((branch) => {
                            const name = String(branch.branch_name || branch.name || branch.branchName || "").trim().toLowerCase();
                            return name !== "head office";
                        })
                        .map((branch) => ({
                            value: branch.branch_name || branch.name || branch.branchName || branch.id || branch.branch_id,
                            label: branch.branch_name || branch.name || branch.branchName || `Branch ${branch.id || branch.branch_id}`,
                            branch_id: branch.branch_id || branch.id
                        }));
                    setBranches(branchesOptions);
                } else {
                    setBranchesData([]);
                    setBranches([]);
                }
            }
        } catch (error) {
            console.error("Error fetching branches:", error);
            setBranches([]);
        }
    };

    const fetchOutletInfoForPrint = async () => {
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        try {
            const raw = await getBranchesForAttendance(userId);
            const list = Array.isArray(raw) ? raw : (raw?.branches ?? raw?.data?.branches ?? raw?.data ?? []);
            if (Array.isArray(list) && list.length > 0) {
                setAttendanceBranchesList(list);
                const selectedBranchId = localStorage.getItem("selectedBranchId");
                const selectedId = selectedBranchId ? String(selectedBranchId).trim() : "";
                const branch = list.find((b) => {
                    const id = b?.branch_id ?? b?.id;
                    return id != null && (Number(id) === Number(selectedId) || String(id) === selectedId);
                });
                if (branch) {
                    setOutletInfoForPrint({
                        name: branch.branch_name ?? branch.name ?? "",
                        address: branch.location_address != null && branch.location_address !== "" ? String(branch.location_address) : "",
                        telephone: branch.location_telephone != null && branch.location_telephone !== "" ? String(branch.location_telephone) : "",
                    });
                }
            }
        } catch (e) {
            console.error("Error fetching outlet info for print:", e);
        }
    };

    // Use branches from API, fallback to empty array if not loaded
    const deliveryOutletOptions = branches.length > 0 ? branches : [];

    const orderTypeOptions = [
        { value: "Outlet Order", label: "Outlet Order" },
        { value: "Web Sales", label: "Web Sales" },
        { value: "Pickup/Delivery", label: "Pickup/Delivery" },
    ];

    const paymentOptions = [
        { value: "CASH", label: "Cash" },
        { value: "CARD", label: "Card" },
    ];

    const cardTypeOptions = [
        { value: "CREDIT", label: "Credit" },
        { value: "DEBIT", label: "Debit" },
    ];

    const bankOptions = [
        { value: 'Amana Bank PLC', label: 'Amana Bank PLC' },
        { value: 'Bank of Ceylon (BOC)', label: 'Bank of Ceylon (BOC)' },
        { value: 'Bank of China Ltd', label: 'Bank of China Ltd' },
        { value: 'Cargills Bank PLC', label: 'Cargills Bank PLC' },
        { value: 'Citibank, N.A.', label: 'Citibank, N.A.' },
        { value: 'Commercial Bank of Ceylon PLC', label: 'Commercial Bank of Ceylon PLC' },
        { value: 'Deutsche Bank AG', label: 'Deutsche Bank AG' },
        { value: 'DFCC Bank PLC', label: 'DFCC Bank PLC' },
        { value: 'Habib Bank Ltd', label: 'Habib Bank Ltd' },
        { value: 'Hatton National Bank PLC (HNB)', label: 'Hatton National Bank PLC (HNB)' },
        { value: 'HSBC (Hong Kong and Shanghai Banking Corporation)', label: 'HSBC (Hong Kong and Shanghai Banking Corporation)' },
        { value: 'Indian Bank', label: 'Indian Bank' },
        { value: 'Indian Overseas Bank', label: 'Indian Overseas Bank' },
        { value: 'MCB Bank Ltd', label: 'MCB Bank Ltd' },
        { value: 'National Development Bank PLC (NDB)', label: 'National Development Bank PLC (NDB)' },
        { value: 'Nations Trust Bank PLC', label: 'Nations Trust Bank PLC' },
        { value: 'Pan Asia Banking Corporation PLC', label: 'Pan Asia Banking Corporation PLC' },
        { value: "People's Bank", label: "People's Bank" },
        { value: 'Public Bank Berhad', label: 'Public Bank Berhad' },
        { value: 'Sampath Bank PLC', label: 'Sampath Bank PLC' },
        { value: 'Seylan Bank PLC', label: 'Seylan Bank PLC' },
        { value: 'Standard Chartered Bank', label: 'Standard Chartered Bank' },
        { value: 'State Bank of India', label: 'State Bank of India' },
        { value: 'Union Bank of Colombo PLC', label: 'Union Bank of Colombo PLC' },
        { value: 'Licensed Specialised Banks', label: 'Licensed Specialised Banks' },
        { value: 'National Savings Bank (NSB)', label: 'National Savings Bank (NSB)' },
        { value: 'Housing Development Finance Corporation Bank of Sri Lanka (HDFC)', label: 'Housing Development Finance Corporation Bank of Sri Lanka (HDFC)' },
        { value: 'Regional Development Bank (RDB)', label: 'Regional Development Bank (RDB)' },
        { value: 'Sanasa Development Bank PLC', label: 'Sanasa Development Bank PLC' },
        { value: 'State Mortgage and Investment Bank', label: 'State Mortgage and Investment Bank' },
        { value: 'Sri Lanka Savings Bank Ltd', label: 'Sri Lanka Savings Bank Ltd' },
        { value: 'Lankaputhra Development Bank', label: 'Lankaputhra Development Bank' },
    ];

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

    const fetchAllCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_type: "Retail",
                branch_id: 1,
            };

            const response = await getAllCustomers(payload);
            const filtered = response.data.allCustomers.filter(customer => customer.customer_type === "Retail" && customer.account_status === "Active");
            setCustomers(filtered);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
        }
    };

    const fetchAllServiceTypes = async () => {
        try {
            const response = await getAllServiceTypes();
            setServiceTypes(response.data.service_types);
        } catch (error) {
            console.error("Error fetching service types: ", error);
        }
    };

    const fetchPriceList = async () => {
        try {
            const response = await getAllPriceLists(localStorage.getItem("userId"));
            setPriceList(response.data.price_lists);
        } catch (error) {
            console.error("Errorr fetching price list: ", error);
        }
    };

    const fetchAllSettings = async () => {
        try {
            const response = await getAllSettings(localStorage.getItem("userId"));
            setSettings(response.data.settings[0]);
        } catch (error) {
            console.error("Error fetching settings: ", error);
        }
    };

    const fetchDiscounts = async () => {
        try {
            const response = await getAllRetailDiscounts(localStorage.getItem("userId"));
            if (response && response.data && Array.isArray(response.data.discounts)) {
                // Keep all discounts from API (except Deactive); type comes directly from here
                const filtered = response.data.discounts.filter(discount => discount.status !== "Deactive");
                setDiscounts(filtered);
            } else {
                setDiscounts([]);
            }
        } catch (error) {
            console.error("Error fetching discounts: ", error);
            setDiscounts([]);
        }
    };


    useEffect(() => {
        fetchAllCustomers();
        fetchItemTypes();
        fetchAllServiceTypes();
        fetchPriceList();
        fetchAllSettings();
        fetchDiscounts();
        fetchAllBranches();
        fetchOutletInfoForPrint();
    }, []);

    const fetchCustomerOrders = async (customerId) => {
        if (!customerId) return;

        setIsLoadingOrders(true);
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_id: customerId
            };

            const response = await getAllOrdersByCustomerId(payload);
            if (response && response.orders && Array.isArray(response.orders)) {
                setCustomerOrders(response.orders);
            } else {
                setCustomerOrders([]);
            }
        } catch (error) {
            console.error("Error fetching customer orders:", error);
            setCustomerOrders([]);
        } finally {
            setIsLoadingOrders(false);
        }
    };

    // Set branch_id when branches are loaded and delivery_outlet matches
    /*useEffect(() => {
        if (branchesData.length > 0 && formData.delivery_outlet) {
            const matchingBranch = branchesData.find(branch =>
                (branch.branch_name || branch.name || branch.branchName) === formData.delivery_outlet
            );
            if (matchingBranch) {
                const branchId = matchingBranch.branch_id || matchingBranch.id;
                if (formData.branch_id !== branchId) {
                    setFormData(prev => ({
                        ...prev,
                        branch_id: branchId
                    }));
                }
            }
        }
    }, [branchesData, formData.delivery_outlet]);*/

    // Set default branch from attendance when branches are loaded
    useEffect(() => {
        const storedBranchName = localStorage.getItem("selectedBranchName");
        const storedBranchId = localStorage.getItem("selectedBranchId");

        if (branchesData.length > 0 && storedBranchName && storedBranchId) {
            const matchingBranch = branchesData.find(branch =>
                (branch.branch_name || branch.name || branch.branchName) === storedBranchName ||
                (branch.branch_id || branch.id || branch.branchId) === Number(storedBranchId)
            );

            // Re-sync branch_id (the logged-in outlet) whenever it doesn't match the
            // attendance-selected branch, regardless of what delivery_outlet is currently
            // showing. delivery_outlet is user-editable independently and must not gate this.
            if (matchingBranch && formData.branch_id !== Number(storedBranchId)) {
                const branchId = matchingBranch.branch_id || matchingBranch.id || matchingBranch.branchId;

                setFormData(prev => ({
                    ...prev,
                    branch_id: Number(branchId)
                }));
            }
        }
    }, [branchesData]);

    useEffect(() => {
        if (itemTypes && itemTypes.length > 0 && priceList && priceList.length > 0) {
            const filteredItems = itemTypes.filter(item =>
                priceList.some(pl => pl.item_type_id === item.item_type_id)
            );

            setFilteredItemTypes(filteredItems);
        } else {
            setFilteredItemTypes([]);
        }
    }, [itemTypes, serviceTypes, priceList])

    // Get suggested delivery date based on delivery type and order placement time (used when user selects/changes delivery type only)
    const getSuggestedDeliveryDate = (deliveryType) => {
        const now = new Date();
        const currentHour = now.getHours();
        const isBefore11AM = currentHour < 11;
        
        let hoursToAdd = 0;
        
        if (deliveryType === "Normal") {
            hoursToAdd = isBefore11AM ? 72 : 96;
        } else if (deliveryType === "Two Day") {
            hoursToAdd = isBefore11AM ? 48 : 72;
        } else if (deliveryType === "One Day") {
            hoursToAdd = isBefore11AM ? 24 : 48;
        } else if (deliveryType === "Express") {
            hoursToAdd = isBefore11AM ? 6 : 24;
        } else if (deliveryType === "Urgent") {
            hoursToAdd = isBefore11AM ? 4 : 24;
        } else {
            return "";
        }
        
        const deliveryDate = new Date(now);
        deliveryDate.setHours(deliveryDate.getHours() + hoursToAdd);
        return deliveryDate.toISOString().split('T')[0];
    };

    useEffect(() => {
        if (redoToggle === true) {
            return;
        } else if (formData.delivery_type === "Normal" && priceList && priceList.length > 0 && orders && orders.length > 0) {
            const updatedOrders = orders.map(order => {
                let newPrice;
                switch (order.service_type_id) {
                    case 1:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.normal_washing_price ?? 0);
                        break;
                    case 2:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.normal_pressing_price ?? 0);
                        break;
                    case 3:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.normal_dry_clean_price ?? 0);
                        break;
                    default:
                        newPrice = 0; // fallback
                }

                return {
                    ...order,
                    price: newPrice
                };
            });

            setOrders(updatedOrders);
        } else if (formData.delivery_type === "Express" && priceList && priceList.length > 0 && orders && orders.length > 0) {
            const updatedOrders = orders.map(order => {
                let newPrice;
                switch (order.service_type_id) {
                    case 1:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.express_washing_price ?? 0);
                        break;
                    case 2:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.express_pressing_price ?? 0);
                        break;
                    case 3:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.express_dry_clean_price ?? 0);
                        break;
                    default:
                        newPrice = 0; // fallback
                }

                return {
                    ...order,
                    price: newPrice
                };
            });

            setOrders(updatedOrders);
        } else if (formData.delivery_type === "One Day" && priceList && priceList.length > 0 && orders && orders.length > 0) {
            const updatedOrders = orders.map(order => {
                let newPrice;
                switch (order.service_type_id) {
                    case 1:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.one_day_washing_price ?? 0);
                        break;
                    case 2:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.one_day_pressing_price ?? 0);
                        break;
                    case 3:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.one_day_dry_clean_price ?? 0);
                        break;
                    default:
                        newPrice = 0; // fallback
                }

                return {
                    ...order,
                    price: newPrice
                };
            });

            setOrders(updatedOrders);
        } else if (formData.delivery_type === "Urgent" && priceList && priceList.length > 0 && orders && orders.length > 0) {
            const updatedOrders = orders.map(order => {
                let newPrice;
                switch (order.service_type_id) {
                    case 1:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.urgent_washing_price ?? 0);
                        break;
                    case 2:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.urgent_pressing_price ?? 0);
                        break;
                    case 3:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.urgent_dry_clean_price ?? 0);
                        break;
                    default:
                        newPrice = 0; // fallback
                }

                return {
                    ...order,
                    price: newPrice
                };
            });

            setOrders(updatedOrders);
        } else if (formData.delivery_type === "Two Day" && priceList && priceList.length > 0 && orders && orders.length > 0) {
            const updatedOrders = orders.map(order => {
                let newPrice;
                switch (order.service_type_id) {
                    case 1:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.two_day_washing_price ?? 0);
                        break;
                    case 2:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.two_day_pressing_price ?? 0);
                        break;
                    case 3:
                        newPrice = Number(priceList?.find(pl => pl.item_type_id === order.item_type_id)?.two_day_dry_clean_price ?? 0);
                        break;
                    default:
                        newPrice = 0; // fallback
                }

                return {
                    ...order,
                    price: newPrice
                };
            });

            setOrders(updatedOrders);
        }
    }, [formData.delivery_type]);

    useEffect(() => {
        if (orders && Array.isArray(orders)) {
            const totalAmount = orders.reduce(
                (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
                0
            );
            const totalRounded = Math.round((totalAmount + (Number(formData.delivery_charge) || 0)) * 100) / 100;

            setFormData(prev => (
                {
                    ...prev,
                    total_amount: totalRounded
                }
            ));
        } else {
            setFormData(prev => (
                {
                    ...prev,
                    total_amount: Number(formData.delivery_charge) || 0
                }
            ));
        }
    }, [orders, formData.delivery_charge]);

    useEffect(() => {
        if (orderCreateSuccess && formData.order_id) {
            const triggerPrint = async () => {
                try {
                    console.log("Auto-triggering print for new order:", formData.order_id);
                    await incrementRetailOrderPrintCount({
                        order_id: formData.order_id
                    });
                } catch (error) {
                    console.error("Error incrementing print count:", error);
                }
                handlePrint();
                setOrderCreateSuccess(false); // Reset to avoid double triggers
                // Redirect after a short delay to allow print capture
                setTimeout(() => {
                    navigate('/salesCorporate/retail/order-entry', { replace: true, state: { refreshOrders: true } });
                }, 500);
            };
            triggerPrint();
        }
    }, [orderCreateSuccess, formData.order_id]);

    useEffect(() => {
        if (settings) {
            setFormData(prev => (
                {
                    ...prev,
                    notes: settings.receipt_notes || "",
                    terms_and_conditions: settings.receipt_terms || "",
                }
            ));
        }
    }, [settings]);

    useEffect(() => {
        if (formData.order_type === "Pickup/Delivery" && redoToggle === false && settings) {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_charge: Number(settings.delivery_charge) || 0,
                }
            ));
        } else {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_charge: 0,
                }
            ));
        }
    }, [formData.order_type, settings, redoToggle]);

    // Fetch customer orders when REDO is toggled on
    useEffect(() => {
        if (redoToggle && selectedCustomer) {
            fetchCustomerOrders(selectedCustomer.customer_id);
        } else {
            // Clear orders and selections when REDO is toggled off
            setCustomerOrders([]);
            setSelectedRedoOrders([]);
            setFormData(prev => ({
                ...prev,
                redo_order_reference: ""
            }));
        }
    }, [redoToggle, selectedCustomer]);

    // Update redo_order_reference when selected orders change
    useEffect(() => {
        if (selectedRedoOrders && selectedRedoOrders.length > 0) {
            const orderIds = selectedRedoOrders.map(order => order.order_id).join(", ");
            setFormData(prev => ({
                ...prev,
                redo_order_reference: orderIds
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                redo_order_reference: ""
            }));
        }
    }, [selectedRedoOrders]);

    useEffect(() => {
        if (selectedDiscount === "loyalty") {
            setFormData(prev => (
                {
                    ...prev,
                    discount: `${selectedCustomer?.discount}%`,
                    discount_remark: "Loyalty",
                }
            ));
        } else if (selectedDiscount !== "other" && selectedDiscount !== null && selectedDiscount !== "") {
            const discount = discounts.find(discount => discount.discount_id === selectedDiscount)

            setFormData(prev => (
                {
                    ...prev,
                    discount: discount?.value_type === "Value" ? discount?.value : `${discount?.value}%`,
                    discount_remark: discount?.discount_name,
                }
            ));
        } else {
            setFormData(prev => (
                {
                    ...prev,
                    discount: "",
                    discount_remark: "",
                }
            ));
        }
    }, [selectedDiscount, selectedCustomer]);

    useEffect(() => {
        const discountValue = formData.discount?.toString().trim().endsWith('%')
            ? formData.total_amount * Number(formData.discount.replace('%', '').trim()) / 100
            : Number(formData.discount);
        const safeDiscountValue = Number.isFinite(discountValue) ? discountValue : 0;

        const cashPaid = Number(formData.advance_payment || 0);
        const cardPaid = (formData.payment || [])
            .filter(p => p.payment_method === "CARD")
            .reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
        const totalPaid = cashPaid + cardPaid;

        setFormData(prev => (
            {
                ...prev,
                remaining_amount: formData.total_amount - safeDiscountValue - totalPaid,
            }
        ));

    }, [formData.total_amount, formData.discount, formData.advance_payment, formData.payment]);

    useEffect(() => {
        if (formData.card_type === "CREDIT") {
            const filteredDiscounts = discounts.filter(discount => {
                if (discount?.discount_type === "Credit Card" && formData.bank !== "") {
                    return discount?.discount_condition?.includes(formData.bank);
                }
                if (discount?.discount_type === "Min Bill") {
                    return formData.total_amount >= Number(discount?.discount_condition);
                }
                if (discount?.discount_type === "Seasonal") {
                    return true; // add more rules if needed
                }
                return false;
            });

            setAvailableDiscounts(filteredDiscounts);

        } else if (formData.payment_method !== "") {
            const filteredDiscounts = discounts.filter(discount => {
                if (discount?.discount_type === "Min Bill") {
                    return formData.total_amount >= Number(discount?.discount_condition);
                }
                if (discount?.discount_type === "Seasonal") {
                    return true;
                }
                return false;
            });

            setAvailableDiscounts(filteredDiscounts);
        }

    }, [formData.payment_method, formData.total_amount, formData.card_type, formData.bank, discounts]);

    // Helper to normalize discount type strings (used in multiple places below)
    const normalizeDiscountType = (t) => String(t || "").trim();

    const filteredAvailableDiscounts = (() => {
        let filtered = availableDiscounts || [];

        if (selectedDiscountType) {
            filtered = filtered.filter(
                (d) => normalizeDiscountType(d?.discount_type) === selectedDiscountType
            );
        }

        if (selectedDiscountCondition && selectedDiscountType) {
            filtered = filtered.filter((d) => {
                if (!d.discount_condition) return false;

                if (selectedDiscountType === "Credit Card") {
                    const banks = d.discount_condition
                        .split(",")
                        .map((b) => b.trim());
                    return banks.includes(selectedDiscountCondition);
                } else if (selectedDiscountType === "Min Bill") {
                    return String(d.discount_condition) === String(selectedDiscountCondition);
                } else {
                    return String(d.discount_condition) === String(selectedDiscountCondition);
                }
            });
        }

        return filtered;
    })();

    // Min Bill: auto-apply on page/bill preview and when total changes, without user selecting "Min Bill"
    const applyBestMinBillDiscount = () => {
        const total = Number(formData.total_amount) || 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const minBillDiscounts = (discounts || []).filter((d) => {
            if (normalizeDiscountType(d?.discount_type) !== "Min Bill") return false;
            if (d?.status === "Deactive") return false;
            if (d?.valid_to) {
                const validTo = new Date(d.valid_to);
                validTo.setHours(0, 0, 0, 0);
                if (validTo < today) return false;
            }
            return typeof d.discount_condition !== "undefined" && d.discount_condition !== null;
        });

        const applicable = minBillDiscounts
            .filter((d) => Number(d.discount_condition) <= total)
            .sort((a, b) => Number(b.discount_condition) - Number(a.discount_condition));

        const best = applicable[0];
        if (best && best.discount_id) {
            setSelectedDiscountType("Min Bill");
            setSelectedDiscountCondition(String(best.discount_condition ?? ""));
            setSelectedDiscount(best.discount_id);
        } else {
            setSelectedDiscount(null);
        }
    };

    // When no discount type is selected: auto-apply best Min Bill by total (on load and when total changes)
    // Skip when customer has a loyalty discount so we don't overwrite it
    useEffect(() => {
        if (selectedDiscountType !== "") return;
        if (!discounts?.length) return;
        if (selectedCustomer?.discount != null && selectedCustomer?.discount !== "" && Number(selectedCustomer?.discount) > 0) return;
        applyBestMinBillDiscount();
    }, [selectedDiscountType, formData.total_amount, discounts, selectedCustomer?.discount]);

    // When user has selected "Min Bill": keep discount in sync with total
    useEffect(() => {
        if (selectedDiscountType !== "Min Bill") return;
        applyBestMinBillDiscount();
    }, [selectedDiscountType, formData.total_amount, discounts]);

    // Seasonal: auto-apply the best valid seasonal discount for today's date once selected
    const applyBestSeasonalDiscount = () => {
        const total = Number(formData.total_amount) || 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const applicableSeasonal = (discounts || []).filter((d) => {
            if (normalizeDiscountType(d?.discount_type) !== "Seasonal") return false;
            if (d?.status === "Deactive") return false;

            const validFrom = d?.valid_from ? new Date(d.valid_from) : null;
            const validTo = d?.valid_to ? new Date(d.valid_to) : null;
            if (validFrom) validFrom.setHours(0, 0, 0, 0);
            if (validTo) validTo.setHours(23, 59, 59, 999);

            if (validFrom && today < validFrom) return false;
            if (validTo && today > validTo) return false;

            const minBill = Number(d?.discount_condition);
            if (!Number.isNaN(minBill) && minBill > 0 && total < minBill) return false;

            return true;
        });

        const best = applicableSeasonal.reduce((max, d) => {
            const amount = d.value_type === "Value"
                ? Number(d.value || 0)
                : (total * Number(d.value || 0) / 100);
            return amount > (max?.amount ?? 0) ? { ...d, amount } : max;
        }, null);

        if (best?.discount_id) {
            setSelectedDiscountCondition(String(best.discount_condition ?? ""));
            setSelectedDiscount(best.discount_id);
        } else {
            setSelectedDiscount(null);
        }
    };

    // When user has selected "Seasonal": keep discount in sync with total
    useEffect(() => {
        if (selectedDiscountType !== "Seasonal") return;
        applyBestSeasonalDiscount();
    }, [selectedDiscountType, formData.total_amount, discounts]);

    // When a discount condition is selected (Credit Card), pick the best matching discount
    useEffect(() => {
        if (!selectedDiscountType || selectedDiscountType === "Min Bill" || selectedDiscountType === "Other" || selectedDiscountType === "Seasonal") return;
        if (!selectedDiscountCondition) {
            setSelectedDiscount(null);
            return;
        }

        if (!filteredAvailableDiscounts || filteredAvailableDiscounts.length === 0) {
            setSelectedDiscount(null);
            return;
        }

        const maxDiscount = filteredAvailableDiscounts.reduce((max, d) => {
            const discountValue = d.value_type === "Value"
                ? Number(d.value || 0)
                : (formData.total_amount * Number(d.value || 0) / 100);

            return discountValue > max.amount
                ? { ...d, amount: discountValue }
                : max;
        }, { amount: 0 });

        if (maxDiscount && maxDiscount.discount_id) {
            setSelectedDiscount(maxDiscount.discount_id);
        }
    }, [selectedDiscountType, selectedDiscountCondition, filteredAvailableDiscounts, formData.total_amount]);

    // Sync primary payment fields from payment[0] for discount logic and API (multi-payment UI)
    useEffect(() => {
        const first = formData.payment?.[0];
        if (!first) return;
        setFormData(prev => ({
            ...prev,
            payment_method: first.payment_method ?? "",
            card_type: first.card_type ?? "",
            bank: first.bank ?? "",
        }));
    }, [formData.payment]);

    //shortcut go back
    useHotkeys(
        "f3",
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (stage === 1) {
                document.getElementById("stage1Back").click();
            } else if (stage === 2) {
                document.getElementById("stage2Back").click();
            } else if (stage === 3) {
                document.getElementById("stage3Back").click();
            }
        },
        { enableOnFormTags: true, preventDefault: true },
        [stage]
    );

    //shortcut go next
    useHotkeys(
        "f4",
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (stage === 1) {
                document.getElementById("stage1Next").click();
            } else if (stage === 2) {
                document.getElementById("stage2Next").click();
            }
        },
        { enableOnFormTags: true, preventDefault: true },
        [stage]
    );

    //shortcut action
    useHotkeys(
        "f5",
        (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (stage === 1) {
                setShowCreateCustomerDialog(true);
            } else if (stage === 2) {
                setShowAddItemToOrderDialog(true);
            }
        },
        { enableOnFormTags: true, preventDefault: true },
        [stage]
    );

    //shortcut create
    useHotkeys(
        "f6",
        (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (stage === 3) {
                document.getElementById("create").click();
            }
        },
        { enableOnFormTags: true, preventDefault: true },
        [stage]
    );

    const handleSelectCustomer = (selectedOption) => {
        const newCustomer = customers.find(customer => customer.customer_id === selectedOption);
        setSelectedCustomer(newCustomer);
        setFormData(prev => ({
            ...prev,
            customer_id: selectedOption
        }));
        if (newCustomer?.discount != null && newCustomer?.discount !== "" && Number(newCustomer?.discount) > 0) {
            setSelectedDiscount("loyalty");
        } else {
            setSelectedDiscount(prev => prev === "loyalty" ? null : prev);
        }
    };

    const handleAddItemToOrder = (itemData) => {
        try {
            if (redoToggle === true) {
                // Set price to 0 for REDO orders (free service)
                itemData = {
                    ...itemData,
                    price: 0
                };
                setOrders(prev => [...prev, itemData]);
                setShowAddItemToOrderDialog(false);
            } else if (formData.delivery_type !== "" && priceList && Array.isArray(priceList) && priceList.length > 0) {
                let newPrice = 0;

                if (formData.delivery_type === "Normal") {
                    switch (itemData.service_type_id) {
                        case 1:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.normal_washing_price || 0);
                            break;
                        case 2:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.normal_pressing_price || 0);
                            break;
                        case 3:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.normal_dry_clean_price || 0);
                            break;
                        default:
                            newPrice = 0;
                    }
                } else if (formData.delivery_type === "Express") {
                    switch (itemData.service_type_id) {
                        case 1:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.express_washing_price || 0);
                            break;
                        case 2:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.express_pressing_price || 0);
                            break;
                        case 3:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.express_dry_clean_price || 0);
                            break;
                        default:
                            newPrice = 0;
                    }
                } else if (formData.delivery_type === "One Day") {
                    switch (itemData.service_type_id) {
                        case 1:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.one_day_washing_price || 0);
                            break;
                        case 2:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.one_day_pressing_price || 0);
                            break;
                        case 3:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.one_day_dry_clean_price || 0);
                            break;
                        default:
                            newPrice = 0;
                    }
                } else if (formData.delivery_type === "Urgent") {
                    switch (itemData.service_type_id) {
                        case 1:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.urgent_washing_price || 0);
                            break;
                        case 2:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.urgent_pressing_price || 0);
                            break;
                        case 3:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.urgent_dry_clean_price || 0);
                            break;
                        default:
                            newPrice = 0;
                    }
                } else if (formData.delivery_type === "Two Day") {
                    switch (itemData.service_type_id) {
                        case 1:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.two_day_washing_price || 0);
                            break;
                        case 2:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.two_day_pressing_price || 0);
                            break;
                        case 3:
                            newPrice = Number(priceList.find(pl => pl.item_type_id === itemData.item_type_id)?.two_day_dry_clean_price || 0);
                            break;
                        default:
                            newPrice = 0;
                    }
                }

                itemData = {
                    ...itemData,
                    price: newPrice
                };

                setOrders(prev => [...prev, itemData]);
                setShowAddItemToOrderDialog(false);
            } else {
                // If delivery type is not set or priceList is empty, add item with price 0
                itemData = {
                    ...itemData,
                    price: itemData.price || 0
                };
                setOrders(prev => [...prev, itemData]);
                setShowAddItemToOrderDialog(false);
            }
        } catch (error) {
            console.error("Error adding item to order: ", error);
            // Still add the item even if there's an error
            itemData = {
                ...itemData,
                price: itemData.price || 0
            };
            setOrders(prev => [...prev, itemData]);
            setShowAddItemToOrderDialog(false);
        }
    };

    const handleRemoveItemFromOrder = (indexToRemove) => {
        const updatedOrders = orders.filter((_, index) => index !== indexToRemove);
        setOrders(updatedOrders);
    };

    const handleInputChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value
            }
        ));
    };

    const handleInputNumberChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value === "" ? "" : Number(e.target.value)
            }
        ));
    };

    const handleInputPercentageChange = (e) => {
        if (/^[0-9%]*$/.test(e.target.value)) {
            setFormData(prev => ({
                ...prev,
                [e.target.name]: e.target.value,
            }));
        }
    };

    const handlePrint = useReactToPrint({
        contentRef: componentRefBulk
    });

    if (!allowed) return <PermissionDenied required="SalesRetail_Order_Create" label="Add New Order" />;

    const handleCreate = async () => {
        const MAX_ITEMS = settings?.bag_count ?? 8;
        setIsLoading(true);
        formData.items = orders;
        formData.advance_payment = Number(formData.advance_payment);

        const cashAmount = formData.advance_payment || 0;
        const cardAmount = (formData.payment || [])
            .filter((p) => p.payment_method === "CARD")
            .reduce((sum, p) => sum + (Number(p.paid_amount) || 0), 0);
        const totalPaid = cashAmount + cardAmount;

        const emptyStr = (v) => v === "" || v == null || (typeof v === "string" && v.trim() === "");
        const num = (v) => (v === "" || v == null ? 0 : Number(v));
        const strOrNull = (v) => (emptyStr(v) ? null : String(v).trim());

        const normalizedItems = (orders || []).map((item) => ({
            ...item,
            item_type_id: num(item.item_type_id),
            service_type_id: num(item.service_type_id),
            quantity: num(item.quantity),
            price: num(item.price),
            ...(item.pics_count !== undefined && { pics_count: num(item.pics_count) }),
        }));

        const normalizedPayment = (formData.payment || []).map((p) => {
            const base = p.payment_method === "CASH" ? { ...p, paid_amount: cashAmount } : { ...p, paid_amount: num(p.paid_amount) };
            return {
                ...base,
                paid_amount: num(base.paid_amount),
                card_type: strOrNull(base.card_type),
                bank: strOrNull(base.bank),
                card_last_4_digits: strOrNull(base.card_last_4_digits),
            };
        });

        const payload = {
            ...formData,
            branch_id: num(formData.branch_id),
            advance_payment: totalPaid,
            total_amount: num(formData.total_amount),
            remaining_amount: num(formData.remaining_amount),
            delivery_charge: num(formData.delivery_charge),
            discount: emptyStr(formData.discount) ? 0 : formData.discount,
            discount_remark: strOrNull(formData.discount_remark),
            redo_order_reference: strOrNull(formData.redo_order_reference),
            items: normalizedItems,
            payment: normalizedPayment,
            order_id: emptyStr(formData.order_id) ? null : String(formData.order_id).trim(),
            commingOrderId: emptyStr(formData.order_id) ? "-1" : String(formData.order_id).trim(),
        };

        try {
            setErrorMessage(""); // Clear any previous errors
            const response = await createRetailOrder(payload);
            if (response) {
                const grouped = {};

                // Step 1: Group by service_type_id + packing_option
                response?.items?.forEach(item => {
                    const key = `${item.service_type_id}-${item.packing_option}`;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(item);
                });

                // Step 2: Convert groups into array and chunk into size 8
                const result = [];
                Object.keys(grouped).forEach(key => {
                    const [service_type_id, packing_option] = key.split("-");
                    const groupItems = grouped[key];

                    for (let i = 0; i < groupItems.length; i += MAX_ITEMS) {
                        result.push({
                            service_type_id: Number(service_type_id),
                            packing_option: packing_option,
                            items: groupItems.slice(i, i + MAX_ITEMS)
                        });
                    }
                });

                setGroupedResult(result); // store in state to trigger re-render

                // Preserve manually entered order_id; only update if user didn't enter one
                const manuallyEnteredOrderId = formData.order_id && String(formData.order_id).trim() !== "" 
                    ? String(formData.order_id).trim() 
                    : null;
                const orderId = manuallyEnteredOrderId ?? response.order_id ?? response.id ?? "";
                setFormData(prev => ({ ...prev, order_id: orderId }));
                setOrderCreateSuccess(true);
            } else {
                setErrorMessage("Failed to create order: No response from server");
                setIsLoading(false);
            }
        } catch (error) {
            console.error("Error creating retail order: ", error);
            const errorMsg = error.message || "Failed to create order. Please try again.";
            setErrorMessage(errorMsg);
            setIsLoading(false);
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

    const handleAddPaymentMethod = () => {
        setFormData((prev) => ({
            ...prev,
            payment: [
                ...prev.payment,
                { payment_method: "", card_type: "", bank: "", paid_amount: "", card_last_4_digits: "" },
            ],
        }));
    };

    const discountTypeOptions = [
        { label: "All Types", value: "" },
        ...Array.from(
            new Set(
                (discounts || [])
                    .map((d) => normalizeDiscountType(d?.discount_type))
                    .filter(Boolean)
            )
        )
            .sort((a, b) => a.localeCompare(b))
            .map((type) => ({ label: type, value: type })),
        { label: "Other", value: "Other" },
    ];

    // Get discount conditions filtered by selected discount type
    // and only from active, date-valid discounts (no inactive / expired)
    const getDiscountConditionOptions = () => {
        if (!selectedDiscountType) {
            return [];
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const typeFilteredDiscounts = (discounts || []).filter((d) => {
            if (normalizeDiscountType(d?.discount_type) !== selectedDiscountType) return false;
            if (d?.status === "Deactive") return false;

            if (d?.valid_from) {
                const from = new Date(d.valid_from);
                from.setHours(0, 0, 0, 0);
                if (today < from) return false;
            }

            if (d?.valid_to) {
                const to = new Date(d.valid_to);
                to.setHours(0, 0, 0, 0);
                if (today > to) return false;
            }

            return true;
        });

        const conditions = new Set();

        typeFilteredDiscounts.forEach((discount) => {
            if (!discount.discount_condition) return;

            if (selectedDiscountType === "Credit Card") {
                const banks = String(discount.discount_condition)
                    .split(",")
                    .map((b) => b.trim())
                    .filter(Boolean);
                banks.forEach((bank) => conditions.add(bank));
            } else {
                conditions.add(discount.discount_condition);
            }
        });

        return Array.from(conditions)
            .sort((a, b) => {
                if (selectedDiscountType === "Min Bill") {
                    return Number(a) - Number(b);
                }
                return String(a).localeCompare(String(b));
            })
            .map((condition) => ({
                label: String(condition),
                value: String(condition),
            }));
    };

    const discountConditionOptions = getDiscountConditionOptions();

    // "Other" discount: lets the user enter either a flat Rs. amount or a 1-100% cut,
    // stored on formData.discount as a plain number ("500") or a percent string ("10%").
    const isPercentageDiscount = formData.discount?.toString().trim().endsWith('%') ?? false;
    const discountNumericValue = (formData.discount ?? "").toString().replace('%', '').trim();
    const setDiscountMode = (mode) => {
        if (discountNumericValue === "") {
            setFormData(prev => ({ ...prev, discount: mode === "PERCENT" ? "%" : "" }));
            return;
        }
        const num = mode === "PERCENT" ? Math.min(100, Number(discountNumericValue) || 0) : Number(discountNumericValue) || 0;
        setFormData(prev => ({ ...prev, discount: mode === "PERCENT" ? `${num}%` : `${num}` }));
    };
    const handleDiscountValueChange = (e) => {
        let raw = e.target.value;
        if (!/^\d*\.?\d*$/.test(raw)) return;
        if (isPercentageDiscount && raw !== "" && Number(raw) > 100) raw = "100";
        setFormData(prev => ({ ...prev, discount: raw === "" ? "" : `${raw}${isPercentageDiscount ? '%' : ''}` }));
    };

    return (
        <div>
            {/* <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/order-entry`)} />
                <h1 className="text-3xl text-primary font-bold">Order Entry/Add New Order</h1>
            </div> */}
            {/* <p className="text-black/50 text-xl">Create a new order.</p> */}

            {/* <div className="flex flex-row gap-x-1 items-center justify-center w-full my-5">
                <p className={`${stage === 1 || stage === 2 || stage === 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>1</p>
                <hr className={`${stage === 2 || stage === 3 ? "border-primary" : "border-black/20"} border w-1/6 my-auto`} />
                <p className={`${stage === 2 || stage === 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>2</p>
                <hr className={`${stage === 3 ? "border-primary" : "border-black/20"} border w-1/6 my-auto`} />
                <p className={`${stage === 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>3</p>
            </div> */}

            {stage === 1 &&
                <div className="flex flex-col gap-y-5">
                    <div className="flex flex-row items-center">
                        <div className="grow flex flex-col">
                            <label className="text-xl font-semibold" htmlFor="customer_id">Select Customer</label>
                            <Select
                                id="customer_id"
                                className="w-1/2"
                                styles={selectStyles}
                                options={customers.map(customer => ({
                                    value: customer.customer_id,
                                    // Include ID so search supports Customer ID as well
                                    label: `${customer.customer_name} (${customer.phone_number}) [${customer.customer_id}]`
                                }))}
                                value={customers.map(customer => ({
                                    value: customer.customer_id,
                                    label: `${customer.customer_name} (${customer.phone_number}) [${customer.customer_id}]`
                                })).find(option => option.value === formData.customer_id)}
                                onChange={(selectedOption) => handleSelectCustomer(selectedOption.value)}
                                filterOption={selectFilter}
                            />
                        </div>

                        <button className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer" onClick={() => setShowCreateCustomerDialog(true)}><BiPlus /> Add New Customer</button>
                    </div>

                    <div className="flex flex-row items-center text-xl gap-x-20">
                        <p className="font-semibold">Customer: <span className="font-normal">{selectedCustomer?.customer_name}</span></p>
                        <p className="font-semibold">Phone Number: <span className="font-normal">{selectedCustomer?.phone_number}</span></p>
                        {selectedCustomer?.discount != null && selectedCustomer?.discount !== "" && Number(selectedCustomer?.discount) > 0 && (
                            <p className="font-semibold">Discount : <span className="font-normal">{selectedCustomer.discount}%</span></p>
                        )}
                    </div>

                    {/* <h2 className="text-xl font-semibold">Recent Customer</h2>

                    <div className="bg-white rounded-xl">
                        {customers.slice(0, 4).map((customer, index) => (
                            <div key={index} className="grid grid-cols-8 py-2 hover:bg-primary/20 cursor-pointer" onClick={() => handleSelectCustomer(customer.customer_id)}>
                                <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto mx-auto p-1" />
                                <p className="col-span-2">{customer.customer_name}</p>
                                <p className="col-span-2">{customer.email}</p>
                                <p>{customer.phone_number}</p>
                                <p className="col-span-2">{customer.address}</p>
                            </div>
                        ))}
                    </div> */}

                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                        <div className="flex flex-row items-center gap-x-3">
                            <h2 className="text-xl font-semibold">Delivery Information</h2>

                            <p className="text-xl font-semibold ms-auto">Redo :</p>
                            {redoToggle ?
                                <ImCheckboxChecked
                                    className="text-green-500 cursor-pointer size-4"
                                    onClick={() => setRedoToggle(!redoToggle)}
                                /> :
                                <ImCheckboxUnchecked
                                    className="text-black/50 cursor-pointer size-4"
                                    onClick={() => setRedoToggle(!redoToggle)}
                                />
                            }
                        </div>

                        {/* Order Selection Dropdown - shown when REDO is active */}
                        {redoToggle && selectedCustomer && (
                            <div className="flex flex-col gap-y-2 mt-3">
                                <label className="text-lg font-semibold" htmlFor="redo_orders">Select Previous Orders to Redo</label>
                                {isLoadingOrders ? (
                                    <div className="flex items-center justify-center py-4">
                                        <BeatLoader color="#1470F9" size={10} />
                                        <p className="ml-3 text-gray-500">Loading customer orders...</p>
                                    </div>
                                ) : customerOrders.length > 0 ? (
                                    <>
                                        <Select
                                            id="redo_orders"
                                            className="w-full"
                                            styles={selectStyles}
                                            isMulti
                                            options={customerOrders.map(order => ({
                                                value: order.order_id,
                                                label: `Order #${order.order_id} - ${new Date(order.created_at || order.order_date).toLocaleDateString()} - Rs. ${Number(order.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                                order: order
                                            }))}
                                            value={selectedRedoOrders.map(order => ({
                                                value: order.order_id,
                                                label: `Order #${order.order_id} - ${new Date(order.created_at || order.order_date).toLocaleDateString()} - Rs. ${Number(order.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                                order: order
                                            }))}
                                            onChange={(selectedOptions) => {
                                                const orders = selectedOptions ? selectedOptions.map(opt => opt.order) : [];
                                                setSelectedRedoOrders(orders);
                                            }}
                                            placeholder="Select orders to redo..."
                                            filterOption={selectFilter}
                                        />
                                        {selectedRedoOrders.length > 0 && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                                                <p className="text-sm font-semibold text-blue-900">REDO Order Reference:</p>
                                                <p className="text-sm text-blue-700">{formData.redo_order_reference}</p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                        <p className="text-yellow-800 font-medium">No previous orders found for this customer.</p>
                                        <p className="text-yellow-600 text-sm mt-1">This customer doesn't have any orders to redo.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="order_id">Order ID</label>
                            <input
                                id="order_id"
                                className="border border-black/20 rounded-xl px-3 py-2"
                                type="text"
                                placeholder="Optional"
                                value={formData.order_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, order_id: e.target.value }))}
                            />
                        </div> */}

                        <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="delivery_type">Delivery Type</label>
                            <Select
                                id="delivery_type"
                                className="w-full"
                                styles={selectStyles}
                                options={deliveryTypeOptions}
                                value={deliveryTypeOptions.find(option => option.value === formData.delivery_type)}
                                onChange={(option) => setFormData(prev => ({
                                    ...prev,
                                    delivery_type: option.value,
                                    delivery_date: getSuggestedDeliveryDate(option.value) || prev.delivery_date
                                }))}
                                filterOption={selectFilter}
                            />
                        </div>

                        <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="delivery_date">Delivery Date</label>
                            <input
                                id="delivery_date"
                                className="border border-black/20 rounded-xl px-3 py-2"
                                type="date"
                                value={formData.delivery_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))}
                                disabled={false}
                                readOnly={false}
                            />
                        </div>

                        <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="delivery_type">Delivery Outlet</label>
                            <Select
                                id="delivery_outlet"
                                className="w-full"
                                styles={selectStyles}
                                options={deliveryOutletOptions}
                                value={deliveryOutletOptions.find(option => option.value === formData.delivery_outlet)}
                                onChange={(option) => {
                                    // Only update delivery_outlet (name). branch_id always stays the logged-in outlet.
                                    setFormData(prev => ({
                                        ...prev,
                                        delivery_outlet: option.value
                                        // branch_id unchanged: keep logged-in outlet id (prev.branch_id)
                                    }));
                                }}
                                filterOption={selectFilter}
                            />
                        </div>

                        <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="order_type">Order Type</label>
                            <Select
                                id="order_type"
                                className="w-full"
                                styles={selectStyles}
                                options={orderTypeOptions}
                                value={orderTypeOptions.find(option => option.value === formData.order_type)}
                                onChange={(option) => setFormData(prev => ({ ...prev, order_type: option.value }))}
                                filterOption={selectFilter}
                            />
                        </div>
                    </div>

                    <div className="flex flex-row text-xl my-5 justify-between">
                        <button id="stage1Back" type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => navigate("/salesCorporate/retail/order-entry")}>Back</button>

                        <p className="text-red-500 font-medium text-base">{errorMessage}</p>

                        <button
                            id="stage1Next"
                            type="button"
                            className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={() => {
                                if (!selectedCustomer) {
                                    setErrorMessage("Please select a customer before proceeding.");
                                } else if (!formData.delivery_type) {
                                    setErrorMessage("Please select a delivery type before proceeding.");
                                } else if (!formData.delivery_date) {
                                    setErrorMessage("Please select a delivery date before proceeding.");
                                } else if (!formData.delivery_outlet) {
                                    setErrorMessage("Please select a delivery outlet before proceeding.");
                                } else {
                                    setErrorMessage("");
                                    setStage(2);

                                }
                            }}
                        >Next</button>
                    </div>
                </div>
            }

            {stage === 2 &&
                <div className="flex flex-col gap-y-5">
                    <div className="grid grid-cols-2 bg-white rounded-xl p-5 gap-y-3">
                        <div className="flex flex-col gap-y-3">
                            <h2 className="text-xl font-semibold">Customer Information</h2>

                            <div className="flex flex-row gap-x-10 items-center font-medium text-lg">
                                <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto p-1" />
                                <p>{selectedCustomer?.customer_name}</p>
                                <p>{selectedCustomer?.phone_number}</p>
                                {selectedCustomer?.discount != null && selectedCustomer?.discount !== "" && Number(selectedCustomer?.discount) > 0 && (
                                    <p>Discount : {selectedCustomer.discount}%</p>
                                )}

                                {/* <p className="ms-auto text-primary cursor-pointer" onClick={() => setStage(1)}>Change Customer</p> */}
                            </div>
                        </div>

                        <div className="flex flex-col gap-y-3">
                            <h2 className="text-xl font-semibold">Delivery Information</h2>

                            <div className="flex flex-row gap-x-10 items-center font-medium text-lg">
                                <p>{formData?.delivery_type}</p>
                                <p>{formData?.delivery_date}</p>
                                <p>{formData?.delivery_outlet}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                        <div className="flex flex-row items-center justify-between">
                            <h2 className="text-xl font-semibold">Order Items</h2>
                            <button className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-lg py-1 px-3 rounded-full border border-primary cursor-pointer" onClick={() => setShowAddItemToOrderDialog(true)}><BiPlus /> Add New Item</button>
                        </div>

                        <div className="rounded-xl overflow-hidden">
                            <div className="text-xl grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                <p>ITEM</p>
                                <p>COLOUR</p>
                                <p>BRAND</p>
                                <p>REMARK</p>
                                <p>PACKING</p>
                                <p>QTY</p>
                                <p>PIECES</p>
                                <p>SERVICE</p>
                                <p>PRICE</p>
                                <p></p>
                            </div>

                            {orders.map((order, index) => (
                                <div key={index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                    <p>{itemTypes.find(type => type.item_type_id === order.item_type_id)?.item_type_name}</p>
                                    <p>{order.color}</p>
                                    <p>{order.brand}</p>
                                    <p>{order.remark}</p>
                                    <p>{order.packing_option}</p>
                                    <p>{order.quantity}</p>
                                    <p>{order.pics_count}</p>
                                    <p>{serviceTypes.find(type => type.service_type_id === order.service_type_id)?.service_type_name}</p>
                                    <p>{(Number(order.price) * Number(order.quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <Icon icon={"carbon:close-filled"} className="text-red-500 mx-auto cursor-pointer" onClick={() => handleRemoveItemFromOrder(index)} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                        <h2 className="text-xl font-semibold">Order Summary</h2>

                        {formData.order_type === "Pickup/Delivery" &&
                            <div className="flex flex-row justify-between">
                                <p>Delivery Charge</p>
                                <p>Rs. {(formData.delivery_charge).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        }

                        <div className="flex flex-row justify-between">
                            <p>Total Amount</p>
                            <p>Rs. {formData.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="flex flex-row justify-between">
                            <p>Cash received</p>
                            <p>Rs. {formData.advance_payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="flex flex-row justify-between">
                            <p>Discount</p>
                            <p>Rs. {(() => {
                                const discountValue = formData.discount?.toString().trim().endsWith('%')
                                    ? formData.total_amount * Number(String(formData.discount).replace('%', '').trim()) / 100
                                    : Number(formData.discount);
                                const safeDiscount = Number.isFinite(discountValue) ? discountValue : 0;
                                return safeDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}</p>
                        </div>
                        <div className="flex flex-row justify-between">
                            <p>Remaining Amount</p>
                            <p>Rs. {(Number(formData.remaining_amount) ?? (formData.total_amount - formData.advance_payment)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>

                    </div>

                    <div className="flex flex-row text-xl my-5 justify-between">
                        <button id="stage2Back" type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => setStage(1)}>Back</button>

                        <p className="text-red-500 font-medium text-base">{errorMessage}</p>

                        <button
                            id="stage2Next"
                            type="button"
                            className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={() => {
                                if (orders.length === 0) {
                                    setErrorMessage("Please add at least one item to the order before proceeding.");
                                    return;
                                } else if (!formData.delivery_type) {
                                    setErrorMessage("Please select a delivery type before proceeding.");
                                    return;
                                } else {
                                    setErrorMessage("");
                                    setStage(3);
                                }
                            }}
                        >Next</button>
                    </div>
                </div>
            }

            {stage === 3 &&
                <div>
                    <div className="flex flex-row gap-x-3 items-center">
                        <Icon icon={"material-symbols:refresh"} className="bg-primary/20 text-primary rounded-full p-1 size-6" />
                        <h2 className="text-2xl font-semibold">Bill Preview</h2>
                    </div>

                    <div className="grid grid-cols-4">
                        <main className="col-span-3 border-r border-black/20 pe-3">

                            {/* <RetailSalesOrder ref={salesOrderRef} orderItems={orders} data={formData} customer={selectedCustomer} itemTypes={itemTypes} serviceTypes={serviceTypes} /> */}

                            <div ref={componentRefBulk}>
                                <RetailSalesOrder ref={salesOrderRef} orderItems={orders} data={formData} customer={selectedCustomer} itemTypes={itemTypes} serviceTypes={serviceTypes} outletInfo={outletInfoForPrint} attendanceBranches={attendanceBranchesList} />

                                {groupedResult.map((o, index) => {
                                    const modifiedFormData = {
                                        ...formData,
                                        customer_name: selectedCustomer?.customer_name || "",
                                        phone_number: selectedCustomer?.phone_number || "", // example
                                    };

                                    return (
                                        <RetailServiceOrderBulk
                                            key={index}
                                            order={modifiedFormData}
                                            serviceType={o.service_type_id}
                                            itemTypes={itemTypes}
                                            foldType={o.packing_option}
                                            itemsFormatted={o.items}
                                            serialStart={groupedResult.slice(0, index).filter(prevGroup => prevGroup.service_type_id === o.service_type_id && prevGroup.packing_option === o.packing_option).reduce((sum, prevGroup) => sum + prevGroup.items.length, 0) + 1}
                                        />
                                    );
                                })}
                            </div>
                            <div className="flex flex-row text-xl my-5 justify-between">
                                <button id="stage3Back" type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => setStage(2)} disabled={isLoading}>Back</button>

                                <p className="text-red-500 font-medium text-base text-center">{errorMessage}</p>

                                <button
                                    id="create"
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={() => {
                                        const hasPayment = formData.payment?.length > 0 && formData.payment.some(p => p.payment_method);
                                        if (!hasPayment) {
                                            setErrorMessage("Please select a payment method before proceeding.");
                                            return;
                                        // } else if (formData.discount && formData.remaining_amount > 0) {
                                        //     setErrorMessage("Discount can be applied only if full payment is done.");
                                        //     return;
                                        } else if (formData.advance_payment > formData.total_amount) {
                                            setErrorMessage("Advance amount cannot exceed total amount.");
                                            return;
                                        } else {
                                            setErrorMessage("");
                                            handleCreate();
                                        }
                                    }}
                                    disabled={isLoading}>
                                    {isLoading ? <BeatLoader color="#fff" size={10} /> : "Create Order & Print Receipt"}
                                </button>
                            </div>
                        </main>

                        <aside className="px-3">
                            {formData.payment.map((p, index) => (
                                <div className="mb-5" key={index}>
                                    <div className="grow flex flex-col">
                                        <div className="flex flex-row justify-between items-center">
                                            <label className="text-xl font-semibold" htmlFor={`payment_method_${index}`}>Select Payment Method:</label>
                                            {formData.payment.length > 1 &&
                                                <BiMinus
                                                    className="text-red-500 cursor-pointer"
                                                    onClick={() =>
                                                        setFormData((prev) => {
                                                            const removedWasCash = prev.payment[index]?.payment_method === "CASH";
                                                            const nextPayment = prev.payment.filter((_, i) => i !== index);
                                                            const hasCash = nextPayment.some((pay) => pay.payment_method === "CASH");
                                                            return {
                                                                ...prev,
                                                                payment: nextPayment,
                                                                advance_payment: removedWasCash || !hasCash ? 0 : prev.advance_payment,
                                                            };
                                                        })
                                                    }
                                                />
                                            }
                                        </div>
                                        <Select
                                            id={`payment_method_${index}`}
                                            className="w-full"
                                            styles={selectStyles}
                                            options={paymentOptions}
                                            value={paymentOptions.find(option => option.value === p.payment_method)}
                                            onChange={(option) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    payment: prev.payment.map((pay, i) =>
                                                        i === index
                                                            ? { ...pay, payment_method: option.value, card_type: "", bank: "", paid_amount: "", card_last_4_digits: "" }
                                                            : pay
                                                    ),
                                                    advance_payment: 0,
                                                }))
                                            }
                                            filterOption={selectFilter}
                                        />
                                    </div>

                                    {p.payment_method === "CASH" && index === formData.payment.findIndex((pay) => pay.payment_method === "CASH") &&
                                        <Input variant={"number"}
                                            name="advance_payment"
                                            label="Advanced payment"
                                            placeholder="Enter advanced payment here..."
                                            value={formData.advance_payment === 0 || formData.advance_payment === "" ? "" : formData.advance_payment}
                                            onChange={handleInputNumberChange}
                                            classnames={"bg-white mt-2"}
                                        />
                                    }

                                    {p.payment_method === "CARD" &&
                                        <div className="grow flex flex-col">
                                            <label className="text-xl font-semibold" htmlFor={`card_type_${index}`}>Card Type:</label>
                                            <Select
                                                id={`card_type_${index}`}
                                                className="w-full"
                                                styles={selectStyles}
                                                options={cardTypeOptions}
                                                value={cardTypeOptions.find(option => option.value === p.card_type)}
                                                onChange={(option) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, card_type: option.value } : pay
                                                        ),
                                                    }))
                                                }
                                                filterOption={selectFilter}
                                            />
                                        </div>
                                    }

                                    {p.payment_method === "CARD" &&
                                        <div className="grow flex flex-col">
                                            <label className="text-xl font-semibold" htmlFor={`bank_${index}`}>Bank:</label>
                                            <Select
                                                id={`bank_${index}`}
                                                className="w-full"
                                                styles={selectStyles}
                                                options={bankOptions}
                                                value={bankOptions.find(option => option.value === p.bank)}
                                                onChange={(option) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, bank: option.value } : pay
                                                        ),
                                                    }))
                                                }
                                                filterOption={selectFilter}
                                            />
                                        </div>
                                    }

                                    {p.payment_method === "CARD" && p.bank &&
                                        <div className="grow flex flex-col">
                                            <label className="text-xl font-semibold" htmlFor={`last4_${index}`}>Last 4 digits:</label>
                                            <input
                                                type="text"
                                                id={`last4_${index}`}
                                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg"
                                                maxLength={4}
                                                value={p.card_last_4_digits ?? ""}
                                                onChange={(e) => {
                                                    const sanitized = e.target.value.replace(/\D/g, "").slice(0, 4);
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, card_last_4_digits: sanitized } : pay
                                                        ),
                                                    }));
                                                }}
                                            />
                                        </div>
                                    }

                                    {p.payment_method === "CARD" && p.bank &&
                                        <div className="grow flex flex-col">
                                            <label className="text-xl font-semibold" htmlFor={`paid_amount_${index}`}>Card Amount:</label>
                                            <input
                                                type="number"
                                                id={`paid_amount_${index}`}
                                                name="paid_amount"
                                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg"
                                                value={p.paid_amount ?? ""}
                                                onChange={(e) => {
                                                    const value = Number(e.target.value);
                                                    if (value < 0) return;
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, paid_amount: e.target.value === "" ? "" : value } : pay
                                                        ),
                                                    }));
                                                }}
                                            />
                                        </div>
                                    }
                                </div>
                            ))}

                            <button type="button" className="hidden border border-dashed border-primary rounded-xl w-full py-1 text-lg bg-white text-primary mt-3" onClick={handleAddPaymentMethod}>Add Payment Method</button>

                            <div className="grow flex flex-col mt-3">
                                <label className="text-xl font-semibold" htmlFor="discount_type">Discount Type:</label>
                                <Select
                                    id="discount_type"
                                    className="w-full"
                                    styles={selectStyles}
                                    options={discountTypeOptions}
                                    value={discountTypeOptions.find(opt => opt.value === selectedDiscountType) ?? null}
                                    onChange={(option) => {
                                        const nextType = option?.value ?? "";
                                        setSelectedDiscountType(nextType);
                                        setSelectedDiscountCondition("");
                                        setSelectedDiscount(null);
                                        setFormData((prev) => ({
                                            ...prev,
                                            discount: "",
                                            discount_remark: "",
                                        }));
                                        setTimeout(() => document.activeElement?.blur?.(), 0);
                                    }}
                                    onMenuClose={() => setTimeout(() => document.activeElement?.blur?.(), 0)}
                                    blurInputOnSelect
                                    filterOption={selectFilter}
                                />
                            </div>

                            {/* Discount Condition dropdown (except Min Bill which is auto, Other has no condition) */}
                            {selectedDiscountType && selectedDiscountType !== "Min Bill" && selectedDiscountType !== "Other" &&
                                <div className="grow flex flex-col mt-2">
                                    <label className="text-xl font-semibold" htmlFor="discount_condition">Discount Condition:</label>
                                    <Select
                                        id="discount_condition"
                                        key={selectedDiscountType || "no-type"}
                                        className="w-full"
                                        styles={selectStyles}
                                        options={discountConditionOptions}
                                        value={discountConditionOptions.find(opt => opt.value === selectedDiscountCondition) ?? null}
                                        onChange={(option) => {
                                            setSelectedDiscountCondition(option?.value ?? "");
                                            setTimeout(() => document.activeElement?.blur?.(), 0);
                                        }}
                                        onMenuClose={() => setTimeout(() => document.activeElement?.blur?.(), 0)}
                                        blurInputOnSelect
                                        filterOption={selectFilter}
                                        placeholder="Select condition..."
                                    />
                                </div>
                            }

                            {/* Manual discount when "Other" is selected */}
                            {selectedDiscountType === "Other" &&
                                <div className="grow flex flex-col mt-2 gap-y-1">
                                    <label className="text-xl font-semibold" htmlFor="discount_other">Discount:</label>
                                    <div className="flex flex-row gap-x-2">
                                        <div className="flex flex-row rounded-xl border border-black/20 overflow-hidden shrink-0">
                                            <button
                                                type="button"
                                                className={`px-3 py-1 text-lg font-semibold ${!isPercentageDiscount ? "bg-primary text-white" : "bg-white text-black/60"}`}
                                                onClick={() => setDiscountMode("AMOUNT")}
                                            >Rs.</button>
                                            <button
                                                type="button"
                                                className={`px-3 py-1 text-lg font-semibold ${isPercentageDiscount ? "bg-primary text-white" : "bg-white text-black/60"}`}
                                                onClick={() => setDiscountMode("PERCENT")}
                                            >%</button>
                                        </div>
                                        <div className="relative grow">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                id="discount_other"
                                                name="discount"
                                                className="w-full border border-black/20 bg-white px-3 rounded-xl py-1 text-lg pr-8"
                                                placeholder={isPercentageDiscount ? "1 - 100" : "Enter amount"}
                                                value={discountNumericValue}
                                                onChange={handleDiscountValueChange}
                                            />
                                            {isPercentageDiscount &&
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-black/50 font-semibold pointer-events-none">%</span>
                                            }
                                        </div>
                                    </div>
                                    {isPercentageDiscount && discountNumericValue !== "" && Number(formData.total_amount) > 0 &&
                                        <p className="text-sm text-black/50">
                                            = Rs. {(Number(formData.total_amount) * Number(discountNumericValue) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off
                                        </p>
                                    }
                                </div>
                            }

                            <div className="grow flex flex-col">
                                <label className="text-xl font-semibold" htmlFor="notes">Enter Note:</label>
                                <textarea
                                    className="border border-black/20 bg-white px-3 rounded-xl py-1"
                                    id="notes"
                                    name="notes"
                                    rows={4}
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>

                            <div className="grow flex flex-col">
                                <label className="text-xl font-semibold" htmlFor="terms_and_conditions">Enter Terms & Conditions:</label>
                                <textarea
                                    className="border border-black/20 bg-white px-3 rounded-xl py-1"
                                    id="terms_and_conditions" name="terms_and_conditions"
                                    rows={4}
                                    value={formData.terms_and_conditions}
                                    onChange={(e) => setFormData(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
                                />
                            </div>
                        </aside>
                    </div>
                </div>
            }

            {showCreateCustomerDialog &&
                <RetailCustomerCreateDialog
                    handleClose={() => setShowCreateCustomerDialog(false)}
                    onSuccess={() => window.location.reload()}
                />
            }

            {showAddItemToOrderDialog &&
                <RetailAddItemToOrderDialog
                    handleClose={() => setShowAddItemToOrderDialog(false)}
                    addToOrder={handleAddItemToOrder}
                    itemTypes={filteredItemTypes && filteredItemTypes.length > 0 ? filteredItemTypes : itemTypes}
                    serviceTypes={serviceTypes}
                    priceList={priceList}
                />
            }
        </div>
    );
};

export default RetailAddNewOrder;