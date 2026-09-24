import { useEffect, useState } from "react";
import Input from "../../ui/Input";
import Select from "react-select";
import { getAllCustomers } from "../../../services/CustomerServices";
import { createRetailVoucher, updateRetailVoucher } from "../../../services/Retail/RetailVoucherServices";
import { BeatLoader } from "react-spinners";

const RetailUpdateVoucherForm = ({ handleClose, refreshVouchers, voucher }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [errorMessage, setErrorMessage] = useState("");
    const [formData, setFormData] = useState(
        {
            user_id: localStorage.getItem("userId"),
            voucher_code: "",
            value: "",
            balance: "",
            issued_to: "",
            issued_date: "",
            expire_date: "",
            status: "",
        }
    );

    const statusOptions = [
        { value: "Pending", label: "Pending" },
        { value: "Active", label: "Active" },
        { value: "Inactive", label: "Inactive" },
        { value: "Expired", label: "Expired" },
        { value: "Redeemed", label: "Redeemed" },
    ];

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
                customer_type: "Retail",
                branch_id: 1,
            };

            const response = await getAllCustomers(payload);
            const filtered = response.data.allCustomers.filter(customer => customer.customer_type === "Retail" && customer.account_status === "Active");
            setCustomers(filtered);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        }
    };

    useEffect(() => {
        fetchAllCustomers();
    }, []);

    useEffect(() => {
        const norm = (s) => {
            if (s == null || String(s).trim() === "") return "Pending";
            const t = String(s).trim().toLowerCase();
            return t.charAt(0).toUpperCase() + t.slice(1);
        };
        setFormData(
            {
                user_id: localStorage.getItem("userId"),
                voucher_id: voucher.voucher_id,
                voucher_code: voucher.voucher_code,
                value: voucher.value,
                balance: voucher.balance,
                issued_to: voucher.issued_to,
                issued_date: new Date(voucher.issued_date).toISOString().split("T")[0],
                expire_date: new Date(voucher.expire_date).toISOString().split("T")[0],
                status: norm(voucher.status),
            }
        );
    }, [voucher]);

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

    const handleSubmit = async (e) => {
        e.preventDefault();

        formData.balance = formData.value;
        try {
            if (!formData.voucher_code) {
                setErrorMessage("Please enter voucher code");
                return;
            } else if (!formData.value) {
                setErrorMessage("Please enter voucher amount");
                return;
            } else if (!formData.issued_date) {
                setErrorMessage("Please enter issued date");
                return;
            } else if (!formData.expire_date) {
                setErrorMessage("Please enter expire date");
                return;
            } else if (!formData.issued_to) {
                setErrorMessage("Please select customer");
                return;
            }

            setIsLoading(true);
            const response = await updateRetailVoucher(formData);
            handleClose();
            refreshVouchers();
        } catch (error) {
            console.error("Error creating voucher: ", error);
        } finally {
            setIsLoading(false);
        }
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
            <div className="grid grid-cols-2 gap-5">
                <Input classnames={"bg-white"} name={"voucher_code"} variant={"text"} label={"Voucher Code"} placeholder={"Enter voucher code here..."} value={formData.voucher_code} onChange={handleInputChange} />
                <Input classnames={"bg-white"} name={"value"} variant={"number"} label={"Value"} placeholder={"Enter value here..."} value={formData.value} onChange={handleInputNumberChange} />

                <div className="flex flex-col gap-y-1">
                    <label htmlFor="issued_date" className="text-xl font-semibold">Issued Date:</label>
                    <input
                        type="date"
                        id="issued_date"
                        name="issued_date"
                        placeholder="Add Start date here ..."
                        className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white"
                        value={formData.issued_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, issued_date: e.target.value }))}
                    />
                </div>

                <div className="flex flex-col gap-y-1">
                    <label htmlFor="expire_date" className="text-xl font-semibold">Expire Date:</label>
                    <input
                        type="date"
                        id="expire_date"
                        name="expire_date"
                        placeholder="Add End date here ..."
                        className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white"
                        value={formData.expire_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, expire_date: e.target.value }))}
                    />
                </div>

                <div className="grow flex flex-col col-span-1">
                    <label className="text-xl font-semibold" htmlFor="customer_id">Select Customer</label>
                    <Select
                        id="customer_id"
                        className="w-full"
                        styles={{
                            ...selectStyles,
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }) // ensure it's above dialog
                        }}
                        options={customers.map(customer => ({
                            value: customer.customer_id,
                            label: `${customer.customer_name} (${customer.phone_number})`
                        }))}
                        value={customers.map(customer => ({
                            value: customer.customer_id,
                            label: `${customer.customer_name} (${customer.phone_number})`
                        })).find(option => option.value === formData.issued_to)}
                        onChange={(selectedOption) => setFormData(prev => ({ ...prev, issued_to: selectedOption.value }))}
                        menuPortalTarget={document.body}
                        filterOption={selectFilter}
                    />
                </div>

                <div className="grow flex flex-col col-span-1">
                    <label className="text-xl font-semibold" htmlFor="status">Status</label>
                    <Select
                        id="status"
                        className="w-full"
                        styles={{
                            ...selectStyles,
                            menuPortal: (base) => ({ ...base, zIndex: 9999 })
                        }}
                        options={statusOptions}
                        value={statusOptions.find(opt => opt.value === formData.status) || statusOptions[0]}
                        onChange={(selectedOption) => setFormData(prev => ({ ...prev, status: selectedOption?.value ?? "Pending" }))}
                        menuPortalTarget={document.body}
                    />
                </div>
            </div>

            <p className="text-red-500 text-center mt-3">{errorMessage}</p>

            <div className="flex flex-row gap-x-5 px-10 text-xl mt-3">
                <button type="submit" className="font-semibold text-white bg-primary rounded-full py-2 w-full cursor-pointer" disabled={isLoading} >{isLoading ? <BeatLoader color="#fff" size={10} /> : "Update"}</button>

                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-full cursor-pointer" onClick={handleClose} disabled={isLoading} >Cancel</button>
            </div>
        </form>
    );
};

export default RetailUpdateVoucherForm;