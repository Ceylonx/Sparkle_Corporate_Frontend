import { useEffect, useState } from "react";
import Input from "../../ui/Input";
import Select from "react-select";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import { createRetailDiscount, updateRetailDiscount } from "../../../services/Retail/RetailDiscountServices";
import { BeatLoader } from "react-spinners";
import { useParams } from "react-router-dom";

const RetailUpdateDiscountForm = ({ discount, handleClose, refreshDiscounts }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState(
        {
            user_id: localStorage.getItem("userId"),
            discount_id: "",
            discount_name: "",
            customer_type: "Retail",
            discount_type: "",
            discount_condition: "",
            value: "",
            valid_from: "",
            valid_to: "",
            auto_apply: false,
            status: "Active",
        }
    );

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    //dummy data
    const discountTypeOptions = [
        { value: 'Credit Card', label: 'Credit Card' },
        { value: 'Min Bill', label: 'Min Bill' },
        { value: 'Seasonal', label: 'Seasonal' },
    ];

    const creditCardOptions = [
        { value: 'Amana Bank PLC', label: 'Amana Bank PLC' },
        { value: 'Bank of Ceylon (BOC)', label: 'Bank of Ceylon (BOC)' },
        { value: 'Bank of China Ltd', label: 'Bank of China Ltd' },
        { value: 'Cargills Bank PLC', label: 'Cargills Bank PLC' },
        { value: 'Citibank, N.A.', label: 'Citibank, N.A.' },
        { value: 'Commercial Bank of Ceylon PLC', label: 'Commercial Bank of Ceylon PLC' },
        { value: 'Deutsche Bank AG', label: 'Deutsche Bank AG' },
        { value: 'DFCC Bank PLC', label: 'DFCC Bank PLC' },
        { value: 'Habib Bank Ltd', label: 'Habib Bank Ltd' },
        { value: 'Hatton National Bank PLC (HNB)', label: 'Hatton National Bank PLC (HNB)' },
        { value: 'HSBC (Hong Kong and Shanghai Banking Corporation)', label: 'HSBC (Hong Kong and Shanghai Banking Corporation)' },
        { value: 'Indian Bank', label: 'Indian Bank' },
        { value: 'Indian Overseas Bank', label: 'Indian Overseas Bank' },
        { value: 'MCB Bank Ltd', label: 'MCB Bank Ltd' },
        { value: 'National Development Bank PLC (NDB)', label: 'National Development Bank PLC (NDB)' },
        { value: 'Nations Trust Bank PLC', label: 'Nations Trust Bank PLC' },
        { value: 'Pan Asia Banking Corporation PLC', label: 'Pan Asia Banking Corporation PLC' },
        { value: "People's Bank", label: "People's Bank" },
        { value: 'Public Bank Berhad', label: 'Public Bank Berhad' },
        { value: 'Sampath Bank PLC', label: 'Sampath Bank PLC' },
        { value: 'Seylan Bank PLC', label: 'Seylan Bank PLC' },
        { value: 'Standard Chartered Bank', label: 'Standard Chartered Bank' },
        { value: 'State Bank of India', label: 'State Bank of India' },
        { value: 'Union Bank of Colombo PLC', label: 'Union Bank of Colombo PLC' },
        { value: 'Licensed Specialised Banks', label: 'Licensed Specialised Banks' },
        { value: 'National Savings Bank (NSB)', label: 'National Savings Bank (NSB)' },
        { value: 'Housing Development Finance Corporation Bank of Sri Lanka (HDFC)', label: 'Housing Development Finance Corporation Bank of Sri Lanka (HDFC)' },
        { value: 'Regional Development Bank (RDB)', label: 'Regional Development Bank (RDB)' },
        { value: 'Sanasa Development Bank PLC', label: 'Sanasa Development Bank PLC' },
        { value: 'State Mortgage and Investment Bank', label: 'State Mortgage and Investment Bank' },
        { value: 'Sri Lanka Savings Bank Ltd', label: 'Sri Lanka Savings Bank Ltd' },
        { value: 'Lankaputhra Development Bank', label: 'Lankaputhra Development Bank' },
    ];

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

    useEffect(() => {
        setFormData(
            {
                user_id: localStorage.getItem("userId"),
                discount_id: discount.discount_id,
                discount_name: discount.discount_name,
                customer_type: discount.customer_type,
                discount_type: discount.discount_type,
                discount_condition: discount.discount_condition,
                value: discount.value_type === "Value" ? discount.value : `${discount.value}%`,
                valid_from: new Date(discount.valid_from).toISOString().split("T")[0],
                valid_to: new Date(discount.valid_to).toISOString().split("T")[0],
                auto_apply: discount.auto_apply,
                status: discount.status,
            }
        );
    }, [discount]);

    useEffect(() => {
        if (!formData.type) return;

        setFormData(prev => ({
            ...prev,
            discount_condition: ""
        }));
    }, [formData.type]);

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
                [e.target.name]: e.target.value === "" ? "" : e.target.value
            }
        ));
    };

    const handleInputPercentageChange = (e) => {
        if (/^[0-9%]*$/.test(e.target.value)) {
            setFormData(prev => (
                {
                    ...prev,
                    [e.target.name]: e.target.value === "" ? "" : e.target.value
                }
            ));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const payload = {
            user_id: localStorage.getItem("userId"),
            discount_id: formData.discount_id,
            discount_name: formData.discount_name,
            customer_type: "Retail",
            value_type: formData.value.toString().trim().endsWith("%") ? "Percentage" : "Value",
            discount_type: formData.discount_type,
            discount_condition: formData.discount_condition,
            value: Number(formData.value.toString().replace("%", "").trim()),
            valid_from: formData.valid_from,
            valid_to: formData.valid_to,
            auto_apply: formData.auto_apply,
            status: "Active",
        };

        try {
            setIsLoading(true);
            const response = await updateRetailDiscount(payload);
            handleClose();
            refreshDiscounts();
        } catch (error) {
            console.error("Error updating discount: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectCardOption = (selectedOption) => {
        setFormData(prev => ({
            ...prev,
            discount_condition: selectedOption.map(item => item.value).join(", ")
        }));
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
                <Input classnames={"bg-white"} name={"discount_name"} variant={"text"} label={"Discount Name"} placeholder={"Enter discount name here..."} value={formData.discount_name} onChange={handleInputChange} />
                <Input classnames={"bg-white"} name={"value"} variant={"text"} label={"Discount Value"} placeholder={"Enter discount value here..."} value={formData.value} onChange={handleInputPercentageChange} />
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="discount_type" className="text-xl font-semibold">Discount Type</label>
                    <Select
                        name="discount_type"
                        id="discount_type"
                        options={discountTypeOptions}
                        onChange={(option) => setFormData(prev => ({ ...prev, discount_type: option.value }))}
                        styles={selectStyles}
                        value={discountTypeOptions.find(type => type.value === formData.discount_type)}
                        filterOption={selectFilter}
                    />
                </div>

                {formData.discount_type === "Credit Card" &&
                    <div className="flex flex-col gap-y-1">
                        <label htmlFor="discount_condition" className="text-xl font-semibold">Condition</label>
                        <Select
                            isMulti
                            name="discount_condition"
                            id="discount_condition"
                            options={creditCardOptions}
                            onChange={handleSelectCardOption}
                            styles={selectStyles}
                            value={creditCardOptions.filter(card =>
                                formData.discount_condition
                                    ?.split(", ")
                                    .includes(card.value)
                            )}
                            filterOption={selectFilter}
                        />
                    </div>
                }

                {formData.discount_type === "Seasonal" &&
                    <Input classnames={"bg-white"} name={"discount_condition"} variant={"text"} label={"Condition"} placeholder={"Enter condition here..."} value={formData.discount_condition} onChange={handleInputChange} />
                }

                {formData.discount_type === "Min Bill" &&
                    <div className="flex flex-col gap-y-1">
                        <Input classnames={"bg-white"} name={"discount_condition"} variant={"number"} label={"Condition"} placeholder={"Enter min value here..."} value={formData.discount_condition} onChange={handleInputNumberChange} />
                    </div>
                }

                <div className="flex flex-col gap-y-1">
                    <label htmlFor="valid_from" className="text-xl font-semibold">Start Date:</label>
                    <input
                        type="date"
                        id="valid_from"
                        name="valid_from"
                        placeholder="Add Start date here ..."
                        className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white"
                        value={formData.valid_from}
                        onChange={(e) => setFormData(prev => ({ ...prev, valid_from: e.target.value }))}
                    />
                </div>

                <div className="flex flex-col gap-y-1">
                    <label htmlFor="valid_to" className="text-xl font-semibold">End Date:</label>
                    <input
                        type="date"
                        id="valid_to"
                        name="valid_to"
                        placeholder="Add End date here ..."
                        className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white"
                        value={formData.valid_to}
                        onChange={(e) => setFormData(prev => ({ ...prev, valid_to: e.target.value }))}
                    />
                </div>

                <div className="flex flex-row gap-x-3 items-center">
                    {formData.auto_apply ?
                        <ImCheckboxChecked
                            className="text-green-500 cursor-pointer size-4"
                            onClick={() => setFormData(prev => ({ ...prev, auto_apply: !formData.auto_apply }))}
                        /> :
                        <ImCheckboxUnchecked
                            className="text-black/50 cursor-pointer size-4"
                            onClick={() => setFormData(prev => ({ ...prev, auto_apply: !formData.auto_apply }))}
                        />
                    }
                    <p className="text-xl font-semibold">Auto Apply</p>
                </div>

            </div>

            <div className="flex flex-row gap-x-5 px-10 text-xl mt-5">
                <button type="submit" className="font-semibold text-white bg-primary rounded-full py-2 w-full cursor-pointer" disabled={isLoading} >{isLoading ? <BeatLoader color="#fff" size={10} /> : "Update"}</button>

                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-full cursor-pointer" onClick={handleClose} disabled={isLoading} >Cancel</button>
            </div>
        </form>
    );
};

export default RetailUpdateDiscountForm;