import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { BeatLoader } from "react-spinners";
import { getRetailInvoicesByOrder, getServiceItemsByOrderId, getAllCustomersPublic, getOrderByIdPublic, incrementRetailInvoicePrintCount } from "../../../services/Retail/RetailInvoiceServices";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import RetailInvoice from "../../printables/RetailInvoice";
import { markItemAsDamaged } from "../../../services/Retail/RetailBackToOutletServices";

const RetailViewInvoices = ({ handleClose, orderId, order: orderFromParent }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const invoiceRef = useRef(null);
    const [invoices, setInvoices] = useState([]);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [itemTypes, setItemTypes] = useState([]);
    const [invoice, setInvoice] = useState(null);
    const [damagedItems, setDamagedItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState([]);

    const fetchInvoicesByOrder = async () => {
        try {
            setIsLoadingInvoices(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: orderId
            };
            const response = await getRetailInvoicesByOrder(payload);
            const rawInvoices = response?.invoices || [];
            const formattedResponse = rawInvoices.map(item => ({
                ...item,
                order_ids: (() => {
                    try {
                        return typeof item.order_id === "string" ? JSON.parse(item.order_id) : item.order_id;
                    } catch {
                        return [item.order_id];
                    }
                })(),
                payment: (() => {
                    try {
                        return typeof item.payment === "string" ? JSON.parse(item.payment) : item.payment;
                    } catch {
                        return item.payment;
                    }
                })()
            }));
            setInvoices(formattedResponse);

            // Find the invoice that matches orderFromParent.invoice_id or contains orderId in order_ids
            let targetIndex = 0;
            if (orderFromParent?.invoice_id) {
                const foundIdx = formattedResponse.findIndex(inv => String(inv.invoice_id) === String(orderFromParent.invoice_id));
                if (foundIdx !== -1) targetIndex = foundIdx;
            } else if (orderId) {
                const foundIdx = formattedResponse.findIndex(inv => {
                    const ids = Array.isArray(inv.order_ids) ? inv.order_ids : [inv.order_ids];
                    return ids.includes(orderId);
                });
                if (foundIdx !== -1) targetIndex = foundIdx;
            }

            setSelectedIndex(targetIndex);
            const targetInvoice = formattedResponse[targetIndex];
            setSelectedInvoice(targetInvoice);
            if (targetInvoice) {
                fetchAllOrders(targetInvoice.order_ids || targetInvoice.order_id, targetInvoice);
            } else {
                fetchAllOrders([orderId], null);
            }
        } catch (error) {
            console.error("Error fetching invoices by order:", error);
        } finally {
            setIsLoadingInvoices(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response?.data?.item_types || []);
        } catch (error) {
            console.error("Error fetching item types: ", error);
        }
    };

    const fetchAllOrders = async (orderIds, currentInvoice) => {
        try {
            setIsLoadingInvoices(true);
            const userId = localStorage.getItem("userId");
            const parsed = typeof orderIds === "string" ? (() => { try { return JSON.parse(orderIds); } catch { return [orderIds]; } })() : orderIds;
            const idList = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
            
            if (idList.length === 0 || !userId) {
                setIsLoadingInvoices(false);
                return;
            }

            // Fetch service items for ALL orders in idList in parallel
            const itemsResponses = await Promise.all(
                idList.map(oid => getServiceItemsByOrderId({ user_id: userId, order_id: oid }).catch(err => {
                    console.error("Error fetching items for order", oid, err);
                    return null;
                }))
            );
            
            let allItems = [];
            itemsResponses.forEach((res, idx) => {
                let orderItems = [];
                if (res?.service_items && Array.isArray(res.service_items)) {
                    orderItems = res.service_items;
                } else if (res?.items && Array.isArray(res.items)) {
                    orderItems = res.items;
                } else if (Array.isArray(res)) {
                    orderItems = res;
                }
                orderItems = orderItems.map(item => ({
                    ...item,
                    order_id: item.order_id || idList[idx]
                }));
                allItems.push(...orderItems);
            });

            // Discount priority logic
            let finalDiscount = null;
            const orderDataMerged = orderFromParent || {};
            const inv = currentInvoice || selectedInvoice || {};
            try {
                const orderRes = await getOrderByIdPublic({ user_id: "public", order_id: idList[0] });
                const adminDiscount = orderRes?.order?.discount;
                const isValidDiscount = adminDiscount != null && adminDiscount !== "" && adminDiscount !== "0" && adminDiscount !== 0;
                if (isValidDiscount) {
                    finalDiscount = String(adminDiscount).trim();
                } else {
                    const branchId = orderDataMerged.branch_id || inv?.branch_id || itemsResponses[0]?.branch_id || 1;
                    const customersRes = await getAllCustomersPublic({ customer_type: "Retail", branch_id: branchId });
                    if (customersRes?.success && Array.isArray(customersRes.allCustomers)) {
                        const lookupId = String(orderDataMerged.customer_id || inv?.customer_id || itemsResponses[0]?.customer_id || "").trim();
                        const lookupPhone = String(orderDataMerged.phone_number || inv?.phone_number || itemsResponses[0]?.phone_number || "").trim().replace(/^0+/, "");
                        const currentCustomer = customersRes.allCustomers.find(c => {
                            const cId = String(c.customer_id || "").trim();
                            const cPhone = String(c.phone_number || "").trim().replace(/^0+/, "");
                            return cId === lookupId || (lookupPhone && cPhone === lookupPhone);
                        });
                        if (currentCustomer && currentCustomer.discount != null && Number(currentCustomer.discount) > 0) {
                            finalDiscount = `${currentCustomer.discount}%`;
                        }
                    }
                }
            } catch (discountErr) {
                console.error("RetailViewInvoices: Error fetching discount", discountErr);
            }

            const firstRes = itemsResponses[0] || {};
            const mergedOrder = {
                customer_id: inv?.customer_id || orderDataMerged.customer_id || firstRes?.customer_id,
                customer_name: inv?.customer_name || orderDataMerged.customer_name || firstRes?.customer_name,
                phone_number: inv?.phone_number || orderDataMerged.phone_number || firstRes?.phone_number,
                created_at: inv?.created_at || orderDataMerged.created_at || firstRes?.created_at,
                delivery_type: inv?.delivery_type || orderDataMerged.delivery_type || firstRes?.delivery_type,
                delivery_date: inv?.delivery_date || orderDataMerged.delivery_date || firstRes?.delivery_date,
                delivery_outlet: inv?.delivery_outlet || orderDataMerged.delivery_outlet || firstRes?.delivery_outlet,
                redo_order_reference: orderDataMerged.redo_order_reference || firstRes?.redo_order_reference,
                created_by: inv?.user_id || orderDataMerged.created_by || orderDataMerged.user_id || firstRes?.created_by,
                user_id: inv?.user_id || orderDataMerged.user_id || orderDataMerged.created_by || firstRes?.user_id,
                created_by_name: orderDataMerged.created_by_name || firstRes?.created_by_name,
                created_by_user_name: orderDataMerged.created_by_user_name || firstRes?.created_by_user_name,
                user_name: orderDataMerged.user_name || firstRes?.user_name,
                order_ids: idList,
                advance_payment: parseFloat(inv?.advanced_payment || inv?.advance_payment || orderDataMerged.advance_payment || firstRes?.advance_payment || 0),
                remaining_amount: parseFloat(inv?.balance_due || inv?.remaining_amount || orderDataMerged.remaining_amount || firstRes?.remaining_amount || 0),
                delivery_charge: parseFloat(inv?.delivery_charge || orderDataMerged.delivery_charge || firstRes?.delivery_charge || 0),
                total_amount: parseFloat(inv?.total_amount_for_ready || inv?.total_amount || orderDataMerged.total_amount || firstRes?.total_amount || 0),
                discount: finalDiscount ?? parseFloat(inv?.discount || orderDataMerged.discount || firstRes?.discount || 0),
                damaged_deduction: 0,
                returned_deduction: 0,
                items: allItems
            };

            if (finalDiscount != null) {
                setSelectedInvoice(prev => ({ ...prev, discount: finalDiscount }));
            }

            // Calculate damaged and returned deductions from items
            let damagedDeduction = 0;
            let returnedDeduction = 0;
            allItems.forEach(item => {
                if (item.is_damaged === 1 || item.is_damaged === "1") {
                    damagedDeduction += parseFloat(item.price || 0);
                }
                if (item.is_returned === 1 || item.is_returned === "1") {
                    returnedDeduction += parseFloat(item.price || 0);
                }
            });
            mergedOrder.damaged_deduction = damagedDeduction;
            mergedOrder.returned_deduction = returnedDeduction;

            console.log("[RetailViewInvoices] Merged order with all items:", mergedOrder);
            setInvoice(mergedOrder);
            
            // Initialize damaged items from backend data
            const damaged = allItems
                .filter(item => item.is_damaged === 1 || item.is_damaged === "1")
                .map(item => item.service_item_id);
            setDamagedItems(damaged);
        } catch (error) {
            console.error("Error fetching orders: ", error);
        } finally {
            setIsLoadingInvoices(false);
        }
    };

    useEffect(() => {
        if (orderId) {
            fetchInvoicesByOrder();
        }
        fetchItemTypes();
    }, [orderId]);

    useEffect(() => {
        if (invoices[selectedIndex]) {
            const current = invoices[selectedIndex];
            setSelectedInvoice(current);
            fetchAllOrders(current.order_ids || current.order_id, current);
        }
    }, [selectedIndex]);

    useEffect(() => {
        // Initialize damaged items from backend data when invoice changes
        if (invoice?.items) {
            const damaged = invoice.items
                .filter(item => item.is_damaged === 1)
                .map(item => item.service_item_id);
            setDamagedItems(damaged);
        }
    }, [invoice]);

    const handleToggleDamaged = async (item) => {
        // Get the service_item_id from the item object - try multiple field names
        const serviceItemId = item.service_item_id ?? item.serviceItemId ?? item.id ?? item.item_id;
        
        // Check if already loading
        if (loadingItems.includes(serviceItemId)) {
            return;
        }

        if (!invoice || !invoice.order_ids || invoice.order_ids.length === 0) {
            alert("Order ID not found. Please refresh the page.");
            return;
        }

        const orderId = invoice.order_ids[0]; // Use first order ID
        const isCurrentlyDamaged = damagedItems.includes(serviceItemId);
        
        try {
            // Add to loading state
            setLoadingItems(prev => [...prev, serviceItemId]);

            const payload = {
                user_id: String(localStorage.getItem("userId")),
                order_id: String(orderId),
                service_item_id: Number(serviceItemId)
            };
            
            console.log("Mark as damaged payload:", payload);
            console.log("Item object:", item);

            const response = await markItemAsDamaged(payload);

            if (response && response.message) {
                // Update damaged items state
                if (isCurrentlyDamaged) {
                    setDamagedItems(prev => prev.filter(id => id !== serviceItemId));
                    // Update invoice items
                    setInvoice(prev => ({
                        ...prev,
                        items: prev.items.map(item => 
                            item.service_item_id === serviceItemId 
                                ? { ...item, is_damaged: 0 }
                                : item
                        )
                    }));
                } else {
                    setDamagedItems(prev => [...prev, serviceItemId]);
                    // Update invoice items
                    setInvoice(prev => ({
                        ...prev,
                        items: prev.items.map(item => 
                            item.service_item_id === serviceItemId 
                                ? { ...item, is_damaged: 1 }
                                : item
                        )
                    }));
                }
                
                // Refresh invoice data to get updated totals
                await fetchAllOrders(JSON.stringify(invoice.order_ids));
            }
        } catch (error) {
            console.error("Error marking item as damaged:", error);
            alert("Failed to update damaged status. Please try again.");
        } finally {
            // Remove from loading state
            setLoadingItems(prev => prev.filter(id => id !== serviceItemId));
        }
    };

    const handlePrint = useReactToPrint({
        contentRef: invoiceRef,
        onBeforePrint: async () => {
            try {
                const response = await incrementRetailInvoicePrintCount({ invoice_id: selectedInvoice.invoice_id });
                setSelectedInvoice(prev => ({ ...prev, print_count: response?.print_count ?? (Number(prev?.print_count || 0) + 1) }));
            } catch (error) {
                console.error("Error incrementing invoice print count:", error);
            }
        }
    });

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">View Invoices</h1>

                {isLoadingInvoices &&
                    <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                        <BeatLoader color="#1470F9" size={20} />
                    </div>
                }

                {selectedInvoice && !isLoadingInvoices && invoice && (
                    <>
                        {/* Only invoice bill - pass invoice items as data.items so damaged deduction can be computed (same as pending) */}
                        <RetailInvoice ref={invoiceRef} data={{ ...selectedInvoice, items: invoice?.items ?? selectedInvoice?.items, delivery_outlet: invoice?.delivery_outlet ?? selectedInvoice?.delivery_outlet }} itemTypes={itemTypes} order={invoice} />
                    </>
                )}

                {/* {!isLoadingInvoices &&
                    <div className="flex flex-row justify-center gap-x-20 mb-5">
                        <button
                            className={`border border-primary flex flex-row rounded-full items-center gap-x-5 px-5 py-1 font-semibold ${selectedIndex === 0 ? "text-black/50" : "text-primary cursor-pointer"}`}
                            disabled={selectedIndex === 0}
                            onClick={() => setSelectedIndex(selectedIndex - 1)}
                        >
                            <CgChevronLeft /> Back
                        </button>
                        <button
                            className={`border border-primary flex flex-row rounded-full items-center gap-x-5 px-5 py-1 font-semibold ${selectedIndex === invoices.length - 1 ? "text-black/50" : "text-primary cursor-pointer"}`}
                            disabled={selectedIndex === invoices.length - 1}
                            onClick={() => setSelectedIndex(selectedIndex + 1)}
                        >
                            <CgChevronRight /> Next
                        </button>
                    </div>
                } */}

                {!isLoadingInvoices && (selectedInvoice && invoice) &&
                    <div className="flex flex-row gap-x-3 justify-center mt-3">
                        <button className="cursor-pointer bg-primary text-white font-bold w-fit px-20 py-1 rounded-xl text-xl" onClick={handlePrint} disabled={isLoading}>Print</button>
                        <button className="cursor-pointer bg-black/50 text-white font-bold w-fit px-20 py-1 rounded-xl text-xl" onClick={handleClose} disabled={isLoading}>Close</button>
                    </div>
                }
            </div>
        </div>
    );
};

export default RetailViewInvoices;