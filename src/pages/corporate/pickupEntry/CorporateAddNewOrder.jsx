import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import { BiPlus } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import Input from "../../../components/ui/Input";
import CorporateCustomerCreateDialog from "../../../components/dialogs/corporate/CorporateCustomerCreateDialog";
import SignatureInput from "../../../components/ui/SignatureInput";
import CorporateCollectionNote from "../../../components/printables/CorporateCollectionNote";
import { useReactToPrint } from "react-to-print";
import { getAllCorporateCustomers, getCorporateCustomerById } from "../../../services/CustomerServices";
import { createCorporatePickupEntry, getAllCorporateInProductionPickupEntries } from "../../../services/corporate/PickupEntryServices";
import { BeatLoader } from "react-spinners";
import { getAllCorporateItems, getAllCorporateSettings, getCorporatePriceListByCustomer, getAllCorporateItemCategories, getCorporateTaxes } from "../../../services/corporate/CorporateSettingsServices";
import Swal from "sweetalert2";
import {
    buildCollectionNoteLinesFromDraftRows,
    pickCorporateTaxRatePercent,
} from "../../../utils/corporateCollectionNotePricing";

function buildPickupEntryItemsPayload(orderRows, priceList, itemTypes) {
    const items = orderRows.map((order) => {
        const pl = priceList.find(
            (p) => String(p.corp_item_auto_id ?? p.item_type_id ?? p.corp_item_id ?? "") === String(order.item_id)
        );
        const itemInfo = itemTypes.find(it => String(it.corp_item_auto_id) === String(order.item_id));
        const unit = Number(pl?.washing_price ?? pl?.price_list_washing_price ?? 0);
        const qty = Number(order.quantity || 0);
        const lineTotal = Math.round(qty * unit * 100) / 100;
        return {
            corp_item_id: itemInfo ? itemInfo.item_type_id : String(order.item_id),
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

const CorporateAddNewOrder = () => {
    const navigate = useNavigate();
    const collectionNoteRef = useRef(null);
    const navigateAfterPrintRef = useRef(false);
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
    const [customerPriceList, setCustomerPriceList] = useState([]);
    const [customerSearch, setCustomerSearch] = useState("");
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [recentProductionOrders, setRecentProductionOrders] = useState([]);
    const [isRecentCustomersLoading, setIsRecentCustomersLoading] = useState(true);
    const [deliveryType, setDeliveryType] = useState(null);
    const [deliveryPercentage, setDeliveryPercentage] = useState(0);
    const [availableServiceTypes, setAvailableServiceTypes] = useState([]);
    const [isPriceListLoading, setIsPriceListLoading] = useState(false);
    const [corporateTaxRates, setCorporateTaxRates] = useState({ sscl: 0, vat: 0 });
    /** Authoritative tax_type from getCorporateCustomerById (falls back to list customer). */
    const [customerPricingTaxType, setCustomerPricingTaxType] = useState("");

    const recentCustomers = useMemo(() => {
        const uniqueCustomerIds = [];
        const recent = [];
        
        // Extract unique customers from production orders
        for (const order of recentProductionOrders) {
            const cid = order.customer_id;
            if (cid && !uniqueCustomerIds.includes(String(cid))) {
                uniqueCustomerIds.push(String(cid));
                // Match with full customer data from master list
                const fullCustomer = customers.find(c => String(c.customer_id || c.customer_auto_id || c.id) === String(cid));
                if (fullCustomer) {
                    recent.push(fullCustomer);
                } else if (order.customer_company_name) {
                    // Pre-construct from order data if not yet loaded in customers list
                    recent.push({
                        customer_id: cid,
                        company_name: order.customer_company_name,
                        customer_name: order.customer_name || order.customer_company_name,
                        customer_address: order.customer_address,
                        phone_number: order.customer_phone,
                    });
                }
            }
            if (recent.length >= 5) break;
        }

        // If no production orders yet, show a clean empty state or very minimal fallback
        // The user specifically wanted production context, so we avoid the generic first-5 slice
        return recent;
    }, [recentProductionOrders, customers]);

    const fetchRecentProductionEntries = async () => {
        setIsRecentCustomersLoading(true);
        try {
            const response = await getAllCorporateInProductionPickupEntries(localStorage.getItem("userId"), 0);
            const rows = response?.data?.in_production_pickup_entries ?? [];
            // Sort by creation date descending to ensure we get the absolute latest
            const sorted = rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            setRecentProductionOrders(sorted.slice(0, 15)); // Get enough to extract unique customers
        } catch (error) {
            console.error("Error fetching recent production entries:", error);
        } finally {
            setIsRecentCustomersLoading(false);
        }
    };

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault();
        });
    });

    const [formData, setFormData] = useState({
        user_id: "",
        customer_id: "",
        pickup_entry_id: "",
        items: "",
        signed_by: localStorage.getItem("userName") || "",
        signature_url: null,
        delivery_date: "",
        company_name: "",
        customer_name: "",
        phone_number: "",
        total_quantity: "",
        notes: "",
        terms_and_conditions: "",
        place_of_supply: "",
        room_no: "",
        gate_pass_no: "",
        manual_order_id: "",
    });

    const [orders, setOrders] = useState([]);

    const [orderItem, setOrderItem] = useState({
        item_id: "",
        item_category_id: "",
        quantity: "",
        weight: "",
        remark: "",
    });

    const [itemCategoryOptions, setItemCategoryOptions] = useState([]);

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem",
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            padding: "0rem 0.25rem",
            boxShadow: "none",
            "&:hover": {
                borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            },
        }),
        placeholder: (base) => ({ ...base, color: "#6B7280" }),
        singleValue: (base) => ({ ...base, color: "#000000" }),
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
        fetchAllCustomers();
        fetchCorporateItems();
        fetchAllSettings();
        fetchRecentProductionEntries();
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

    useEffect(() => {
        if (!selectedCustomer?.customer_id) {
            setCustomerPriceList([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setIsPriceListLoading(true);
                const res = await getCorporatePriceListByCustomer({
                    user_id: localStorage.getItem("userId"),
                    customer_id: selectedCustomer.customer_id,
                });
                console.log('Price List Data:', res?.data);
                if (!cancelled) {
                    const list = res?.data?.price_list ?? res?.data?.corporate_price_lists ?? res?.data ?? [];
                    setCustomerPriceList(Array.isArray(list) ? list : []);
                }
            } catch (error) {
                console.error("Error fetching customer price list:", error);
                if (!cancelled) setCustomerPriceList([]);
            } finally {
                if (!cancelled) setIsPriceListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedCustomer]);

    useEffect(() => {
        if (settings) {
            setFormData(prev => ({
                ...prev,
                notes: settings.receipt_notes,
                terms_and_conditions: settings.receipt_terms,
            }));
        }
    }, [settings]);

    const handleSelectCustomer = async (customerId) => {
        const customer = customers.find(c => (c.customer_id || c.customer_auto_id || c.id) === customerId);
        if (!customer) return;
        
        const customerIdToSet = customer.customer_id || customer.customer_auto_id || customer.id;
        setSelectedCustomer({
            ...customer,
            customer_id: customerIdToSet,
            phone_number: customer.customer_phone || customer.phone_number
        });
        setFormData(prev => ({ ...prev, customer_id: customerIdToSet, place_of_supply: "" }));
        setCustomerSearch(`${customer.company_name || ""} (${customer.customer_name || ""})`);
        setHighlightIndex(-1);
        setShowSuggestions(false);
        setOrders([]); // Clear items when customer is changed

        // Reset delivery type states
        setDeliveryType(null);
        setDeliveryPercentage(0);

        try {
            const customerAutoId = customer.customer_auto_id || customer.id || null;
            if (customerAutoId) {
                const payload = {
                    user_id: localStorage.getItem("userId"),
                    customer_auto_id: customerAutoId
                };
                const response = await getCorporateCustomerById(payload);
                const data = response?.data?.customer || response?.data?.data || response?.data;
                setCustomerPricingTaxType(String(data?.tax_type ?? customer.tax_type ?? ""));
                const serviceTypesList = data && Array.isArray(data.service_types) ? data.service_types : [];
                setAvailableServiceTypes([
                    { service_type: 'Normal', percentage: 0 },
                    ...serviceTypesList
                ]);
            } else {
                setCustomerPricingTaxType(String(customer.tax_type ?? ""));
                setAvailableServiceTypes([
                    { service_type: 'Normal', percentage: 0 }
                ]);
            }
        } catch (error) {
            console.error("Error loading customer service types: ", error);
            setCustomerPricingTaxType(String(customer.tax_type ?? ""));
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

    const placeOfSupplyOptions = useMemo(() => {
        if (!selectedCustomer?.locations) return [];
        return selectedCustomer.locations.map(loc => ({
            value: loc.location_name,
            label: loc.location_name
        }));
    }, [selectedCustomer]);

    const handleAddItemToOrder = () => {
        if (orderItem.item_id && orderItem.quantity !== "" && orderItem.item_category_id !== "" && orderItem.item_category_id != null) {
            setOrders(prev => [...prev, orderItem]);
            setOrderItem({
                item_id: "",
                item_category_id: "",
                quantity: "",
                weight: "",
                remark: "",
            });
        }
    };

    const handleRemoveItemFromOrder = (indexToRemove) => {
        setOrders(orders.filter((_, index) => index !== indexToRemove));
    };

    const handleInputChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleAddSignature = (file) => {
        setFormData(prev => ({ ...prev, signature_url: file }));
        setShowAddSignature(false);
    };

    const handlePrint = useReactToPrint({
        contentRef: collectionNoteRef,
        documentTitle: `Collection note - ${selectedCustomer?.company_name || "Customer"}`,
        onAfterPrint: () => {
            if (navigateAfterPrintRef.current) {
                navigateAfterPrintRef.current = false;
                navigate("/salesCorporate/corporate/pickup-entry");
            }
        },
    });

    const handleCreateOrder = async () => {
        if (!selectedCustomer?.customer_id) {
            setErrorMessage("Please select a customer.");
            await Swal.fire({ icon: "warning", title: "Missing customer", text: "Please select a customer.", confirmButtonColor: "#1470F9" });
            return;
        }
        if (!orders.length) {
            setErrorMessage("Please add at least one item.");
            await Swal.fire({ icon: "warning", title: "No items", text: "Please add at least one item to the order.", confirmButtonColor: "#1470F9" });
            return;
        }

        const { items: itemsPayload, total_amount } = buildPickupEntryItemsPayload(orders, customerPriceList, itemTypes);

        const payload = new FormData();
        payload.append("user_id", String(localStorage.getItem("userId") ?? ""));
        payload.append("customer_id", String(selectedCustomer.customer_id));
        payload.append("items", JSON.stringify(itemsPayload));
        if (formData.signed_by && formData.signed_by.trim()) {
            payload.append("signed_by", formData.signed_by.trim());
        }
        if (formData.signature_url) {
            payload.append("signature_url", formData.signature_url);
        }
        payload.append("phone_number", String(selectedCustomer.phone_number ?? ""));
        payload.append("notes", formData.notes ?? "");
        payload.append("terms_and_conditions", formData.terms_and_conditions ?? "");
        payload.append("place_of_supply", formData.place_of_supply ?? "");
        payload.append("room_no", formData.room_no ?? "");
        payload.append("gate_pass_no", formData.gate_pass_no ?? "");
        payload.append("total_amount", String(total_amount));
        payload.append("delivery_type", deliveryType?.value ?? "Normal");
        payload.append("delivery_percentage", String(deliveryPercentage));
        if (formData.manual_order_id && formData.manual_order_id.trim() !== "") {
            payload.append("manual_order_id", formData.manual_order_id.trim());
        }

        try {
            setIsLoading(true);
            setErrorMessage("");
            const responseData = await createCorporatePickupEntry(payload);
            const pickupId =
                responseData?.pickup_entry_id ??
                responseData?.data?.pickup_entry_id ??
                responseData?.pickupEntryId;

            setFormData((prev) => ({
                ...prev,
                pickup_entry_id: pickupId != null ? String(pickupId) : prev.pickup_entry_id,
            }));

            await Swal.fire({
                icon: "success",
                title: "Order created",
                text: "Your collection order was saved successfully.",
                confirmButtonColor: "#1470F9",
            });

            fetchRecentProductionEntries();

            requestAnimationFrame(() => {
                navigateAfterPrintRef.current = true;
                handlePrint();
            });
        } catch (error) {
            const status = error?.response?.status;
            const message =
                error?.response?.data?.message ??
                error?.response?.data?.error ??
                (typeof error?.response?.data === "string" ? error.response.data : null) ??
                error?.message ??
                "Could not create collection order. Please try again.";
            console.error("Error creating collection order:", error);
            setErrorMessage(message);
            await Swal.fire({
                icon: "error",
                title: status === 400 ? "Invalid request" : "Something went wrong",
                text: message,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue.toLowerCase().split(/\s*\*\s*/).filter(word => word.trim().length > 0);
        return searchWords.every(word => option.label.toLowerCase().includes(word));
    };

    const filteredCustomers = customers.filter((customer) => {
        const search = customerSearch.toLowerCase();
        return (
            customer.company_name?.toLowerCase().includes(search) ||
            customer.customer_name?.toLowerCase().includes(search) ||
            customer.phone_number?.toLowerCase().includes(search)
        );
    });

    const totalItems = orders.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const billTotals = useMemo(
        () => buildPickupEntryItemsPayload(orders, customerPriceList, itemTypes),
        [orders, customerPriceList, itemTypes]
    );

    const orderItemsForPreview = useMemo(() => {
        const taxType = customerPricingTaxType || selectedCustomer?.tax_type;
        const vatNumber =
            selectedCustomer?.customer_vat_number ??
            selectedCustomer?.vat_number ??
            selectedCustomer?.vat_no;
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
        deliveryPercentage,
    ]);

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
                <h1 className="text-3xl text-primary font-bold">Collection Order / Add New Order</h1>
            </div>
            <p className="text-black/50 text-xl">Record new laundry collection with item counts by category.</p>

            {/* Stage Indicator */}
            <div className="flex flex-row gap-x-1 items-center justify-center w-full my-5">
                <p className={`${stage >= 1 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>1</p>
                <hr className={`${stage >= 2 ? "border-primary" : "border-black/20"} border w-1/6 my-auto`} />
                <p className={`${stage >= 2 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>2</p>
                <hr className={`${stage >= 3 ? "border-primary" : "border-black/20"} border w-1/6 my-auto`} />
                <p className={`${stage >= 3 ? "bg-primary" : "bg-black/20"} text-white rounded-full size-7 text-center text-xl font-extrabold`}>3</p>
            </div>

            {/* ───── STAGE 1 ───── */}
            {stage === 1 &&
                <div className="flex flex-col gap-y-5">
                    <div className="flex flex-row items-center">
                        <div className="grow flex flex-col">
                            <label className="text-xl font-semibold" htmlFor="customer">Select Customer</label>
                            <div className="w-full max-w-[450px] relative">
                                <Select
                                    name="customer_id"
                                    options={customers
                                        .filter(customer => {
                                            const status = String(customer.status || "").toLowerCase();
                                            return status !== "deactive" && status !== "inactive";
                                        })
                                        .map(customer => ({ 
                                            value: customer.customer_id || customer.customer_auto_id || customer.id, 
                                            label: `${customer.company_name || ""}  ${customer.customer_name || ""} - ${customer.customer_phone || customer.phone_number || ""}` 
                                        }))
                                    }
                                    onChange={(option) => {
                                        if (option) {
                                            handleSelectCustomer(option.value);
                                        } else {
                                            setSelectedCustomer(null);
                                            setCustomerPricingTaxType("");
                                            setFormData(prev => ({ ...prev, customer_id: "" }));
                                            setCustomerSearch("");
                                            setAvailableServiceTypes([]);
                                            setDeliveryType(null);
                                            setDeliveryPercentage(0);
                                        }
                                    }}
                                    value={
                                        selectedCustomer?.customer_id
                                            ? { 
                                                value: selectedCustomer.customer_id, 
                                                label: `${selectedCustomer.company_name || ""}  ${selectedCustomer.customer_name || ""} - ${selectedCustomer.phone_number || ""}` 
                                              }
                                            : null
                                    }
                                    styles={{
                                        ...selectStyles,
                                        control: (base, state) => ({
                                            ...selectStyles.control(base, state),
                                            height: '2.75rem',
                                            minHeight: '2.75rem',
                                            fontSize: '1.125rem'
                                        })
                                    }}
                                    filterOption={selectFilter}
                                    placeholder="Search Customer..."
                                    isClearable
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row items-center text-xl gap-x-20">
                        <p className="font-semibold">Company: <span className="font-normal">{selectedCustomer?.company_name}</span></p>
                        <p className="font-semibold">Customer: <span className="font-normal">{selectedCustomer?.customer_name}</span></p>
                        <p className="font-semibold">Phone Number: <span className="font-normal">{selectedCustomer?.phone_number}</span></p>
                    </div>

                    <h2 className="text-xl font-semibold">Recent Customer</h2>

                    <div className="bg-white rounded-xl">
                        {isRecentCustomersLoading ? (
                            Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="grid grid-cols-6 py-2 px-5">
                                    <div className="col-span-2 flex flex-row items-center gap-x-5">
                                        <div className="bg-gray-200 animate-pulse rounded-full size-7 min-w-[1.75rem]"></div>
                                        <div className="flex flex-col gap-y-2 w-full pr-10">
                                            <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4"></div>
                                            <div className="h-3 bg-gray-200 animate-pulse rounded w-1/2"></div>
                                        </div>
                                    </div>
                                    <div className="col-span-2 flex items-center pr-10">
                                        <div className="h-4 bg-gray-200 animate-pulse rounded w-full"></div>
                                    </div>
                                    <div className="col-span-2 flex items-center">
                                        <div className="h-4 bg-gray-200 animate-pulse rounded w-2/3"></div>
                                    </div>
                                </div>
                            ))
                        ) : recentCustomers.length > 0 ? (
                            recentCustomers.map((customer, index) => (
                                <div key={index} className="grid grid-cols-6 py-2 px-5 hover:bg-primary/20 cursor-pointer" onClick={() => handleSelectCustomer(customer.customer_id || customer.customer_auto_id || customer.id)}>
                                    <div className="col-span-2 flex flex-row items-center gap-x-5">
                                        <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 p-1" />
                                        <div className="flex flex-col">
                                            <p className="font-medium">{customer.company_name || ""}</p>
                                            <p className="text-base text-black/60 font-medium">{customer.customer_name || ""}</p>
                                        </div>
                                    </div>
                                    <p className="col-span-2">{customer.address || customer.customer_address || ""}</p>
                                    <p>{customer.phone_number || customer.customer_phone || ""}</p>
                                </div>
                            ))
                        ) : (
                            <div className="py-2 px-5 text-black/50">No recent customers found.</div>
                        )}
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
                                value={formData.gate_pass_no}
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
                                value={formData.room_no}
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

                        {/* Manual Order ID */}
                        {/* <div className="flex flex-col gap-y-2">
                            <label className="text-xl font-semibold" htmlFor="manual_order_id">
                                Manual Order ID
                                <span className="ml-2 text-sm font-normal text-black/40">(Optional)</span>
                            </label>
                            <input
                                id="manual_order_id"
                                name="manual_order_id"
                                type="text"
                                className="px-4 py-1.5 text-xl border border-black/20 rounded-lg h-[2.75rem] focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                                placeholder="e.g., COD-0026"
                                value={formData.manual_order_id}
                                onChange={handleInputChange}
                                disabled={!selectedCustomer}
                            />
                            <p className="text-xs text-black/40">Leave blank to auto-generate the next Order ID.</p>
                        </div> */}
                    </div>

                    <div className="flex flex-row text-xl my-5 justify-between">
                        <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => navigate("/salesCorporate/corporate/pickup-entry")}>Back</button>
                        <p className="text-red-500 font-medium text-base">{errorMessage}</p>
                        <button
                            type="button"
                            className={`font-semibold text-white bg-primary rounded-full py-2 w-1/3 ${!selectedCustomer || !deliveryType || !formData.gate_pass_no?.trim() || !formData.place_of_supply?.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                            onClick={async () => {
                                if (selectedCustomer && deliveryType && formData.gate_pass_no?.trim() && formData.place_of_supply?.trim()) {
                                    setErrorMessage("");
                                    // Refresh price list at the point of clicking Next
                                    if (selectedCustomer.customer_id && !isPriceListLoading) {
                                        try {
                                            setIsPriceListLoading(true);
                                            const res = await getCorporatePriceListByCustomer({
                                                user_id: localStorage.getItem("userId"),
                                                customer_id: selectedCustomer.customer_id,
                                            });
                                            const list = res?.data?.price_list ?? res?.data?.corporate_price_lists ?? res?.data ?? [];
                                            setCustomerPriceList(Array.isArray(list) ? list : []);
                                        } catch (err) {
                                            console.error("Error refreshing price list on Next:", err);
                                        } finally {
                                            setIsPriceListLoading(false);
                                        }
                                    }
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
                        >{isPriceListLoading ? <BeatLoader color="#fff" size={8} /> : "Next"}</button>
                    </div>
                </div>
            }

            {/* ───── STAGE 2 ───── */}
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

                    {/* Order Items */}
                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                        <h2 className="text-xl font-semibold">Order Items</h2>

                        {/* Input Row — Item Name | Quantity | Weight | Remark | + */}
                        <div className="grid grid-cols-9 gap-x-4 items-end">

                            {/* Item Name */}
                            <div className="col-span-2 flex flex-col">
                                <label className="text-base font-medium mb-1">Item Name</label>
                                <Select
                                    name="item_type_id"
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
                                            ? itemOptions.find(o => o.value === String(orderItem.item_id))
                                            : null
                                    }
                                    styles={selectStyles}
                                    filterOption={selectFilter}
                                    placeholder={isPriceListLoading ? "Loading..." : "Select Item..."}
                                />
                            </div>

                            {/* Category */}
                            <div className="col-span-2 flex flex-col">
                                <label className="text-base font-medium mb-1">Category</label>
                                <input
                                    type="text"
                                    className="px-3 py-1.5 text-base border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed focus:outline-none"
                                    readOnly
                                    value={
                                        orderItem.item_category_id !== "" && orderItem.item_category_id != null
                                            ? itemCategoryOptions.find((o) => String(o.value) === String(orderItem.item_category_id))?.label ?? ""
                                            : ""
                                    }
                                />
                            </div>

                            

                            {/* Quantity */}
                            <div className="col-span-2 flex flex-col">
                                <label className="text-base font-medium mb-1">Quantity</label>
                                <input
                                    type="number"
                                    className="px-3 py-1.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                                    placeholder=""
                                    value={orderItem.quantity}
                                    onChange={(e) => setOrderItem(prev => ({ ...prev, quantity: e.target.value === "" ? "" : Number(e.target.value) }))}
                                />
                            </div>

                            {/* Remark */}
                            <div className="col-span-2 flex flex-col">
                                <label className="text-base font-medium mb-1">Remark</label>
                                <input
                                    className="px-3 py-1.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                                    placeholder=""
                                    value={orderItem.remark}
                                    onChange={(e) => setOrderItem(prev => ({ ...prev, remark: e.target.value }))}
                                />
                            </div>

                            {/* Add Button */}
                            <div className="col-span-1 flex justify-center">
                                <button
                                    type="button"
                                    onClick={handleAddItemToOrder}
                                    className="text-primary border border-primary rounded-full size-8 flex items-center justify-center text-2xl font-bold cursor-pointer hover:bg-primary/10"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="rounded-xl overflow-hidden border border-black/20 mt-2">
                            {orders.map((order, index) => (
                                <div
                                    key={index}
                                    className={`grid grid-cols-9 gap-x-4 text-base py-2 px-4 ${index % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center`}
                                >
                                    <p className="col-span-2 font-medium">
                                        {(() => {
                                            const item = itemTypes.find(it => String(it.corp_item_auto_id) === String(order.item_id));
                                            return item ? `${item.item_type_id} - ${item.item_type_name}` : "—";
                                        })()}
                                    </p>
                                    <p className="col-span-2 text-black/60">
                                        {itemCategoryOptions.find(cat => String(cat.value) === String(order.item_category_id))?.label ?? "—"}
                                    </p>
                                    <p className="col-span-2">{order.quantity}</p>
                                    <p className="col-span-2 text-black/70">{order.remark}</p>
                                    <div className="col-span-1 flex justify-center">
                                        <Icon
                                            icon={"carbon:close-filled"}
                                            className="text-red-500 text-2xl cursor-pointer"
                                            onClick={() => handleRemoveItemFromOrder(index)}
                                        />
                                    </div>
                                </div>
                            ))}

                            {orders.length === 0 && (
                                <div className="py-4 text-center text-black/40 text-base">No items added yet.</div>
                            )}
                        </div>

                        {/* Total Items */}
                            <div className="flex flex-row items-center gap-x-5 pt-1">
                            <p className="text-base font-bold">Total Items</p>
                            <p className="text-base font-medium">{totalItems}</p>
                            {/* <p className="text-base font-bold ms-6">Total Amount (Rs.)</p>
                            <p className="text-base font-medium">{billTotals.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p> */}
                        </div>
                    </div>

                    {/* Navigation */}
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
                                } else if (orders.some((o) => o.item_category_id === "" || o.item_category_id == null)) {
                                    setErrorMessage("Each line item must have a category.");
                                } else {
                                    setErrorMessage("");
                                    setStage(3);
                                }
                            }}
                        >Next</button>
                    </div>
                </div>
            }

            {/* ───── STAGE 3 ───── */}
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
                                data={{ ...formData, delivery_type: deliveryType?.value }}
                                customer={selectedCustomer}
                                itemTypes={itemTypes}
                                itemCategories={itemCategoryOptions}
                            />

                            <div className="flex flex-row text-xl my-5 justify-between">
                                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => { setEditPickupSnapshot(null); setStage(2); }} disabled={isLoading}>Back</button>
                                <p className="text-red-500 font-medium text-base">{errorMessage}</p>
                                <button
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={handleCreateOrder}
                                    disabled={isLoading}
                                >
                                    {isLoading ? <BeatLoader color="#fff" size={10} /> : "Create Order & Print Receipt"}
                                </button>
                            </div>
                        </main>

                        <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px] mt-3">
                            {/* Not yet created (first-time creation) — the Back button above already
                                covers editing, so lock this, same as the other disabled states below. */}
                            <button
                                type="button"
                                disabled
                                className="font-bold py-3 rounded-full text-lg shadow-sm bg-black/10 text-black/40 cursor-not-allowed w-full text-center"
                            >
                                🔒 Locked
                            </button>
                            
                            {/* Created By — show current user */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Created By :</p>
                                <div className="flex flex-row items-center gap-x-2">
                                    <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                                    <span className="text-black/70 text-sm truncate">
                                        {localStorage.getItem("userName") || localStorage.getItem("userId") || "—"}
                                    </span>
                                </div>
                            </div>

                            {/* Checked By — disabled at creation */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Checked By :</p>
                                <button
                                    disabled
                                    className="border border-black/20 text-black/30 font-medium py-2.5 rounded-full shadow-sm bg-white w-full text-lg cursor-not-allowed"
                                >
                                    Checked
                                </button>
                            </div>

                            {/* Approved By — disabled at creation */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Approved By :</p>
                                <button
                                    disabled
                                    className="border border-black/20 text-black/30 font-medium py-2.5 rounded-full shadow-sm bg-white w-full text-lg cursor-not-allowed"
                                >
                                    Approved
                                </button>
                            </div>

                            {/* Activity Log — empty until order is created */}
                            <div className="flex flex-col gap-y-2 text-[15px]">
                                <p className="font-semibold text-black">Activity Log :</p>
                                <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 text-black/40 text-sm">
                                        Activity log will appear after order is created.
                                    </div>
                                </div>
                            </div>


                            {/* <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Room No :</label>
                                <input 
                                    name="room_no" 
                                    value={formData.room_no} 
                                    onChange={handleInputChange} 
                                    placeholder="Enter room number" 
                                    className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 bg-white shadow-sm text-sm"
                                />
                            </div> */}

                            {/* <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Gate Pass No :</label>
                                <input 
                                    name="gate_pass_no" 
                                    value={formData.gate_pass_no} 
                                    onChange={handleInputChange} 
                                    placeholder="Enter gate pass number" 
                                    className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 bg-white shadow-sm text-sm"
                                />
                            </div> */}

                            {/* <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Place of Supply :</label>
                                <input 
                                    name="place_of_supply" 
                                    value={formData.place_of_supply} 
                                    onChange={handleInputChange} 
                                    placeholder="Enter place of supply here" 
                                    className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 bg-white shadow-sm text-sm"
                                />
                            </div> */}

                            <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Enter Note :</label>
                                <textarea 
                                    name="notes" 
                                    value={formData.notes} 
                                    onChange={handleInputChange} 
                                    placeholder="Enter note here" 
                                    rows={3}
                                    className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 bg-white shadow-sm text-sm resize-none"
                                />
                            </div>

                            <div className="flex flex-col gap-y-1">
                                <label className="text-black font-semibold text-[15px]">Enter Terms & Conditions :</label>
                                <textarea 
                                    name="terms_and_conditions" 
                                    value={formData.terms_and_conditions} 
                                    onChange={handleInputChange} 
                                    placeholder="Enter terms & conditions" 
                                    rows={3}
                                    className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none focus:border-primary text-black/60 bg-white shadow-sm text-sm resize-none"
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
        </div>
    );
};

export default CorporateAddNewOrder;