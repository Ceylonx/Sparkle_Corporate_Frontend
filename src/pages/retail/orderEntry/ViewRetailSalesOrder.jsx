import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import RetailSalesOrder from "../../../components/printables/RetailSalesOrder";
import { getViewRetailOrderById, incrementRetailOrderPrintCount } from "../../../services/Retail/RetailOrderServices";
import { getViewCustomerById } from "../../../services/CustomerServices";
import { getViewAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { getViewAllServiceTypes } from "../../../services/ServiceTypeServices";
import { BeatLoader } from "react-spinners";

const ViewRetailSalesOrder = () => {
    const { id } = useParams();
    const componentRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [orderData, setOrderData] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [orderItems, setOrderItems] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [createdDate, setCreatedDate] = useState("");
    const [error, setError] = useState(null);

    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `Retail_Sales_Order_${id}`,
        onBeforeGetContent: () => {
            // Ensure component is ready
            if (!componentRef.current) {
                console.warn('Print content not ready');
            }
        },
    });

    useEffect(() => {
        const fetchOrderData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Fetch order by ID
                const payload = {
                    user_id: localStorage.getItem("userId") || "",
                    order_id: id
                };

                const orderResponse = await getViewRetailOrderById(payload);

                if (!orderResponse || !orderResponse.order) {
                    setError("Order not found");
                    setIsLoading(false);
                    return;
                }

                const order = orderResponse.order;
                setOrderData(order);
                setCreatedDate(order.created_at ? order.created_at.split('T')[0] : "");

                // Format order items
                const formattedItems = order.items.map(({ created_at, status, ...rest }) => ({
                    ...rest,
                    price: Number(rest.price)
                }));
                setOrderItems(formattedItems);

                // Fetch customer data
                if (order.customer_id) {
                    const customerPayload = {
                        user_id: localStorage.getItem("userId") || "",
                        customer_id: order.customer_id,
                        customer_type: "Retail"
                    };

                    try {
                        const customerResponse = await getViewCustomerById(customerPayload);
                        if (customerResponse && customerResponse.data && customerResponse.data.customer) {
                            setCustomer(customerResponse.data.customer);
                        }
                    } catch (customerError) {
                        console.error("Error fetching customer:", customerError);
                    }
                }

                // Fetch item types
                try {
                    const itemTypesResponse = await getViewAllItemTypes();
                    if (itemTypesResponse && itemTypesResponse.data && itemTypesResponse.data.item_types) {
                        setItemTypes(itemTypesResponse.data.item_types);
                    }
                } catch (itemTypesError) {
                    console.error("Error fetching item types:", itemTypesError);
                }

                // Fetch service types
                try {
                    const serviceTypesResponse = await getViewAllServiceTypes();
                    if (serviceTypesResponse && serviceTypesResponse.data && serviceTypesResponse.data.service_types) {
                        setServiceTypes(serviceTypesResponse.data.service_types);
                    }
                } catch (serviceTypesError) {
                    console.error("Error fetching service types:", serviceTypesError);
                }

            } catch (error) {
                console.error("Error fetching order data:", error);
                setError("Failed to load order data. Please try again.");
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchOrderData();
        }
    }, [id]);

    const onPrintClick = async () => {
        console.log("Print button clicked for order:", id);
        try {
            const payload = {
                order_id: id
            };
            console.log("Calling incrementRetailOrderPrintCount with payload:", payload);
            const res = await incrementRetailOrderPrintCount(payload);
            console.log("Increment API response:", res);
        } catch (error) {
            console.error("Error incrementing print count:", error);
        }
        handlePrint();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <BeatLoader color="#1470F9" loading={isLoading} size={15} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-red-500 text-lg font-semibold mb-4">{error}</p>
                    <p className="text-gray-600">Order ID: {id}</p>
                </div>
            </div>
        );
    }

    if (!orderData || !customer) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-gray-600 text-lg">Loading order details...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">Retail Sales Order - {orderData.order_id}</h1>
                    <button
                        onClick={onPrintClick}
                        className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Print Order
                    </button>
                </div>
                <RetailSalesOrder
                    ref={componentRef}
                    data={orderData}
                    orderItems={orderItems}
                    customer={customer}
                    itemTypes={itemTypes}
                    serviceTypes={serviceTypes}
                    createdDate={createdDate}
                />
            </div>
        </div>
    );
};

export default ViewRetailSalesOrder;
