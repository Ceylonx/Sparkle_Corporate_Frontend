import CorporateCustomerCreateForm from "../../forms/corporate/CorporateCustomerCreateForm";

const CorporateCustomerCreateDialog = ({ handleClose, salesPersons, refreshCustomers, customerList }) => {
    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/30">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-white rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">Add New Customer</h1>
                <p className="text-black/50 text-center">Add new customer in to system</p>
                
                <CorporateCustomerCreateForm handleClose={handleClose}/>
            </div>
        </div>
    );
};

export default CorporateCustomerCreateDialog;