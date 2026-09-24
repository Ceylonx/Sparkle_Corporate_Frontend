import { useEffect, useState } from "react";
import Input from "../../ui/Input";
import Select from "react-select";
import { getAllCustomers } from "../../../services/CustomerServices";
import { createRetailVoucher } from "../../../services/Retail/RetailVoucherServices";
import { BeatLoader } from "react-spinners";

const RetailRedeemVoucherForm = ({ handleClose, vouchers, addVoucher, invoiceData, data }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [errorMessage, setErrorMessage] = useState("");
    const [formData, setFormData] = useState(
        {
            voucher_code: "",
            value: "",
        }
    );

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem", // rounded-xl
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db", // gray-300
            padding: "0rem 0.25rem", // py-2 px-3
            boxShadow: "none",
            "&:hover": {
                borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            },
        }),
        placeholder: (base) => ({
            ...base,
            color: "#6B7280", // gray-400
        }),
        singleValue: (base) => ({
            ...base,
            color: "#000000",
        }),
    };

    const fetchAllCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_type: "Retail"
            };

            const response = await getAllCustomers(payload);
            const filtered = response.data.allCustomers.filter(customer => customer.customer_type === "Retail");
            setCustomers(filtered);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        }
    };

    useEffect(() => {
        fetchAllCustomers();
    }, []);

    const handleInputChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleInputNumberChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value === "" ? "" : Number(e.target.value)
            }
        ));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setErrorMessage("");

        const voucher = vouchers.find(voucher => voucher.voucher_code === formData.voucher_code);

        const formattedItems = Object.values(
            invoiceData.items.reduce((acc, item) => {
                const key = `${item.item_type_id}|${item.remark}|${item.color}|${item.brand}|${item.packing_option}`;

                if (!acc[key]) {
                    // clone the item and add quantity = 0
                    acc[key] = { ...item, quantity: 0 };
                }

                // increase the quantity
                acc[key].quantity += 1;

                return acc;
            }, {})
        );

        const totalReady = data?.delivery_charge + formattedItems.reduce((sum, item) => {
            return sum + item.quantity * parseFloat(item.price);
        }, 0);

        const discount = data.discount?.toString().endsWith('%') ?
            (parseFloat(data.discount) / 100) * (totalReady + Number(data.delivery_charge)) :
            parseFloat(data.discount || 0);

        const totalToPay = totalReady - discount - data.gift_voucher_amount;

        if (!voucher) {
            setErrorMessage("Invalid voucher code.");
            return;
        } else if (voucher.status === "Expired") {
            setErrorMessage(`The voucher has expired.`);
            return;
        } else if (voucher.status === "Redeemed") {
            setErrorMessage(`The voucher has already been redeemed.`);
            return;
        } else if (voucher.status === "Inactive") {
            setErrorMessage(`The voucher is inactive.`);
            return;
        } else if (voucher.balance < formData.value) {
            setErrorMessage(`Available balance for selected voucher is Rs. ${voucher.balance}.`);
            return;
        } else if (formData.value <= 0) {
            setErrorMessage("Please enter a valid amount to redeem.");
            return;
        } else if (totalToPay < formData.value) {
            setErrorMessage(`Voucher value cannot exceed total for bill: ${totalToPay}`);
            return;
        }
        setErrorMessage("");
        addVoucher(formData);
        handleClose();
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-5">
                <Input classnames={"bg-white"} name={"voucher_code"} variant={"text"} label={"Gift Voucher Number"} placeholder={"Enter voucher code here..."} value={formData.voucher_code} onChange={handleInputChange} />
                <Input classnames={"bg-white"} name={"value"} variant={"number"} label={"Enter Amount to Redeem"} placeholder={"Enter value here..."} value={formData.value} onChange={handleInputNumberChange} />
            </div>

            <p className="text-center text-red-500 text-lg font-medium mt-3">{errorMessage}</p>

            <div className="flex flex-row gap-x-5 px-10 text-xl mt-5">
                <button type="submit" className="font-semibold text-white bg-primary rounded-full py-2 w-full cursor-pointer" disabled={isLoading} >{isLoading ? <BeatLoader color="#fff" size={10} /> : "Apply"}</button>

                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-full cursor-pointer" onClick={handleClose} disabled={isLoading} >Cancel</button>
            </div>
        </form>
    );
};

export default RetailRedeemVoucherForm;