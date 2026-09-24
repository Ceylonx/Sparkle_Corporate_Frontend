import { useEffect, useState } from "react";
import Select from "react-select";
import { BeatLoader } from "react-spinners";
import { getCorporateCustomerById, updateCorporateCustomer } from "../../../services/CustomerServices";
import { getAllCorporateSettings, getCorporateTaxes } from "../../../services/corporate/CorporateSettingsServices";

const emptyContactPerson = () => ({
    contact_person_name: "",
    contact_person_phone: "",
    contact_person_email: "",
});

const emptyLocation = () => ({
    location_name: "",
    location_address: "",
    location_telephone: "",
    location_email: "",
    transport_rate: "",
    contact_persons: [emptyContactPerson()],
});

const emptyServiceType = () => ({
    service_type: "",
    percentage: "",
});

const CorporateCustomerUpdateForm = ({ customer, handleClose }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [locations, setLocations] = useState([emptyLocation()]);
    const [serviceTypes, setServiceTypes] = useState([emptyServiceType()]);
    const [formData, setFormData] = useState({
        user_id: localStorage.getItem("userId"),
        id: "",
        company_name: "",
        customer_br_number: "",
        customer_br_date: "",
        address: "",
        phone_number: "",
        email: "",
        vat_number: "",
        invoice_type: "",
        invoicing_period: "",
        payment_period: "",
        discount: "",
        assigned_tax_ids: [],
        transport_rate: "",
    });

    const [isTaxEnabled, setIsTaxEnabled] = useState(false);
    const [availableTaxes, setAvailableTaxes] = useState([]);

    const taxSelectOptions = availableTaxes.map((t) => ({
        value: Number(t.tax_id),
        label:
            t.is_active === 0 || t.is_active === false
                ? `${t.tax_name} (${Number(t.tax_rate).toFixed(2)}%) — inactive`
                : `${t.tax_name} (${Number(t.tax_rate).toFixed(2)}%)`,
    }));

    const deriveLegacyTaxType = (ids) => {
        if (!ids || ids.length === 0) return "No Tax";
        const names = ids
            .map((id) => availableTaxes.find((t) => Number(t.tax_id) === Number(id))?.tax_name)
            .filter(Boolean);
        return names.length ? names.join(", ") : "No Tax";
    };

    const invoiceTypeOptions = [
        { value: "Daily Invoice", label: "Daily Invoice" },
        { value: "Period Invoice", label: "Period Invoice" },
    ];

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem",
            borderColor: state.isFocused ? "#1470F9" : "#E5E7EB",
            padding: "0.25rem 0.5rem",
            boxShadow: "none",
            "&:hover": { borderColor: state.isFocused ? "#1470F9" : "#D1D5DB" },
        }),
        placeholder: (base) => ({ ...base, color: "#9CA3AF" }),
        singleValue: (base) => ({ ...base, color: "#000000" }),
        multiValue: (base) => ({ ...base, backgroundColor: "#E0E7FF", borderRadius: "0.375rem" }),
        multiValueLabel: (base) => ({ ...base, color: "#1e3a8a" }),
        multiValueRemove: (base) => ({
            ...base,
            color: "#1e40af",
            ":hover": { backgroundColor: "#c7d2fe", color: "#1e3a8a" },
        }),
    };

    useEffect(() => {
        const fetchFullData = async () => {
            try {
                let taxesList = [];
                try {
                    const settingsResp = await getAllCorporateSettings(localStorage.getItem("userId"));
                    if (settingsResp?.data?.settings?.[0]) {
                        const settings = settingsResp.data.settings[0];
                        setIsTaxEnabled(settings.is_tax_enabled === 1 || settings.is_tax_enabled === true);
                    }
                } catch (err) {
                    console.error("Error fetching corporate settings:", err);
                }
                try {
                    const taxRes = await getCorporateTaxes(localStorage.getItem("userId"), { activeOnly: false });
                    taxesList = Array.isArray(taxRes.taxes) ? taxRes.taxes : [];
                    setAvailableTaxes(taxesList);
                } catch (taxErr) {
                    console.error("Error fetching corporate taxes:", taxErr);
                    setAvailableTaxes([]);
                }

                const customerAutoId = customer?.customer_auto_id ?? customer?.id ?? null;
                if (!customerAutoId) {
                    console.error("Missing customer_auto_id for corporate customer");
                    return;
                }

                const payload = {
                    user_id: localStorage.getItem("userId"),
                    customer_auto_id: customerAutoId,
                };
                const response = await getCorporateCustomerById(payload);
                const data = response?.data?.customer || response?.data?.data || response?.data;

                const parseAssignedTaxIds = (d) => {
                    if (Array.isArray(d.assigned_tax_ids)) {
                        return d.assigned_tax_ids.map(Number).filter((n) => Number.isFinite(n));
                    }
                    if (Array.isArray(d.assigned_taxes)) {
                        return d.assigned_taxes.map((t) => Number(t.tax_id)).filter((n) => Number.isFinite(n));
                    }
                    const tt = (d.tax_type || "").trim();
                    if (tt && tt.toLowerCase() !== "no tax") {
                        const names = tt.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                        const ids = [];
                        names.forEach((name) => {
                            const found = taxesList.find(
                                (x) => (x.tax_name || "").trim().toLowerCase() === name
                            );
                            if (found?.tax_id != null) {
                                ids.push(Number(found.tax_id));
                            }
                        });
                        return ids;
                    }
                    return [];
                };

                if (data) {
                    setFormData({
                        user_id: localStorage.getItem("userId"),
                        id: data.customer_auto_id || customerAutoId,
                        company_name: data.company_name || data.customer_company_name || "",
                        customer_br_number: data.customer_BR_number || "",
                        customer_br_date: data.customer_BR_date || "",
                        address: data.customer_address || "",
                        phone_number: data.customer_phone || "",
                        email: data.customer_email || "",
                        vat_number: data.customer_vat_number || "",
                        invoice_type: data.customer_invoice_type || "",
                        invoicing_period: data.customer_invoicing_period || "",
                        payment_period: data.customer_payment_period || "",
                        discount: data.discount || "",
                        assigned_tax_ids: parseAssignedTaxIds(data),
                        transport_rate: data.transport_rate != null ? data.transport_rate : "",
                    });

                    if (data.locations && Array.isArray(data.locations)) {
                        setLocations(
                            data.locations.map((loc) => ({
                                location_auto_id: loc.location_auto_id || null,
                                location_name: loc.location_name || "",
                                location_address: loc.location_address || "",
                                location_telephone: loc.location_phone || loc.location__telephone || "",
                                location_email: loc.location_email || "",
                                transport_rate: loc.transport_rate != null ? String(loc.transport_rate) : "",
                                contact_persons: loc.location_contact_persons || loc.contact_persons || [emptyContactPerson()],
                            }))
                        );
                    }

                    if (data.service_types && Array.isArray(data.service_types) && data.service_types.length > 0) {
                        setServiceTypes(
                            data.service_types.map((st) => ({
                                service_type: st.service_type || "",
                                percentage: st.percentage != null ? String(st.percentage) : "",
                            }))
                        );
                    } else {
                        setServiceTypes([emptyServiceType()]);
                    }
                }
            } catch (error) {
                console.error("Error fetching full customer data:", error);
                setErrorMessage("Failed to load full customer details.");
            } finally {
                setIsFetching(false);
            }
        };

        fetchFullData();
    }, [customer]);

    const handleInputChange = (e) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleInputPhoneChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value.replace(/\D/g, ""),
        }));
    };

    const handleLocationChange = (locIndex, field, value) => {
        setLocations((prev) => {
            const updated = [...prev];
            updated[locIndex] = { ...updated[locIndex], [field]: value };
            return updated;
        });
    };

    const handleContactPersonChange = (locIndex, contactIndex, field, value) => {
        setLocations((prev) => {
            const updated = [...prev];
            const updatedContacts = [...updated[locIndex].contact_persons];
            updatedContacts[contactIndex] = { ...updatedContacts[contactIndex], [field]: value };
            updated[locIndex] = { ...updated[locIndex], contact_persons: updatedContacts };
            return updated;
        });
    };

    const handleAddContactPerson = (locIndex) => {
        setLocations((prev) => {
            const updated = [...prev];
            updated[locIndex] = {
                ...updated[locIndex],
                contact_persons: [...updated[locIndex].contact_persons, emptyContactPerson()],
            };
            return updated;
        });
    };

    const handleAddLocation = () => {
        setLocations((prev) => [...prev, emptyLocation()]);
    };

    const handleServiceTypeChange = (index, field, value) => {
        setServiceTypes((prev) => {
            const updated = [...prev];
            if (field === "service_type" && value === "Normal") {
                updated[index] = { ...updated[index], [field]: value, percentage: 0 };
            } else if (field === "service_type" && value !== "Normal" && updated[index].service_type === "Normal") {
                updated[index] = { ...updated[index], [field]: value, percentage: "" };
            } else {
                updated[index] = { ...updated[index], [field]: value };
            }
            return updated;
        });
    };

    const handleRemoveServiceType = (index) => {
        setServiceTypes((prev) => prev.filter((_, i) => i !== index));
    };

    const handleAddServiceType = () => {
        setServiceTypes((prev) => [...prev, emptyServiceType()]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.company_name) {
            setErrorMessage("Please enter company name.");
            return;
        }

        try {
            setIsLoading(true);
            const payload = {
                id: formData.id,
                user_id: formData.user_id,
                customer_company_name: formData.company_name,
                customer_BR_number: formData.customer_br_number,
                customer_BR_date: formData.customer_br_date,
                customer_address: formData.address,
                customer_phone: formData.phone_number,
                customer_email: formData.email,
                customer_invoicing_period: Number(formData.invoicing_period),
                customer_payment_period: Number(formData.payment_period),
                customer_vat_number: formData.vat_number,
                customer_invoice_type: formData.invoice_type,
                discount: Number(formData.discount || 0),
                assigned_tax_ids: Array.isArray(formData.assigned_tax_ids)
                    ? formData.assigned_tax_ids.map(Number).filter((n) => Number.isFinite(n))
                    : [],
                tax_type: deriveLegacyTaxType(formData.assigned_tax_ids),
                transport_rate: Number(formData.transport_rate || 0),
                locations: locations.map((loc) => ({
                    location_auto_id: loc.location_auto_id || null,
                    location_name: loc.location_name,
                    location_address: loc.location_address,
                    location__telephone: loc.location_telephone,
                    location_email: loc.location_email,
                    transport_rate: Number(loc.transport_rate || 0),
                    location_contact_persons: loc.contact_persons,
                })),
                service_types: serviceTypes
                    .filter((st) => st.service_type && (st.percentage !== "" || st.service_type === "Normal"))
                    .map((st) => ({
                        service_type: st.service_type,
                        percentage: Number(st.percentage),
                    })),
            };
            await updateCorporateCustomer(payload);
            handleClose();
        } catch (error) {
            console.error("Error updating customer: ", error);
            const data = error?.response?.data;
            const message = 
                (typeof data === "string" && data) ||
                data?.message ||
                data?.error ||
                data?.msg ||
                "Failed to update customer details.";
            setErrorMessage(message);
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-blue-500 transition-all bg-white text-gray-800 placeholder-gray-400";
    const labelClass = "text-sm font-semibold text-gray-600 mb-1 ml-1";

    if (isFetching) {
        return (
            <div className="flex items-center justify-center py-20">
                <BeatLoader color="#1470F9" size={15} />
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                <div className="flex flex-col">
                    <label className={labelClass}>Company Name</label>
                    <input name="company_name" className={inputClass} value={formData.company_name} onChange={handleInputChange} />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer BR Number</label>
                    <input name="customer_br_number" className={inputClass} value={formData.customer_br_number} onChange={handleInputChange} />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer BR Date</label>
                    <input name="customer_br_date" type="date" className={inputClass} value={formData.customer_br_date} onChange={handleInputChange} />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Registered Address</label>
                    <input name="address" className={inputClass} value={formData.address} onChange={handleInputChange} />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer Phone Number</label>
                    <input
                        name="phone_number"
                        className={`${inputClass} ${formData.phone_number?.length > 0 && formData.phone_number?.length < 10 ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}

                        value={
                            formData.phone_number
                                ? (formData.phone_number.toString().startsWith('0') ? formData.phone_number : '0' + formData.phone_number)
                                : ''
                        }

                        maxLength={10}
                        onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, "");

                            if (val.length > 0 && val[0] !== "0") {
                                val = "0" + val;
                            }

                            if (val.length <= 10) {
                                handleInputPhoneChange({
                                    target: {
                                        name: "phone_number",
                                        value: val
                                    }
                                });
                            }
                        }}
                        placeholder="0712345678"
                    />
                    {formData.phone_number?.length > 0 && formData.phone_number?.length < 10 && (
                        <span className="text-red-500 text-xs mt-1 font-medium ml-1">
                            Phone number must be exactly 10 digits.
                        </span>
                    )}
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer Email</label>
                    <input
                        name="email"
                        type="email"
                        className={`${inputClass} ${formData.email && !formData.email.includes("@") ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="infor@sparklelaundry.lk"
                    />
                    {formData.email && !formData.email.includes("@") && (
                        <span className="text-red-500 text-xs mt-1 font-medium ml-1">
                            Please enter a valid email
                        </span>
                    )}
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Discount (%)</label>
                    <div className="relative">
                        <input name="discount" type="number" step="0.01" className={`${inputClass} pr-8`} value={formData.discount} onChange={handleInputChange} placeholder="0.00" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-semibold pointer-events-none">%</span>
                    </div>
                </div>
                {/* <div className="flex flex-col">
                    <label className={labelClass}>Assigned taxes</label>
                    {!isTaxEnabled ? (
                        <p className="text-sm text-gray-500 py-2">Tax calculation is disabled in corporate settings.</p>
                    ) : taxSelectOptions.length === 0 ? (
                        <p className="text-sm text-amber-600 py-2">No active taxes defined. Add taxes under Settings → Tax.</p>
                    ) : (
                        <Select
                            isMulti
                            name="assigned_tax_ids"
                            options={taxSelectOptions}
                            onChange={(selected) =>
                                setFormData((prev) => ({
                                    ...prev,
                                    assigned_tax_ids: selected ? selected.map((o) => o.value) : [],
                                }))
                            }
                            styles={selectStyles}
                            value={taxSelectOptions.filter((o) =>
                                (formData.assigned_tax_ids || []).map(Number).includes(o.value)
                            )}
                            placeholder="Select one or more taxes (optional)"
                            closeMenuOnSelect={false}
                        />
                    )}
                </div> */}
            </div>

            <div>
                <div className="flex items-center gap-x-3 mb-5 mt-2">
                    <p className="text-xl font-bold text-gray-800 whitespace-nowrap">Invoicing Details</p>
                    <div className="flex-1 border-t border-blue-200" />
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <div className="flex flex-col">
                        <label className={labelClass}>Invoicing Type</label>
                        <Select
                            options={invoiceTypeOptions}
                            onChange={(option) => setFormData(prev => ({ ...prev, invoice_type: option.value }))}
                            styles={selectStyles}
                            value={invoiceTypeOptions.find(t => t.value === formData.invoice_type) || null}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Invoicing Period</label>
                        <input name="invoicing_period" className={inputClass} value={formData.invoicing_period} onChange={handleInputChange} />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Credit Period</label>
                        <input name="payment_period" className={inputClass} value={formData.payment_period} onChange={handleInputChange} />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Vat Number</label>
                        <input name="vat_number" className={inputClass} value={formData.vat_number} onChange={handleInputChange} />
                    </div>

                </div>
            </div>

            <div>
                <div className="flex items-center gap-x-3 mb-5 mt-2">
                    <p className="text-xl font-bold text-gray-800 whitespace-nowrap">Locations</p>
                    <div className="flex-1 border-t border-blue-200" />
                </div>
                {locations.map((location, locIndex) => (
                    <div key={locIndex} className="bg-blue-50/30 p-6 rounded-2xl mb-6 border border-blue-100/50">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-5 mb-5">
                            <div className="flex flex-col">
                                <label className={labelClass}>Location name</label>
                                <input className={inputClass} value={location.location_name} onChange={(e) => handleLocationChange(locIndex, "location_name", e.target.value)} />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Delivery Address</label>
                                <input className={inputClass} value={location.location_address} onChange={(e) => handleLocationChange(locIndex, "location_address", e.target.value)} />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Transport charges(Rate)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className={inputClass}
                                    value={location.transport_rate}
                                    onChange={(e) => handleLocationChange(locIndex, "transport_rate", e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Location Telephone</label>
                                <input
                                    className={`${inputClass} ${location.location_telephone?.length > 0 && location.location_telephone?.length < 10 ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}
                                    value={location.location_telephone}
                                    maxLength={10}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, "");
                                        if (val.length <= 10) {
                                            handleLocationChange(locIndex, "location_telephone", val);
                                        }
                                    }}
                                    placeholder="0112345678"
                                />
                                {location.location_telephone?.length > 0 && location.location_telephone?.length < 10 && (
                                    <span className="text-red-500 text-xs mt-1 font-medium ml-1">
                                        Telephone number must be 10 digits.
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Location Email</label>
                                <input
                                    type="email"
                                    className={`${inputClass} ${location.location_email && !location.location_email.includes("@") ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}
                                    value={location.location_email}
                                    onChange={(e) => handleLocationChange(locIndex, "location_email", e.target.value)}
                                    placeholder="location@gmail.com"
                                />
                                {location.location_email && !location.location_email.includes("@") && (
                                    <span className="text-red-500 text-xs mt-1 font-medium ml-1">
                                        Please enter a valid email
                                    </span>
                                )}
                            </div>
                        </div>

                        {location.contact_persons.map((contact, cpIndex) => (
                            <div key={cpIndex} className="grid grid-cols-3 gap-x-4 mt-4 items-end relative">
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Name</label>
                                    <input className={inputClass} value={contact.contact_person_name} onChange={(e) => handleContactPersonChange(locIndex, cpIndex, "contact_person_name", e.target.value)} />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Phone Number</label>
                                    <input
                                        className={`${inputClass} ${contact.contact_person_phone?.length > 0 && contact.contact_person_phone?.length < 10 ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}
                                        value={contact.contact_person_phone}
                                        maxLength={10}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "");
                                            if (val.length <= 10) {
                                                handleContactPersonChange(locIndex, cpIndex, "contact_person_phone", val);
                                            }
                                        }}
                                        placeholder="0712345678"
                                    />
                                    {contact.contact_person_phone?.length > 0 && contact.contact_person_phone?.length < 10 && (
                                        <span className="text-red-500 text-[10px] mt-1 font-medium ml-1">
                                            Must be 10 digits.
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col relative">
                                    <label className={labelClass}>Contact Person Email</label>
                                    <input
                                        className={`${inputClass} pr-12 ${contact.contact_person_email && !contact.contact_person_email.includes("@") ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}
                                        value={contact.contact_person_email}
                                        onChange={(e) => handleContactPersonChange(locIndex, cpIndex, "contact_person_email", e.target.value)}
                                        placeholder="contact@gmail.com"
                                    />
                                    {contact.contact_person_email && !contact.contact_person_email.includes("@") && (
                                        <span className="text-red-500 text-[10px] mt-1 font-medium ml-1">
                                            Please enter a valid email
                                        </span>
                                    )}
                                    {cpIndex === location.contact_persons.length - 1 && (
                                        <div
                                            className="absolute right-3 top-[2.2rem] text-blue-500 font-bold text-xl cursor-pointer hover:scale-110 transition-transform"
                                            onClick={() => handleAddContactPerson(locIndex)}
                                        >
                                            +
                                        </div>
                                    )}
                                </div>
                                {cpIndex === location.contact_persons.length - 1 && (
                                    <div className="absolute -bottom-5 right-0 text-[0.65rem] text-blue-400 font-bold uppercase tracking-wider cursor-pointer hover:text-blue-600"
                                        onClick={() => handleAddContactPerson(locIndex)}>
                                        Add Another
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
                <button type="button" className="text-blue-500 font-bold text-lg hover:underline transition-all flex items-center gap-x-1" onClick={handleAddLocation}>
                    <span className="text-2xl">+</span> Add Another Location
                </button>
            </div>

            {/* Service Type Section */}
            <div>
                <div className="flex items-center gap-x-3 mb-5 mt-2">
                    <p className="text-xl font-bold text-gray-800 whitespace-nowrap">Service Type</p>
                    <div className="flex-1 border-t border-blue-200" />
                </div>

                {serviceTypes.map((st, index) => (
                    <div key={index} className="grid grid-cols-2 gap-x-8 gap-y-5 mb-4 items-end">
                        <div className="flex flex-col">
                            <label className={labelClass}>Service Types</label>
                            <Select
                                options={[
                                    { value: "Normal", label: "Normal" },
                                    { value: "Urgent", label: "Urgent" },
                                    { value: "Express", label: "Express" },
                                ]}
                                onChange={(option) =>
                                    handleServiceTypeChange(index, "service_type", option ? option.value : "")
                                }
                                styles={selectStyles}
                                value={
                                    st.service_type
                                        ? { value: st.service_type, label: st.service_type }
                                        : null
                                }
                                placeholder="Select Service Type"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className={labelClass}>Percentage</label>
                            <div className="flex items-center gap-x-3">
                                <input
                                    type="number"
                                    step="0.01"
                                    className={`${inputClass} ${st.service_type === "Normal" ? "bg-gray-100 cursor-not-allowed" : ""}`}
                                    value={st.percentage}
                                    onChange={(e) =>
                                        handleServiceTypeChange(index, "percentage", e.target.value)
                                    }
                                    placeholder="0.00"
                                    disabled={st.service_type === "Normal"}
                                />
                                {serviceTypes.length > 1 && (
                                    <button
                                        type="button"
                                        className="text-red-500 font-semibold cursor-pointer shrink-0 ml-2 text-sm hover:underline"
                                        onClick={() => handleRemoveServiceType(index)}
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <hr className="my-2" />
                <button
                    type="button"
                    className="text-blue-500 font-bold text-lg hover:underline transition-all flex items-center gap-x-1 mt-1"
                    onClick={handleAddServiceType}
                >
                    <span className="text-2xl">+</span> Add Another Service Type
                </button>
            </div>

            {errorMessage && <p className="text-center text-red-500 font-semibold">{errorMessage}</p>}

            <div className="flex flex-row gap-x-6 mt-6">
                <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full text-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50" disabled={isLoading}>
                    {isLoading ? <BeatLoader color="#fff" size={12} /> : "Update"}
                </button>
                <button type="button" className="flex-1 bg-white text-blue-600 border-2 border-blue-600 font-bold py-3.5 rounded-full text-xl hover:bg-blue-50 transition-all" onClick={handleClose}>
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default CorporateCustomerUpdateForm;