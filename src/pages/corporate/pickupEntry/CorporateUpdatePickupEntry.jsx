import { useEffect, useRef, useState, useMemo } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import { BiPlus } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import Input from "../../../components/ui/Input";
import CorporateCustomerCreateDialog from "../../../components/dialogs/corporate/CorporateCustomerCreateDialog";
import SignatureInput from "../../../components/ui/SignatureInput";
import CorporateCollectionNote from "../../../components/printables/CorporateCollectionNote";
import { useReactToPrint } from "react-to-print";
import { getAllCorporateCustomers, getCorporateCustomerById } from "../../../services/CustomerServices";
import { trackCorporatePickupEntryById, updateCorporatePickupEntry, updatePickupEntryApprovalStatus } from "../../../services/corporate/PickupEntryServices";
import { BeatLoader } from "react-spinners";
import { getAllCorporateItems, getAllCorporatePriceLists, getAllCorporateSettings, getCorporatePriceListByCustomer, getAllCorporateItemCategories, getCorporateTaxes } from "../../../services/corporate/CorporateSettingsServices";
import SignatureCanvas from "react-signature-canvas";
import {
    buildCollectionNoteLinesFromDraftRows,
    pickCorporateTaxRatePercent,
} from "../../../utils/corporateCollectionNotePricing";
import { normalizePickupTrackResponse } from "../../../utils/normalizeCorporatePickupTrackResponse";

function buildPickupEntryItemsPayload(orderRows, priceList, itemTypes) {
    const items = orderRows.map((order) => {
        const pl = priceList.find(
            (p) => String(p.corp_item_auto_id ?? p.item_type_id ?? p.corp_item_id ?? "") === String(order.item_id)
        );
        // Resolve the actual string corp_item_id (e.g. "COP_ITEM_30") from itemTypes.
        // order.item_id may be either the corp_item_auto_id (integer) set when adding a new
        // item from the dropdown, or the string corp_item_id loaded from an existing order.
        const itemInfo = itemTypes
            ? itemTypes.find(
                  (it) =>
                      String(it.corp_item_auto_id) === String(order.item_id) ||
                      String(it.item_type_id) === String(order.item_id)
              )
            : null;
        const unit = Number(pl?.washing_price ?? pl?.price_list_washing_price ?? 0);
        const qty = Number(order.quantity || 0);
        const lineTotal = Math.round(qty * unit * 100) / 100;
        return {
            order_item_auto_id: order.order_item_auto_id,
            corp_item_id: itemInfo ? String(itemInfo.item_type_id) : String(order.item_id),
            item_category_id: Number(order.item_category_id) || 1,
            corp_item_quantity: qty,
            corp_item_price: lineTotal,
            corp_item_remark: String(order.remark ?? ""),
        };
    });
    const total_amount = Math.round(items.reduce((sum, row) => sum + row.corp_item_price, 0) * 100) / 100;
    return { items, total_amount };
}

function normalizeCorporateItems(rawItems) {
    return (rawItems ?? []).map((item) => ({
        item_type_id: String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
        item_type_name: item.corp_item_name ?? item.item_type_name ?? "-",
        corp_item_auto_id: item.corp_item_auto_id, // Ensure this is preserved
        item_category_id: item.item_category_id,
        corp_item_id: item.corp_item_id || String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
        service_type: item.service_type,
        service_types: item.service_types,
    })).filter((item) => item.item_type_id);
}

const formatLogTimestamp = (isoString) => {
    try {
        const date = new Date(isoString);
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
        return isoString;
    }
};

const CorporateUpdatePickupEntry = () => {
    const navigate = useNavigate();
    const collectionNoteRef = useRef(null);
    const { id } = useParams();
    const [isLoading, setIsLoading] = useState(false);
    const [stage, setStage] = useState(1);
    const [editPickupSnapshot, setEditPickupSnapshot] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddSignature, setShowAddSignature] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [settings, setSettings] = useState(null);
    const [order, setOrder] = useState(null);
    const [customerPriceList, setCustomerPriceList] = useState([]);
    const [deliveryType, setDeliveryType] = useState(null);
    const [deliveryPercentage, setDeliveryPercentage] = useState(0);
    const [availableServiceTypes, setAvailableServiceTypes] = useState([]);
    const [isPriceListLoading, setIsPriceListLoading] = useState(false);
    const [corporateTaxRates, setCorporateTaxRates] = useState({ sscl: 0, vat: 0 });
    const [customerPricingTaxType, setCustomerPricingTaxType] = useState("");
    const [approvalStatus, setApprovalStatus] = useState('Created');
    const [createdByName, setCreatedByName] = useState('');
    const [checkedByUser, setCheckedByUser] = useState(null);
    const [approvedByUser, setApprovedByUser] = useState(null);
    const [activityLog, setActivityLog] = useState([]);
    const [isApprovalLoading, setIsApprovalLoading] = useState(false);
    const [checkedBySignature, setCheckedBySignature] = useState(null);
    const [showCheckedBySignatureModal, setShowCheckedBySignatureModal] = useState(false);
    const checkedBySigCanvasRef = useRef(null);
    const isSnapshotInitializedRef = useRef(false);

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    const [formData, setFormData] = useState(
        {
            user_id: "",
            customer_id: "",
            items: "",
            signed_by: "",
            signature_url: null,
            delivery_date: "",
            company_name: "",
            customer_name: "",
            phone_number: "",
            total_quantity: "",
            notes: "",
            terms_and_conditions: "",
            place_of_supply: "",
            checked_by_user: null,
            checked_by_signature: null,
            room_no: "",
            gate_pass_no: "",
        }
    );

    const [orders, setOrders] = useState([]);

    const [orderItem, setOrderItem] = useState(
        {
            item_id: "",
            item_category_id: "",
            quantity: "",
            remark: "",
        }
    );

    const [itemCategoryOptions, setItemCategoryOptions] = useState([]);

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
            const userId = localStorage.getItem("userId");
            const response = await getAllCorporateCustomers(userId);
            const list = response?.data?.customers
                || response?.data?.corporate_customers
                || response?.data?.allCustomers
                || response?.data?.data
                || [];
            setCustomers(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        }
    };

    const fetchCorporateItems = async () => {
        try {
            const response = await getAllCorporateItems(localStorage.getItem("userId"));
            const corporateItems = normalizeCorporateItems(response?.data?.corporate_items);
            setItemTypes(corporateItems);
        } catch (error) {
            console.error("Error fetching corporate items: ", error);
            setItemTypes([]);
        }
    };

    const fetchAllSettings = async () => {
        try {
            const response = await getAllCorporateSettings(localStorage.getItem("userId"));
            setSettings(response.data.settings[0]);
        } catch (error) {
            console.error("Error fetching settings: ", error);
        }
    };

    const fetchCustomerPriceList = async (customerId) => {
        if (!customerId) return;
        try {
            setIsPriceListLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_id: customerId,
            };
            const response = await getCorporatePriceListByCustomer(payload);
            const data = response?.data;
            console.log('Price List Data:', data);
            const list = data?.price_list ?? data?.corporate_price_lists ?? data ?? [];
            setCustomerPriceList(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching customer price list: ", error);
            setCustomerPriceList([]);
        } finally {
            setIsPriceListLoading(false);
        }
    };

    const fetchPickupEntryById = async () => {
        try {
            const userId = localStorage.getItem("userId");
            const response = await trackCorporatePickupEntryById(userId, id);
            setOrder(normalizePickupTrackResponse(response ?? null));
        } catch (error) {
            console.error("Error fetching pickup entry details: ", error);
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
            // Fallback for development if needed
            setItemCategoryOptions([
                { value: 1, label: "King" },
                { value: 2, label: "Queen" },
                { value: 3, label: "Single" },
            ]);
        }
    };

    useEffect(() => {
        fetchPickupEntryById();
        fetchAllCustomers();
        fetchCorporateItems();
        fetchAllSettings();
        fetchItemCategories();
    }, []);

    useEffect(() => {
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        let cancelled = false;
        (async () => {
            try {
                const taxRes = await getCorporateTaxes(userId, { activeOnly: true });
                if (cancelled) return;
                const taxes = taxRes?.taxes ?? [];
                setCorporateTaxRates({
                    sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
                    vat: pickCorporateTaxRatePercent(taxes, "VAT"),
                });
            } catch (e) {
                console.error("Error fetching corporate taxes for preview:", e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // useEffect(() => {
    //     if (formData.pickup_entry_id) {
    const fetchCustomerServiceTypes = async (customerAutoId) => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_auto_id: customerAutoId
            };
            const response = await getCorporateCustomerById(payload);
            const data = response?.data?.customer || response?.data?.data || response?.data;
            setCustomerPricingTaxType(String(data?.tax_type ?? ""));
            const serviceTypesList = data && Array.isArray(data.service_types) ? data.service_types : [];
            setAvailableServiceTypes([
                { service_type: 'Normal', percentage: 0 },
                ...serviceTypesList
            ]);
        } catch (error) {
            console.error("Error loading customer service types: ", error);
            setCustomerPricingTaxType("");
            setAvailableServiceTypes([
                { service_type: 'Normal', percentage: 0 }
            ]);
        }
    };

    const deliveryTypeOptions = useMemo(() => {
        const options = [];
        availableServiceTypes.forEach(st => {
            if (st.service_type && !options.some(o => o.value === st.service_type)) {
                options.push({
                    value: st.service_type,
                    label: st.service_type
                });
            }
        });
        return options;
    }, [availableServiceTypes]);

    useEffect(() => {
        if (order !== null && customers.length > 0) {
            setFormData(
                {
                    user_id: localStorage.getItem("userId"),
                    pickup_entry_id: order.pickup_entry_id,
                    customer_id: order.customer_id,
                    items: "",
                    signed_by: order.signed_by,
                    signature_url: order.signature_url || null,
                    delivery_date: order.delivery_date,
                    company_name: order.company_name || order.customer_company_name,
                    customer_name: order.customer_name || order.signed_by || "",
                    phone_number: order.phone_number || order.customer_phone,
                    total_quantity: order.total_quantity || "",
                    notes: order.notes,
                    terms_and_conditions: order.terms_and_conditions,
                    place_of_supply: order.place_of_supply || "",
                    checked_by_user: order.checked_by_user || null,
                    checked_by_signature: order.checked_by_signature || null,
                    room_no: order.room_no || "",
                    gate_pass_no: order.gate_pass_no || "",
                }
            );

            const custObj = customers.find(customer => (customer.customer_id || customer.customer_auto_id || customer.id) === order.customer_id);
            setSelectedCustomer(custObj);
            fetchCustomerPriceList(order.customer_id);
            if (custObj) {
                fetchCustomerServiceTypes(custObj.customer_auto_id);
            }

            if (order.delivery_type) {
                setDeliveryType({ value: order.delivery_type, label: order.delivery_type });
                setDeliveryPercentage(Number(order.delivery_percentage || 0));
            } else if (order.deliveryType) {
                setDeliveryType({ value: order.deliveryType, label: order.deliveryType });
                setDeliveryPercentage(Number(order.delivery_percentage || order.deliveryPercentage || 0));
            } else {
                setDeliveryType(null);
                setDeliveryPercentage(0);
            }

            const formattedItems = (order.items || []).map(item => {
                let resolvedServiceType = item.service_type;
                if (!resolvedServiceType && item.service_types) {
                    let parsedTypes = item.service_types;
                    if (typeof parsedTypes === 'string') {
                        try { parsedTypes = JSON.parse(parsedTypes); } catch (_) { parsedTypes = []; }
                    }
                    if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
                        resolvedServiceType = parsedTypes[0]?.service_type_name;
                    }
                }
                if (!resolvedServiceType) {
                    const itemInfo = itemTypes.find(
                        (it) => String(it.item_type_id) === String(item.corp_item_id || item.item_id) || String(it.corp_item_auto_id) === String(item.item_id)
                    );
                    resolvedServiceType = itemInfo?.service_type;
                    if (!resolvedServiceType && itemInfo?.service_types) {
                        let parsedTypes = itemInfo.service_types;
                        if (typeof parsedTypes === 'string') {
                            try { parsedTypes = JSON.parse(parsedTypes); } catch (_) { parsedTypes = []; }
                        }
                        if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
                            resolvedServiceType = parsedTypes[0]?.service_type_name;
                        }
                    }
                }
                if (!resolvedServiceType) {
                    resolvedServiceType = 'Washing';
                }

                return {
                    item_id: item.item_id || item.corp_item_id,
                    corp_item_id: item.corp_item_id || item.item_id,
                    order_item_auto_id: item.order_item_auto_id,
                    item_name: item.corp_item_name ?? item.item_name,
                    item_category_id: item.item_category_id,
                    item_category_name: item.item_category_name ?? item.category_name,
                    quantity: item.quantity || item.corp_item_quantity,
                    remark: item.remark || item.corp_item_remark,
                    service_type: resolvedServiceType,
                };
            });

            setOrders(formattedItems);

            if (!isSnapshotInitializedRef.current) {
                setEditPickupSnapshot({
                    customer_id: order.customer_id,
                    delivery_type: order.delivery_type || order.deliveryType || null,
                    gate_pass_no: order.gate_pass_no || "",
                    room_no: order.room_no || "",
                    place_of_supply: order.place_of_supply || "",
                    signed_by: order.signed_by || "",
                    signature_url: order.signature_url || null,
                    orders: JSON.stringify(formattedItems.map(o => ({
                        item_id: o.item_id,
                        item_category_id: o.item_category_id,
                        quantity: o.quantity,
                        remark: o.remark
                    })))
                });
                isSnapshotInitializedRef.current = true;
            }

            // Hydrate approval workflow state
            setApprovalStatus(order.approval_status || 'Created');
            setCreatedByName(order.created_by_name || order.created_by || '');
            setCheckedByUser(order.checked_by_user || null);
            setCheckedBySignature(order.checked_by_signature || null);
            setApprovedByUser(order.approved_by_user || null);
            setActivityLog(Array.isArray(order.activity_log) ? order.activity_log : []);
        }
    }, [order, customers])

    const handleSelectCustomer = (selectedOption) => {
        const customer = customers.find(c => (c.customer_id || c.customer_auto_id || c.id) === selectedOption);
        if (!customer) return;

        const customerIdToSet = customer.customer_id || customer.customer_auto_id || customer.id;
        setSelectedCustomer({
            ...customer,
            customer_id: customerIdToSet,
            phone_number: customer.customer_phone || customer.phone_number
        });
        setFormData(prev => ({
            ...prev,
            customer_id: customerIdToSet,
            place_of_supply: ""
        }));
        fetchCustomerPriceList(customerIdToSet);
        fetchCustomerServiceTypes(customer.customer_auto_id);
        setOrders([]); // Clear items when customer is changed
        setDeliveryType(null);
        setDeliveryPercentage(0);
    };

    const handleAddItemToOrder = () => {
        if (orderItem.item_id && orderItem.item_category_id && orderItem.quantity) {
            setOrders(prev => [...prev, orderItem]);
            setOrderItem(
                {
                    item_id: "",
                    item_category_id: "",
                    quantity: "",
                    remark: "",
                }
            );
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

    const handleAddSignature = (file) => {
        setFormData(prev => (
            {
                ...prev,
                signature_url: file
            }
        ));
        setShowAddSignature(false);
    };

    const handlePrint = useReactToPrint({
        contentRef: collectionNoteRef,
        documentTitle: `Collection note - ${selectedCustomer?.company_name || "Customer"}`
    });

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    const handleUpdate = async () => {
        const { items: itemsPayload, total_amount } = buildPickupEntryItemsPayload(orders, customerPriceList, itemTypes);
        const phoneNumber = selectedCustomer?.customer_phone
            || selectedCustomer?.phone_number
            || formData.phone_number
            || "";

        const payload = new FormData();
        payload.append("user_id", localStorage.getItem("userId"));
        payload.append("pickup_entry_id", formData.pickup_entry_id);
        payload.append("customer_id", formData.customer_id);
        payload.append("items", JSON.stringify(itemsPayload));
        payload.append("signed_by", formData.signed_by);
        // Only append the signature file if the user captured a new one (File/Blob); skip stale string URLs
        if (formData.signature_url instanceof File || formData.signature_url instanceof Blob) {
            payload.append("signature_url", formData.signature_url);
        }
        payload.append("phone_number", phoneNumber);
        payload.append("notes", formData.notes || "");
        payload.append("terms_and_conditions", formData.terms_and_conditions || "");
        payload.append("place_of_supply", formData.place_of_supply || "");
        payload.append("room_no", formData.room_no || "");
        payload.append("gate_pass_no", formData.gate_pass_no || "");
        payload.append("total_amount", total_amount);
        payload.append("delivery_type", deliveryType?.value ?? "Normal");
        payload.append("delivery_percentage", String(deliveryPercentage));

        try {
            setIsLoading(true);
            setErrorMessage('');
            await updateCorporatePickupEntry(payload);
            handlePrint();
            navigate("/salesCorporate/corporate/pickup-entry");
        } catch (error) {
            console.error("Error updating pickup entry: ", error);
            setErrorMessage(error?.response?.data?.message ?? "Failed to update. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprovalAction = async (newStatus, signature = null) => {
        const userId = localStorage.getItem("userId");
        const pickupEntryId = order?.pickup_entry_id;
        if (!userId || !pickupEntryId) return;
        try {
            setIsApprovalLoading(true);
            const result = await updatePickupEntryApprovalStatus({
                user_id: userId,
                pickup_entry_id: pickupEntryId,
                new_status: newStatus,
                signature: signature
            });
            setApprovalStatus(newStatus);
            if (newStatus === 'Checked') {
                setCheckedByUser(result.actor);
                setCheckedBySignature(signature);
                setFormData(prev => ({
                    ...prev,
                    checked_by_user: result.actor,
                    checked_by_signature: signature
                }));
            } else if (newStatus === 'Approved') {
                setApprovedByUser(result.actor);
            }
            // Append to local activity log
            setActivityLog(prev => [...prev, {
                type: newStatus,
                user: result.actor,
                timestamp: new Date().toISOString(),
                changes: []
            }]);
        } catch (error) {
            alert(error?.response?.data?.message ?? `Failed to mark as ${newStatus}`);
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleConfirmCheckedBySignature = () => {
        if (!checkedBySigCanvasRef.current || checkedBySigCanvasRef.current.isEmpty()) {
            alert("Please draw your signature first.");
            return;
        }
        const signatureBase64 = checkedBySigCanvasRef.current.getCanvas().toDataURL("image/png");
        setShowCheckedBySignatureModal(false);
        setCheckedBySignature(signatureBase64);
    };

    const itemOptions = useMemo(() => {
        if (!customerPriceList || customerPriceList.length === 0) return [];
        return customerPriceList
            .filter(pl => pl.price_list_auto_id != null && parseFloat(pl.amount ?? pl.price_list_washing_price ?? pl.washing_price ?? 0) > 0)
            .map(pl => {
                const name = pl.corp_item_name || pl.item_name || "";
                const itemId = pl.corp_item_id || "";
                const label = itemId && name ? `${itemId} - ${name}` : (itemId || name || "");
                return {
                    value: String(pl.corp_item_auto_id),
                    label: label
                };
            })
            .filter(opt => opt && opt.value);
    }, [customerPriceList]);

    const placeOfSupplyOptions = useMemo(() => {
        if (!selectedCustomer?.locations) return [];
        return selectedCustomer.locations.map(loc => ({
            value: loc.location_name,
            label: loc.location_name
        }));
    }, [selectedCustomer]);

    const orderItemsForPreview = useMemo(() => {
        const taxType =
            customerPricingTaxType ||
            selectedCustomer?.tax_type ||
            order?.tax_type;
        const vatNumber =
            selectedCustomer?.customer_vat_number ??
            selectedCustomer?.vat_number ??
            selectedCustomer?.vat_no ??
            order?.customer_vat_number ??
            order?.vat_number ??
            order?.vat_no;
        return buildCollectionNoteLinesFromDraftRows({
            orders,
            customerPriceList,
            deliveryTypeRaw: deliveryType?.value ?? "Normal",
            customerServiceTypes: availableServiceTypes,
            corporateTaxRates,
            itemTypes,
            taxType,
            vatNumber,
            customer: selectedCustomer,
            deliveryPercentageFallback: deliveryPercentage,
        });
    }, [
        orders,
        customerPriceList,
        deliveryType,
        availableServiceTypes,
        corporateTaxRates,
        itemTypes,
        customerPricingTaxType,
        selectedCustomer,
        order,
        deliveryPercentage,
    ]);

    const hasStage1Changed = editPickupSnapshot && (
        (editPickupSnapshot.customer_id !== (selectedCustomer?.customer_id || null)) ||
        (editPickupSnapshot.delivery_type !== (deliveryType?.value || null)) ||
        (editPickupSnapshot.gate_pass_no !== (formData.gate_pass_no || "")) ||
        (editPickupSnapshot.room_no !== (formData.room_no || "")) ||
        (editPickupSnapshot.place_of_supply !== (formData.place_of_supply || ""))
    );

    const currentOrdersStr = JSON.stringify(orders.map(o => ({
        item_id: o.item_id,
        item_category_id: o.item_category_id,
        quantity: o.quantity,
        remark: o.remark
    })));

    const hasStage2Changed = editPickupSnapshot && (
        (editPickupSnapshot.signed_by !== (formData.signed_by || "")) ||
        (editPickupSnapshot.signature_url !== (formData.signature_url || null)) ||
        (editPickupSnapshot.orders !== currentOrdersStr)
    );

    const hasChanged = !editPickupSnapshot || hasStage1Changed || hasStage2Changed;

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/pickup-entry`)} />
                <h1 className="text-3xl text-primary font-bold">Collection Order/Edit Order</h1>
            </div>
            <p className="text-black/50 text-xl">Edit an existing order.</p>

            <div className="flex flex-row gap-x-1 items-center justify-center w-full my-5">
                <p className={`${stage === 1 || stage === 2 || stage === 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>1</p>
                <hr className={`${stage === 2 || stage === 3 ? "border-primary" : "border-black/20"} border w-1/6 my-auto`} />
                <p className={`${stage === 2 || stage === 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>2</p>
                <hr className={`${stage === 3 ? "border-primary" : "border-black/20"} border w-1/6 my-auto`} />
                <p className={`${stage === 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>3</p>
            </div>

            {stage === 1 &&
                <div className="flex flex-col gap-y-5">
                    <div className="flex flex-row items-center">
                        <div className="grow flex flex-col">
                            <label className="text-xl font-semibold" htmlFor="customer">Select Customer</label>
                            <Select
                                id="customer"
                                className="w-full max-w-[450px]"
                                styles={{
                                    ...selectStyles,
                                    control: (base, state) => ({
                                        ...selectStyles.control(base, state),
                                        height: '2.75rem',
                                        minHeight: '2.75rem',
                                        fontSize: '1.125rem'
                                    })
                                }}
                                options={customers
                                    .filter(customer => {
                                        const status = String(customer.status || "").toLowerCase();
                                        return status !== "deactive" && status !== "inactive";
                                    })
                                    .map(customer => ({
                                        value: customer.customer_id || customer.customer_auto_id || customer.id,
                                        label: `${customer.company_name || ""}  ${customer.customer_name || ""} - ${customer.customer_phone || customer.phone_number || ""}`
                                    }))}
                                value={
                                    formData.customer_id && customers.length > 0
                                        ? (() => {
                                            const cust = customers.find(c => (c.customer_id || c.customer_auto_id || c.id) === formData.customer_id);
                                            return cust ? {
                                                value: formData.customer_id,
                                                label: `${cust.company_name || ""}  ${cust.customer_name || ""} - ${cust.customer_phone || cust.phone_number || ""}`
                                            } : null;
                                        })()
                                        : null
                                }
                                onChange={(option) => {
                                    if (option) {
                                        handleSelectCustomer(option.value);
                                    } else {
                                        setSelectedCustomer(null);
                                        setFormData(prev => ({ ...prev, customer_id: "" }));
                                        setAvailableServiceTypes([]);
                                        setDeliveryType(null);
                                        setDeliveryPercentage(0);
                                    }
                                }}
                                filterOption={selectFilter}
                                isClearable
                            />
                        </div>
                    </div>

                    <div className="flex flex-row items-center text-xl gap-x-20">
                        <p className="font-semibold">Company: <span className="font-normal">{selectedCustomer?.company_name}</span></p>
                        <p className="font-semibold">Customer: <span className="font-normal">{selectedCustomer?.customer_name}</span></p>
                        <p className="font-semibold">Phone Number: <span className="font-normal">{selectedCustomer?.customer_phone}</span></p>
                    </div>

                    <h2 className="text-xl font-semibold">Recent Customer</h2>

                    <div className="bg-white rounded-xl">
                        {customers.slice(0, 4).map((customer, index) => (
                            <div key={index} className="grid grid-cols-6 py-2 px-5 hover:bg-primary/20 cursor-pointer" onClick={() => handleSelectCustomer(customer.customer_id || customer.customer_auto_id || customer.id)}>
                                <div className="col-span-2 flex flex-row items-center gap-x-5">
                                    <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 p-1" />
                                    <div className="flex flex-col">
                                        <p className="font-medium">{customer.company_name || ""}</p>
                                        <p className="text-base text-black/60 font-medium">{customer.customer_name || ""}</p>
                                    </div>
                                </div>
                                <p>{customer.phone_number || customer.customer_phone || ""}</p>
                                <p className="col-span-2">{customer.address || customer.customer_address || ""}</p>
                            </div>
                        ))}
                    </div>

                    {/* Grid for Delivery Type, Gate Pass No, Room No, Place of Supply */}
                    <div className="grid grid-cols-2 gap-5 w-full max-w-[900px]">
                        {/* Delivery Type */}
                        <div className="flex flex-col gap-y-2">
                            <label className="text-xl font-semibold" htmlFor="delivery_type">Select Delivery Type<span className="text-red-500"> *</span></label>
                            <Select
                                id="delivery_type"
                                name="delivery_type"
                                options={deliveryTypeOptions}
                                value={deliveryType}
                                onChange={(option) => {
                                    setDeliveryType(option);
                                    if (option) {
                                        const matched = availableServiceTypes.find(st => st.service_type === option.value);
                                        setDeliveryPercentage(matched ? Number(matched.percentage) : 0);
                                    } else {
                                        setDeliveryPercentage(0);
                                    }
                                }}
                                placeholder="Select Delivery Type"
                                isDisabled={!selectedCustomer}
                                styles={{
                                    ...selectStyles,
                                    control: (base, state) => ({
                                        ...selectStyles.control(base, state),
                                        height: '2.75rem',
                                        minHeight: '2.75rem',
                                        fontSize: '1.125rem'
                                    })
                                }}
                            />
                        </div>

                        {/* Gate Pass No */}
                        <div className="flex flex-col gap-y-2">
                            <label className="text-xl font-semibold" htmlFor="gate_pass_no">
                                Gate Pass No <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="gate_pass_no"
                                name="gate_pass_no"
                                type="text"
                                className="px-4 py-1.5 text-xl border border-black/20 rounded-lg h-[2.75rem] focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                                placeholder="Enter Gate Pass No"
                                value={formData.gate_pass_no || ""}
                                onChange={handleInputChange}
                                disabled={!selectedCustomer}
                            />
                        </div>

                        {/* Room No */}
                        <div className="flex flex-col gap-y-2">
                            <label className="text-xl font-semibold" htmlFor="room_no">Room No</label>
                            <input
                                id="room_no"
                                name="room_no"
                                type="text"
                                className="px-4 py-1.5 text-xl border border-black/20 rounded-lg h-[2.75rem] focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                                placeholder="Enter Room No"
                                value={formData.room_no || ""}
                                onChange={handleInputChange}
                                disabled={!selectedCustomer}
                            />
                        </div>

                        {/* Place of Supply */}
                        <div className="flex flex-col gap-y-2">
                            <label className="text-xl font-semibold" htmlFor="place_of_supply">Place of Supply<span className="text-red-500"> *</span></label>
                            <Select
                                id="place_of_supply"
                                name="place_of_supply"
                                options={placeOfSupplyOptions}
                                value={
                                    formData.place_of_supply
                                        ? { value: formData.place_of_supply, label: formData.place_of_supply }
                                        : null
                                }
                                onChange={(option) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        place_of_supply: option ? option.value : ""
                                    }));
                                }}
                                placeholder="Select Place of Supply"
                                isDisabled={!selectedCustomer}
                                styles={{
                                    ...selectStyles,
                                    control: (base, state) => ({
                                        ...selectStyles.control(base, state),
                                        height: '2.75rem',
                                        minHeight: '2.75rem',
                                        fontSize: '1.125rem'
                                    })
                                }}
                                isClearable
                            />
                        </div>
                    </div>

                    <div className="flex flex-row text-xl my-5 justify-between">
                         <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => navigate("/salesCorporate/corporate/pickup-entry")}>Back</button>
                         <p className="text-red-500 font-medium text-base">{errorMessage}</p>
                         <button
                             type="button"
                             className={`font-semibold text-white bg-primary rounded-full py-2 w-1/3 ${!selectedCustomer || !deliveryType || !formData.gate_pass_no?.trim() || !formData.place_of_supply?.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                             onClick={() => {
                                 if (selectedCustomer && deliveryType && formData.gate_pass_no?.trim() && formData.place_of_supply?.trim()) {
                                     setErrorMessage("");
                                     setStage(2);
                                 } else if (!selectedCustomer) {
                                     setErrorMessage("Please select a customer before proceeding.");
                                 } else if (!deliveryType) {
                                     setErrorMessage("Please select a delivery type before proceeding.");
                                 } else if (!formData.gate_pass_no?.trim()) {
                                     setErrorMessage("Please fill the mandatory Gate Pass No before proceeding.");
                                 } else if (!formData.place_of_supply?.trim()) {
                                     setErrorMessage("Please select a place of supply before proceeding.");
                                 }
                             }}
                             disabled={!selectedCustomer || !deliveryType || !formData.gate_pass_no?.trim() || !formData.place_of_supply?.trim()}
                         >Next</button>
                     </div>
                </div>
            }

            {stage === 2 &&
                <div className="flex flex-col gap-y-5">
                    {/* Customer Information */}
                    <div className="flex flex-col bg-white rounded-xl p-6 gap-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-[1.35rem] font-medium text-black">Order Details</h2>
                            <p className="text-primary font-medium cursor-pointer hover:underline" onClick={() => setStage(1)}>Change Customer</p>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-8 items-start">
                            <div className="flex flex-row items-center gap-x-4 col-span-1">
                                <div className="bg-[#E5EFFE] rounded-full p-2.5 h-fit w-fit">
                                    <Icon icon={"lucide:user"} strokeWidth={2.5} className="text-primary size-7" />
                                </div>
                                <div className="flex flex-col gap-y-2">
                                    <p className="text-[1.1rem] text-black font-medium leading-none">{selectedCustomer?.company_name}</p>
                                    <p className="text-[1.05rem] text-black/40 uppercase leading-none">{selectedCustomer?.customer_id}</p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-y-2 col-span-1">
                                <p className="text-[0.95rem] text-black/80 font-medium leading-none">Address</p>
                                <p className="text-[1.05rem] text-black/40 leading-none">{selectedCustomer?.customer_address}</p>
                            </div>
                            
                            <div className="flex flex-col gap-y-2 col-span-1">
                                <p className="text-[0.95rem] text-black/80 font-medium leading-none">Telephone Number</p>
                                <p className="text-[1.05rem] text-black/40 leading-none">{selectedCustomer?.customer_phone}</p>
                            </div>
                        </div>

                        {/* Divider */}
                        <hr className="border-black/10" />

                        {/* Step 1 Details Grid */}
                        <div className="grid grid-cols-4 gap-8 items-start">
                            <div className="flex flex-col gap-y-2 col-span-1">
                                <p className="text-[0.95rem] text-black/80 font-medium leading-none">Delivery Type</p>
                                <p className="text-[1.05rem] text-black/40 leading-none">{deliveryType?.value || 'Normal'}</p>
                            </div>
                            
                            <div className="flex flex-col gap-y-2 col-span-1">
                                <p className="text-[0.95rem] text-black/80 font-medium leading-none">Gate Pass No</p>
                                <p className="text-[1.05rem] text-black/40 leading-none">{formData.gate_pass_no || '---'}</p>
                            </div>

                            <div className="flex flex-col gap-y-2 col-span-1">
                                <p className="text-[0.95rem] text-black/80 font-medium leading-none">Room No</p>
                                <p className="text-[1.05rem] text-black/40 leading-none">{formData.room_no || '---'}</p>
                            </div>

                            <div className="flex flex-col gap-y-2 col-span-1">
                                <p className="text-[0.95rem] text-black/80 font-medium leading-none">Place of Supply</p>
                                <p className="text-[1.05rem] text-black/40 leading-none">{formData.place_of_supply || '---'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                        <div className="flex flex-row items-center justify-between">
                            <h2 className="text-xl font-semibold">Order Items</h2>
                        </div>

                        <div className="grid grid-cols-9 gap-x-5">
                            <div className="grow flex flex-col col-span-2">
                                <label className="text-lg font-medium" htmlFor="itemName">Item Name</label>
                                <Select
                                    name="item_type_id"
                                    id="item_type_id"
                                    options={itemOptions}
                                    isLoading={isPriceListLoading}
                                    onChange={(option) => {
                                        if (option) {
                                            const item = itemTypes.find(it => String(it.corp_item_auto_id) === String(option.value));
                                            setOrderItem(prev => ({
                                                ...prev,
                                                item_id: option.value,
                                                item_category_id: item ? item.item_category_id : prev.item_category_id
                                            }));
                                        } else {
                                            setOrderItem(prev => ({ ...prev, item_id: "" }));
                                        }
                                    }}
                                    value={
                                        orderItem.item_id
                                            ? itemOptions.find(option => option.value === String(orderItem.item_id))
                                            : null
                                    }
                                    styles={selectStyles}
                                    filterOption={selectFilter}
                                    placeholder={isPriceListLoading ? "Loading..." : "Select Item..."}
                                />
                            </div>

                            <div className="grow flex flex-col col-span-2">
                                <label className="text-lg font-medium" htmlFor="category">Category</label>
                                <input
                                    type="text"
                                    className="px-4 py-1 text-lg border border-black/20 rounded-lg bg-gray-100 cursor-not-allowed focus:outline-none"
                                    readOnly
                                    value={
                                        orderItem.item_category_id
                                            ? itemCategoryOptions.find(option => String(option.value) === String(orderItem.item_category_id))?.label ?? ""
                                            : ""
                                    }
                                />
                            </div>

                            <div className="grow flex flex-col col-span-2">
                                <label className="text-lg font-medium" htmlFor="customer">Quantity</label>
                                <input
                                    id="quantity"
                                    name="quantity"
                                    type="number"
                                    className="px-4 py-1 text-lg border border-black/20 rounded-lg"
                                    placeholder="Enter Quantity"
                                    onChange={(e) =>
                                        setOrderItem(prev => ({
                                            ...prev,
                                            quantity: Number(e.target.value)
                                        }))
                                    }
                                    value={orderItem.quantity}
                                />
                            </div>

                            <div className="grow flex flex-col col-span-2">
                                <label className="text-lg font-medium" htmlFor="remark">Remark</label>
                                <input
                                    id="remark"
                                    name="remark"
                                    className="px-4 py-1 text-lg border border-black/20 rounded-lg"
                                    placeholder="Enter Remarks"
                                    onChange={(e) =>
                                        setOrderItem(prev => ({
                                            ...prev,
                                            remark: e.target.value
                                        }))
                                    }
                                    value={orderItem.remark}
                                />
                            </div>

                            <BiPlus onClick={handleAddItemToOrder} className="cursor-pointer text-green-500 size-8 mt-auto mb-3 ms-auto me-5" />
                        </div>

                        <div className="rounded-xl overflow-hidden border border-black/50">
                            <div className="text-lg grid grid-cols-9 gap-x-5 text-white bg-primary font-semibold py-2 px-4">
                                <p className="col-span-2">ITEM NAME</p>
                                <p className="col-span-2">CATEGORY</p>
                                <p className="col-span-2">QUANTITY</p>
                                <p className="col-span-2">REMARK</p>
                                <p className="col-span-1 text-center">ACTION</p>
                            </div>

                            {orders.map((order, index) => (
                                <div key={index} className={`grid grid-cols-9 gap-x-5 text-lg py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-4`}>
                                    <p className="col-span-2 font-medium">
                                        {(() => {
                                            const item = itemTypes.find(it => String(it.corp_item_auto_id) === String(order.item_id));
                                            return item ? `${item.item_type_id} - ${item.item_type_name}` : (order.item_name || "—");
                                        })()}
                                    </p>
                                    <p className="col-span-2 text-black/60">
                                        {itemCategoryOptions.find(cat => String(cat.value) === String(order.item_category_id))?.label ?? order.item_category_name ?? order.item_category_id ?? "—"}
                                    </p>
                                    <p className="col-span-2">{order.quantity}</p>
                                    <p className="col-span-2 text-black/70">{order.remark}</p>
                                    <div className="col-span-1 flex justify-center">
                                        <Icon icon={"carbon:close-filled"} className="text-red-500 text-2xl cursor-pointer" onClick={() => handleRemoveItemFromOrder(index)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-row text-xl my-5 justify-between">
                        <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => setStage(1)}>Back</button>
                        <p className="text-red-500 font-medium text-base">{errorMessage}</p>
                        <button
                            type="button"
                            disabled={!hasChanged}
                            className={`font-semibold text-white bg-primary rounded-full py-2 w-1/3 ${!hasChanged ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                            onClick={() => {
                                if (orders.length === 0) {
                                    setErrorMessage("Please add at least one item to the order before proceeding.");
                                    return;
                                } else if (orders.some((o) => o.item_category_id === "" || o.item_category_id == null)) {
                                    setErrorMessage("Each line item must have a category.");
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
                            <CorporateCollectionNote
                                ref={collectionNoteRef}
                                orderItems={orderItemsForPreview}
                                data={{ 
                                    ...formData, 
                                    delivery_type: deliveryType?.value,
                                    checked_by_user: checkedByUser || (checkedBySignature ? localStorage.getItem("userName") : null) || formData.checked_by_user,
                                    checked_by_signature: checkedBySignature || formData.checked_by_signature
                                }}
                                customer={selectedCustomer}
                                itemTypes={itemTypes}
                                itemCategories={itemCategoryOptions}
                                priceList={customerPriceList}
                                serviceTypes={availableServiceTypes}
                            />
                            <div className="flex flex-row text-xl my-5 justify-between">
                                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => { setEditPickupSnapshot(null); setStage(2); }} disabled={isLoading}>Back</button>
                                <p className="text-red-500 font-medium text-base">{errorMessage}</p>
                                <button
                                    type="button"
                                    className={`font-semibold text-white rounded-full py-2 w-1/3 cursor-pointer ${approvalStatus === 'Approved' ? 'bg-black/30 cursor-not-allowed' : 'bg-primary'}`}
                                    onClick={() => {
                                        handleUpdate();
                                    }}
                                    disabled={isLoading || approvalStatus === 'Approved'}
                                >{isLoading ? <BeatLoader color="#fff" size={10} /> : "Update Order & Print Receipt"}</button>
                            </div>
                        </main>

                        <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px] mt-3">
                            {/* Edit Pickup is just a label/indicator */}
                            <button
                                type="button"
                                disabled={approvalStatus === 'Approved' || isLoading}
                                onClick={() => {
                                    setEditPickupSnapshot({
                                        customer_id: selectedCustomer?.customer_id || null,
                                        delivery_type: deliveryType?.value || null,
                                        gate_pass_no: formData.gate_pass_no || "",
                                        room_no: formData.room_no || "",
                                        place_of_supply: formData.place_of_supply || "",
                                        signed_by: formData.signed_by || "",
                                        signature_url: formData.signature_url || null,
                                        orders: JSON.stringify(orders.map(o => ({
                                            item_id: o.item_id,
                                            item_category_id: o.item_category_id,
                                            quantity: o.quantity,
                                            remark: o.remark
                                        })))
                                    });
                                    setStage(1);
                                }}
                                className={`font-bold py-3 rounded-full text-lg shadow-sm transition-colors w-full ${approvalStatus === 'Approved' || isLoading ? 'bg-black/10 text-black/40 cursor-not-allowed' : 'bg-[#E5EFFE] text-[#000000] hover:bg-[#d4e4fd] cursor-pointer'}`}
                            >
                                {approvalStatus === 'Approved' ? '🔒 Locked' : 'Edit Collection Order'}
                            </button>
                            
                            {/* Created By */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Created By :</p>
                                <div className="flex flex-row items-center gap-x-2">
                                    <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                                    <span className="text-black/70 text-sm truncate">{createdByName || '—'}</span>
                                </div>
                            </div>

                            {/* Checked By */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Checked By :</p>
                                {checkedByUser ? (
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon icon="mdi:check-circle" className="text-[#1470F9] text-xl" />
                                        <span className="text-black/70 text-sm truncate">{checkedByUser}</span>
                                    </div>
                                ) : (
                                    <button
                                        disabled
                                        className="border border-black/20 text-black/30 font-medium py-2.5 rounded-full shadow-sm bg-white w-full text-lg cursor-not-allowed"
                                    >
                                        Checked
                                    </button>
                                )}
                            </div>

                            {/* Approved By */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Approved By :</p>
                                {approvedByUser ? (
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                                        <span className="text-black/70 text-sm truncate">{approvedByUser}</span>
                                    </div>
                                ) : (
                                    <button
                                        disabled
                                        className="border border-black/20 text-black/30 font-medium py-2.5 rounded-full shadow-sm bg-white w-full text-lg cursor-not-allowed"
                                    >
                                        Approved
                                    </button>
                                )}
                            </div>

                            {/* Activity Log */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Activity Log :</p>
                                <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                                    {activityLog.length === 0 ? (
                                        <div className="px-4 py-3 text-black/40 text-sm">No activity yet.</div>
                                    ) : activityLog.map((log, idx) => {
                                        const formattedTime = formatLogTimestamp(log.timestamp);
                                        const isNewStyle = !!log.action;
                                        return (
                                            <div key={idx} className={`px-4 py-2 text-sm text-black/70 ${idx > 0 ? 'border-t border-black/20' : ''}`}>
                                                {log.description ? (
                                                    <>
                                                        <span className="font-semibold text-[13px]">{formattedTime}</span>: {log.user} — {log.description}
                                                    </>
                                                ) : isNewStyle ? (
                                                    <>
                                                        <span className="font-semibold text-[13px]">{formattedTime}</span>: {log.user} changed {log.field} from "{log.old ?? '—'}" to "{log.new ?? '—'}"
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="font-semibold text-[13px]">{formattedTime}</span>: {log.user} {log.type === 'Created' ? 'created the order' : log.type === 'Checked' ? 'checked the order' : log.type === 'Approved' ? 'approved the order' : 'edited the order'}
                                                        {log.changes && log.changes.length > 0 && (
                                                            <ul className="list-disc pl-5 mt-1 text-xs">
                                                                {log.changes.map((change, ci) => (
                                                                    <li key={ci}>{change}</li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                             {/* <div className="flex flex-col gap-y-1">
                                 <label className="text-black font-semibold text-[15px]">Room No :</label>
                                 <input 
                                     name="room_no" 
                                     value={formData.room_no} 
                                     onChange={handleInputChange} 
                                     disabled={approvalStatus === 'Approved'}
                                     placeholder="Enter room number" 
                                     className={`border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 shadow-sm text-sm ${approvalStatus === 'Approved' ? 'bg-black/5 cursor-not-allowed' : 'bg-white'}`}
                                 />
                             </div>

                             <div className="flex flex-col gap-y-1">
                                 <label className="text-black font-semibold text-[15px]">Gate Pass No :</label>
                                 <input 
                                     name="gate_pass_no" 
                                     value={formData.gate_pass_no} 
                                     onChange={handleInputChange} 
                                     disabled={approvalStatus === 'Approved'}
                                     placeholder="Enter gate pass number" 
                                     className={`border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 shadow-sm text-sm ${approvalStatus === 'Approved' ? 'bg-black/5 cursor-not-allowed' : 'bg-white'}`}
                                 />
                             </div>

                             <div className="flex flex-col gap-y-1">
                                 <label className="text-black font-semibold text-[15px]">Place of Supply :</label>
                                 <input 
                                     name="place_of_supply" 
                                     value={formData.place_of_supply} 
                                     onChange={handleInputChange} 
                                     disabled={approvalStatus === 'Approved'}
                                     placeholder="Enter place of supply here" 
                                     className={`border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 shadow-sm text-sm ${approvalStatus === 'Approved' ? 'bg-black/5 cursor-not-allowed' : 'bg-white'}`}
                                 />
                             </div> */}

                            <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Enter Note :</label>
                                <textarea 
                                    name="notes" 
                                    value={formData.notes} 
                                    onChange={handleInputChange} 
                                    disabled={approvalStatus === 'Approved'}
                                    placeholder="Enter note here" 
                                    rows={3}
                                    className={`border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 shadow-sm text-sm resize-none ${approvalStatus === 'Approved' ? 'bg-black/5 cursor-not-allowed' : 'bg-white'}`}
                                />
                            </div>

                            <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Enter Terms & Conditions :</label>
                                <textarea 
                                    name="terms_and_conditions" 
                                    value={formData.terms_and_conditions} 
                                    onChange={handleInputChange} 
                                    disabled={approvalStatus === 'Approved'}
                                    placeholder="Enter terms & conditions" 
                                    rows={3}
                                    className={`border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 shadow-sm text-sm resize-none ${approvalStatus === 'Approved' ? 'bg-black/5 cursor-not-allowed' : 'bg-white'}`}
                                />
                            </div>
                        </aside>

                    </div>
                </div>
            }

            {showCreateCustomerDialog &&
                <CorporateCustomerCreateDialog handleClose={() => setShowCreateCustomerDialog(false)} />
            }

            {showAddSignature &&
                <SignatureInput handleAddSignature={handleAddSignature} handleClose={() => setShowAddSignature(false)} />
            }

            {showCheckedBySignatureModal && (
                <div className="fixed inset-0 h-screen w-screen z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
                    <div className="bg-white rounded-[24px] w-full max-w-[450px] shadow-2xl flex flex-col p-8 transition-all relative">
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                            Checked By Signature
                        </h2>
                        <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                            Please draw your signature in the box below to confirm this request.
                        </p>

                        <div className="w-full h-[180px] border border-dashed border-gray-300 rounded-xl overflow-hidden bg-white mb-3">
                            <SignatureCanvas
                                ref={checkedBySigCanvasRef}
                                penColor="black"
                                canvasProps={{
                                    className: "w-full h-full cursor-crosshair"
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => checkedBySigCanvasRef.current.clear()}
                            className="text-gray-400 hover:text-gray-600 text-sm underline underline-offset-4 self-start cursor-pointer transition-colors mb-6"
                        >
                            Clear Signature
                        </button>

                        <div className="flex flex-row gap-x-4 w-full">
                            <button
                                type="button"
                                onClick={() => setShowCheckedBySignatureModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmCheckedBySignature}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorporateUpdatePickupEntry;