import CorporateCustomerUpdateForm from "../../forms/corporate/CorporateCustomerUpdateForm";
import RetailCustomerUpdateForm from "../../forms/retail/RetailCustomerUpdateForm";

const CorporateCustomerUpdateDialog = ({ handleClose, customer }) => {
    return (
        <div className="fixed inset-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
                <div className="p-8 overflow-y-auto">
                    <div className="mb-6">
                        <h1 className="text-blue-500 text-3xl font-bold">Edit Customer Details</h1>
                        <p className="text-gray-400 text-lg mt-1">{customer?.company_name || customer?.customer_company_name || "Customer Details"}</p>
                    </div>

                    <CorporateCustomerUpdateForm handleClose={handleClose} customer={customer} />
                </div>
            </div>
        </div>
    );
};

export default CorporateCustomerUpdateDialog;