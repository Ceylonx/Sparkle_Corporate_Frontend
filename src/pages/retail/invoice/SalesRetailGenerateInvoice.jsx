import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import Select from "react-select";
import RetailInvoice from "../../../components/printables/RetailInvoice";
import { useReactToPrint } from "react-to-print";
import { getAllItemTypes, getAllSettings } from "../../../services/Retail/RetailSettingsServices";
import { getAllRetailDiscounts } from "../../../services/Retail/RetailDiscountServices";
import { getAllRetailVouchers } from "../../../services/Retail/RetailVoucherServices";
import { createRetailInvoice, getAllRetailPendingInvoices, getServiceItemsByOrderId } from "../../../services/Retail/RetailInvoiceServices";
import { getAllBranches } from "../../../services/Retail/RetailOrderServices";
import { BeatLoader } from "react-spinners";
import RetailRedeemVoucherDialog from "../../../components/dialogs/retail/RetailRedeemVoucherDialog";
import { getCustomerById } from "../../../services/CustomerServices";
import Input from "../../../components/ui/Input";
import { BiMinus } from "react-icons/bi";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";

const SalesRetailGenerateInvoice = () => {
    const { allowed } = usePagePermission("SalesRetail_Invoice_Pending_Invoiced_Order_Create");
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const invoiceFromState = location.state?.invoice;
    const ordersFromState = location.state?.orders;
    const ids = id.split(",");
    const invoiceRef = useRef(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [stage, setStage] = useState(1);
    const [settings, setSettings] = useState(null);
    const [discounts, setDiscounts] = useState([]);
    const [vouchers, setVouchers] = useState([]);
    const [invoice, setInvoice] = useState(null);
    const [itemTypes, setItemTypes] = useState([]);
    const [showAddVoucherDialog, setShowAddVoucherDialog] = useState(false);
    const [discount, setDiscount] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedDiscount, setSelectedDiscount] = useState(null);
    // No discount type is pre-selected — the cashier must deliberately choose one; a discount
    // should never be silently applied to an invoice without their action.
    const [selectedDiscountType, setSelectedDiscountType] = useState("");
    const [selectedDiscountCondition, setSelectedDiscountCondition] = useState("");
    const [availableDiscounts, setAvailableDiscounts] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [hasPreviousDiscount, setHasPreviousDiscount] = useState(false);
    const [serviceItemsSummary, setServiceItemsSummary] = useState(null);

    const [formData, setFormData] = useState(
        {
            user_id: localStorage.getItem("userId"),
            invoice_id: "",
            order_ids: [],
            company_address: "",
            customer_id: "",
            customer_name: "",
            phone_number: "",
            delivery_type: "",
            delivery_outlet: "",
            collection_date: "",
            delivery_date: "",
            delivery_charge: 0,
            branch_id: Number(localStorage.getItem("selectedBranchId")),
            // ready_items: [], // service_item_ids 
            // pending_items: [], // service_item_ids 
            gift_vouchers: [],
            gift_voucher_amount: "",
            payment: [
                {
                    payment_method: "CASH",
                    paid_amount: "",
                    card_type: "",
                    bank: "",
                    card_last_4_digits: "",
                },
            ],
            total_amount_for_ready: "",
            advanced_payment: "",
            discount: "",
            discount_remark: "",
            balance_due: "",
            notes: "",
            terms_and_conditions: ""
        }
    );

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

    // Discount Condition: no dropdown arrow (read-only look when auto-selected e.g. Seasonal)
    const selectStylesNoArrow = {
        ...selectStyles,
        dropdownIndicator: () => ({ display: "none" }),
        indicatorSeparator: () => ({ display: "none" }),
    };

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    function mergeOrders(orders) {
        if (!orders || orders.length === 0) return null;

        return {
            customer_id: orders[0].customer_id,
            customer_name: orders[0].customer_name,
            phone_number: orders[0].phone_number,
            created_at: orders[0].created_at,
            delivery_type: orders[0].delivery_type,
            delivery_date: orders[0].delivery_date,
            delivery_outlet: orders[0].delivery_outlet ?? (orders.find(o => o.delivery_outlet)?.delivery_outlet),
            branch_id: orders[0].branch_id,
            redo_order_reference: orders[0].redo_order_reference,
            // Include created_by/user_id from the first order (order creator)
            created_by: orders[0].created_by || orders[0].user_id,
            user_id: orders[0].user_id || orders[0].created_by,
            created_by_name: orders[0].created_by_name,
            created_by_user_name: orders[0].created_by_user_name,
            user_name: orders[0].user_name,

            order_ids: orders.map(o => o.order_id),

            advance_payment: orders.reduce(
                (sum, o) => sum + (
                    (o.payment && Array.isArray(o.payment) && o.payment.length > 0)
                        ? o.payment.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0)
                        : parseFloat(o.advance_payment || 0)
                ),
                0
            ),

            // How the advance was originally paid, so the invoice defaults to matching it
            // instead of always defaulting to Cash.
            advance_payment_method: (Array.isArray(orders[0].payment) && orders[0].payment[0]?.payment_method)
                || orders[0].payment_method
                || "",

            remaining_amount: orders
                .reduce((sum, o) => sum + parseFloat(o.remaining_amount || 0), 0),

            delivery_charge: orders.reduce(
                (sum, o) => sum + parseFloat(o.delivery_charge || 0),
                0
            ),

            total_amount: orders.reduce(
                (sum, o) => sum + parseFloat(o.total_amount || 0),
                0
            ),

            discount: orders.reduce(
                (sum, o) => sum + parseFloat(o.discount || 0),
                0
            ),

            items: orders.flatMap(o => o.items || [])
        };
    };

    const getBranchIdsFromApi = async () => {
        const response = await getAllBranches();
        if (!response) return [];
        let data = [];
        if (Array.isArray(response)) data = response;
        else if (response.data && Array.isArray(response.data)) data = response.data;
        else if (response.branches && Array.isArray(response.branches)) data = response.branches;
        else if (response.results && Array.isArray(response.results)) data = response.results;
        else {
            for (const key of Object.keys(response)) {
                if (Array.isArray(response[key])) {
                    data = response[key];
                    break;
                }
            }
        }
        return (data || []).map((b) => b.branch_id ?? b.id).filter((id) => id != null && !Number.isNaN(Number(id))).map(Number);
    };

    const applyMergedOrderToState = async (mergedOrder) => {
        if (!mergedOrder) return;
        const totalExcludingDamaged = mergedOrder.items.reduce((sum, item) => {
            if (item.is_damaged !== 1) return sum + parseFloat(item.price);
            return sum;
        }, 0);
        // Default the invoice's payment method to match how the advance was actually paid,
        // instead of always defaulting to Cash.
        const rawAdvanceMethod = String(mergedOrder.advance_payment_method || "").trim().toUpperCase();
        const normalizedAdvanceMethod = rawAdvanceMethod === "CARD" ? "CARD" : rawAdvanceMethod === "CASH" ? "CASH" : "";
        setFormData(prev => ({
            ...prev,
            order_ids: mergedOrder.order_ids,
            customer_id: mergedOrder.customer_id,
            customer_name: mergedOrder.customer_name,
            phone_number: mergedOrder.phone_number,
            delivery_type: mergedOrder.delivery_type,
            delivery_outlet: mergedOrder.delivery_outlet ?? "",
            collection_date: mergedOrder.created_at ? new Date(mergedOrder.created_at).toISOString().split("T")[0] : "",
            delivery_date: mergedOrder.delivery_date ? new Date(mergedOrder.delivery_date).toISOString().split("T")[0] : "",
            delivery_charge: Number(mergedOrder.delivery_charge),
            total_amount_for_ready: totalExcludingDamaged,
            advanced_payment: mergedOrder.advance_payment,
            branch_id: mergedOrder.branch_id || 1,
            discount: mergedOrder.discount != null && mergedOrder.discount !== "" ? (String(mergedOrder.discount).endsWith("%") ? mergedOrder.discount : `${mergedOrder.discount}%`) : prev.discount,
            discount_remark: mergedOrder.discount_remark || prev.discount_remark,
            payment: normalizedAdvanceMethod
                ? prev.payment.map((p, idx) => idx === 0 ? { ...p, payment_method: normalizedAdvanceMethod } : p)
                : prev.payment,
        }));
        // Show the order's existing discount as an editable "Other" value — there's no
        // dedicated option for it in the Discount Type dropdown, so without this the amount
        // gets applied to the total but is never visible or editable here. The Seasonal
        // auto-select effect still runs independently afterward and will override this if a
        // currently-active seasonal discount applies (it takes priority regardless).
        const hasExistingDiscount = mergedOrder.discount != null && mergedOrder.discount !== "";
        if (hasExistingDiscount) {
            setSelectedDiscountType("Other");
        }
        try {
            const payload = { user_id: localStorage.getItem("userId"), customer_id: mergedOrder.customer_id, customer_type: "Retail" };
            const responseCustomer = await getCustomerById(payload);
            const d = responseCustomer?.data;
            const apiCustomer = d?.customer ?? responseCustomer?.customer ?? null;
            const discountValue = apiCustomer?.discount ?? d?.discount ?? responseCustomer?.discount;
            setSelectedCustomer(apiCustomer);
            // Bill preview: show discount from get-customer-by-id when order doesn't already have one
            if (!hasExistingDiscount && discountValue != null) {
                setSelectedDiscountType("Other");
            }
            setFormData(prev => ({
                ...prev,
                discount: (prev.discount != null && prev.discount !== "") ? prev.discount : (discountValue != null ? `${discountValue}%` : prev.discount),
                discount_remark: prev.discount_remark || (discountValue != null ? "Loyalty" : prev.discount_remark),
            }));
        } catch (e) {
            console.error("Error fetching customer:", e);
        }
        if (mergedOrder.discount) setHasPreviousDiscount(true);
    };

    const fetchAllPendingInvoices = async () => {
        try {
            setIsLoading(true);
            const idsMatchInvoice = invoiceFromState?.order_ids && ids.length > 0 && ids.every((i) => invoiceFromState.order_ids.some((oid) => String(oid) === String(i)));
            if (invoiceFromState && idsMatchInvoice) {
                setInvoice(invoiceFromState);
                await applyMergedOrderToState(invoiceFromState);
                setIsLoading(false);
                return;
            }
            if (ordersFromState && Array.isArray(ordersFromState) && ordersFromState.length > 0) {
                const orderIdsFromState = ordersFromState.map((o) => o.order_id);
                const idsMatchOrders = ids.length > 0 && ids.every((i) => orderIdsFromState.some((oid) => String(oid) === String(i)));
                if (idsMatchOrders) {
                    // Use items directly from the pending-invoice API response (ordersFromState already has items)
                    const merged = mergeOrders(ordersFromState);
                    if (merged) {
                        setInvoice(merged);
                        await applyMergedOrderToState(merged);
                        setIsLoading(false);
                        return;
                    }
                }
            }
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            let order = [];
            const branchId = Number(localStorage.getItem("selectedBranchId"));
            const response = await getAllRetailPendingInvoices(userId, branchId, 0);
            const list = response?.data?.pending_invoice_orders ?? [];
            order = list.filter(o => ids.includes(o.order_id));

            if (order.length === 0) {
                const branchIds = await getBranchIdsFromApi();
                const responses = await Promise.all(
                    branchIds.map((bid) => getAllRetailPendingInvoices(userId, bid, 0))
                );
                const seen = new Set();
                for (const res of responses) {
                    const pending = res?.data?.pending_invoice_orders ?? [];
                    for (const o of pending) {
                        if (ids.includes(o.order_id) && !seen.has(o.order_id)) {
                            seen.add(o.order_id);
                            order.push(o);
                        }
                    }
                }
            }

            // Use items directly from the pending-invoice API response (no secondary fetch needed)
            const mergedOrder = mergeOrders(order);
            setInvoice(mergedOrder);

            if (!mergedOrder) {
                setIsLoading(false);
                return;
            }

            await applyMergedOrderToState(mergedOrder);
        } catch (error) {
            console.error("Error fetching orders: ", error);
        } finally {
            setIsLoading(false);
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
            // Keep all active discounts for type dropdown + manual selection.
            // (Previously we filtered by date + auto_apply which could make the list empty.)
            const filtered = response.data.discounts.filter(discount => discount.status !== "Deactive");
            setDiscounts(filtered);
        } catch (error) {
            console.error("Error fetching discounts: ", error);
        }
    };

    const fetchVouchers = async () => {
        try {
            const response = await getAllRetailVouchers(localStorage.getItem("userId"));
            const filtered = response.data.vouchers.filter(voucher => voucher.status !== "Deactive");

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const updatedVouchers = filtered.map(voucher => {
                const issuedDate = new Date(voucher.issued_date);
                const expireDate = new Date(voucher.expire_date);

                let status = voucher.status;

                if (Number(voucher.balance) === 0) {
                    status = "Redeemed";
                } else if (expireDate < today) {
                    status = "Expired";
                } else if (issuedDate > today) {
                    status = "Inactive";
                } else {
                    status = "Active";
                }

                return {
                    ...voucher,
                    status
                };
            });

            setVouchers(updatedVouchers);
        } catch (error) {
            console.error("Error fetching vouchers: ", error);
        }
    };

    const fetchCustomerById = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_id: order.customer_name,
                customer_type: "Retail"
            };
            const response = await getCustomerById(localStorage.getItem("userId"));
        } catch (error) {
            console.error("Error fetching vouchers: ", error);
        }
    }

    useEffect(() => {
        fetchAllPendingInvoices();
        fetchItemTypes();
        fetchAllSettings();
        fetchDiscounts();
        fetchVouchers();
    }, [id, invoiceFromState, ordersFromState]);

    useEffect(() => {
        if (settings) {
            setFormData(prev => (
                {
                    ...prev,
                    notes: settings.receipt_notes,
                    terms_and_conditions: settings.receipt_terms,
                }
            ));
        }
    }, [settings]);

    useEffect(() => {
        if (invoice) {
            // Calculate total excluding damaged items
            const total = invoice.items.reduce((sum, item) => {
                // Only add price if item is not damaged
                if (item.is_damaged !== 1) {
                    return sum + parseFloat(item.price);
                }
                return sum;
            }, 0);

            setFormData(prev => (
                {
                    ...prev,
                    total_amount_for_ready: total,
                }
            ));
        }
    }, [invoice]);

    // Fetch get-all-service-items-by-order-id for bill preview: each row = 1 physical item. Total Before Deductions = sum(price) all rows; Returned = sum(price) where is_returned===1; Damaged = sum(price) where is_damaged===1.
    useEffect(() => {
        const orderIds = invoice?.order_ids;
        if (!orderIds?.length) {
            setServiceItemsSummary(null);
            return;
        }
        const userId = localStorage.getItem("userId");
        if (!userId) {
            setServiceItemsSummary(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                let totalBeforeDeductions = 0;
                let returnedDeduction = 0;
                let damagedDeduction = 0;
                const returnedCountByKey = {};
                const damagedCountByKey = {};
                const norm = (v) => (v != null && v !== "") ? String(v).trim() : "";
                const normPrice = (p) => (p != null && p !== "") ? String(parseFloat(Number(p))) : "";
                const getKey = (it) => it.item_id ? String(it.item_id) : `${norm(it.item_type_id)}|${norm(it.remark)}|${norm(it.color)}|${norm(it.brand)}|${norm(it.packing_option)}|${normPrice(it.price)}|${norm(it.service_type_id)}`;
                for (const orderId of orderIds) {
                    const response = await getServiceItemsByOrderId({ user_id: userId, order_id: orderId });
                    if (cancelled) return;
                    let items = [];
                    if (response?.service_items && Array.isArray(response.service_items)) items = response.service_items;
                    else if (response?.items && Array.isArray(response.items)) items = response.items;
                    else if (Array.isArray(response?.data)) items = response.data;
                    else if (Array.isArray(response)) items = response;
                    for (const item of items) {
                        const price = parseFloat(item.price) || 0;
                        totalBeforeDeductions += price;
                        const key = getKey(item);
                        if (item.is_returned === 1 || item.is_returned === "1" || item.is_returned === true) {
                            returnedDeduction += price;
                            returnedCountByKey[key] = (returnedCountByKey[key] || 0) + 1;
                        }
                        if (item.is_damaged === 1 || item.is_damaged === "1" || item.is_damaged === true) {
                            damagedDeduction += price;
                            damagedCountByKey[key] = (damagedCountByKey[key] || 0) + 1;
                        }
                    }
                }
                if (!cancelled) setServiceItemsSummary({ totalBeforeDeductions, returnedDeduction, damagedDeduction, returnedCountByKey, damagedCountByKey });
            } catch (err) {
                console.warn("Error fetching service items for bill preview:", err);
                if (!cancelled) setServiceItemsSummary(null);
            }
        })();
        return () => { cancelled = true; };
    }, [invoice?.order_ids]);


    // When user switches back to Seasonal (e.g. from Credit Card), re-apply the seasonal condition from order date so it displays again
    useEffect(() => {
        if (selectedDiscountType !== "Seasonal" || !invoice || !discounts?.length) return;

        const totalReady = Number(formData.total_amount_for_ready) || 0;
        const orderDateStr = formData.collection_date || invoice?.created_at;
        if (!orderDateStr) return;

        const orderDate = new Date(orderDateStr);
        orderDate.setHours(0, 0, 0, 0);
        const normalizeType = (t) => String(t || "").trim();

        const applicableSeasonal = (discounts || []).filter((d) => {
            if (normalizeType(d?.discount_type) !== "Seasonal") return false;
            if (d?.status === "Deactive") return false;

            const validFrom = d?.valid_from ? new Date(d.valid_from) : null;
            const validTo = d?.valid_to ? new Date(d.valid_to) : null;
            if (validFrom) validFrom.setHours(0, 0, 0, 0);
            if (validTo) validTo.setHours(23, 59, 59, 999);

            if (validFrom && orderDate < validFrom) return false;
            if (validTo && orderDate > validTo) return false;

            const minBill = Number(d?.discount_condition);
            if (!Number.isNaN(minBill) && minBill > 0 && totalReady < minBill) return false;

            return true;
        });

        if (applicableSeasonal.length === 0) return;

        const best = applicableSeasonal.reduce((max, d) => {
            const amount = d.value_type === "Value"
                ? Number(d.value || 0)
                : (totalReady * Number(d.value || 0) / 100);
            return amount > (max?.amount ?? 0) ? { ...d, amount } : max;
        }, null);

        if (best?.discount_id) {
            setSelectedDiscountCondition(String(best.discount_condition ?? ""));
            setSelectedDiscount(best.discount_id);
            setFormData((prev) => ({
                ...prev,
                discount: best.value_type === "Value" ? best.value : `${best.value}%`,
                discount_remark: best.discount_name || "",
            }));
        }
    }, [selectedDiscountType, invoice, discounts, formData.total_amount_for_ready, formData.collection_date]);

    let hasInitialized = false;



    useEffect(() => {
        // Guard: Min Bill is handled in its own useEffect; Seasonal is fixed by order date — do not overwrite when user changes payment method
        if (selectedDiscountType === "Min Bill" || selectedDiscountType === "Seasonal") return;

        if (formData.payment.find(p => p.payment_method === "CARD" && p.card_type === "CREDIT")) {
            const creditCardPayments = formData.payment.filter(
                (p) => p.payment_method === "CARD" && p.card_type === "CREDIT" && p.bank !== ""
            );

            const filteredDiscounts = discounts.filter(discount => {
                // only consider active + valid discounts for auto-application
                if (discount.status === "Deactive") return false;
                if (discount.valid_from && new Date() < new Date(discount.valid_from)) return false;
                if (discount.valid_to && new Date() > new Date(discount.valid_to)) return false;
                if (discount.auto_apply !== 1) return false;
                if (discount?.discount_type === "Credit Card") {
                    return creditCardPayments.some((card) =>
                        discount?.discount_condition?.includes(card.bank)
                    );;
                }
                // Min Bill logic is handled separately now, but keeping for completeness if type not selected
                if (discount?.discount_type === "Min Bill") {
                    return formData.total_amount_for_ready >= Number(discount?.discount_condition);
                }
                if (discount?.discount_type === "Seasonal") {
                    return true; // add more rules if needed
                }
                return false;
            });

            setAvailableDiscounts(filteredDiscounts);

            const maxDiscount = filteredDiscounts.length > 0
                ? filteredDiscounts.reduce((max, d) => {
                    const discountValue = d.value_type === "Value"
                        ? d.value
                        : (formData.total_amount_for_ready * d.value / 100);

                    return discountValue > max.amount
                        ? { ...d, amount: discountValue }
                        : max;
                }, { amount: 0 })
                : null;

            setSelectedDiscount(maxDiscount?.discount_id || null);

            setFormData(prev => ({
                ...prev,
                discount: (maxDiscount && maxDiscount.discount_id)
                    ? (maxDiscount.value_type === "Value"
                        ? maxDiscount.value
                        : `${maxDiscount.value}%`)
                    : 0
            }));
        } else {
            const filteredDiscounts = discounts.filter(discount => {
                // only consider active + valid discounts for auto-application
                if (discount.status === "Deactive") return false;
                if (discount.valid_from && new Date() < new Date(discount.valid_from)) return false;
                if (discount.valid_to && new Date() > new Date(discount.valid_to)) return false;
                if (discount.auto_apply !== 1) return false;
                if (discount?.discount_type === "Min Bill") {
                    return formData.total_amount_for_ready >= Number(discount?.discount_condition);
                }
                if (discount?.discount_type === "Seasonal") {
                    return true;
                }
                return false;
            });

            setAvailableDiscounts(filteredDiscounts);

            const maxDiscount = filteredDiscounts.length > 0
                ? filteredDiscounts.reduce((max, d) => {
                    const discountValue = d.value_type === "Value"
                        ? d.value
                        : (formData.total_amount_for_ready * d.value / 100);

                    return discountValue > max.amount
                        ? { ...d, amount: discountValue }
                        : max;
                }, { amount: 0 })
                : null;

            setSelectedDiscount(maxDiscount?.discount_id || null);

            setFormData(prev => ({
                ...prev,
                discount: (maxDiscount && maxDiscount.discount_id)
                    ? (maxDiscount.value_type === "Value"
                        ? maxDiscount.value
                        : `${maxDiscount.value}%`)
                    : 0
            }));
        }

    }, [formData.total_amount_for_ready, formData.payment.map(p => p.payment_method).join(","), formData.payment.length, discounts, selectedDiscountType]);

    useEffect(() => {
        if (selectedDiscount === "loyalty") {
            setFormData(prev => (
                {
                    ...prev,
                    discount: `${selectedCustomer?.discount}%`,
                    discount_remark: "",
                }
            ));
        } else if (selectedDiscount !== "other" && selectedDiscount !== null && selectedDiscount !== "") {
            const discount = discounts.find(discount => discount.discount_id === selectedDiscount)

            setFormData(prev => (
                {
                    ...prev,
                    discount: discount?.value_type === "Value" ? discount?.value : `${discount?.value}%`,
                    discount_remark: "",
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
    }, [selectedDiscount]);

    useEffect(() => {
        const normalizeType = (t) => String(t || "").trim();

        // reset selected type only when we have API types and current selection isn't in the list
        // (don't clear when discounts not yet loaded, and never clear "Other" which isn't from API)
        const types = new Set(
            (discounts || [])
                .map((d) => normalizeType(d?.discount_type))
                .filter(Boolean)
        );
        if (
            selectedDiscountType &&
            selectedDiscountType !== "Other" &&
            types.size > 0 &&
            !types.has(selectedDiscountType)
        ) {
            setSelectedDiscountType("");
            setSelectedDiscountCondition("");
        }

        // clear selected discount if it's not valid for the selected type anymore
        if (selectedDiscount && selectedDiscount !== "loyalty" && selectedDiscount !== "other") {
            const stillExists = (discounts || []).some((d) => {
                const matchesType = selectedDiscountType
                    ? normalizeType(d?.discount_type) === selectedDiscountType
                    : true;
                return matchesType && d?.discount_id === selectedDiscount;
            });
            if (!stillExists) setSelectedDiscount(null);
        }
    }, [discounts, selectedDiscountType]);

    // Clear discount condition when discount type changes (but not when switching to Seasonal — seasonal condition is auto-set from order date)
    useEffect(() => {
        if (selectedDiscountType !== "Seasonal") {
            setSelectedDiscountCondition("");
        }
    }, [selectedDiscountType]);

    // Clear selected discount if it doesn't match the selected condition
    useEffect(() => {
        if (selectedDiscount && selectedDiscount !== "loyalty" && selectedDiscount !== "other") {
            const discount = discounts.find((d) => d.discount_id === selectedDiscount);
            if (discount && selectedDiscountCondition) {
                let matches = false;

                if (selectedDiscountType === "Credit Card") {
                    const banks = discount.discount_condition
                        ?.split(",")
                        .map((b) => b.trim()) || [];
                    matches = banks.includes(selectedDiscountCondition);
                } else if (selectedDiscountType === "Min Bill") {
                    matches = String(discount.discount_condition) === String(selectedDiscountCondition);
                } else if (selectedDiscountType === "Seasonal") {
                    matches = String(discount.discount_name || discount.discount_condition) === String(selectedDiscountCondition) || String(discount.discount_condition) === String(selectedDiscountCondition);
                }

                if (!matches) {
                    setSelectedDiscount(null);
                }
            }
        }
    }, [selectedDiscountCondition, selectedDiscountType, selectedDiscount, discounts]);

    const handlePrint = useReactToPrint({
        contentRef: invoiceRef
    });

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    const moveItemToReady = (serviceItemId) => {
        setFormData((prev) => {
            const itemToMove = prev.pending_items.find(
                (item) => item.service_item_id === serviceItemId
            );

            if (!itemToMove) return prev;

            const newPending = prev.pending_items.filter(
                (item) => item.service_item_id !== serviceItemId
            );

            const newReady = [...prev.ready_items, itemToMove];

            return {
                ...prev,
                pending_items: newPending,
                ready_items: newReady,
            };
        });
    };

    const moveItemToPending = (serviceItemId) => {
        setFormData((prev) => {
            const itemToMove = prev.ready_items.find(
                (item) => item.service_item_id === serviceItemId
            );

            if (!itemToMove) return prev;

            const newReady = prev.ready_items.filter(
                (item) => item.service_item_id !== serviceItemId
            );

            const newPending = [...prev.pending_items, itemToMove];

            return {
                ...prev,
                pending_items: newPending,
                ready_items: newReady,
            };
        });
    };

    const handleInputNumberChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value === "" ? "" : e.target.value
            }
        ));
    };

    const handleAddVoucher = (voucherData) => {
        const data = {
            voucher_code: voucherData.voucher_code,
            voucher_amount: voucherData.value,
        };

        setFormData(prev => {
            const exists = prev.gift_vouchers.some(
                v => v.voucher_code === voucherData.voucher_code
            );

            let updatedVouchers;
            let updatedTotal = Number(prev.gift_voucher_amount);

            if (exists) {
                // replace existing voucher
                updatedVouchers = prev.gift_vouchers.map(v =>
                    v.voucher_code === voucherData.voucher_code ? data : v
                );

                // recalc total amount
                updatedTotal = updatedVouchers.reduce(
                    (sum, v) => sum + Number(v.voucher_amount),
                    0
                );
            } else {
                // add new voucher
                updatedVouchers = [...prev.gift_vouchers, data];
                updatedTotal += Number(voucherData.value);
            }

            return {
                ...prev,
                gift_vouchers: updatedVouchers,
                gift_voucher_amount: updatedTotal,
            };
        });
    };

    const handleRemoveVoucher = (voucherCode) => {
        setFormData(prev => {
            const updatedVouchers = prev.gift_vouchers.filter(
                v => v.voucher_code !== voucherCode
            );

            const updatedTotal = updatedVouchers.reduce(
                (sum, v) => sum + Number(v.voucher_amount),
                0
            );

            return {
                ...prev,
                gift_vouchers: updatedVouchers,
                gift_voucher_amount: updatedTotal,
            };
        });
    };

    const handleInputChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value
            }
        ));
    };

    const handleInputPercentageChange = (e) => {
        if (/^[0-9.%]*$/.test(e.target.value)) {
            setFormData(prev => ({
                ...prev,
                discount: e.target.value,
            }));
        }
    };

    const handleAddPaymentMethod = () => {
        setFormData((prev) => ({
            ...prev,
            payment: [
                ...prev.payment,
                {
                    payment_method: "",
                    paid_amount: 0,
                    card_type: "",
                    bank: "",
                    card_last_4_digits: "",
                }
            ]
        }));
    }

    const handleCreate = async () => {
        // Use same grouping as RetailInvoice (first occurrence only) so amount due matches the bill
        // The backend expands items (qty N becomes N rows), sharing the same item_id.
        // Group by item_id to recover exactly the original order entry rows.
        const uniqueItemsById = [];
        const seenItemIds = new Set();

        (invoice?.items || []).forEach((item) => {
            const idKey = item.item_id || `${item.item_type_id}|${item.remark}|${item.color}|${item.brand}|${item.packing_option}|${item.price}|${item.service_type_id}`;

            if (!seenItemIds.has(idKey)) {
                seenItemIds.add(idKey);
                const qty = Number(item.quantity) ?? Number(item.qty) ?? 1;
                // Physical pieces (e.g. pcs) — cap returns/damage by this, not by weight/volume quantity (e.g. 3.65 kg)
                const pieceCap = Number(item.pics_count) > 0 ? Number(item.pics_count) : qty;
                const isItemDamaged = item.is_damaged === 1 || item.is_damaged === true || Number(item.is_damaged) === 1 || item.isDamaged === true || Number(item.damaged) === 1;
                const isReturned = item.is_returned === 1 || item.is_returned === true || Number(item.is_returned) === 1;
                const returnedQty = (item.returned_quantity != null && Number(item.returned_quantity) >= 0)
                    ? Math.min(Number(item.returned_quantity), pieceCap)
                    : (isReturned ? 1 : 0);

                uniqueItemsById.push({
                    ...item,
                    quantity: qty,
                    damaged_quantity: isItemDamaged ? qty : 0,
                    returned_quantity: returnedQty
                });
            }
        });
        const formattedItems = uniqueItemsById;

        // Calculate total excluding both damaged AND returned items (same as RetailInvoice and bill preview)
        const deliveryCharge = Number(formData?.delivery_charge) || 0;
        const hasServiceItemsSummary = serviceItemsSummary && (serviceItemsSummary.returnedCountByKey || serviceItemsSummary.damagedCountByKey);
        const norm = (v) => (v != null && v !== "") ? String(v).trim() : "";
        const normPrice = (p) => (p != null && p !== "") ? String(parseFloat(Number(p))) : "";
        const getItemKey = (it) => it.item_id ? String(it.item_id) : `${norm(it.item_type_id)}|${norm(it.remark)}|${norm(it.color)}|${norm(it.brand)}|${norm(it.packing_option)}|${normPrice(it.price)}|${norm(it.service_type_id)}`;
        const localRetCounts = { ...(hasServiceItemsSummary && serviceItemsSummary.returnedCountByKey ? serviceItemsSummary.returnedCountByKey : {}) };
        const localDamCounts = { ...(hasServiceItemsSummary && serviceItemsSummary.damagedCountByKey ? serviceItemsSummary.damagedCountByKey : {}) };

        const totalReady = deliveryCharge + formattedItems.reduce((sum, item) => {
            let rowReturned = item.returned_quantity || 0;
            let rowDamaged = item.damaged_quantity || 0;
            const pieceCap = Number(item.pics_count) > 0 ? Number(item.pics_count) : (Number(item.quantity) || 1);

            if (hasServiceItemsSummary) {
                const itemKey = getItemKey(item);
                if (localRetCounts[itemKey] > 0) {
                    rowReturned = Math.min(localRetCounts[itemKey], pieceCap);
                    localRetCounts[itemKey] -= rowReturned;
                } else {
                    rowReturned = 0;
                }

                if (localDamCounts[itemKey] > 0) {
                    rowDamaged = Math.min(localDamCounts[itemKey], pieceCap);
                    localDamCounts[itemKey] -= rowDamaged;
                } else {
                    rowDamaged = 0;
                }
            }

            // Use same pricePerPiece formula as RetailInvoice so deductions match the displayed bill exactly.
            // When pics_count (number of physical pieces) differs from quantity (weight/volume),
            // the price per physical piece = (qty × unitPrice) / picsCount.
            const picsCount = Number(item.pics_count) || item.quantity;
            const rowTotal = item.quantity * parseFloat(item.price);
            const pricePerPiece = rowTotal / picsCount;
            const damagedAmount = rowDamaged * pricePerPiece;
            const returnedAmount = rowReturned * pricePerPiece;
            return sum + Math.max(0, rowTotal - damagedAmount - returnedAmount);
        }, 0);

        // Compute discount with the same fallback RetailInvoice uses:
        // 1. Use formData.discount if set (may be "5%" or a flat value)
        // 2. Fallback to invoice.discount (raw % number from the order API) — this matches RetailInvoice lines 186-188
        // NOTE: totalReady (computed above from items) already deducts returned/damaged items, so discount % is applied
        //       to the correct post-deduction subtotal — matching exactly what the bill preview shows.
        const rawFormDiscount = formData.discount;
        const hasFormDiscount = rawFormDiscount != null && rawFormDiscount !== "" && rawFormDiscount !== 0 && rawFormDiscount !== "0";
        let discount = 0;
        if (hasFormDiscount) {
            discount = rawFormDiscount?.toString().endsWith('%')
                ? (parseFloat(rawFormDiscount) / 100) * totalReady
                : parseFloat(rawFormDiscount || 0);
        } else if (invoice?.discount != null && invoice.discount !== "" && Number(invoice.discount) > 0) {
            // Fallback: invoice.discount is a raw % number (e.g. 5 means 5%)
            discount = totalReady * Number(invoice.discount) / 100;
        }

        // Filter to only check payment methods that are actually selected
        const selectedPayments = formData.payment.filter(p => p.payment_method !== "");

        // Only calculate total paid from selected payment methods (handle 0, empty string, null, undefined)
        const totalPaid = selectedPayments.reduce(
            (sum, p) => {
                const amount = p.paid_amount;
                // Handle empty string, null, undefined as 0
                if (amount === "" || amount === null || amount === undefined) {
                    return sum;
                }
                const numAmount = Number(amount);
                return sum + (isNaN(numAmount) ? 0 : Math.max(0, numAmount));
            },
            0
        );

        // Use advance from form; fallback to merged order (invoice) so balance is correct when form hasn't got it
        const advancedPayment = Number(formData.advanced_payment ?? "") || Number(invoice?.advance_payment ?? 0);
        const giftVoucherAmount = Number(formData.gift_voucher_amount || 0);
        // amountDue uses billTotalReady (matches bill preview) so entering the displayed amount always clears validation
        const amountDue = Math.round((totalReady - advancedPayment - giftVoucherAmount - discount) * 100) / 100;
        const balance = amountDue - totalPaid;
        const balanceNum = Number(balance);
        const balanceNumRounded = Math.round(balanceNum * 100) / 100;
        const isNumber = !Number.isNaN(balanceNum);

        // Debug logging
        console.log("Invoice validation:", {
            totalReady,
            amountDue,
            advanced_payment: formData.advanced_payment,
            advancedPaymentUsed: advancedPayment,
            invoiceAdvance: invoice?.advance_payment,
            totalPaid,
            gift_voucher_amount: formData.gift_voucher_amount,
            discount,
            formDiscount: formData.discount,
            invoiceDiscount: invoice?.discount,
            balance: balanceNum,
            selectedPayments: selectedPayments.map(p => ({ method: p.payment_method, amount: p.paid_amount }))
        });

        const balanceTolerance = 0.01;
        const amountDueRounded = Math.round(amountDue * 100) / 100;
        const totalPaidRounded = Math.round(totalPaid * 100) / 100;
        // Fully paid: balance <= tolerance OR paid amount >= amount due (so paying the bill amount always works)
        const isFullyPaid = isNumber && (balanceNumRounded <= balanceTolerance || totalPaidRounded >= amountDueRounded - balanceTolerance);

        // Always require a payment method to be selected
        if (selectedPayments.length === 0) {
            setErrorMessage("Please select a payment method.");
            return;
        }

        if (selectedPayments.some(p => p.payment_method === "CARD" && p.card_type === "")) {
            setErrorMessage("Please select a card type.");
            return;
        }
        if (selectedPayments.some(p => p.payment_method === "CARD" && p.bank === "")) {
            setErrorMessage("Please select a bank.");
            return;
        }

        if (isFullyPaid) {
            // Balance is already fully covered (e.g. by advance payment) - allow proceeding
            setErrorMessage("");
        } else {
            // Balance remains: require paid_amount to be entered and to cover it
            const missingAmount = selectedPayments.some(p => {
                const amount = p.paid_amount;
                return amount === "" || amount === null || amount === undefined;
            });
            if (missingAmount) {
                setErrorMessage(`Please enter the amount received (minimum: ${amountDueRounded.toFixed(2)}).`);
                return;
            }

            const invalidPayments = selectedPayments.filter(p => {
                const numAmount = Number(p.paid_amount);
                return isNaN(numAmount) || numAmount < 0;
            });
            if (invalidPayments.length > 0) {
                setErrorMessage("Please enter a valid amount received (0 or more).");
                return;
            }

            // Paid amount must be >= balance due
            if (balanceNumRounded > balanceTolerance) {
                setErrorMessage(`Paid amount must be at least ${amountDueRounded.toFixed(2)} (balance due).`);
                return;
            }
            setErrorMessage("");
        }

        try {
            setIsLoadingSubmit(true);

            // Filter out empty payment methods before sending (allow paid_amount 0 for redo/fully advanced)
            // Format per API: payment_method uppercase (CASH/CARD), paid_amount number, card_type & bank strings
            let validPayments = formData.payment
                .filter(p => p.payment_method !== "" && (p.paid_amount !== "" || p.paid_amount === 0) && !isNaN(Number(p.paid_amount)) && Number(p.paid_amount) >= 0)
                .map(p => ({
                    payment_method: p.payment_method === "CASH" || p.payment_method === "Cash" ? "CASH" : (p.payment_method === "CARD" || p.payment_method === "Card" ? "CARD" : String(p.payment_method || "").toUpperCase()),
                    paid_amount: Number(p.paid_amount),
                    card_type: p.card_type != null ? String(p.card_type) : "",
                    bank: p.bank != null ? String(p.bank) : ""
                }));

            const payload = {
                user_id: localStorage.getItem("userId"),
                invoice_id: "",
                order_ids: formData.order_ids,
                company_address: "",
                customer_id: formData.customer_id,
                customer_name: formData.customer_name,
                phone_number: formData.phone_number,
                delivery_type: formData.delivery_type,
                delivery_outlet: formData.delivery_outlet ?? "",
                delivery_charge: formData.delivery_charge,
                collection_date: formData.collection_date,
                delivery_date: formData.delivery_date,
                gift_vouchers: formData.gift_vouchers,
                gift_voucher_amount: Number(formData.gift_voucher_amount),
                payment: validPayments,
                total_amount_for_ready: Number(totalReady),
                advanced_payment: advancedPayment,
                discount: formData.discount,
                discount_remark: formData.discount_remark,
                balance_due: -Number(balance),
                notes: formData.notes,
                terms_and_conditions: formData.terms_and_conditions,
                branch_id: formData.branch_id
            };

            const response = await createRetailInvoice(payload);
            const newInvoiceId = response?.data?.invoice_id ?? response?.invoice_id;
            if (newInvoiceId != null && newInvoiceId !== "") {
                setFormData((prev) => ({ ...prev, invoice_id: String(newInvoiceId) }));
                setTimeout(() => {
                    handlePrint();
                    navigate(`/salesCorporate/retail/invoice/`);
                }, 150);
            } else {
                handlePrint();
                navigate(`/salesCorporate/retail/invoice/`);
            }
        } catch (error) {
            console.error("Error creating invoice: ", error);
        } finally {
            setIsLoadingSubmit(false);
        }
    }

    const normalizeDiscountType = (t) => String(t || "").trim();
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
    const getDiscountConditionOptions = () => {
        if (!selectedDiscountType) {
            return [];
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const orderDateStr = formData.collection_date || invoice?.created_at;
        const orderDate = orderDateStr ? new Date(orderDateStr) : null;
        if (orderDate) orderDate.setHours(0, 0, 0, 0);

        // Filter active discounts by selected type
        const typeFilteredDiscounts = (discounts || []).filter(
            (d) => {
                if (normalizeDiscountType(d?.discount_type) !== selectedDiscountType) return false;

                if (d?.status === "Deactive") return false;

                if (d?.valid_to) {
                    const validTo = new Date(d.valid_to);
                    validTo.setHours(0, 0, 0, 0);
                    if (validTo < today) {
                        // For Seasonal: also include if order date falls within valid period (so "Black Friday" shows when viewing an order from that period)
                        if (selectedDiscountType === "Seasonal" && orderDate) {
                            const validFrom = d?.valid_from ? new Date(d.valid_from) : null;
                            if (validFrom) validFrom.setHours(0, 0, 0, 0);
                            const validToEnd = new Date(d.valid_to);
                            validToEnd.setHours(23, 59, 59, 999);
                            if (validFrom && orderDate < validFrom) return false;
                            if (orderDate > validToEnd) return false;
                            return true;
                        }
                        return false;
                    }
                }

                return true;
            }
        );

        // Extract unique discount conditions based on type
        const conditions = new Set();

        typeFilteredDiscounts.forEach((discount) => {
            if (selectedDiscountType === "Credit Card") {
                if (!discount.discount_condition) return;
                const banks = String(discount.discount_condition)
                    .split(",")
                    .map((b) => b.trim())
                    .filter(Boolean);
                banks.forEach((bank) => conditions.add(bank));
            } else {
                if (!discount.discount_condition) return;
                conditions.add(discount.discount_condition);
            }
        });

        // Convert to options array and sort
        let options = Array.from(conditions)
            .sort((a, b) => {
                // Sort numbers numerically, strings alphabetically
                if (selectedDiscountType === "Min Bill") {
                    return Number(a) - Number(b);
                }
                return String(a).localeCompare(String(b));
            })
            .map((condition) => ({
                label: String(condition),
                value: String(condition),
            }));

        // When Seasonal is auto-selected on land, the condition may come from a discount valid for order date but expired for "today" — ensure it appears in the dropdown
        if (selectedDiscountType === "Seasonal" && selectedDiscountCondition && String(selectedDiscountCondition).trim() !== "" && !options.some((o) => o.value === selectedDiscountCondition)) {
            options = [...options, { label: String(selectedDiscountCondition), value: String(selectedDiscountCondition) }];
        }

        return options;
    };

    const discountConditionOptions = getDiscountConditionOptions();

    // Filter discounts by type and condition for manual selection (ignore auto_apply/date filters)
    // Memoized so the reference is stable and the useEffect below does not re-run infinitely
    const filteredAvailableDiscounts = useMemo(() => {
        let filtered = discounts || [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const orderDateStr = formData.collection_date || invoice?.created_at;
        const orderDate = orderDateStr ? new Date(orderDateStr) : null;
        if (orderDate) orderDate.setHours(0, 0, 0, 0);

        // Exclude expired discounts; for Seasonal also keep discounts valid for the order date (e.g. Black Friday when viewing an order from that period)
        filtered = filtered.filter((d) => {
            if (!d?.valid_to) return true;
            const validTo = new Date(d.valid_to);
            validTo.setHours(0, 0, 0, 0);
            if (validTo >= today) return true;
            if (selectedDiscountType === "Seasonal" && orderDate && normalizeDiscountType(d?.discount_type) === "Seasonal") {
                const validFrom = d?.valid_from ? new Date(d.valid_from) : null;
                const validToEnd = new Date(d.valid_to);
                validToEnd.setHours(23, 59, 59, 999);
                if (validFrom) validFrom.setHours(0, 0, 0, 0);
                if (validFrom && orderDate < validFrom) return false;
                if (orderDate > validToEnd) return false;
                return true;
            }
            return false;
        });

        // Filter by discount type
        if (selectedDiscountType) {
            filtered = filtered.filter(
                (d) => normalizeDiscountType(d?.discount_type) === selectedDiscountType
            );
        }

        // Filter by discount condition if selected
        if (selectedDiscountCondition && selectedDiscountType) {
            filtered = filtered.filter((d) => {
                if (selectedDiscountType === "Credit Card") {
                    if (!d.discount_condition) return false;
                    // For Credit Card, check if condition includes the selected bank
                    const banks = d.discount_condition
                        .split(",")
                        .map((b) => b.trim());
                    return banks.includes(selectedDiscountCondition);
                } else if (selectedDiscountType === "Min Bill") {
                    if (!d.discount_condition) return false;
                    return String(d.discount_condition) === String(selectedDiscountCondition);
                } else if (selectedDiscountType === "Seasonal") {
                    return String(d.discount_name || d.discount_condition) === String(selectedDiscountCondition) || String(d.discount_condition) === String(selectedDiscountCondition);
                }
                return true;
            });
        }

        return filtered;
    }, [discounts, selectedDiscountType, selectedDiscountCondition, invoice, formData.collection_date]);

    // Min Bill: auto-apply the "nearest" discount (largest threshold <= total amount for ready)
    useEffect(() => {
        if (selectedDiscountType !== "Min Bill") return;

        const totalReady = Number(formData.total_amount_for_ready) || 0;
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
            return true;
        });

        const applicable = minBillDiscounts
            .filter((d) => Number(d.discount_condition) <= totalReady)
            .sort((a, b) => Number(b.discount_condition) - Number(a.discount_condition));

        const best = applicable[0];
        if (best && best.discount_id) {
            setSelectedDiscount(best.discount_id);
            setFormData((prev) => ({
                ...prev,
                discount: best.value_type === "Value" ? best.value : `${best.value}%`,
                discount_remark: best.discount_name || "",
            }));
        } else {
            setSelectedDiscount(null);
            setFormData((prev) => ({ ...prev, discount: "", discount_remark: "" }));
        }
    }, [selectedDiscountType, formData.total_amount_for_ready, discounts]);

    // When a discount condition is selected (Credit Card / Seasonal), pick the best matching discount
    useEffect(() => {
        if (!selectedDiscountType || selectedDiscountType === "Min Bill" || selectedDiscountType === "Other") return;
        if (!selectedDiscountCondition) {
            setSelectedDiscount(null);
            setFormData((prev) => ({ ...prev, discount: "", discount_remark: "" }));
            return;
        }

        if (!filteredAvailableDiscounts || filteredAvailableDiscounts.length === 0) {
            setSelectedDiscount(null);
            setFormData((prev) => ({ ...prev, discount: "", discount_remark: "" }));
            return;
        }

        const maxDiscount = filteredAvailableDiscounts.reduce((max, d) => {
            const discountValue = d.value_type === "Value"
                ? Number(d.value || 0)
                : (formData.total_amount_for_ready * Number(d.value || 0) / 100);

            return discountValue > max.amount
                ? { ...d, amount: discountValue }
                : max;
        }, { amount: 0 });

        if (maxDiscount && maxDiscount.discount_id) {
            setSelectedDiscount(maxDiscount.discount_id);
            setFormData((prev) => ({
                ...prev,
                discount: maxDiscount.value_type === "Value"
                    ? maxDiscount.value
                    : `${maxDiscount.value}%`,
                discount_remark: maxDiscount.discount_name || "",
            }));
        }
    }, [selectedDiscountType, selectedDiscountCondition, filteredAvailableDiscounts, formData.total_amount_for_ready]);

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

    if (!allowed) return <PermissionDenied required="SalesRetail_Invoice_Pending_Invoiced_Order_Create" label="Generate Invoice" />;

    return (
        <div className="flex flex-col ">
            <div className="relative z-20 flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/invoice/${id}`)} />
                <h1 className="text-3xl text-primary font-bold">Order/{id}/Generate Invoice</h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Generate invoice for order.</p>

            {isLoading &&
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            }

            {/* {stage === 1 && !isLoading &&
                <div>
                    <div className="grid grid-cols-2 gap-x-5">
                        <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3 h-fit">
                            <div className="flex flex-row justify-between items-center">
                                <h2 className="text-2xl font-medium">Pending ({formData.pending_items.length ?? 0} Items)</h2>
                            </div>

                            <div className="rounded-xl border border-black/50 overflow-hidden">
                                <div className="text-sm grid grid-cols-5 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                                    <p className="text-start">ITEM</p>
                                    <p>COLOUR</p>
                                    <p>BRAND</p>
                                    <p>BARCODE</p>
                                    <p>ACTION</p>
                                </div>

                                {formData.pending_items.map((orderItem, index) => (
                                    <div key={index} className={`grid grid-cols-5 gap-x-3 text-xs py-1.5 px-3 text-center ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                        <p className="text-start">{itemTypes.find(type => type.item_type_id === orderItem.item_type_id)?.item_type_name}</p>
                                        <p>{orderItem.color}</p>
                                        <p>{orderItem.brand}</p>
                                        <p>{orderItem.barcode}</p>
                                        <Icon
                                            icon={"tdesign:send-filled"}
                                            className="mx-auto text-green-500 cursor-pointer"
                                            onClick={() => moveItemToReady(orderItem.service_item_id)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3 h-fit">
                            <div className="flex flex-row justify-between items-center">
                                <h2 className="text-2xl font-medium">Received ({formData.ready_items.length} Items)</h2>
                            </div>

                            <div className="rounded-xl border border-black/50 overflow-hidden">
                                <div className="text-sm grid grid-cols-5 gap-x-3 text-white bg-primary font-semibold py-2 px-3 text-center">
                                    <p className="text-start">ITEM</p>
                                    <p>COLOUR</p>
                                    <p>BRAND</p>
                                    <p>BARCODE</p>
                                    <p>ACTION</p>
                                </div>

                                {formData.ready_items.map((orderItem, index) => (
                                    <div key={index} className={`grid grid-cols-5 gap-x-3 text-xs py-1.5 px-3 text-center ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                        <p className="text-start">{itemTypes.find(type => type.item_type_id === orderItem.item_type_id)?.item_type_name}</p>
                                        <p>{orderItem.color}</p>
                                        <p>{orderItem.brand}</p>
                                        <p>{orderItem.barcode}</p>
                                        <Icon
                                            icon={"tdesign:send-filled"}
                                            className="rotate-180 mx-auto text-red-500 cursor-pointer"
                                            onClick={() => moveItemToPending(orderItem.service_item_id)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row justify-between mt-5">
                        <Link to={`/salesCorporate/retail/invoice/${id}`} className="cursor-pointer bg-black/50 text-white font-bold text-2xl px-10 py-2 mb-5 rounded-full">Back</Link>

                        <p className="text-red-500 font-medium text-lg text-center px-5">{errorMessage}</p>

                        <button
                            className="cursor-pointer bg-primary text-white font-bold text-2xl px-3 py-2 mb-5 rounded-full"
                            onClick={() => {
                                if (formData.ready_items.length === 0) {
                                    setErrorMessage("Please select at least one item to generate the invoice.");
                                    return;
                                } else {
                                    setErrorMessage("");
                                }
                                setStage(2);
                            }}
                        >Confirm & Generate Invoice</button>
                    </div>
                </div>
            } */}

            {/* {stage === 2 && */}
            {!isLoading &&
                <div>
                    <div className="flex flex-row gap-x-3 items-center">
                        <Icon icon={"material-symbols:refresh"} className="bg-primary/20 text-primary rounded-full p-1 size-6" />
                        <h2 className="text-2xl font-semibold">Bill Preview</h2>
                    </div>

                    <div className="grid grid-cols-4">
                        <main className="col-span-3 border-r border-black/20 pe-3">
                            {formData.order_ids.length > 0 &&
                                <RetailInvoice ref={invoiceRef} data={formData} order={invoice} itemTypes={itemTypes} serviceItemsSummary={serviceItemsSummary} />
                            }

                            <div className="flex flex-row text-xl my-5 justify-between">
                                <button
                                    type="button"
                                    className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={() => navigate('/salesCorporate/retail/invoice/')}
                                    disabled={isLoadingSubmit}
                                >
                                    Close
                                </button>

                                <p className="text-red-500 font-medium text-lg text-center px-5">{errorMessage}</p>

                                <button
                                    type="button"
                                    className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                    onClick={() => {
                                        // if (orders.length === 0) {
                                        //     alert("Please add at least one item to the order before proceeding.");
                                        //     return;
                                        // } else if (!formData.delivery_type) {
                                        //     alert("Please select a delivery type before proceeding.");
                                        //     return;
                                        // } else {
                                        //     setStage(3);
                                        // }
                                        handleCreate();
                                    }}
                                    disabled={isLoadingSubmit}
                                >
                                    {isLoadingSubmit ? <BeatLoader color="#fff" size={10} /> : "Create Order & Print Receipt"}
                                </button>
                            </div>
                        </main>

                        <aside className="px-3">
                            {(() => {
                                return formData.payment.map((p, index) => (
                                    <div className="mb-5" key={index}>
                                        <div className="grow flex flex-col mb-3">
                                            <div className="flex flex-row justify-between items-center">
                                                <label className="text-xl font-semibold" htmlFor="payment_method">Select Payment Method:</label>
                                                {formData.payment.length > 1 &&
                                                    <BiMinus
                                                        className="text-red-500 cursor-pointer"
                                                        onClick={() =>
                                                            setFormData((prev) => ({
                                                                ...prev,
                                                                payment: prev.payment.filter((_, i) => i !== index),
                                                            }))
                                                        }
                                                    />
                                                }
                                            </div>
                                            <Select
                                                id="payment_method"
                                                className="w-full"
                                                styles={selectStyles}
                                                options={paymentOptions}
                                                value={paymentOptions.find(option => option.value === p.payment_method)}
                                                onChange={(option) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index
                                                                ? {
                                                                    ...pay,
                                                                    payment_method: option.value,
                                                                    card_type: "",
                                                                    bank: "",
                                                                    card_last_4_digits: "",
                                                                }
                                                                : pay
                                                        ),
                                                    }))
                                                }
                                                filterOption={selectFilter}
                                            />
                                        </div>

                                        {p.payment_method === "CARD" &&
                                            <div className="grow flex flex-col mb-3">
                                                <label className="text-xl font-semibold" htmlFor="card_type">Card Type:</label>
                                                <Select
                                                    id="card_type"
                                                    className="w-full"
                                                    styles={selectStyles}
                                                    options={cardTypeOptions}
                                                    value={cardTypeOptions.find(option => option.value === p.card_type)}
                                                    onChange={(option) =>
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            payment: prev.payment.map((pay, i) =>
                                                                i === index
                                                                    ? {
                                                                        ...pay,
                                                                        card_type: option.value,
                                                                    }
                                                                    : pay
                                                            ),
                                                        }))
                                                    }
                                                    filterOption={selectFilter}
                                                />
                                            </div>
                                        }

                                        {p.payment_method === "CARD" &&
                                            <div className="grow flex flex-col mb-3">
                                                <label className="text-xl font-semibold" htmlFor="bank">Bank:</label>
                                                <Select
                                                    id="bank"
                                                    className="w-full"
                                                    styles={selectStyles}
                                                    options={bankOptions}
                                                    value={bankOptions.find(option => option.value === p.bank)}
                                                    onChange={(option) =>
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            payment: prev.payment.map((pay, i) =>
                                                                i === index
                                                                    ? {
                                                                        ...pay,
                                                                        bank: option.value,
                                                                    }
                                                                    : pay
                                                            ),
                                                        }))
                                                    }
                                                    filterOption={selectFilter}
                                                />
                                            </div>
                                        }

                                        <div className="grow flex flex-col mb-3">
                                            <label className="text-xl font-semibold" htmlFor={`paid_amount_${index}`}>Amount:</label>
                                            {/* <input
                                                type="number"
                                                min={0}
                                                id={`paid_amount_${index}`}
                                                name="paid_amount"
                                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg"
                                                value={p.paid_amount}
                                                onChange={(e) => {
                                                    const inputValue = e.target.value;
                                                    // Allow empty string or valid number (including 0)
                                                    if (inputValue === "") {
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            payment: prev.payment.map((pay, i) =>
                                                                i === index ? { ...pay, paid_amount: "" } : pay
                                                            ),
                                                        }));
                                                        return;
                                                    }
                                                    const value = Number(inputValue);
                                                    if (isNaN(value) || value < 0) return;

                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, paid_amount: value } : pay
                                                        ),
                                                    }));
                                                }}
                                            /> */}
                                            <input
                                                type="number"
                                                min={0}
                                                id={`paid_amount_${index}`}
                                                name="paid_amount"
                                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg"
                                                value={p.paid_amount}
                                                //avoide "-" and "e"

                                                onKeyDown={(e) => {
                                                    if (e.key === "-" || e.key === "e") {
                                                        e.preventDefault();
                                                    }
                                                }}

                                                onChange={(e) => {
                                                    const inputValue = e.target.value;

                                                    // Allow empty string
                                                    if (inputValue === "") {
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            payment: prev.payment.map((pay, i) =>
                                                                i === index ? { ...pay, paid_amount: "" } : pay
                                                            ),
                                                        }));
                                                        return;
                                                    }

                                                    const value = Number(inputValue);

                                                    // Prevent negative values
                                                    if (isNaN(value) || value < 0) return;

                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        payment: prev.payment.map((pay, i) =>
                                                            i === index ? { ...pay, paid_amount: value } : pay
                                                        ),
                                                    }));
                                                }}
                                            />
                                        </div>

                                        {p.payment_method === "CARD" && p.bank &&
                                            <div className="grow flex flex-col">
                                                <label className="text-xl font-semibold" htmlFor={`last4-${index}`}>Last 4 digits:</label>
                                                <input
                                                    type="text"
                                                    id={`last4-${index}`}
                                                    className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg"
                                                    maxLength={4}
                                                    value={p.card_last_4_digits || ""}
                                                    onChange={(e) => {
                                                        const sanitized = e.target.value.replace(/\D/g, "").slice(0, 4);
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            payment: prev.payment.map((pay, i) =>
                                                                i === index
                                                                    ? {
                                                                        ...pay,
                                                                        card_last_4_digits: sanitized,
                                                                    }
                                                                    : pay
                                                            ),
                                                        }));
                                                    }}
                                                />
                                            </div>
                                        }
                                    </div>
                                ));
                            })()}

                            <button className="border border-dashed border-primary rounded-xl w-full py-1 text-lg bg-white text-primary mt-3" onClick={handleAddPaymentMethod}>Add Payment Method</button>

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

                            {/* Discount Condition: dropdown for all types (Credit Card, Seasonal, etc.) */}
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
                                    {isPercentageDiscount && discountNumericValue !== "" && Number(formData.total_amount_for_ready) > 0 &&
                                        <p className="text-sm text-black/50">
                                            = Rs. {(Number(formData.total_amount_for_ready) * Number(discountNumericValue) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off
                                        </p>
                                    }
                                </div>
                            }

                            {/* <div className="grow flex flex-col">
                                <label className="text-xl font-semibold" htmlFor="voucher_button">Add Gift Voucher:</label>
                                {formData.gift_vouchers.map(v => (
                                    <div className="flex flex-row my-1 items-center text-lg font-semibold gap-x-3">
                                        <p>{v.voucher_code}</p>
                                        <p className="ms-auto">Rs. {v.voucher_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        <BiMinus className="text-red-500 cursor-pointer" onClick={() => handleRemoveVoucher(v.voucher_code)} />
                                    </div>
                                ))}
                                <button id="voucher_button" className="cursor-pointer border border-primary text-primary font-medium bg-white px-3 rounded-xl py-1 text-lg" onClick={() => setShowAddVoucherDialog(true)}>Add Voucher</button>
                            </div> */}

                            {/* <div className="grow flex flex-col">
                                <label className="text-xl font-semibold" htmlFor="payment_method">Discount:</label>
                                <input type="text" id="discount" name="discount" className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg" value={formData.discount} onChange={handleInputPercentageChange} />
                            </div> */}

                            {/* Discount is now applied automatically based on Discount Type + Discount Condition.
                                The manual discount dropdown and custom value/remark fields were removed as requested. */}

                            <div className="grow flex flex-col">
                                <label className="text-xl font-semibold" htmlFor="note">Enter Note:</label>
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
                                <label className="text-xl font-semibold" htmlFor="tAndC">Enter Terms & Conditions:</label>
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
            {/* } */}

            {showAddVoucherDialog &&
                <RetailRedeemVoucherDialog
                    vouchers={vouchers}
                    handleClose={() => setShowAddVoucherDialog(false)}
                    addVoucher={handleAddVoucher}
                    invoiceData={invoice}
                    data={formData}
                />
            }
        </div>
    );
};

export default SalesRetailGenerateInvoice;