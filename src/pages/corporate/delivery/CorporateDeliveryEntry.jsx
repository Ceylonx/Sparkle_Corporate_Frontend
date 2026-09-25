import { useEffect, useState, useRef } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import { BiPlus, BiTrash } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import Input from "../../../components/ui/Input";
import CorporateCustomerCreateDialog from "../../../components/dialogs/corporate/CorporateCustomerCreateDialog";
import SignatureInput from "../../../components/ui/SignatureInput";
import { createCorporateDeliveryEntry, getAllCorporateDrivers, getCorporateDeliveryById, getCorporateDeliveryLogs, createDeliveryNote, updateDeliveryNote, getDeliveryNoteById } from "../../../services/corporate/CorporateDeliveryServices";
import { BeatLoader } from "react-spinners";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { getAllCorporateItems, getCorporatePriceListByCustomer, getAllCorporateItemCategories } from "../../../services/corporate/CorporateSettingsServices";
import { updateCorporatePickupEntry } from "../../../services/corporate/PickupEntryServices";
import Swal from "sweetalert2";
import CorporateDeliveryNote from "../../../components/printables/CorporateDeliveryNote";
import { useReactToPrint } from "react-to-print";

const CorporateDeliveryEntry = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const queryParams = new URLSearchParams(location.search);
    const editNoteId = queryParams.get("edit_note_id") || location.state?.edit_note_id || null;
    const [editNote, setEditNote] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [stage, setStage] = useState(1);
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddSignature, setShowAddSignature] = useState(false);
    const [order, setOrder] = useState(null);
    const [itemTypes, setItemTypes] = useState([]);
    const [items, setItems] = useState([]);
    const [isSaveClicked, setIsSaveClicked] = useState(false);
    const [itemErrorMessage, setItemErrorMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [drivers, setDrivers] = useState([]);
    const [tripDeliveries, setTripDeliveries] = useState(location.state?.tripDeliveries || {});

    const [previewDeliveryNoteId, setPreviewDeliveryNoteId] = useState(editNoteId || "-");
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [corporateItems, setCorporateItems] = useState([]);
    const [customerPriceList, setCustomerPriceList] = useState([]);
    const [newItemData, setNewItemData] = useState({
        corp_item_id: "",
        delivery_quantity: "",
        remark: "",
    });

    const deliveryNoteRef = useRef(null);
    const navigateAfterPrintRef = useRef(false);

    const handlePrint = useReactToPrint({
        contentRef: deliveryNoteRef,
        documentTitle: `Delivery note - ${order?.customer_company_name ?? order?.company_name ?? "Customer"}`,
        onAfterPrint: () => {
            if (navigateAfterPrintRef.current) {
                navigateAfterPrintRef.current = false;
                navigate("/salesCorporate/corporate/delivery", { state: { initialTab: 1 } });
            }
        },
    });

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    const [formData, setFormData] = useState(
        {
            signature: null,
            received_by: "",
            delivered_by: localStorage.getItem("userId") ?? "",
            customer_invoicing_period: "",
            delivered_location: null,
            manual_delivery_id: "",
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

    const fetchDeliveryById = async () => {
        try {
            setIsLoading(true);

            const payload = {
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: id
            };

            const response = await getCorporateDeliveryById(payload);
            const entry = response?.data?.in_delivery_pickup_entry?.[0] ?? null;
            if (entry && entry.items) {
                entry.items = entry.items.map(item => {
                    const totalCount = Number(item.final_packed_qty || 0);
                    const alreadyDelivered = Number(item.delivered_qty || 0);
                    const unassignedQty = Math.max(0, totalCount - alreadyDelivered);
                    return {
                        ...item,
                        unassigned_qty: unassignedQty
                    };
                });
            }
            setOrder(entry);
        } catch (error) {
            console.error("Error fetching delivery logs: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Error fetching item types: ", error);
        }
    };

    const fetchCorporateItems = async () => {
        try {
            const response = await getAllCorporateItems(localStorage.getItem("userId"));
            setCorporateItems(response.data.corporate_items || []);
        } catch (error) {
            console.error("Error fetching corporate items: ", error);
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
        }
    };

    const fetchPriceList = async (customerId) => {
        if (!customerId) return;
        try {
            const response = await getCorporatePriceListByCustomer({
                user_id: localStorage.getItem("userId"),
                customer_id: customerId
            });
            const list = response?.data?.price_list 
                || response?.data?.customerPriceList 
                || response?.data?.data 
                || [];
            setCustomerPriceList(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching price list: ", error);
        }
    };

    const fetchDrivers = async () => {
        try {
            const response = await getAllCorporateDrivers();
            setDrivers(response.data);
        } catch (error) {
            console.error("Error fetching frivers: ", error);
        }
    };

    const fetchEditNoteDetails = async () => {
        try {
            setIsLoading(true);
            const response = await getDeliveryNoteById({
                user_id: localStorage.getItem("userId"),
                delivery_note_id: editNoteId
            });
            const noteDetails = response?.data?.delivery_note;
            // Reached the edit page directly (URL / back nav) for a note whose invoice already has
            // a Credit/Debit Note or payment entry — bounce back to its view instead of editing.
            if (noteDetails?.edit_lock?.locked) {
                await Swal.fire({
                    icon: "warning",
                    title: "Delivery Note Locked",
                    text: noteDetails.edit_lock.message || "This delivery note's invoice already has credit/debit notes or payments.",
                    confirmButtonColor: "#1470F9",
                });
                navigate(`/salesCorporate/corporate/delivery/note/${noteDetails.delivery_id || editNoteId}`, { replace: true });
                return;
            }
            if (noteDetails) {
                setEditNote(noteDetails);
                setPreviewDeliveryNoteId(noteDetails.delivery_id || editNoteId);
            }
        } catch (error) {
            console.error("Error fetching delivery note details for edit:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setOrder(null);
        setItems([]);
        setIsSaveClicked(false);
        setErrorMessage("");
        setItemErrorMessage("");
        setEditNote(null);
        setPreviewDeliveryNoteId("-");
        setTripDeliveries({});
        
        fetchDeliveryById();
        fetchItemTypes();
        fetchCorporateItems();
        fetchItemCategories();
        fetchDrivers();

        if (editNoteId) {
            fetchEditNoteDetails();
        }
    }, [id, editNoteId]);

    useEffect(() => {
        if (order) {
            fetchPriceList(order.customer_id);
            if (editNoteId && editNote) {
                // Edit Mode: Populate items from editNote.items
                const formattedItems = order.items
                    .filter(item => (Number(item.final_packed_qty || 0) + Number(item.damaged_qty || 0)) > 0)
                    .map(item => {
                        const existingStateItem = items.find(i => String(i.order_item_auto_id) === String(item.order_item_auto_id));
                        if (existingStateItem && existingStateItem.delivery_quantity !== undefined && existingStateItem.delivery_quantity !== "") {
                            return {
                                order_item_auto_id: item.order_item_auto_id,
                                corp_item_id: item.corp_item_id,
                                pickup_entry_id: item.pickup_entry_id || id || order?.pickup_entry_id || null,
                                delivery_quantity: existingStateItem.delivery_quantity
                            };
                        }

                        const matchingNoteItem = editNote.items?.find(ni => 
                            (ni.order_item_auto_id !== null && ni.order_item_auto_id !== undefined && String(ni.order_item_auto_id) === String(item.order_item_auto_id)) || 
                            ((ni.order_item_auto_id === null || ni.order_item_auto_id === undefined) && (ni.item_id === item.corp_item_id || ni.corp_item_id === item.corp_item_id))
                        );

                        const defaultQty = matchingNoteItem 
                            ? Number(matchingNoteItem.delivered_qty ?? 0) 
                            : (Number(item.corp_item_quantity || 0) === 0 ? Number(item.final_packed_qty || 0) : "");

                        return {
                            order_item_auto_id: item.order_item_auto_id,
                            corp_item_id: item.corp_item_id,
                            pickup_entry_id: item.pickup_entry_id || id || order?.pickup_entry_id || null,
                            delivery_quantity: defaultQty
                        };
                    });
                setItems(formattedItems);
                setIsSaveClicked(false);

                // Pre-populate formData from editNote details
                setFormData(prev => ({
                    ...prev,
                    signature: editNote.signature_url || prev.signature || null,
                    received_by: editNote.received_by || prev.received_by || "",
                    delivered_by: editNote.created_by_user || localStorage.getItem("userId") || prev.delivered_by || "",
                    customer_invoicing_period: order?.invoice_details?.invoice_period ?? order?.customer_invoicing_period ?? prev.customer_invoicing_period ?? "",
                    delivered_location: editNote.delivered_location ? { value: editNote.delivered_location, label: editNote.delivered_location } : prev.delivered_location,
                }));

                // Update tripDeliveries in state so totals sum up correctly
                const updatedTrip = { [id]: formattedItems };
                setTripDeliveries(updatedTrip);
            } else if (!editNoteId) {
                const formattedItems = order.items
                    .filter(item => ((Number(item.final_packed_qty || 0) + Number(item.damaged_qty || 0)) - Number(item.delivered_qty || 0)) > 0)
                    .map(item => {
                        const existingStateItem = items.find(i => String(i.order_item_auto_id) === String(item.order_item_auto_id));
                        if (existingStateItem && existingStateItem.delivery_quantity !== undefined && existingStateItem.delivery_quantity !== "") {
                            return {
                                order_item_auto_id: item.order_item_auto_id,
                                corp_item_id: item.corp_item_id,
                                delivery_quantity: existingStateItem.delivery_quantity
                            };
                        }
                        return {
                            order_item_auto_id: item.order_item_auto_id,
                            corp_item_id: item.corp_item_id,
                            delivery_quantity: Math.max(0, Number(item.unassigned_qty ?? 0))
                        };
                    });
                setItems(formattedItems);
                setIsSaveClicked(false);
                setTripDeliveries({
                    [id]: formattedItems
                });

                // Pre-populate invoicing period and place of supply from order data
                const invoicingPeriod = order?.invoice_details?.invoice_period ?? order?.customer_invoicing_period ?? "";
                const placeOfSupply = order?.place_of_supply ?? "";
                setFormData(prev => ({
                    ...prev,
                    customer_invoicing_period: invoicingPeriod,
                    delivered_location: placeOfSupply ? { value: placeOfSupply, label: placeOfSupply } : prev.delivered_location
                }));
            }
        }
    }, [order, editNote, id, editNoteId]);

    const handleInputChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value
            }
        ));
    };

    const handleInputNumberChangeItems = (e, order_item_auto_id) => {
        const valStr = e.target.value;
        const val = valStr === "" ? "" : Number(valStr);
        
        // Find matching item in order items to validate quantity
        const match = order?.items?.find(p => String(p.order_item_auto_id) === String(order_item_auto_id));
        const matchingNoteItem = editNoteId && editNote
            ? editNote.items?.find(ni => 
                String(ni.order_item_auto_id) === String(order_item_auto_id) || 
                (ni.order_item_auto_id === null && ni.item_id === match?.corp_item_id)
            )
            : null;
        const currentNoteQty = editNote && matchingNoteItem ? Number(matchingNoteItem.delivered_qty ?? 0) : 0;
        const isCurrentNoteApproved = editNote && editNote.approval_status === "Approved";
        const alreadyDeliveredOtherTrips = Number(match?.delivered_qty || 0) - (isCurrentNoteApproved ? currentNoteQty : 0);
        
        
        if (valStr !== "" && val < 0) {
            setItemErrorMessage("Quantity cannot be negative");
        } else {
            setItemErrorMessage("");
        }


        const updatedItems = items.map(item =>
            String(item.order_item_auto_id) === String(order_item_auto_id)
                ? { ...item, delivery_quantity: val }
                : item
        );
        
        setItems(updatedItems);
        
        // Update trip state immediately
        const updatedTrip = { [id]: updatedItems };
        setTripDeliveries(updatedTrip);
        
        // Persist to location state immediately
        navigate(location.pathname, { state: { ...location.state, tripDeliveries: updatedTrip }, replace: true });
    };

    const handleAddItemSave = () => {
        const { corp_item_id, delivery_quantity } = newItemData;
        if (!corp_item_id) {
            setItemErrorMessage("Please select an item.");
            return;
        }
        if (!delivery_quantity || Number(delivery_quantity) <= 0) {
            setItemErrorMessage("Please enter a valid quantity greater than 0.");
            return;
        }

        const selectedItem = corporateItems.find(item => item.corp_item_id === corp_item_id);
        if (!selectedItem) return;

        const tempAutoId = -Date.now() - Math.floor(Math.random() * 1000); // Unique negative ID for new item

        const matchedCategory = itemCategoryOptions.find(cat => String(cat.value) === String(selectedItem.item_category_id));
        const categoryName = matchedCategory?.label || selectedItem.item_category_name || "Uniform";

        const itemRemark = newItemData.remark || "";

        const newOrderItem = {
            order_item_auto_id: tempAutoId,
            corp_item_id: selectedItem.corp_item_id,
            item_id: selectedItem.corp_item_id,
            corp_item_name: selectedItem.corp_item_name,
            corp_item_quantity: 0,
            delivered_qty: 0,
            unassigned_qty: Number(delivery_quantity),
            final_packed_qty: Number(delivery_quantity),
            damaged_qty: 0,
            item_category_id: selectedItem.item_category_id,
            item_category_name: categoryName,
            corp_item_remark: itemRemark,
            remark: itemRemark,
        };

        // Update order state
        setOrder(prev => ({
            ...prev,
            items: [...(prev?.items || []), newOrderItem]
        }));

        // Update items state
        const newDeliveryItem = {
            order_item_auto_id: tempAutoId,
            corp_item_id: selectedItem.corp_item_id,
            item_id: selectedItem.corp_item_id,
            corp_item_name: selectedItem.corp_item_name,
            item_category_name: categoryName,
            pickup_entry_id: id || order?.pickup_entry_id || null,
            delivery_quantity: Number(delivery_quantity),
            remark: itemRemark,
            corp_item_remark: itemRemark,
        };
        const updatedItems = [...items, newDeliveryItem];
        setItems(updatedItems);

        // Update tripDeliveries in state so totals sum up correctly
        const updatedTrip = { [id]: updatedItems };
        setTripDeliveries(updatedTrip);
        navigate(location.pathname, { state: { ...location.state, tripDeliveries: updatedTrip }, replace: true });

        setShowAddItemModal(false);
        setNewItemData({
            corp_item_id: "",
            delivery_quantity: "",
            remark: "",
        });
        setItemErrorMessage("");
    };

    const handleRemoveItem = (targetAutoId) => {
        if (isSaveClicked) return;

        setOrder(prev => ({
            ...prev,
            items: (prev?.items || []).filter(i => String(i.order_item_auto_id) !== String(targetAutoId))
        }));

        const updatedItems = items.filter(i => String(i.order_item_auto_id) !== String(targetAutoId));
        setItems(updatedItems);

        const updatedTrip = { [id]: updatedItems };
        setTripDeliveries(updatedTrip);
        navigate(location.pathname, { state: { ...location.state, tripDeliveries: updatedTrip }, replace: true });
    };

    const handleAddSignature = (file) => {
        setFormData(prev => (
            {
                ...prev,
                signature: file
            }
        ));
        setShowAddSignature(false);
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    const clearItems = () => {
        const cleared = items.map(item => ({
            ...item,
            delivery_quantity: ""
        }));
        setItems(cleared);
        setIsSaveClicked(false);

        const updatedTrip = { [id]: cleared };
        setTripDeliveries(updatedTrip);
        navigate(location.pathname, { state: { ...location.state, tripDeliveries: updatedTrip }, replace: true });
    }

    const clearDeliveryData = () => {
        setFormData(
            {
                signature: null,
                received_by: "",
                delivered_by: localStorage.getItem("userId") ?? "",
                customer_invoicing_period: order?.invoice_details?.invoice_period ?? order?.customer_invoicing_period ?? "",
                delivered_location: null,
            }
        );
    };

    const handleNext = () => {
        const anyItemsSaved = items.some(item => Number(item.delivery_quantity || 0) > 0);

        if (itemErrorMessage !== "") {
            setErrorMessage("Please resolve item quantity errors before proceeding");
            return;
        } else if (!anyItemsSaved) {
            setErrorMessage("Save items for at least one order to proceed");
            return;
        } else if (!formData.received_by) {
            setErrorMessage("Please fill Received By field");
            return;
        } else if (!formData.delivered_by) {
            setErrorMessage("Delivered By is missing. Please ensure you are logged in.");
            return;
        } else if (!formData.customer_invoicing_period) {
            setErrorMessage("Please enter the Customer Invoicing Period");
            return;
        } else if (!formData.delivered_location) {
            setErrorMessage("Please select Delivered Location");
            return;
        } else {
            setErrorMessage("");
            setStage(2);
        }
    };

    const handleSave = async () => {
        try {
            setIsLoadingSubmit(true);
            const anyItemsSaved = items.some(item => Number(item.delivery_quantity || 0) > 0);

            if (itemErrorMessage !== "") {
                setErrorMessage("Please resolve item quantity errors before saving");
                return;
            } else if (!anyItemsSaved) {
                setErrorMessage("Save items for at least one order to proceed");
                return;
            } else if (!formData.received_by) {
                setErrorMessage("Please fill Received By field");
                return;
            } else if (!formData.delivered_by) {
                setErrorMessage("Delivered By is missing. Please ensure you are logged in.");
                return;
            } else if (!formData.customer_invoicing_period) {
                setErrorMessage("Please enter the Customer Invoicing Period");
                return;
            } else if (!formData.delivered_location) {
                setErrorMessage("Please select Delivered Location");
                return;
            } else {
                setErrorMessage("");
            }

            const finalEditNoteId = editNoteId || editNote?.delivery_id || (previewDeliveryNoteId && previewDeliveryNoteId !== "-" ? previewDeliveryNoteId : null);

            if (finalEditNoteId) {
                // EDIT MODE UPDATE
                const deliveryNotePayload = new FormData();
                deliveryNotePayload.append("user_id", localStorage.getItem("userId"));
                deliveryNotePayload.append("delivery_note_id", finalEditNoteId);
                deliveryNotePayload.append("pickup_entry_id", id || order?.pickup_entry_id || "");
                deliveryNotePayload.append("received_by", formData.received_by);
                deliveryNotePayload.append("delivered_location", formData.delivered_location?.value ?? "");

                const deliveryNoteItems = [];
                Object.entries(tripDeliveries).forEach(([orderId, orderItems]) => {
                    orderItems.forEach(item => {
                        const qty = Number(item.delivery_quantity || 0);
                        if (qty > 0) {
                            const matchedOrderItem = order?.items?.find(i => 
                                String(i.order_item_auto_id) === String(item.order_item_auto_id) ||
                                ((!i.order_item_auto_id || Number(i.order_item_auto_id) < 0) && (!item.order_item_auto_id || Number(item.order_item_auto_id) < 0) && i.corp_item_id === item.corp_item_id) ||
                                (!i.order_item_auto_id && i.corp_item_id === item.corp_item_id)
                            );
                            deliveryNoteItems.push({
                                pickup_entry_id: orderId,
                                corp_item_id: item.corp_item_id,
                                corp_item_name: matchedOrderItem?.corp_item_name ?? item.corp_item_name ?? item.corp_item_id,
                                item_category_name: matchedOrderItem?.item_category_name ?? item.item_category_name ?? '',
                                delivery_quantity: qty,
                                order_qty: (Number(matchedOrderItem?.final_packed_qty || 0) + Number(matchedOrderItem?.damaged_qty || 0)),
                                order_item_auto_id: (item.order_item_auto_id && Number(item.order_item_auto_id) > 0) ? item.order_item_auto_id : null,
                                remark: item.remark || item.corp_item_remark || matchedOrderItem?.corp_item_remark || matchedOrderItem?.remark || null,
                            });
                        }
                    });
                });

                deliveryNotePayload.append("items", JSON.stringify(deliveryNoteItems));

                if (formData.signature instanceof Blob || formData.signature instanceof File) {
                    deliveryNotePayload.append("signature_url", formData.signature);
                } else if (typeof formData.signature === "string") {
                    deliveryNotePayload.append("signature_url", formData.signature);
                }

                await updateDeliveryNote(deliveryNotePayload);
                
                await Swal.fire({
                    title: "Success!",
                    text: "Delivery Note updated successfully.",
                    icon: "success",
                    confirmButtonText: "OK",
                    confirmButtonColor: "#1470F9"
                });

                requestAnimationFrame(() => {
                    navigateAfterPrintRef.current = true;
                    handlePrint();
                });
            } else {
                // NORMAL MODE CREATE
                // Submit for each order that has items in the trip
                const submissionPromises = Object.entries(tripDeliveries).map(([orderId, orderItems]) => {
                    const deliveredItems = orderItems
                        .filter((item) => Number(item.delivery_quantity || 0) > 0)
                        .map((item) => ({
                            pickup_entry_id: orderId,
                            corp_item_id: item.corp_item_id,
                            item_qty_delivered: Number(item.delivery_quantity || 0),
                            order_item_auto_id: (item.order_item_auto_id && Number(item.order_item_auto_id) > 0) ? item.order_item_auto_id : null,
                            remark: item.remark || item.corp_item_remark || null,
                        }));

                    if (deliveredItems.length === 0) return null;

                    const payload = new FormData();
                    payload.append("user_id", localStorage.getItem("userId"));
                    payload.append("pickup_entry_id", orderId);
                    payload.append("items", JSON.stringify(deliveredItems));
                    payload.append("delivered_by", localStorage.getItem("userId"));
                    payload.append("received_by", formData.received_by);
                    payload.append("signature_url", formData.signature);
                    payload.append("customer_id", order?.customer_id ?? ""); // Fallback to current order's customer
                    payload.append("customer_invoicing_period", formData.customer_invoicing_period);
                    payload.append("delivered_location", formData.delivered_location?.value ?? "");

                    return createCorporateDeliveryEntry(payload);
                }).filter(Boolean);

                await Promise.all(submissionPromises);

                // Build delivery note items from the entire trip
                const deliveryNoteItems = [];
                Object.entries(tripDeliveries).forEach(([orderId, orderItems]) => {
                    orderItems.forEach(item => {
                        const qty = Number(item.delivery_quantity || 0);
                        if (qty > 0) {
                            const matchedOrderItem = order?.items?.find(i => 
                                String(i.order_item_auto_id) === String(item.order_item_auto_id) ||
                                ((!i.order_item_auto_id || Number(i.order_item_auto_id) < 0) && (!item.order_item_auto_id || Number(item.order_item_auto_id) < 0) && i.corp_item_id === item.corp_item_id) ||
                                (!i.order_item_auto_id && i.corp_item_id === item.corp_item_id)
                            );
                            deliveryNoteItems.push({
                                pickup_entry_id: orderId,
                                corp_item_id: item.corp_item_id,
                                corp_item_name: matchedOrderItem?.corp_item_name ?? item.corp_item_name ?? item.corp_item_id,
                                item_category_name: matchedOrderItem?.item_category_name ?? item.item_category_name ?? '',
                                delivery_quantity: qty,
                                order_qty: (Number(matchedOrderItem?.final_packed_qty || 0) + Number(matchedOrderItem?.damaged_qty || 0)),
                                order_item_auto_id: (item.order_item_auto_id && Number(item.order_item_auto_id) > 0) ? item.order_item_auto_id : null,
                                remark: item.remark || item.corp_item_remark || matchedOrderItem?.corp_item_remark || matchedOrderItem?.remark || null,
                            });
                        }
                    });
                });

                // Create the delivery note
                const deliveryNotePayload = new FormData();
                deliveryNotePayload.append("user_id", localStorage.getItem("userId"));
                deliveryNotePayload.append("pickup_entry_id", id);
                deliveryNotePayload.append("customer_id", order?.customer_id ?? "");
                deliveryNotePayload.append("delivered_by", localStorage.getItem("userId"));
                deliveryNotePayload.append("received_by", formData.received_by);
                deliveryNotePayload.append("delivered_location", formData.delivered_location?.value ?? "");
                deliveryNotePayload.append("items", JSON.stringify(deliveryNoteItems));
                if (formData.manual_delivery_id && formData.manual_delivery_id.trim() !== "") {
                    deliveryNotePayload.append("manual_delivery_id", formData.manual_delivery_id.trim());
                }
                if (formData.signature) {
                    deliveryNotePayload.append("signature_url", formData.signature);
                }

                const response = await createDeliveryNote(deliveryNotePayload);
                const newNoteId = response?.data?.delivery_note_id;

                if (newNoteId) {
                    setPreviewDeliveryNoteId(newNoteId);
                }

                await Swal.fire({
                    title: "Success!",
                    text: "Delivery Note created successfully.",
                    icon: "success",
                    confirmButtonText: "OK",
                    confirmButtonColor: "#1470F9"
                });

                requestAnimationFrame(() => {
                    navigateAfterPrintRef.current = true;
                    handlePrint();
                });
            }
        } catch (error) {
            console.error("Error creating delivery entries: ", error);
            setErrorMessage(error?.response?.data?.message ?? "Error submitting delivery trip");
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    const handleSaveItems = () => {
        const isValid = items.every(deliveryItem => {
            const match = order.items.find(p => String(p.order_item_auto_id) === String(deliveryItem.order_item_auto_id));
            if (!match) return false;

            const totalQty = Number(match.final_packed_qty ?? 0) + Number(match.damaged_qty ?? 0);
            const matchingNoteItem = editNoteId && editNote
                ? editNote.items?.find(ni => 
                    String(ni.order_item_auto_id) === String(deliveryItem.order_item_auto_id) || 
                    (ni.order_item_auto_id === null && ni.item_id === match.corp_item_id)
                )
                : null;
            const currentNoteQty = (editNote && editNote.approval_status === "Approved") ? Number(matchingNoteItem?.delivered_qty ?? 0) : 0;
            const alreadyDeliveredOtherTrips = Number(match.delivered_qty ?? 0) - currentNoteQty;
            const remaining = totalQty - alreadyDeliveredOtherTrips;
            return deliveryItem.delivery_quantity === "" || Number(deliveryItem.delivery_quantity) >= 0;
        });

        if (isValid) {
            setIsSaveClicked(true);
            setItemErrorMessage("");
            
            // Update trip state
            const updatedTrip = { [id]: items };
            setTripDeliveries(updatedTrip);
            
            // Persist to location state
            navigate(location.pathname, { state: { ...location.state, tripDeliveries: updatedTrip }, replace: true });
        } else {
            setItemErrorMessage("Invalid quantity");
        }
    };

    const sortedLogs = [...(order?.delivery_log || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft 
                    className="size-6 text-primary cursor-pointer" 
                    onClick={() => {
                        if (stage === 2) {
                            setStage(1);
                        } else {
                            navigate(`/salesCorporate/corporate/delivery`);
                        }
                    }} 
                />
                <h1 className="text-3xl text-primary font-bold">
                    {stage === 2 
                        ? `Delivery Note Preview - ${order?.customer_company_name ?? order?.company_name ?? ""}` 
                        : `Delivery/${order?.customer_company_name ?? order?.company_name ?? location.state?.customer_company_name ?? location.state?.company_name}/Delivery Entry`}
                </h1>
            </div>
            {stage === 1 && (
                <p className="text-black/50 text-xl mb-2">Record new laundry pickup with item counts by category.</p>
            )}

            {/* Order Tabs */}
            {stage === 1 && location.state?.all_order_ids?.length > 1 && (
                <div className="flex flex-row gap-x-3 w-full overflow-x-auto pb-2 mb-5 mt-4 whitespace-nowrap scrollbar-none">
                    {location.state.all_order_ids.map((orderId) => (
                        <button
                            key={orderId}
                            className={`cursor-pointer px-5 py-2 text-lg rounded-full font-bold transition-all ${
                                id === orderId
                                    ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                                    : 'bg-white text-black/60 border border-black/15 hover:bg-primary/5 hover:text-primary'
                            }`}
                            onClick={() => {
                                const { edit_note_id, tripDeliveries, ...restState } = location.state || {};
                                navigate(`/salesCorporate/corporate/delivery/entry/${orderId}`, { state: restState });
                            }}
                        >
                            {orderId}
                        </button>
                    ))}
                </div>
            )}

            {isLoading || order === null ?
                <div className="flex items-center justify-center bg-white rounded-xl py-10 border border-primary">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div>
                    {stage === 1 && (
                        <>
                        <div className="flex flex-col gap-y-5">
                        <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                            <h2 className="text-xl font-semibold">Customer Information</h2>

                            <div className="flex flex-row flex-wrap gap-x-20 gap-y-4 items-center font-medium text-lg">
                                <div className="flex flex-row gap-x-5">
                                    <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto p-1" />
                                    <div className="flex flex-col">
                                        <p className="font-medium">{order?.customer_company_name ?? order?.company_name}</p>
                                        <p className="text-base text-black/60 font-medium">{order?.customer_id ?? order?.customer_name}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Order ID</p>
                                    <p className="text-base text-black/60 font-medium">{order?.pickup_entry_id}</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Date of collection</p>
                                    <p className="text-base text-black/60 font-medium">
                                        {(order?.created_at ?? order?.created) ? new Date(order?.created_at ?? order?.created).toISOString().split("T")[0] : ""}
                                    </p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Location</p>
                                    <p className="text-base text-black/60 font-medium">{(order?.customer_address ?? order?.address) || "—"}</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Room No</p>
                                    <p className="text-base text-black/60 font-medium">{order?.room_no || "—"}</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Gate Pass No</p>
                                    <p className="text-base text-black/60 font-medium">{order?.gate_pass_no || "—"}</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Invoice Type</p>
                                    <p className="text-base text-black/60 font-medium">
                                        {order?.invoice_details?.invoice_type ?? order?.customer_invoice_type}
                                    </p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="font-medium">Credit Period</p>
                                    <p className="text-base text-black/60 font-medium">{order?.invoice_details?.payment_period ?? order?.customer_payment_period} Days</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl overflow-hidden border border-black/50">
                            <div className="text-xl text-center grid grid-cols-6 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                <p className="text-start">ITEM TYPE</p>
                                <p>TOTAL COUNT</p>
                                <p>REMAINING TO DELIVER</p>
                                <p>DELIVERED NOW</p>
                                <p>ALREADY DELIVERED</p>
                                <p>PENDING</p>
                            </div>

                             {order?.items?.filter(item => {
                                 const matchingNoteItem = editNoteId && editNote
                                     ? editNote.items?.find(ni => 
                                         ni.order_item_auto_id === item.order_item_auto_id || 
                                         (ni.order_item_auto_id === null && ni.item_id === item.corp_item_id)
                                       )
                                     : null;
                                 const currentNoteQty = (editNote && editNote.approval_status === "Approved") && matchingNoteItem ? Number(matchingNoteItem.delivered_qty ?? 0) : 0;
                                 const alreadyDeliveredOtherTrips = Number(item.delivered_qty || 0) - currentNoteQty;
                                 const pendingQty = (Number(item.final_packed_qty || 0) + Number(item.damaged_qty || 0)) - alreadyDeliveredOtherTrips;
                                 return pendingQty > 0;
                             }).map((item, index) => {
                                 const deliveryItemState = items.find(i => String(i.order_item_auto_id) === String(item.order_item_auto_id));
                                 const matchingNoteItem = editNoteId && editNote
                                     ? editNote.items?.find(ni => 
                                         String(ni.order_item_auto_id) === String(item.order_item_auto_id) || 
                                         (ni.order_item_auto_id === null && ni.item_id === item.corp_item_id)
                                       )
                                     : null;
                                 const currentNoteQty = (editNote && editNote.approval_status === "Approved") && matchingNoteItem ? Number(matchingNoteItem.delivered_qty ?? 0) : 0;
                                 const alreadyDeliveredOtherTrips = Number(item.delivered_qty || 0) - currentNoteQty;
                                 
                                 const remainingToDeliverAvailable = Number(item.unassigned_qty ?? 0) + currentNoteQty;
                                 const totalCount = Number(item.final_packed_qty || 0);
                                 const isManualItem = Number(item.corp_item_quantity || 0) === 0 || Number(item.order_item_auto_id) < 0;

                                 return (
                                     <div key={index} className={`grid grid-cols-6 gap-x-3 text-lg text-center py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                         <div className="text-start truncate">
                                             {item.corp_item_name ?? itemTypes.find(type => type.item_type_id === item.item_id)?.item_type_name} ({itemCategoryOptions.find(cat => String(cat.value) === String(item.item_category_id))?.label || item.item_category_name || "—"})
                                         </div>
                                         <p>{totalCount}</p>
                                         <p>{remainingToDeliverAvailable}</p>
                                         <input
                                             type="number"
                                             className="rounded-full border border-black/50 mx-4 text-center"
                                             onChange={(e) => handleInputNumberChangeItems(e, item.order_item_auto_id)}
                                             value={deliveryItemState?.delivery_quantity ?? ""}
                                             disabled={isSaveClicked}
                                             min={0}
                                         />
                                         <p>{alreadyDeliveredOtherTrips}</p>
                                         <div className="flex items-center justify-center relative">
                                             <p>{totalCount - alreadyDeliveredOtherTrips}</p>
                                             {isManualItem && (
                                                 <button
                                                     type="button"
                                                     onClick={() => handleRemoveItem(item.order_item_auto_id)}
                                                     title="Remove item"
                                                     disabled={isSaveClicked}
                                                     className="absolute right-1 text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                                                 >
                                                     <BiTrash className="size-5" />
                                                 </button>
                                             )}
                                         </div>
                                     </div>
                                 );
                             })}
                        </div>

                        <div className="flex flex-row text-xl my-5 justify-between items-center">
                            <p className="text-red-500 font-semibold">{itemErrorMessage}</p>

                            <div className="flex gap-x-4">
                                <button
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 px-10 cursor-pointer flex items-center gap-x-1"
                                    onClick={() => setShowAddItemModal(true)}
                                >
                                    <BiPlus className="text-xl" /> Add Item
                                </button>
                                <button
                                    type="button"
                                    className="font-semibold text-primary bg-white border border-primary rounded-full py-2 px-10 cursor-pointer"
                                    onClick={clearItems}
                                >Clear Items</button>
                            </div>
                        </div>
                    </div>


                    <div className="w-full border-b border-primary">
                        <p className="border-b-3 border-black w-fit px-1 text-2xl font-semibold">Delivery Amount Summary</p>
                    </div>

                    <div className="flex flex-col gap-y-6 bg-white rounded-xl p-6 my-3 font-medium">
                        <div className="grid grid-cols-2 gap-6">
                            {/* Total Items Delivered */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-lg font-semibold text-black/80">Total Items Delivered in This Trip</label>
                                <input
                                    className="w-full text-lg border border-black/20 px-4 py-2 rounded-xl bg-gray-50 font-semibold text-primary cursor-not-allowed"
                                    disabled
                                    value={items.reduce((s, item) => s + Number(item.delivery_quantity || 0), 0)}
                                />
                            </div>

                            {/* Delivered Location */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-lg font-semibold text-black/80">Delivered Location </label>
                                <input
                                    className="w-full text-lg border border-black/20 px-4 py-2 rounded-xl bg-gray-50 text-black/60 cursor-not-allowed"
                                    value={order?.place_of_supply ?? formData.delivered_location?.value ?? ""}
                                    disabled
                                    readOnly
                                />
                            </div>

                            {/* Delivery Date & Time */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-lg font-semibold text-black/80">Delivery Date & Time</label>
                                <input
                                    className="w-full text-lg border border-black/20 px-4 py-2 rounded-xl bg-gray-50 text-black/60 cursor-not-allowed"
                                    disabled
                                    value={new Date().toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                    }).replace(',', '')}
                                />
                            </div>

                            {/* Delivered By */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-lg font-semibold text-black/80">Delivered By</label>
                                <input
                                    className="w-full text-lg border border-black/20 px-4 py-2 rounded-xl bg-gray-100 text-black/60 cursor-not-allowed"
                                    value={localStorage.getItem("userName") ?? ""}
                                    disabled
                                    readOnly
                                />
                            </div>

                            {/* Received By */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-lg font-semibold text-black/80">Received By <span className="text-red-500">*</span></label>
                                <input
                                    name="received_by"
                                    placeholder="Add Receiver Name"
                                    className="w-full text-lg border border-black/20 px-4 py-2 rounded-xl focus:outline-none focus:border-primary"
                                    onChange={handleInputChange}
                                    value={formData.received_by}
                                />
                            </div>

                            {/* Customer Invoicing Period */}
                            <div className="flex flex-col gap-y-2">
                                <label className="text-lg font-semibold text-black/80">Customer Invoicing Period <span className="text-sm font-normal text-black/50">(days)</span> <span className="text-red-500">*</span></label>
                                <input
                                    name="customer_invoicing_period"
                                    type="number"
                                    min={1}
                                    className="w-full text-lg border border-black/20 px-4 py-2 rounded-xl focus:outline-none focus:border-primary"
                                    placeholder="Enter invoicing period in days"
                                    onChange={handleInputChange}
                                    value={formData.customer_invoicing_period}
                                />
                    </div>
                    </div>
                </div>

                    <div className="flex flex-row text-xl my-5 justify-between items-center">
                        <button
                            type="button"
                            className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={clearDeliveryData}
                        >Clear</button>

                        <p className="text-red-500">{errorMessage}</p>

                        <button
                            type="button"
                            className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={handleNext}
                        >
                            Next
                        </button>
                    </div>

                    {/* Delivery Log */}
                    <div className="flex flex-col w-full mb-10">
                        <h2 className="text-2xl font-bold text-primary mb-4">Delivery Log</h2>
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-y-4 shadow-sm">
                            {sortedLogs.length > 0 ? (
                                <div className="flex flex-col gap-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {sortedLogs.map((log, idx) => (
                                        <div key={idx} className="flex items-start gap-x-4 p-4 bg-primary/5 border border-primary/10 rounded-xl hover:bg-primary/10 transition-colors">
                                            <div className="p-2.5 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                                                <Icon icon="lucide:truck" className="size-6" />
                                            </div>
                                            <div className="flex flex-col gap-y-0.5 text-base">
                                                <p className="text-black/80 font-medium">
                                                    <span className="font-bold text-primary">{log.delivered_by || "User"}</span> delivered <span className="font-bold text-black">{log.item_qty_delivered}</span> units of <span className="font-semibold">{log.corp_item_name}</span> (received by <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-sm">{log.received_by || "—"}</span>)
                                                </p>
                                                <span className="text-sm text-black/40 font-semibold">
                                                    {new Date(log.created_at).toLocaleString('en-US', {
                                                        year: 'numeric',
                                                        month: '2-digit',
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-10 text-center text-gray-500 text-lg">No delivery logs recorded yet.</div>
                            )}
                        </div>
                    </div>
            </>
                    )}

                    {stage === 2 && (
                        <div className="grid grid-cols-4 mt-5 gap-x-6">
                            {/* Main: printable note */}
                            <main className="col-span-3 border-r border-black/20 pe-3 flex flex-col gap-y-6">
                                <div className="overflow-auto w-full">                                    <CorporateDeliveryNote 
                                        ref={deliveryNoteRef}
                                        data={{
                                            delivery_note_id: previewDeliveryNoteId,
                                            pickup_entry_id: order?.pickup_entry_id || id,
                                            status: "Active",
                                            approval_status: "Created",
                                            delivery_type: order?.delivery_type,
                                            room_no: order?.room_no,
                                            gate_pass_no: order?.gate_pass_no,
                                            place_of_supply: order?.place_of_supply,
                                            created_at: new Date().toISOString(),
                                            signature_url: formData.signature instanceof Blob || formData.signature instanceof File 
                                                ? URL.createObjectURL(formData.signature) 
                                                : formData.signature
                                        }}
                                        customer={{
                                            company_name: order?.customer_company_name ?? order?.company_name,
                                            customer_id: order?.customer_id,
                                            customer_phone: order?.customer_phone ?? order?.phone_number,
                                            customer_address: order?.customer_address ?? order?.address,
                                            vat_no: order?.customer_vat_number ?? order?.vat_number ?? order?.vat_no,
                                            email: order?.customer_email ?? order?.email,
                                            place_of_supply: order?.place_of_supply,
                                            customer_company_name: order?.customer_company_name ?? order?.company_name
                                        }}
                                        items={(() => {
                                            const previewItems = [];
                                            Object.entries(tripDeliveries).forEach(([orderId, orderItems]) => {
                                                orderItems.forEach(item => {
                                                    const qty = Number(item.delivery_quantity || 0);
                                                    if (qty > 0) {
                                                        const matchedOrderItem = order?.items?.find(i => 
                                                             String(i.order_item_auto_id) === String(item.order_item_auto_id) || 
                                                             ((!i.order_item_auto_id || Number(i.order_item_auto_id) < 0) && (!item.order_item_auto_id || Number(item.order_item_auto_id) < 0) && i.corp_item_id === item.corp_item_id) ||
                                                             (!i.order_item_auto_id && i.corp_item_id === item.corp_item_id)
                                                        );
                                                        const matchingNoteItem = editNoteId && editNote
                                                            ? editNote.items?.find(ni => 
                                                                (ni.order_item_auto_id !== null && ni.order_item_auto_id !== undefined && String(ni.order_item_auto_id) === String(item.order_item_auto_id)) || 
                                                                ((ni.order_item_auto_id === null || ni.order_item_auto_id === undefined) && (ni.item_id === item.corp_item_id || ni.corp_item_id === item.corp_item_id))
                                                            )
                                                            : null;
                                                        const currentNoteQty = (editNote && editNote.approval_status === "Approved") && matchingNoteItem ? Number(matchingNoteItem.delivered_qty ?? 0) : 0;
                                                        const alreadyDeliveredOtherTrips = Math.max(0, Number(matchedOrderItem?.delivered_qty || 0) - currentNoteQty);

                                                        previewItems.push({
                                                            pickup_entry_id: orderId,
                                                            corp_item_id: item.corp_item_id,
                                                            corp_item_name: matchedOrderItem?.corp_item_name ?? item.corp_item_name ?? item.corp_item_id,
                                                            item_category_name: matchedOrderItem?.item_category_name ?? item.item_category_name ?? '',
                                                            delivery_quantity: qty,
                                                            order_qty: (Number(matchedOrderItem?.final_packed_qty || 0) + Number(matchedOrderItem?.damaged_qty || 0)),
                                                            cumulative_delivered_qty: alreadyDeliveredOtherTrips,
                                                            service_type: matchedOrderItem?.service_type ?? 'Washing',
                                                            remark: item.remark || item.corp_item_remark || matchedOrderItem?.corp_item_remark || matchedOrderItem?.remark || ''
                                                        });
                                                    }
                                                });
                                            });
                                            return previewItems;
                                        })()}
                                    />
                                </div>
 
                                <div className="flex flex-row text-xl my-5 justify-between gap-x-5">
                                    <button
                                        type="button"
                                        className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/2 cursor-pointer text-center"
                                        onClick={() => setStage(1)}
                                    >
                                        Back
                                    </button>
 
                                    <button
                                        type="button"
                                        className="font-semibold text-white bg-primary rounded-full py-2 w-1/2 cursor-pointer text-center"
                                        onClick={handleSave}
                                    >
                                        {isLoadingSubmit
                                            ? <BeatLoader color="#fff" size={10} />
                                            : editNoteId 
                                                ? "Update Delivery Note & Print Receipt" 
                                                : "Create Delivery Note & Print Receipt"
                                        }
                                    </button>
                                </div>
                                {errorMessage && <p className="text-red-500 text-center font-semibold text-xl">{errorMessage}</p>}
                            </main>

                            {/* Sidebar: Approval Workflow */}
                            <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px]">
                                {/* Edit/Locked Button */}
                                <button
                                    disabled
                                    className="font-bold py-3 rounded-full text-lg shadow-sm bg-black/10 text-black/40 cursor-not-allowed w-full text-center"
                                >
                                    Edit Delivery Note
                                </button>

                                {/* Created By */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Created By :</p>
                                    <div className="flex flex-row items-center gap-x-2">
                                        <Icon
                                            icon="mdi:check-circle"
                                            className="text-[#00E676] text-xl"
                                        />
                                        <span className="text-black/70 text-sm truncate">
                                            {localStorage.getItem("userName") ?? ""}
                                        </span>
                                    </div>
                                </div>

                                {/* Checked By */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Checked By :</p>
                                    <button
                                        disabled
                                        className="border font-medium py-2.5 rounded-full shadow-sm border-black/20 text-black/30 cursor-not-allowed w-full text-center text-lg bg-white"
                                    >
                                        Checked
                                    </button>
                                </div>

                                {/* Approved By */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">Approved By :</p>
                                    <button
                                        disabled
                                        className="border font-medium py-2.5 rounded-full shadow-sm border-black/20 text-black/30 bg-white cursor-not-allowed w-full text-center text-lg"
                                    >
                                        Approved
                                    </button>
                                </div>

                                {/* Activity Log */}
                                <div className="flex flex-col gap-y-2 text-[15px]">
                                    <p className="font-semibold text-black">
                                        Activity Log :
                                    </p>
                                    <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                                        <div className="px-4 py-2 text-sm text-black/70">
                                            <span className="font-semibold text-[13px]">
                                                {new Date().toISOString().split("T")[0]} {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                            {": "}
                                            {localStorage.getItem("userName") ?? "User"} will create the delivery note
                                        </div>
                                    </div>
                                </div>

                                {/* Delivery Details */}
                                <div className="flex flex-col gap-y-1">
                                    <label className="text-black font-semibold text-[15px]">
                                        Delivered Location :
                                    </label>
                                    <input
                                        value={formData.delivered_location?.value ?? ""}
                                        disabled
                                        readOnly
                                        placeholder="No location specified"
                                        className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                                    />
                                </div>
                                <div className="flex flex-col gap-y-1">
                                    <label className="text-black font-semibold text-[15px]">
                                        Received By :
                                    </label>
                                    <input
                                        value={formData.received_by || ""}
                                        disabled
                                        readOnly
                                        placeholder="No receiver specified"
                                        className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                                    />
                                </div>
                            </aside>
                        </div>
                    )}
                </div>
            }

            {showAddItemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in text-black">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <h3 className="text-xl font-bold text-neutral-900">Add New Item</h3>
                            <button
                                type="button"
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                onClick={() => {
                                    setShowAddItemModal(false);
                                    setItemErrorMessage("");
                                }}
                            >
                                <Icon icon="mdi:close" className="text-2xl" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-y-4 py-4">
                            <div className="flex flex-col gap-y-1.5 text-left">
                                <label className="text-[14px] font-semibold text-neutral-700">Item Name</label>
                                <Select
                                    options={customerPriceList
                                        .filter(pl => pl.price_list_auto_id != null && parseFloat(pl.amount ?? pl.price_list_washing_price ?? pl.washing_price ?? 0) > 0)
                                        .map(pl => {
                                            const matchingItem = corporateItems.find(item => item.corp_item_id === pl.corp_item_id);
                                            const name = pl.item_name || pl.corp_item_name || matchingItem?.corp_item_name || "";
                                            return {
                                                value: pl.corp_item_id,
                                                label: `${name} (${pl.corp_item_id})`
                                            };
                                        })
                                    }
                                    placeholder="Select an item..."
                                    className="text-sm"
                                    styles={selectStyles}
                                    onChange={(option) => setNewItemData(prev => ({ ...prev, corp_item_id: option?.value || "" }))}
                                />
                            </div>
                            <div className="flex flex-col gap-y-1.5 text-left">
                                <label className="text-[14px] font-semibold text-neutral-700">Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={newItemData.delivery_quantity}
                                    onChange={(e) => setNewItemData(prev => ({ ...prev, delivery_quantity: e.target.value }))}
                                    placeholder="Enter quantity"
                                    className="border border-black/30 rounded-xl px-4 py-2.5 w-full focus:outline-none focus:border-primary text-black shadow-sm text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-y-1.5 text-left">
                                <label className="text-[14px] font-semibold text-neutral-700">Remark</label>
                                <input
                                    type="text"
                                    value={newItemData.remark}
                                    onChange={(e) => setNewItemData(prev => ({ ...prev, remark: e.target.value }))}
                                    placeholder="Enter remark (optional)"
                                    className="border border-black/30 rounded-xl px-4 py-2.5 w-full focus:outline-none focus:border-primary text-black shadow-sm text-sm"
                                />
                            </div>
                        </div>
                        {itemErrorMessage && <p className="text-red-500 font-semibold text-sm mb-3 text-left">{itemErrorMessage}</p>}
                        <div className="flex justify-end gap-x-3 pt-3 border-t border-gray-100">
                            <button
                                type="button"
                                className="font-semibold text-neutral-600 bg-gray-100 hover:bg-gray-200 rounded-full py-2 px-6 cursor-pointer text-sm transition-colors"
                                onClick={() => {
                                    setShowAddItemModal(false);
                                    setItemErrorMessage("");
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="font-semibold text-white bg-primary hover:bg-blue-600 rounded-full py-2 px-6 cursor-pointer text-sm transition-colors"
                                onClick={handleAddItemSave}
                            >
                                Save Item
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddSignature &&
                <SignatureInput handleAddSignature={handleAddSignature} handleClose={() => setShowAddSignature(false)} />
            }
        </div>
    );
};

export default CorporateDeliveryEntry;