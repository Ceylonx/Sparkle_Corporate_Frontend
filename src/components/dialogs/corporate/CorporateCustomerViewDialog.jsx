import { useEffect, useState } from "react";
import { getCorporateCustomerById, deactiveCorporateCustomer, activeCorporateCustomer } from "../../../services/CustomerServices";
import CorporateCustomerViewForm from "../../forms/corporate/CorporateCustomerViewForm";
import { BeatLoader } from "react-spinners";
import { MdClose } from "react-icons/md";
import { Icon } from "@iconify/react";
import CorporateCustomerPriceListDialog from "./CorporateCustomerPriceListDialog";

const CorporateCustomerViewDialog = ({ handleClose, customerId, onEdit }) => {
    const [customerData, setCustomerData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showPriceList, setShowPriceList] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const payload = {
                    user_id: localStorage.getItem("userId"),
                    customer_auto_id: customerId
                };
                const response = await getCorporateCustomerById(payload);
                const data = response?.data?.customer || response?.data?.data || response?.data;
                setCustomerData(data);
            } catch (error) {
                console.error("Error fetching customer details: ", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (customerId) {
            fetchData();
        }
    }, [customerId]);

    const handleStatusToggle = async () => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_auto_id: customerId
            };

            if (customerData?.status?.toLowerCase() === "active") {
                await deactiveCorporateCustomer(payload);
            } else {
                await activeCorporateCustomer(payload);
            }

            // Re-fetch data
            const response = await getCorporateCustomerById(payload);
            const data = response?.data?.customer || response?.data?.data || response?.data;
            setCustomerData(data);
        } catch (error) {
            console.error("Error toggling customer status:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">

                {/* Close Button */}
                <div className="absolute top-6 right-6 z-10 transition-transform hover:scale-110">
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                        <MdClose size={24} />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto">
                    {/* Header Section from Screenshot 2 */}
                    <div className="flex flex-row justify-between items-start mb-8">
                        <div className="flex flex-col">
                            <h1 className="text-blue-500 text-3xl font-bold">Customer Details</h1>
                            <p className="text-gray-400 text-lg mt-1">{customerData?.company_name || customerData?.customer_company_name || "Grand Hotel"}</p>
                        </div>

                        <div className="flex flex-row items-center gap-x-4 mr-12">
                            {/* Edit Pencil Icon */}
                            <button
                                onClick={() => onEdit(customerData)}
                                className="p-2.5 rounded-full border border-blue-500 text-blue-500 hover:bg-blue-50 transition-all cursor-pointer shadow-sm"
                            >
                                <Icon icon="iconamoon:edit-fill" size={20} />
                            </button>

                            {/* View Price List Button */}
                            <button 
                                onClick={() => setShowPriceList(true)}
                                className="flex flex-row items-center gap-x-2 px-6 py-2 rounded-full border border-blue-500 text-blue-500 font-semibold hover:bg-blue-50 transition-all cursor-pointer shadow-sm"
                            >
                                <Icon icon="mdi:eye" size={20} />
                                View Price List
                            </button>

                            {/* Inactive/Active Customer Button */}
                            {/* <button 
                                onClick={handleStatusToggle}
                                className="flex flex-row items-center gap-x-2 px-6 py-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all cursor-pointer shadow-md"
                            >
                                <Icon icon={customerData?.status?.toLowerCase() === "active" ? "mdi:minus-circle-outline" : "mdi:check-circle-outline"} size={20} />
                                {customerData?.status?.toLowerCase() === "active" ? "Inactive Customer" : "Active Customer"}
                            </button> */}
                            <button
                                onClick={handleStatusToggle}
                                className={`flex flex-row items-center gap-x-2 px-6 py-2 rounded-full text-white font-semibold transition-all cursor-pointer shadow-md
                                    ${customerData?.status?.toLowerCase() === "active"
                                        ? "bg-red-600 hover:bg-red-700"
                                        : "bg-blue-600 hover:bg-blue-700"
                                    }`}
                            >
                                <Icon
                                    icon={
                                        customerData?.status?.toLowerCase() === "active"
                                            ? "mdi:minus-circle-outline"
                                            : "mdi:check-circle-outline"
                                    }
                                    size={20}
                                />
                                {
                                    customerData?.status?.toLowerCase() === "active"
                                        ? "Deactivate"
                                        : "Activate"
                                }
                            </button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <BeatLoader color="#1470F9" size={15} />
                        </div>
                    ) : (
                        <CorporateCustomerViewForm
                            customerData={customerData}
                        />
                    )}
                </div>
            </div>

            {showPriceList && (
                <CorporateCustomerPriceListDialog 
                    customer={customerData} 
                    onClose={() => setShowPriceList(false)} 
                />
            )}
        </div>
    );
};

export default CorporateCustomerViewDialog;
