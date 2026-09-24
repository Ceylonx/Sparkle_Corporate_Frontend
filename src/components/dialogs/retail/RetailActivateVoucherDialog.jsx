import { useState, useEffect } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";

const RetailActivateVoucherDialog = ({ voucher, handleClose, onActivate }) => {
    const [formData, setFormData] = useState({
        voucher_code: "",
        value: "",
        issued_date: "",
        expire_date: ""
    });

    useEffect(() => {
        if (voucher) {
            const today = new Date().toISOString().split("T")[0];

            // Calculate expire date based on validity period
            const calculateExpireDate = (startDate, validityPeriod) => {
                if (!startDate || !validityPeriod) return "";
                const start = new Date(startDate);
                const expire = new Date(start);
                expire.setDate(expire.getDate() + parseInt(validityPeriod));
                return expire.toISOString().split("T")[0];
            };

            setFormData({
                voucher_code: voucher.voucher_code || "",
                value: voucher.value || "",
                issued_date: today,
                expire_date: calculateExpireDate(today, voucher.validity_period)
            });
        }
    }, [voucher]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const updated = { ...prev, [name]: value };

            // Recalculate expire date when issued_date changes
            if (name === "issued_date" && voucher?.validity_period) {
                const start = new Date(value);
                const expire = new Date(start);
                expire.setDate(expire.getDate() + parseInt(voucher.validity_period));
                updated.expire_date = expire.toISOString().split("T")[0];
            }

            return updated;
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onActivate(formData);
    };

    if (!voucher) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 w-[600px] max-h-[90vh] overflow-y-auto">
                <div className="flex flex-row justify-between items-center mb-5">
                    <h2 className="text-2xl font-bold text-primary">Activate Voucher</h2>
                    <Icon
                        icon="maki:cross"
                        className="text-red-500 cursor-pointer size-6"
                        onClick={handleClose}
                    />
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
                    <div className="flex flex-col">
                        <label className="text-xl font-semibold mb-2">Voucher Code</label>
                        <input
                            type="text"
                            name="voucher_code"
                            value={formData.voucher_code}
                            className="border border-black/20 rounded-xl px-4 py-2 text-lg bg-gray-100"
                            readOnly
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xl font-semibold mb-2">Value (Rs.)</label>
                        <input
                            type="number"
                            name="value"
                            value={formData.value}
                            onChange={handleInputChange}
                            className="border border-black/20 rounded-xl px-4 py-2 text-lg"
                            required
                            min="0"
                            step="0.01"
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xl font-semibold mb-2">Start Date (Issued Date)</label>
                        <input
                            type="date"
                            name="issued_date"
                            value={formData.issued_date}
                            onChange={handleInputChange}
                            className="border border-black/20 rounded-xl px-4 py-2 text-lg"
                            required
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xl font-semibold mb-2">Expire Date</label>
                        <input
                            type="date"
                            name="expire_date"
                            value={formData.expire_date}
                            className="border border-black/20 rounded-xl px-4 py-2 text-lg bg-gray-100"
                            readOnly
                        />
                        <p className="text-sm text-black/50 mt-1">
                            Auto-calculated based on validity period ({voucher.validity_period} days)
                        </p>
                    </div>

                    <div className="flex flex-row gap-x-3 mt-5">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 bg-white border border-red-500 text-red-500 font-bold text-xl rounded-full py-2 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-primary text-white font-bold text-xl rounded-full py-2 cursor-pointer"
                        >
                            Activate Voucher
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RetailActivateVoucherDialog;
