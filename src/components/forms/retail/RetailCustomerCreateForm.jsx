import { useState } from "react";
import Input from "../../ui/Input";
import { createCustomer } from "../../../services/CustomerServices";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import { hasPermission } from "../../../utils/permissionHelper";

const RetailCustomerCreateForm = ({ handleClose, onSuccess }) => {
    const canEditDiscount = hasPermission("SalesRetail_Customer_Edit");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [formData, setFormData] = useState(
        {
            user_id: localStorage.getItem("userId"),
            branch_id: 1,
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
            status: "New"
        }
    );

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
            setErrorMessage("");
            formData.discount = Number(formData.discount);
            await createCustomer(formData);
            await Swal.fire({
                icon: "success",
                title: "Customer Created",
                text: "Customer has been created successfully.",
                confirmButtonColor: "#1470F9"
            });
            if (typeof onSuccess === "function") onSuccess();
            handleClose();
        } catch (error) {
            console.error("Error creating customer: ", error);
            const data = error?.response?.data;
            const message =
                (typeof data === "string" && data) ||
                data?.message ||
                data?.error ||
                data?.msg ||
                (Array.isArray(data?.errors) && data.errors[0]) ||
                "Failed to create customer.";
            setErrorMessage(message);
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

export default RetailCustomerCreateForm;