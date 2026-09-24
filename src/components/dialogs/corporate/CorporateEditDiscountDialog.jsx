import { MdClose } from "react-icons/md";
import CorporateEditDiscountForm from "../../forms/corporate/CorporateEditDiscountForm";

const CorporateEditDiscountDialog = ({ handleClose, refreshDiscounts, initialData }) => {
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

                <div className="p-10 overflow-y-auto">
                    <div className="mb-8 text-center">
                        <h1 className="text-blue-500 text-3xl font-bold">Edit Discount</h1>
                        <p className="text-gray-400 text-lg mt-2 font-medium">Update the details of the selected discount rule.</p>
                    </div>

                    <CorporateEditDiscountForm handleClose={handleClose} refreshDiscounts={refreshDiscounts} initialData={initialData} />
                </div>
            </div>
        </div>
    );
};

export default CorporateEditDiscountDialog;
