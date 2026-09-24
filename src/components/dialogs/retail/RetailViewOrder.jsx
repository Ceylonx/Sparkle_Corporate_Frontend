import { useRef, useState, useEffect } from "react";
import RetailIssueVoucherForm from "../../forms/retail/RetailIssueVoucherForm";
import RetailSalesOrder from "../../printables/RetailSalesOrder";
import { useReactToPrint } from "react-to-print";
import { BeatLoader } from "react-spinners";
import { deactivateRetailOrder, getRetailOrderById, incrementRetailOrderPrintCount } from "../../../services/Retail/RetailOrderServices";
import { getCustomerById } from "../../../services/CustomerServices";
import { hasPermission } from "../../../utils/permissionHelper";

const RetailViewOrder = ({ handleClose, refreshOrders, orderItems, data, customer, itemTypes, serviceTypes }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [orderData, setOrderData] = useState(data);
    const [customerData, setCustomerData] = useState(customer || null);
    const salesOrderRef = useRef(null);

    // Fetch full order details and customer (with discount) when viewing order
    useEffect(() => {
        const fetchOrderDetails = async () => {
            if (!data?.order_id) return;
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            // Fetch customer by ID first so Discount / Loyalty Discount show same as Add New Order
            let apiCustomer = null;
            let discountValue = null;
            const customerId = data.customer_id;
            if (customerId) {
                try {
                    const customerPayload = {
                        user_id: userId,
                        customer_id: customerId,
                        customer_type: "Retail"
                    };
                    const customerResponse = await getCustomerById(customerPayload);
                    const d = customerResponse?.data;
                    apiCustomer = d?.customer ?? customerResponse?.customer ?? null;
                    discountValue = apiCustomer?.discount ?? d?.discount ?? customerResponse?.discount;
                    if (apiCustomer) {
                        setCustomerData({ ...apiCustomer, discount: discountValue });
                    } else if (discountValue !== undefined && discountValue !== null) {
                        setCustomerData({ discount: discountValue });
                    }
                } catch (custErr) {
                    console.error("Error fetching customer for View Order:", custErr);
                }
            }

            try {
                const orderPayload = {
                    user_id: userId,
                    order_id: data.order_id
                };
                const response = await getRetailOrderById(orderPayload);
                if (response?.order) {
                    const mergedOrder = {
                        ...data,
                        ...response.order,
                        updated_at: response.order.updated_at || response.order.created_at,
                        updated_by_role: response.order.updated_by_role
                    };
                    const orderDiscount = mergedOrder.discount != null && mergedOrder.discount !== ""
                        ? mergedOrder.discount
                        : (discountValue != null ? `${discountValue}%` : undefined);
                    const orderDiscountRemark = mergedOrder.discount_remark || (discountValue != null ? "Loyalty" : undefined);
                    setOrderData({
                        ...mergedOrder,
                        ...(orderDiscount != null && { discount: orderDiscount }),
                        ...(orderDiscountRemark != null && { discount_remark: orderDiscountRemark })
                    });
                } else {
                    // No order from API: still apply customer discount to data so bill shows it
                    const orderDiscount = data.discount != null && data.discount !== "" ? data.discount : (discountValue != null ? `${discountValue}%` : undefined);
                    const orderDiscountRemark = data.discount_remark || (discountValue != null ? "Loyalty" : undefined);
                    setOrderData({
                        ...data,
                        ...(orderDiscount != null && { discount: orderDiscount }),
                        ...(orderDiscountRemark != null && { discount_remark: orderDiscountRemark })
                    });
                }
            } catch (error) {
                console.error("Error fetching order details:", error);
                const orderDiscount = data.discount != null && data.discount !== "" ? data.discount : (discountValue != null ? `${discountValue}%` : undefined);
                const orderDiscountRemark = data.discount_remark || (discountValue != null ? "Loyalty" : undefined);
                setOrderData({
                    ...data,
                    ...(orderDiscount != null && { discount: orderDiscount }),
                    ...(orderDiscountRemark != null && { discount_remark: orderDiscountRemark })
                });
            }
        };
        fetchOrderDetails();
    }, [data?.order_id, data?.customer_id]);

    const normalizedOrderItems = (() => {
        const source = orderData?.items ?? orderItems;
        if (Array.isArray(source)) return source;
        if (source && typeof source === "object") return [source];
        return [];
    })();

    const handlePrint = useReactToPrint({
        contentRef: salesOrderRef
    });

    const onPrintClick = async () => {
        if (orderData?.order_id) {
            try {
                await incrementRetailOrderPrintCount({
                    order_id: orderData.order_id
                });
            } catch (error) {
                console.error("Error incrementing print count:", error);
            }
        }
        handlePrint();
    };

    const handleDeactivate = async () => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: orderData.order_id
            };
            const response = await deactivateRetailOrder(payload);
            handleClose();
            refreshOrders();
        } catch (error) {
            console.error("Error deactivating order: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">View Order</h1>

                {(orderData.redo_order_reference || Number(orderData.total_amount) === 0) && (
                    <div className="bg-neutral-100 rounded-xl p-3 mb-3 text-center border border-neutral-200">
                        <p className="font-bold text-base">REDO{orderData.redo_order_reference ? `: ${orderData.redo_order_reference}` : ""}</p>
                    </div>
                )}

                <RetailSalesOrder
                    ref={salesOrderRef}
                    orderItems={normalizedOrderItems}
                    data={{
                        ...orderData,
                        discount: orderData.discount != null && orderData.discount !== ""
                            ? orderData.discount
                            : (customerData?.discount != null ? `${customerData.discount}%` : orderData.discount),
                        discount_remark: orderData.discount_remark || (customerData?.discount != null ? "Loyalty" : orderData.discount_remark)
                    }}
                    customer={customerData || customer}
                    itemTypes={itemTypes}
                    serviceTypes={serviceTypes}
                />

                <div className="flex flex-row">
                    <button className="cursor-pointer bg-primary text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={onPrintClick} disabled={isLoading}>Print</button>
                    {orderData.can_update === 1 && orderData.status !== "Deactive" && hasPermission("SalesRetail_Order_Delete") &&
                        <button className="cursor-pointer bg-red-500 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handleDeactivate} disabled={isLoading}>{isLoading ? <BeatLoader color="#fff" size={10} /> : "Cancel Order"}</button>
                    }
                    <button className="cursor-pointer bg-black/50 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handleClose} disabled={isLoading}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default RetailViewOrder;