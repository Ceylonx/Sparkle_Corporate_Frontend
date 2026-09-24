import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import RetailCustomerCreateDialog from "../../../components/dialogs/retail/RetailCustomerCreateDialog";
import { BiPlus, BiMinus } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import RetailAddItemToOrderDialog from "../../../components/dialogs/retail/RetailAddItemToOrderDialog";
import Input from "../../../components/ui/Input";
import RetailSalesOrder from "../../../components/printables/RetailSalesOrder";
import { useReactToPrint } from "react-to-print";
import { getAllCustomers, getCustomerById } from "../../../services/CustomerServices";
import { getAllItemTypes, getAllPriceLists, getAllSettings } from "../../../services/Retail/RetailSettingsServices";
import { getAllServiceTypes } from "../../../services/ServiceTypeServices";
import { createRetailOrder, getRetailOrderByIdToEdit, updateRetailOrder, trackOrderById, incrementRetailOrderPrintCount } from "../../../services/Retail/RetailOrderServices";
import { BeatLoader } from "react-spinners";
import { useHotkeys } from "react-hotkeys-hook";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { getAllRetailDiscounts } from "../../../services/Retail/RetailDiscountServices";
import RetailServiceOrderBulk from "../../../components/printables/RetailServiceOrderBulk";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";
import { isSuperadminRole } from "../../../utils/permissionHelper";

const RetailUpdateOrder = ({ requiredPermission }) => {
    const { allowed } = usePagePermission(requiredPermission);
    const { id } = useParams();
    const navigate = useNavigate();
    const isFirstRun = useRef(true);
    const componentRefBulk = useRef(null);
    const [initialized, setInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState();
    const userRole = localStorage.getItem("role") || "";
    const isSuperadmin = isSuperadminRole(userRole);
    const [stage, setStage] = useState(1);
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddItemToOrderDialog, setShowAddItemToOrderDialog] = useState(false);
    const salesOrderRef = useRef(null);
    const [customers, setCustomers] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [priceList, setPriceList] = useState([]);
    const [settings, setSettings] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [createdDate, setCreatedDate] = useState("");
    const [discounts, setDiscounts] = useState([]);
    const [selectedDiscount, setSelectedDiscount] = useState(null);
    const [selectedDiscountType, setSelectedDiscountType] = useState("");
    const [selectedDiscountCondition, setSelectedDiscountCondition] = useState("");
    const [availableDiscounts, setAvailableDiscounts] = useState([]);
    const [redoToggle, setRedoToggle] = useState(false);
    const [groupedResult, setGroupedResult] = useState([]);
    const [orderJustUpdated, setOrderJustUpdated] = useState(false);
    // Flags shared by all items in this order — new items added during edit get the same flags
    const [currentOrderFlags, setCurrentOrderFlags] = useState({
        is_send_to_production: 0,
        is_recived_to_production: 0,
        is_send_to_back_to_outlet: 0,
        is_recived_to_back_to_outlet: 0,
    });
    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    const [formData, setFormData] = useState(
        {
            id: "",
            user_id: localStorage.getItem("userId"),
            order_id: "",
            customer_id: "",
            branch_id: 1,
            items: [],
            delivery_type: "",
            delivery_date: "",
            delivery_charge: 0,
            delivery_outlet: "",
            advance_payment: 0,
            total_amount: "",
            remaining_amount: "",
            discount: "",
            discount_remark: "",
            order_status: "",
            status: "Active",
            order_type: "",
            payment_method: "",
            notes: "",
            terms_and_conditions: "",
            card_type: "",
            bank: "",
            payment: [
                { payment_method: "CASH", card_type: "", bank: "", paid_amount: "", card_last_4_digits: "" },
            ],
        }
    );

    const [orders, setOrders] = useState([]);

    const deliveryTypeOptions = [
        { value: "Urgent", label: "Urgent" },
        { value: "Express", label: "Express" },
        { value: "One Day", label: "One Day" },
        { value: "Two Day", label: "Two Day" },
        { value: "Normal", label: "Normal" },
    ];

    const deliveryOutletOptions = [
        { value: "Thimbirigasyaya", label: "Thimbirigasyaya" },
        { value: "Kotahena", label: "Kotahena" },
        { value: "Wattala", label: "Wattala" },
        { value: "Panadura", label: "Panadura" },
        { value: "Battaramulla", label: "Battaramulla" },
        { value: "Pagoda", label: "Pagoda" },
        // { value: "Head Office", label: "Head Office" },
        { value: "Kiribathgoda", label: "Kiribathgoda" },
        { value: "Nawala", label: "Nawala" },
        { value: "Seeduwa", label: "Seeduwa" },
    ];

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

    const fetchOrderById = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: id
            };

            const response = await getRetailOrderByIdToEdit(payload);

            if (response) {
                // ── DEBUG START ── remove once flags are working correctly ──
                console.log("[DEBUG] Full raw response:", JSON.stringify(response, null, 2));
                // ── DEBUG END ──

                const order = response.order || response.data?.order || response;
                const rawItems = order.items || order.service_items || [];

                // ── DEBUG START ──
                console.log("[DEBUG] Resolved 'order' object keys:", Object.keys(order));
                console.log("[DEBUG] order.order_status:", order.order_status);
                console.log("[DEBUG] order.status:", order.status);
                console.log("[DEBUG] rawItems[0]:", rawItems[0]);
                // ── DEBUG END ──
                const totalPaid = (order.payment && Array.isArray(order.payment) && order.payment.length > 0)
                    ? order.payment.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0)
                    : Number(order.advance_payment || 0);
                const paymentArray = (order.payment && Array.isArray(order.payment) && order.payment.length > 0)
                    ? order.payment.map((p) => ({
                        payment_method: p.payment_method || "CASH",
                        card_type: p.card_type || "",
                        bank: p.bank || "",
                        paid_amount: p.paid_amount != null ? p.paid_amount : "",
                        card_last_4_digits: p.card_last_4_digits || "",
                    }))
                    : [{ payment_method: order.payment_method || "CASH", card_type: order.card_type || "", bank: order.bank || "", paid_amount: totalPaid, card_last_4_digits: "" }];
                const cashEntry = paymentArray.find((p) => p.payment_method === "CASH");
                const advanceFromCash = cashEntry != null ? (Number(cashEntry.paid_amount) || 0) : (paymentArray[0]?.payment_method === "CASH" ? totalPaid : 0);
                setFormData(
                    {
                        id: order.id,
                        user_id: localStorage.getItem("userId"),
                        order_id: order.order_id,
                        customer_id: order.customer_id,
                        branch_id: order.branch_id || Number(localStorage.getItem("selectedBranchId")) || 1,
                        items: rawItems,
                        delivery_type: order.delivery_type,
                        delivery_date: (order.delivery_date || "").toString().split('T')[0],
                        delivery_charge: Number(order.delivery_charge || 0),
                        delivery_outlet: order.delivery_outlet || "",
                        advance_payment: advanceFromCash,
                        total_amount: Number(order.total_amount || 0),
                        remaining_amount: Number(order.remaining_amount || 0),
                        discount: order.discount,
                        discount_remark: order.discount_remark,
                        order_status: order.order_status,
                        status: order.status ?? "Active",
                        order_type: order.order_type,
                        payment_method: paymentArray[0]?.payment_method || order.payment_method || "",
                        notes: order.notes,
                        terms_and_conditions: order.terms_and_conditions,
                        card_type: paymentArray[0]?.card_type || order.card_type || "",
                        bank: paymentArray[0]?.bank || order.bank || "",
                        payment: paymentArray,
                        created_at: order.created_at,
                        updated_at: order.updated_at || null,
                        updated_by_role: order.updated_by_role || null,
                    }
                );

                // Normalize flag — API may return 1/"1"/true or 0/"0"/null/false
                const toFlag = (v) => (v === 1 || v === "1" || v === true) ? 1 : 0;

                // The edit endpoint returns all flags as 0 — we must fetch the real
                // flag values from trackOrderById (same source used by OrderStatusModal)
                // and merge them in by item_id before storing in state.
                let trackFlagsMap = {}; // item_id → { is_send_to_production, ... }
                try {
                    const trackResponse = await trackOrderById({
                        user_id: localStorage.getItem("userId"),
                        order_id: id,
                    });
                    const trackItems = trackResponse?.items ?? [];
                    trackItems.forEach((ti) => {
                        if (ti.item_id != null) {
                            trackFlagsMap[String(ti.item_id)] = {
                                is_send_to_production: toFlag(ti.is_send_to_production),
                                is_recived_to_production: toFlag(ti.is_recived_to_production),
                                is_send_to_back_to_outlet: toFlag(ti.is_send_to_back_to_outlet),
                                is_recived_to_back_to_outlet: toFlag(ti.is_recived_to_back_to_outlet),
                            };
                        }
                    });
                } catch (trackErr) {
                    console.warn("Could not fetch track flags, defaulting to 0:", trackErr);
                }

                // Store the shared flags so new items added during edit get the same values
                const firstFlags = Object.values(trackFlagsMap)[0];
                if (firstFlags) {
                    setCurrentOrderFlags(firstFlags);
                }

                const normalizeItem = (item) => {
                    const get = (obj, ...keys) => {
                        for (const k of keys) {
                            const v = obj?.[k];
                            if (v !== undefined && v !== null && v !== "") return v;
                        }
                        return undefined;
                    };
                    const num = (v) => (v !== undefined && v !== null && v !== "" ? Number(v) : undefined);

                    // Use real flags from trackOrderById if available for this item_id
                    const itemId = item.item_id ?? item.service_item_id ?? null;
                    const realFlags = (itemId != null && trackFlagsMap[String(itemId)])
                        ? trackFlagsMap[String(itemId)]
                        : {
                            is_send_to_production: toFlag(item.is_send_to_production),
                            is_recived_to_production: toFlag(item.is_recived_to_production),
                            is_send_to_back_to_outlet: toFlag(item.is_send_to_back_to_outlet),
                            is_recived_to_back_to_outlet: toFlag(item.is_recived_to_back_to_outlet),
                        };

                    return {
                        ...item,
                        item_type_id: num(get(item, "item_type_id", "itemTypeId")) ?? item.item_type_id,
                        color: get(item, "color") ?? "",
                        brand: get(item, "brand") ?? "",
                        remark: get(item, "remark") ?? "",
                        packing_option: get(item, "packing_option", "packingOption") ?? "",
                        quantity: num(get(item, "quantity", "qty")) ?? 1,
                        service_type_id: num(get(item, "service_type_id", "serviceTypeId")) ?? item.service_type_id,
                        price: num(get(item, "price", "unit_price", "unitPrice", "item_price", "itemPrice")) ?? 0,
                        ...realFlags,
                    };
                };

                const formattedOrder = rawItems.map((item) => {
                    const { created_at, status, ...rest } = item;
                    return normalizeItem({ ...rest, price: Number(rest.price ?? rest.unit_price ?? rest.unitPrice ?? 0) });
                });

                setOrders(formattedOrder);

                setCreatedDate((order.created_at || "").toString().split('T')[0]);

                const customerPayload = {
                    user_id: localStorage.getItem("userId"),
                    customer_id: order.customer_id,
                    customer_type: "Retail"
                };

                const responseCustomer = await getCustomerById(customerPayload);
                const loadedCustomer = responseCustomer.data.customer;
                setSelectedCustomer(loadedCustomer);

                // Always show what this order actually has recorded as an editable value —
                // regardless of whether it originally came from a Loyalty discount, a named
                // preset, or a manual entry. There's no "Loyalty" choice in the Discount Type
                // dropdown at all, so routing through that branch left the dropdown and the
                // amount permanently blank on edit. Only fall back to auto-suggesting the
                // customer's loyalty discount when this order doesn't already have one applied.
                if (order.discount) {
                    setSelectedDiscountType("Other");
                    setSelectedDiscount("other");
                    setFormData(prev => (
                        {
                            ...prev,
                            discount: order.discount,
                            discount_remark: order.discount_remark
                        }
                    ));
                } else if (loadedCustomer?.discount != null && loadedCustomer?.discount !== "" && Number(loadedCustomer?.discount) > 0) {
                    setSelectedDiscount("loyalty");
                }

                // setInitialized(true);
            }
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
        }
    }

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
        fetchOrderById();
        fetchAllCustomers();
        fetchItemTypes();
        fetchAllServiceTypes();
        fetchPriceList();
        fetchDiscounts();
        fetchAllSettings();
    }, []);

    useEffect(() => {
        if (!createdDate) return; // wait until order is loaded
        if (formData.delivery_type === "Urgent") {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_date: new Date(createdDate).toISOString().split('T')[0]
                }
            ));
        } else if (formData.delivery_type === "Express") {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_date: new Date(createdDate).toISOString().split('T')[0]
                }
            ));
        } else if (formData.delivery_type === "One Day") {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_date: new Date(new Date(createdDate).setDate(new Date(createdDate).getDate() + 1)).toISOString().split('T')[0]
                }
            ));
        } else if (formData.delivery_type === "Two Day") {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_date: new Date(new Date(createdDate).setDate(new Date(createdDate).getDate() + 2)).toISOString().split('T')[0]
                }
            ));
        } else if (formData.delivery_type === "Normal") {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_date: new Date(new Date(createdDate).setDate(new Date(createdDate).getDate() + 3)).toISOString().split('T')[0]
                }
            ));
        }

        if (formData.delivery_type === "Normal") {
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
        } else if (formData.delivery_type === "Express") {
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
        } else if (formData.delivery_type === "One Day") {
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
        } else if (formData.delivery_type === "Ugent") {
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
        } else if (formData.delivery_type === "Two Day") {
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
        const totalAmount = orders.reduce(
            (sum, item) => sum + Number(item.price) * Number(item.quantity),
            0
        );
        const totalRounded = Math.round((totalAmount + Number(formData.delivery_charge)) * 100) / 100;

        setFormData(prev => (
            {
                ...prev,
                total_amount: totalRounded
            }
        ));
    }, [orders, formData.delivery_charge]);

    const hasInitializedDeliveryRef = useRef(false);

    useEffect(() => {
        if (!hasInitializedDeliveryRef.current) {
            hasInitializedDeliveryRef.current = true;
            return; // skip first time, even after remount
        }

        if (formData.order_type === "Pickup/Delivery" && redoToggle === false) {
            setFormData(prev => (
                {
                    ...prev,
                    delivery_charge: Number(settings.delivery_charge),
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
    }, [formData.order_type]);

    const hasInitializedRef = useRef(false);

    useEffect(() => {
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            return; // skip first time, even after remount
        }

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
        } else if (selectedDiscount !== "other") {
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
        const cashPaid = Number(formData.advance_payment || 0);
        const cardPaid = (formData.payment || [])
            .filter(p => p.payment_method === "CARD")
            .reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
        const totalPaid = cashPaid + cardPaid;

        setFormData(prev => (
            {
                ...prev,
                remaining_amount: Number(formData.total_amount) - discountValue - totalPaid,
            }
        ));
    }, [formData.total_amount, formData.discount, formData.advance_payment, formData.payment]);

    const totalPaidDisplay = useMemo(() => {
        const cash = Number(formData.advance_payment) || 0;
        const card = (formData.payment || [])
            .filter(p => p.payment_method === "CARD")
            .reduce((s, p) => s + (Number(p.paid_amount) || 0), 0);
        return cash + card;
    }, [formData.advance_payment, formData.payment]);

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

    // Min Bill (update order): auto-apply the "nearest" discount (largest threshold <= total amount)
    useEffect(() => {
        if (selectedDiscountType !== "Min Bill") return;

        const total = Number(formData.total_amount) || 0;

        const minBillDiscounts = (discounts || []).filter((d) => {
            return (
                normalizeDiscountType(d?.discount_type) === "Min Bill" &&
                typeof d.discount_condition !== "undefined" &&
                d.discount_condition !== null
            );
        });

        const applicable = minBillDiscounts
            .filter((d) => Number(d.discount_condition) <= total)
            .sort((a, b) => Number(b.discount_condition) - Number(a.discount_condition));

        const best = applicable[0];

        if (best && best.discount_id) {
            setSelectedDiscount(best.discount_id);
        } else {
            setSelectedDiscount(null);
        }
    }, [selectedDiscountType, formData.total_amount, discounts]);

    // Compute discounts filtered by current type and condition
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

    // When a discount condition is selected (Credit Card / Seasonal), pick the best matching discount
    useEffect(() => {
        if (!selectedDiscountType || selectedDiscountType === "Min Bill" || selectedDiscountType === "Other") return;
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

    useEffect(() => {
        const normalizeType = (t) => String(t || "").trim();

        const types = new Set(
            (availableDiscounts || [])
                .map((d) => normalizeType(d?.discount_type))
                .filter(Boolean)
        );

        // "Other" is a synthetic option (manual entry) that never appears in the fetched
        // discounts list, so it must be exempt from this staleness check — otherwise this
        // effect wipes it out immediately after it's set.
        if (selectedDiscountType && selectedDiscountType !== "Other" && !types.has(selectedDiscountType)) {
            setSelectedDiscountType("");
        }

        if (selectedDiscount && selectedDiscount !== "loyalty" && selectedDiscount !== "other") {
            const stillExists = (availableDiscounts || []).some((d) => {
                const matchesType = selectedDiscountType
                    ? normalizeType(d?.discount_type) === selectedDiscountType
                    : true;
                return matchesType && d?.discount_id === selectedDiscount;
            });
            if (!stillExists) setSelectedDiscount(null);
        }
    }, [availableDiscounts, selectedDiscountType]);

    useEffect(() => {
        setFormData(prev => (
            {
                ...prev,
                card_type: "",
                bank: "",
            }
        ));
    }, [formData.payment_method]);

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
                document.getElementById("update").click();
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
        if (formData.delivery_type !== "") {
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
                price: newPrice,
                ...currentOrderFlags,
            };

            setOrders(prev => [...prev, itemData]);
            setShowAddItemToOrderDialog(false);
        } else {
            setOrders(prev => [...prev, { ...itemData, ...currentOrderFlags }]);
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
        contentRef: componentRefBulk,
        documentTitle: `Retail_Sales_Order_${formData.order_id}`,
    });

    useEffect(() => {
        if (groupedResult.length > 0) {
            // If admin just updated, wait for updated_at to be set before printing
            if (orderJustUpdated && isSuperadmin && !formData.updated_at) {
                return; // Wait for formData.updated_at to be set
            }

            const triggerPrint = async () => {
                if (formData.order_id) {
                    try {
                        await incrementRetailOrderPrintCount({
                            order_id: formData.order_id
                        });
                    } catch (error) {
                        console.error("Error incrementing print count:", error);
                    }
                }
                handlePrint();
                setIsLoading(false);
                setOrderJustUpdated(false);
                navigate('/salesCorporate/retail/order-entry', { replace: true, state: { refreshOrders: true } });
            };
            triggerPrint();
        }
    }, [groupedResult, formData.updated_at, orderJustUpdated]);

    if (!allowed) return <PermissionDenied required={requiredPermission} label="Update Order" />;

    const handleUpdate = async () => {
        const MAX_ITEMS = settings?.bag_count ?? 8;
        setIsLoading(true);
        formData.advance_payment = Number(formData.advance_payment);

        // Cash from advance_payment, card from payment[].paid_amount
        const cashAmount = Number(formData.advance_payment) || 0;
        const cardAmount = (formData.payment || [])
            .filter((p) => p.payment_method === "CARD")
            .reduce((sum, p) => sum + (Number(p.paid_amount) || 0), 0);
        const totalPaid = cashAmount + cardAmount;

        // Normalize flag — API may return 1/"1"/true or 0/"0"/null/false
        const toFlag = (v) => (v === 1 || v === "1" || v === true) ? 1 : 0;

        // Each item already carries the correct flags from the API response.
        // We preserve them per-item so the backend knows exactly where each
        // item currently is in the workflow.
        // New items added during update have no flags → all default to 0
        // (they haven't entered production yet).
        const mappedItems = orders.map((item) => {
            const mappedItem = {
                item_type_id: item.item_type_id,
                color: item.color ?? "",
                brand: item.brand ?? "",
                service_type_id: item.service_type_id,
                remark: item.remark ?? "",
                packing_option: item.packing_option ?? "",
                quantity: Number(item.quantity ?? 1),
                price: Number(item.price ?? 0),
                pics_count: Number(item.pics_count ?? 0),
                is_send_to_production: toFlag(item.is_send_to_production),
                is_recived_to_production: toFlag(item.is_recived_to_production),
                is_send_to_back_to_outlet: toFlag(item.is_send_to_back_to_outlet),
                is_recived_to_back_to_outlet: toFlag(item.is_recived_to_back_to_outlet),
            };

            // Only include item_id for existing items fetched from the API.
            // New items added during update must NOT have item_id in the payload.
            const itemId = item.item_id ?? item.service_item_id ?? item.serviceItemId ?? null;
            if (itemId) {
                mappedItem.item_id = itemId;
            }

            return mappedItem;
        });

        const normalizedPayment = (formData.payment || []).map((p) =>
            p.payment_method === "CASH"
                ? { ...p, paid_amount: cashAmount }
                : p
        );

        // Keep top-level payment fields aligned with the effective paid method.
        const effectivePayment =
            normalizedPayment.find((p) => Number(p?.paid_amount) > 0 && p?.payment_method) ||
            normalizedPayment.find((p) => p?.payment_method);
        const topLevelPaymentMethod = effectivePayment?.payment_method || "";
        const topLevelCardType = topLevelPaymentMethod === "CARD" ? (effectivePayment?.card_type || "") : "";
        const topLevelBank = topLevelPaymentMethod === "CARD" ? (effectivePayment?.bank || "") : "";

        const payload = {
            ...formData,
            items: mappedItems,
            status: formData.status ?? "Active",
            advance_payment: totalPaid,
            payment_method: topLevelPaymentMethod,
            card_type: topLevelCardType,
            bank: topLevelBank,
            payment: normalizedPayment,
        };

        try {
            const response = await updateRetailOrder(payload);
            if (response) {
                // Use created_at from response items as updated_at (represents when order was updated)
                // All items should have the same created_at timestamp from the update
                const updatedAt = response.items && response.items.length > 0
                    ? response.items[0].created_at
                    : (response.order?.created_at || response.created_at || null);
                const updatedByRole = response.order?.updated_by_role || (isSuperadmin ? userRole : null);

                // Update formData with updated_at (from API items created_at) and updated_by_role
                if (updatedAt) {
                    setFormData(prev => ({
                        ...prev,
                        updated_at: updatedAt,
                        updated_by_role: updatedByRole
                    }));
                    if (isSuperadmin) {
                        setOrderJustUpdated(true);
                    }
                }

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
            }
        } catch (error) {
            console.error("Error updating retail order: ", error);
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
            // Keep the "%" marker even with no number yet, so the toggle itself can switch to
            // percent mode before the user has typed anything — an empty string can't carry
            // that, so the % button previously had nothing to switch to.
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
                                    label: `${customer.customer_name} (${customer.phone_number})`
                                }))}
                                value={customers.map(customer => ({
                                    value: customer.customer_id,
                                    label: `${customer.customer_name} (${customer.phone_number})`
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

                        <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="delivery_type">Delivery Type</label>
                            <Select
                                id="delivery_type"
                                className="w-full"
                                styles={selectStyles}
                                options={deliveryTypeOptions}
                                value={deliveryTypeOptions.find(option => option.value === formData.delivery_type)}
                                onChange={(option) => setFormData(prev => ({ ...prev, delivery_type: option.value }))}
                                filterOption={selectFilter}
                            />
                        </div>

                        <div className="grow flex flex-col">
                            <label className="text-lg font-semibold" htmlFor="delivery_type">Delivery Date</label>
                            <input
                                name="delivery_date"
                                className="border border-black/20 rounded-xl px-3 py-2"
                                type="date"
                                value={formData.delivery_date}
                                onChange={handleInputChange}
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
                                onChange={(option) => setFormData(prev => ({ ...prev, delivery_outlet: option.value }))}
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
                                <p className="col-span-1">REMARK</p>
                                <p>PACKING</p>
                                <p>QTY</p>
                                <p>PIECES</p>
                                <p>SERVICE</p>
                                <p>PRICE</p>
                                <p></p>
                            </div>

                            {orders.map((order, index) => {
                                const itemType = itemTypes.find(type => (type.item_type_id ?? type.itemTypeId) === (order.item_type_id ?? order.itemTypeId));
                                const serviceType = serviceTypes.find(type => (type.service_type_id ?? type.serviceTypeId) === (order.service_type_id ?? order.serviceTypeId));
                                const itemName = itemType?.item_type_name ?? itemType?.itemTypeName ?? "-";
                                const serviceName = serviceType?.service_type_name ?? serviceType?.serviceTypeName ?? "-";
                                const qty = Number(order.quantity ?? order.qty ?? 1);
                                const pieces = Number(order.pics_count ?? order.pics_count ?? 1);
                                const price = Number(order.price ?? order.unit_price ?? order.unitPrice ?? 0);
                                return (
                                    <div key={order.service_item_id ?? order.serviceItemId ?? index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                        <p>{itemName}</p>
                                        <p>{order.color ?? "-"}</p>
                                        <p>{order.brand ?? "-"}</p>
                                        <p className="col-span-1">{order.remark ?? "-"}</p>
                                        <p>{order.packing_option ?? order.packingOption ?? "-"}</p>
                                        <p>{qty}</p>
                                        <p>{pieces}</p>
                                        <p>{serviceName}</p>
                                        <p>{(price * qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        <Icon icon={"carbon:close-filled"} className="text-red-500 mx-auto cursor-pointer" onClick={() => handleRemoveItemFromOrder(index)} />
                                    </div>
                                );
                            })}
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
                            <p>Advanced Amount</p>
                            <p>Rs. {totalPaidDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="flex flex-row justify-between">
                            <p>Discount</p>
                            {/* <p>{formData.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p> */}
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
                            <p>Rs. {(formData.remaining_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                            <div ref={componentRefBulk}>
                                <RetailSalesOrder
                                    ref={salesOrderRef}
                                    orderItems={orders}
                                    data={{
                                        ...formData,
                                        advance_payment: totalPaidDisplay,
                                        updated_at: formData.updated_at || (orderJustUpdated && isSuperadmin ? new Date().toISOString() : null),
                                        updated_by_role: formData.updated_by_role || (orderJustUpdated && isSuperadmin ? userRole : null)
                                    }}
                                    customer={selectedCustomer}
                                    itemTypes={itemTypes}
                                    serviceTypes={serviceTypes}
                                />

                                {groupedResult.map((o, index) => {
                                    const modifiedFormData = {
                                        ...formData,
                                        customer_name: selectedCustomer.customer_name,
                                        phone_number: selectedCustomer.phone_number,
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
                                <button id="stage3Back" type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => setStage(2)}>Back</button>

                                <p className="text-red-500 font-medium text-base">{errorMessage}</p>

                                <button
                                    id="update"
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={() => {
                                        const hasPayment = formData.payment?.length > 0 && formData.payment.some(p => p.payment_method);
                                        if (!hasPayment) {
                                            setErrorMessage("Please select a payment method before proceeding.");
                                            return;
                                        } else {
                                            setErrorMessage("");
                                            handleUpdate();
                                        }
                                    }}
                                    disabled={isLoading}>
                                    {isLoading ? <BeatLoader color="#fff" size={10} /> : "Edit Order & Print Receipt"}
                                </button>
                            </div>
                        </main>

                        <aside className="px-3">
                            <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary">
                                <p className="text-lg font-semibold text-primary">Advanced (Total Paid)</p>
                                <p className="text-xl font-bold">Rs. {totalPaidDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className="text-sm text-black/60">Cash + Card</p>
                            </div>
                            {(formData.payment || []).map((p, index) => (
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
                                                    const raw = e.target.value;
                                                    if (raw !== "" && (Number(raw) < 0 || isNaN(Number(raw)))) return;
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, paid_amount: raw === "" ? "" : (Number(raw) || 0) } : pay
                                                        ),
                                                    }));
                                                }}
                                            />
                                        </div>
                                    }
                                </div>
                            ))}

                            <button type="button" className="hidden border border-dashed border-primary rounded-xl w-full py-1 text-lg bg-white text-primary mt-3" onClick={() => setFormData(prev => ({ ...prev, payment: [...prev.payment, { payment_method: "", card_type: "", bank: "", paid_amount: "", card_last_4_digits: "" }] }))}>Add Payment Method</button>

                            <div className="grow flex flex-col">
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
                    itemTypes={itemTypes}
                    serviceTypes={serviceTypes}
                    priceList={priceList}
                />
            }
        </div>
    );
};

export default RetailUpdateOrder;