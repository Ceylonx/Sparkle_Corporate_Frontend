import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { getServiceItemsByOrderId } from "../../../services/Retail/RetailInvoiceServices";
import { useEffect, useState } from "react";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { BeatLoader } from "react-spinners";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";

const SalesRetailViewInvoice = () => {
    const { allowed } = usePagePermission("SalesRetail_Invoice_View");
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const orderFromState = location.state?.order;
    const ids = id.split(",");
    const [isLoading, setIsLoading] = useState(false);
    const [invoice, setInvoice] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    const fetchAllPendingInvoices = async () => {
        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            const orderFromLocation = location.state?.order;
            
            if (!userId) {
                setIsLoading(false);
                return;
            }

            // Use the first order ID from the URL params
            const orderId = ids[0];
            
            if (!orderId) {
                setIsLoading(false);
                return;
            }

            // Fetch service items using the new API
            const payload = {
                user_id: userId,
                order_id: orderId
            };
            
            const response = await getServiceItemsByOrderId(payload);
            console.log("[ViewInvoice] getServiceItemsByOrderId response:", response);
            
            // Extract items from the response
            let items = [];
            if (response?.service_items && Array.isArray(response.service_items)) {
                items = response.service_items;
            } else if (response?.items && Array.isArray(response.items)) {
                items = response.items;
            } else if (Array.isArray(response)) {
                items = response;
            }

            // Build the invoice object using order data from state and items from API
            const orderData = orderFromLocation || {};
            const mergedOrder = {
                order_id: orderId,
                customer_id: orderData.customer_id || response?.customer_id,
                customer_name: orderData.customer_name || response?.customer_name,
                phone_number: orderData.phone_number || response?.phone_number,
                redo_order_reference: orderData.redo_order_reference || response?.redo_order_reference,
                created_at: orderData.created_at || response?.created_at,
                delivery_type: orderData.delivery_type || response?.delivery_type,
                delivery_date: orderData.delivery_date || response?.delivery_date,
                delivery_outlet: orderData.delivery_outlet || response?.delivery_outlet,
                branch_id: orderData.branch_id || response?.branch_id,
                delivery_charge: parseFloat(orderData.delivery_charge || response?.delivery_charge || 0),
                created_by: orderData.created_by || orderData.user_id || response?.created_by,
                user_id: orderData.user_id || orderData.created_by || response?.user_id,
                created_by_name: orderData.created_by_name || response?.created_by_name,
                created_by_user_name: orderData.created_by_user_name || response?.created_by_user_name,
                user_name: orderData.user_name || response?.user_name,
                status: orderData.status || orderData.order_status || response?.status,
                order_status: orderData.order_status || orderData.status || response?.order_status,
                order_ids: [orderId],
                advance_payment: parseFloat(orderData.advance_payment || response?.advance_payment || 0),
                remaining_amount: parseFloat(orderData.remaining_amount || response?.remaining_amount || 0),
                total_amount: parseFloat(orderData.total_amount || response?.total_amount || 0),
                discount: parseFloat(orderData.discount || response?.discount || 0),
                items: items
            };

            console.log("[ViewInvoice] Merged order with items:", mergedOrder);
            setInvoice(mergedOrder);
        } catch (error) {
            console.error("Error fetching order details: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response?.data?.item_types || []);
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
            setItemTypes([]); // Ensure it's always an array even on error
        }
    };

    useEffect(() => {
        fetchAllPendingInvoices();
        fetchItemTypes();
    }, [id, location.state]);

    if (!allowed) return <PermissionDenied required="SalesRetail_Invoice_View" label="Invoice" />;

    //price per item = (price * quantity) / pics_count/// if not, use Number(order.price)
    const pricePerItem = (order) => {
        let price = (order.price * order.quantity) / order.pics_count;
        return price;
    };

    return (
        <div className="flex flex-col ">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/invoice`)} />
                <h1 className="text-3xl text-primary font-bold">Order/{id}</h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Generate invoice for order.</p>
            {(invoice?.redo_order_reference || Number(invoice?.total_amount) === 0) && (
                <div className="bg-white rounded-xl p-5 mb-3">
                    <p className="font-bold text-base">REDO{invoice.redo_order_reference ? `: ${invoice.redo_order_reference}` : ""}</p>
                </div>
            )}

            {isLoading &&
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            }

            {!isLoading && !invoice &&
                <div className="bg-white rounded-xl p-5 text-center text-black/60">Order not found. Go back to the list and open View again.</div>
            }

            {!isLoading && invoice && (!invoice.items || invoice.items.length === 0) &&
                <div className="bg-white rounded-xl p-5 text-center text-black/60">No items found for this order.</div>
            }

            {/* Display all items in a single paginated table */}
            {invoice?.items?.length > 0 && (() => {
                const allItems = invoice.items;
                const totalItems = allItems.length;
                const totalPages = Math.ceil(totalItems / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const currentItems = allItems.slice(startIndex, endIndex);

                const getServiceTypeName = (order) => {
                    if (order?.service_type_name) return order.service_type_name;
                    switch (order?.service_type_id) {
                        case 1: return "Washing";
                        case 2: return "Pressing";
                        case 3: return "Dry Clean";
                        default: return "-";
                    }
                };

                return (
                    <div className="flex flex-col gap-y-3 bg-white rounded-xl p-5 mb-3">
                        <div className="flex flex-row justify-between items-center">
                            <h2 className="text-2xl font-medium">Order Items ({totalItems} Items)</h2>
                        </div>

                        <div className="rounded-xl border border-black/50 overflow-hidden">
                            <div className="text-sm grid grid-cols-11 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                <p>ITEM</p>
                                <p>SERVICE</p>
                                <p>COLOUR</p>
                                <p>BRAND</p>
                                <p className="col-span-2">REMARK</p>
                                <p>PACKING</p>
                                <p>BARCODE</p>
                                <p>PRICE</p>
                                <p className="text-center">CONDITION</p>
                                <p className="text-center">STATUS</p>
                            </div>

                            {currentItems.map((order, index) => (
                                <div key={index} className={`grid grid-cols-11 gap-x-3 text-xs py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                    <p>{itemTypes?.find(type => type.item_type_id === order.item_type_id)?.item_type_name || "-"}</p>
                                    <p>{getServiceTypeName(order)}</p>
                                    <p>{order.color || "-"}</p>
                                    <p>{order.brand || "-"}</p>
                                    <p className="col-span-2">{order.remark || "-"}</p>
                                    <p>{order.packing_option || "-"}</p>
                                    <p>{order.barcode || "-"}</p>
                                    <p>Rs {Number(pricePerItem(order)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p className={`text-center ${order.is_returned === 1 ? "text-blue-600 font-semibold" : order.is_damaged === 1 ? "text-red-500 font-semibold" : ""}`}>
                                        {order.is_returned === 1 ? "returned" : order.is_damaged === 1 ? "damage" : "-"}
                                    </p>
                                    {(() => {
                                        if (order.is_recived_to_back_to_outlet === 1 || order.is_recived_to_back_to_outlet === "1") {
                                            return <p className="bg-green-500/20 text-green-500 text-center rounded-full">Received</p>;
                                        }
                                        const orderStatus = String(invoice?.status ?? invoice?.order_status ?? "").trim();
                                        const itemStatus = String(order?.status ?? "").trim();
                                        const finalStatus = orderStatus || itemStatus;
                                        if (finalStatus && finalStatus.toLowerCase() === "active") {
                                            return <p className="bg-blue-500/20 text-blue-500 text-center rounded-full">Active</p>;
                                        }
                                        return <p className="bg-yellow-500/20 text-yellow-500 text-center rounded-full">Pending</p>;
                                    })()}
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex flex-row justify-between items-center mt-3">
                                <p className="text-base text-black/50">
                                    Showing {startIndex + 1} - {Math.min(endIndex, totalItems)} of {totalItems} items
                                </p>

                                <div className="flex justify-end gap-2 flex-wrap">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                                    >
                                        First
                                    </button>

                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                                    >
                                        Previous
                                    </button>

                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`px-3 py-1 rounded-lg border border-primary/20 ${page === currentPage
                                                ? "bg-primary text-white font-bold"
                                                : "bg-white text-black/60"
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}

                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                                    >
                                        Next
                                    </button>

                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                                    >
                                        Last
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {!isLoading && invoice &&
                <Link to="generate" state={{ invoice }} className="ms-auto bg-primary text-white font-bold text-2xl px-3 py-2 mb-5 rounded-full">Generate Invoice</Link>
            }
        </div>
    );
};

export default SalesRetailViewInvoice;