import { useEffect, useState } from "react";
import Input from "../../ui/Input";
import { updateCustomer } from "../../../services/CustomerServices";
import { BeatLoader } from "react-spinners";
import { hasPermission } from "../../../utils/permissionHelper";

const RetailCustomerUpdateForm = ({ customer, handleClose }) => {
    const canEditDiscount = hasPermission("SalesRetail_Customer_Edit");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [formData, setFormData] = useState(
        {
            user_id: localStorage.getItem("userId"),
            company_name: "",
            customer_name: "",
            customer_type: "Retail",
            phone_number: "",
            address: "",
            email: "",
            discount: "",
            vat_number: "",
            invoice_type: "",
            invoicing_period: 0,
            payment_period: 0,
            status: ""
        }
    );

    useEffect(() => {
        if (customer) {
            setFormData({
                id: customer.id,
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
                company_name: "",
                customer_name: customer.customer_name,
                customer_type: "Retail",
                phone_number: customer.phone_number,
                address: customer.address,
                email: customer.email,
                discount: customer.discount,
                vat_number: "",
                invoice_type: "",
                invoicing_period: 0,
                payment_period: 0,
                status: customer.status,
            });
        }
    }, []);

    const handleInputChange = (e) => {
        if (e.target.name === "email") {
            setFormData(prev => ({
                ...prev,
                [e.target.name]: e.target.value
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [e.target.name]: e.target.value.toUpperCase()
            }));
        }
    };

    const handleInputNumberChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value === "" ? "" : e.target.value
            }
        ));
    };

    const handleInputPhoneChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value.replace(/\D/g, '')
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.customer_name) {
            setErrorMessage("Please enter customer name before proceeding.");
            return;
        } else if (!formData.phone_number) {
            setErrorMessage("Please enter phone number before proceeding.");
            return;
        } else if (!formData.address) {
            setErrorMessage("Please enter address before proceeding.");
            return;
        } else {
            setErrorMessage("");
        }

        try {
            setIsLoading(true);
            const response = await updateCustomer(formData);
            handleClose();
        } catch (error) {
            console.error("Error updating customer: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-5">
                <Input name={"customer_name"} variant={"text"} label={"*Name"} placeholder={"Enter name here..."} value={formData.customer_name} onChange={handleInputChange} />
                <Input name={"email"} variant={"email"} label={"Email"} placeholder={"Enter email here..."} value={formData.email} onChange={handleInputChange} />
                <Input name={"phone_number"} variant={"phone"} label={"*Phone Number"} placeholder={"Enter phone number here..."} value={formData.phone_number} onChange={handleInputPhoneChange} />
                <Input name={"address"} variant={"text"} label={"*Address"} placeholder={"Enter address here..."} value={formData.address} onChange={handleInputChange} />
                {canEditDiscount && (
                    <Input name={"discount"} variant={"number"} label={"Discount (%)"} placeholder={"Enter discount here..."} value={formData.discount} onChange={handleInputNumberChange} />
                )}
            </div>

            <p className="text-center text-red-500 mt-3 text-lg font-semibold">{errorMessage}</p>

            <div className="flex flex-row gap-x-5 px-10 text-xl mt-5">
                <button type="submit" className="font-semibold text-white bg-primary rounded-full py-2 w-full cursor-pointer" disabled={isLoading}>{isLoading ? <BeatLoader color="#fff" size={10} /> : "Apply"}</button>

                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-full cursor-pointer" onClick={handleClose} disabled={isLoading}>Cancel</button>
            </div>
        </form>
    );
};

export default RetailCustomerUpdateForm;