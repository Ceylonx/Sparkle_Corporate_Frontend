import { useHotkeys } from "react-hotkeys-hook";
import RetailCustomerUpdateForm from "../../forms/retail/RetailCustomerUpdateForm";

const RetailCustomerUpdateDialog = ({ handleClose, customer }) => {
    useHotkeys("esc", (event) => {
        event.preventDefault();
        handleClose();
    });

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">Update Customer</h1>
                <p className="text-black/50 text-center">Make changes to customer information</p>

                <RetailCustomerUpdateForm handleClose={handleClose} customer={customer} />
            </div>
        </div>
    );
};

export default RetailCustomerUpdateDialog;