import { useState } from "react";
import Select from "react-select";
import { Icon } from "@iconify/react";
import { createCorporateDiscount } from "../../../services/corporate/CorporateSettingsServices";
import { BeatLoader } from "react-spinners";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";

const CorporateCreateDiscountForm = ({ handleClose, refreshDiscounts }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        user_id: localStorage.getItem("userId"),
        discount_name: "",
        customer_type: "Cooperate",
        discount_type: "",
        discount_condition: "",
        value: "",
        valid_from: "",
        valid_to: "",
        auto_apply: false,
        status: "Active",
    });

    const discountTypeOptions = [
        { value: 'Seasonal', label: 'Seasonal' },
        { value: 'Min Bill', label: 'Min Bill' },
        { value: 'Credit Card', label: 'Credit Card' },
    ];


    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem",
            borderColor: state.isFocused ? "#3B82F6" : "#E5E7EB",
            padding: "0.25rem 0.5rem",
            boxShadow: "none",
            "&:hover": { borderColor: state.isFocused ? "#3B82F6" : "#D1D5DB" },
        }),
        placeholder: (base) => ({ ...base, color: "#9CA3AF" }),
        singleValue: (base) => ({ ...base, color: "#1F2937" }),
    };

    const handleInputChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsLoading(true);
            const isPercentage = formData.value.toString().includes("%");
            
            const payload = {
                user_id: localStorage.getItem("userId"),
                discount_row_id: Math.floor(Math.random() * 10000), // Random row ID if required
                discount_name: formData.discount_name,
                discount_type: formData.discount_type,
                discount_condition: formData.discount_condition,
                discount_value_type: isPercentage ? "Percentage" : "Fixed",
                discount_value: Number(formData.value.toString().replace("%", "").trim()),
                discount_valid_from: formData.valid_from,
                discount_valid_to: formData.valid_to
            };

            await createCorporateDiscount(payload);
            handleClose();
            if (refreshDiscounts) refreshDiscounts();
        } catch (error) {
            console.error("Error creating corporate discount:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-blue-500 transition-all bg-white text-gray-800 placeholder-gray-400";
    const labelClass = "text-sm font-semibold text-gray-600 mb-1.5 ml-1";

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-8">
            <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                {/* Row 1 */}
                <div className="flex flex-col">
                    <label className={labelClass}>Discount Name</label>
                    <input name="discount_name" className={inputClass} placeholder="Enter discount name" onChange={handleInputChange} />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Discount Value</label>
                    <input 
                        name="value"
                        className={inputClass} 
                        placeholder="e.g. 10 or 10%" 
                        value={formData.value}
                        onChange={handleInputChange} 
                    />
                </div>

                {/* Row 2 */}
                <div className="flex flex-col">
                    <label className={labelClass}>Discount Type</label>
                    <Select
                        options={discountTypeOptions}
                        styles={selectStyles}
                        onChange={(opt) => setFormData(prev => ({ ...prev, discount_type: opt.value }))}
                        placeholder="Select type"
                    />
                </div>
                <div className="flex flex-col relative">
                    <label className={labelClass}>Start Date</label>
                    <div className="relative">
                        <input name="valid_from" type="date" className={inputClass} onChange={handleInputChange} />
                        <Icon icon="mdi:calendar" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                    </div>
                </div>

                {/* Row 3 */}
                <div className="flex flex-col">
                    <label className={labelClass}>Condition</label>
                    <input name="discount_condition" className={inputClass} placeholder="Enter condition" onChange={handleInputChange} />
                </div>
                <div className="flex flex-col relative">
                    <label className={labelClass}>End Date</label>
                    <div className="relative">
                        <input name="valid_to" type="date" className={inputClass} onChange={handleInputChange} />
                        <Icon icon="mdi:calendar" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                    </div>
                </div>

                {/* Auto Apply */}
                <div className="flex flex-row items-center gap-x-3 mt-2">
                    <div 
                        className="cursor-pointer transition-colors"
                        onClick={() => setFormData(prev => ({ ...prev, auto_apply: !prev.auto_apply }))}
                    >
                        {formData.auto_apply ? 
                            <Icon icon="mdi:checkbox-marked" className="text-blue-600" size={24} /> : 
                            <Icon icon="mdi:checkbox-blank-outline" className="text-gray-400" size={24} />
                        }
                    </div>
                    <span className="text-base font-medium text-gray-700">Auto Apply</span>
                </div>
            </div>

            <div className="flex flex-row gap-x-8 mt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full text-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50" disabled={isLoading}>
                    {isLoading ? <BeatLoader color="#fff" size={12} /> : "Save"}
                </button>
                <button type="button" className="flex-1 bg-white text-blue-600 border-2 border-blue-600 font-bold py-3.5 rounded-full text-xl hover:bg-blue-50 transition-all" onClick={handleClose}>
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default CorporateCreateDiscountForm;