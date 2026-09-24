import { useEffect, useState } from "react";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { BeatLoader } from "react-spinners";
import { createCorporateCustomer } from "../../../services/CustomerServices";
import { getAllCorporateSettings, getCorporateTaxes } from "../../../services/corporate/CorporateSettingsServices";
import Swal from "sweetalert2";

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

const CorporateCustomerCreateForm = ({ handleClose }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [invoicingPeriodMenuOpen, setInvoicingPeriodMenuOpen] = useState(false);
    const [invoicingPeriodInputValue, setInvoicingPeriodInputValue] = useState("");
    const [locations, setLocations] = useState([emptyLocation()]);
    const [serviceTypes, setServiceTypes] = useState([emptyServiceType()]);
    const [formData, setFormData] = useState({
        user_id: localStorage.getItem("userId"),
        branch_id: -1,
        company_name: "",
        customer_br_number: "",
        customer_br_date: "",
        address: "",
        phone_number: "",
        email: "",
        customer_name: "",
        customer_type: "Cooperate",
        discount: "",
        assigned_tax_ids: [],
        vat_number: "",
        invoice_type: "",
        invoicing_period: "",
        payment_period: "",
        status: "New",
        transport_rate: "",
    });

    const [isTaxEnabled, setIsTaxEnabled] = useState(false);
    const [availableTaxes, setAvailableTaxes] = useState([]);

    useEffect(() => {
        const fetchTaxSettings = async () => {
            try {
                const uid = localStorage.getItem("userId");
                const response = await getAllCorporateSettings(uid);
                if (response && response.data && response.data.settings && response.data.settings[0]) {
                    const settings = response.data.settings[0];
                    setIsTaxEnabled(settings.is_tax_enabled === 1 || settings.is_tax_enabled === true);
                }
                try {
                    const taxRes = await getCorporateTaxes(uid, { activeOnly: true });
                    setAvailableTaxes(Array.isArray(taxRes.taxes) ? taxRes.taxes : []);
                } catch (e) {
                    console.error("Error fetching corporate taxes:", e);
                    setAvailableTaxes([]);
                }
            } catch (error) {
                console.error("Error fetching tax settings:", error);
            }
        };
        fetchTaxSettings();
    }, []);

    const taxSelectOptions = availableTaxes.map((t) => ({
        value: Number(t.tax_id),
        label: `${t.tax_name} (${Number(t.tax_rate).toFixed(2)}%)`,
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

    const invoicingPeriodPresetOptions = [
        { value: 1, label: "1" },
        { value: 15, label: "15" },
        { value: 30, label: "30" },
    ];

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.5rem",
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            padding: "0.1rem 0.25rem",
            boxShadow: "none",
            "&:hover": { borderColor: state.isFocused ? "#1470F9" : "#d1d5db" },
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

    const handleInputChange = (e) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleInputNumberChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value === "" ? "" : Number(e.target.value),
        }));
    };

    const handleInputPhoneChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value.replace(/\D/g, ""),
        }));
    };

    // Update a top-level field in a location
    const handleLocationChange = (locIndex, field, value) => {
        setLocations((prev) => {
            const updated = [...prev];
            updated[locIndex] = { ...updated[locIndex], [field]: value };
            return updated;
        });
    };

    // Update a field inside a specific contact person of a location
    const handleContactPersonChange = (locIndex, contactIndex, field, value) => {
        setLocations((prev) => {
            const updated = [...prev];
            const updatedContacts = [...updated[locIndex].contact_persons];
            updatedContacts[contactIndex] = { ...updatedContacts[contactIndex], [field]: value };
            updated[locIndex] = { ...updated[locIndex], contact_persons: updatedContacts };
            return updated;
        });
    };

    // Add a new contact person row to a specific location
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
            setErrorMessage("Please enter company name before proceeding.");
            return;
        } else if (!formData.customer_br_number) {
            setErrorMessage("Please enter BR number before proceeding.");
            return;
        } else if (!formData.phone_number) {
            setErrorMessage("Please enter phone number before proceeding.");
            return;
        } else if (formData.phone_number.length !== 10) {
            setErrorMessage("Phone number must be exactly 10 digits.");
            return;
        } else if (!formData.invoice_type) {
            setErrorMessage("Please select invoice type before proceeding.");
            return;
        } else if (!formData.invoicing_period) {
            setErrorMessage("Please enter invoicing period before proceeding.");
            return;
        } else if (!formData.payment_period) {
            setErrorMessage("Please enter credit period before proceeding.");
            return;
        }

        // Validate Transport charges in locations
        if (locations.length === 0) {
            setErrorMessage("Please add at least one location.");
            return;
        }
        for (let i = 0; i < locations.length; i++) {
            const loc = locations[i];
            if (loc.transport_rate === "" || loc.transport_rate === null || loc.transport_rate === undefined) {
                setErrorMessage(`Please enter Transport charges for Location ${i + 1}.`);
                return;
            }
        }

        // Validate Service Types and their percentages
        if (serviceTypes.length === 0) {
            setErrorMessage("Please add at least one Service Type.");
            return;
        }
        for (let i = 0; i < serviceTypes.length; i++) {
            const st = serviceTypes[i];
            if (!st.service_type) {
                setErrorMessage(`Please select Service Type for row ${i + 1}.`);
                return;
            }
            if (st.service_type !== "Normal" && (st.percentage === "" || st.percentage === null || st.percentage === undefined)) {
                setErrorMessage(`Please enter percentage for Service Type ${st.service_type}.`);
                return;
            }
        }

        setErrorMessage("");

        try {
            setIsLoading(true);
            const payload = {
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
                assigned_tax_ids: Array.isArray(formData.assigned_tax_ids) ? formData.assigned_tax_ids.map(Number) : [],
                tax_type: deriveLegacyTaxType(formData.assigned_tax_ids),
                transport_rate: Number(formData.transport_rate || 0),
                locations: locations.map((loc) => ({
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
            await createCorporateCustomer(payload);
            
            await Swal.fire({
                icon: "success",
                title: "Customer Created",
                text: "Customer has been saved successfully.",
                confirmButtonColor: "#1470F9",
            });

            handleClose();
        } catch (error) {
            console.error("Error creating customer: ", error);
            const data = error?.response?.data;
            const message = 
                (typeof data === "string" && data) ||
                data?.message ||
                data?.error ||
                data?.msg ||
                "Failed to save customer. Please try again.";
            
            await Swal.fire({
                icon: "error",
                title: "Error",
                text: message,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const fieldClass =
        "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary";
    const labelClass = "text-sm font-medium text-gray-700 mb-1";

    const getInvoicingPeriodSelectValue = () => {
        const v = formData.invoicing_period;
        if (v === "" || v === null || v === undefined) return null;
        const num = Number(v);
        if (!Number.isFinite(num) || num <= 0) return null;
        const preset = invoicingPeriodPresetOptions.find((o) => o.value === num);
        return preset ?? { value: num, label: String(num) };
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5">

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex flex-col">
                    <label className={labelClass}>Company Name <span className="text-red-500">*</span></label>
                    <input
                        name="company_name"
                        className={fieldClass}
                        value={formData.company_name}
                        onChange={handleInputChange}
                    />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer BR Number <span className="text-red-500">*</span></label>
                    <input
                        name="customer_br_number"
                        className={fieldClass}
                        value={formData.customer_br_number}
                        onChange={handleInputChange}
                    />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer BR Date</label>
                    <input
                        name="customer_br_date"
                        type="date"
                        className={fieldClass}
                        value={formData.customer_br_date}
                        onChange={handleInputChange}
                    />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Registered Address</label>
                    <input
                        name="address"
                        className={fieldClass}
                        value={formData.address}
                        onChange={handleInputChange}
                    />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer Phone Number <span className="text-red-500">*</span></label>
                    <input
                        name="phone_number"
                        className={`${fieldClass} ${formData.phone_number?.length > 0 && formData.phone_number?.length < 10 ? 'border-red-500 focus:ring-red-500' : ''}`}
                        value={formData.phone_number}
                        maxLength={10}
                        onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");

                            if (val.length <= 10) {
                                handleInputPhoneChange({
                                    target: {
                                        name: "phone_number",
                                        value: val
                                    }
                                });
                            }
                        }}
                        placeholder="e.g. 0712345678"
                    />

                    {/* Error message eka ilakkama 10 k nathnam pamanak pennanna */}
                    {formData.phone_number?.length > 0 && formData.phone_number?.length < 10 && (
                        <span className="text-red-500 text-xs mt-1 font-medium">
                            Phone number must be exactly 10 digits.
                        </span>
                    )}
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer Email</label>
                    <input
                        name="email"
                        type="email"
                        className={`${fieldClass} ${formData.email && !formData.email.includes("@")
                            ? 'border-red-500 focus:ring-red-500'
                            : ''
                            }`}
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="infor@sparklelaundry.lk
"
                    />

                    {formData.email && !formData.email.includes("@") && (
                        <span className="text-red-500 text-xs mt-1 font-medium">
                            Please enter a valid email
                        </span>
                    )}
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Discount (%)</label>
                    <div className="relative">
                        <input
                            name="discount"
                            type="number"
                            step="0.01"
                            className={`${fieldClass} pr-8`}
                            value={formData.discount}
                            onChange={handleInputNumberChange}
                            placeholder="0.00"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-semibold pointer-events-none">%</span>
                    </div>
                </div>
                {/* <div className="flex flex-col">
                    <label className={labelClass}>Assigned taxes</label>
                    {!isTaxEnabled ? (
                        <p className="text-sm text-gray-500 py-2">Tax calculation is disabled in corporate settings. Enable it under Settings → Tax to assign taxes.</p>
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

            {/* Invoicing Details Section */}
            <div>
                <div className="flex items-center gap-x-3 mb-4">
                    <p className="text-m font-bold text-gray-800 whitespace-nowrap">Invoicing Details</p>
                    <div className="flex-1 border-t border-blue-300" />
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="flex flex-col">
                        <label className={labelClass}>Invoicing Type <span className="text-red-500">*</span></label>
                        <Select
                            name="invoice_type"
                            options={invoiceTypeOptions}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, invoice_type: option.value }))
                            }
                            styles={selectStyles}
                            value={invoiceTypeOptions.find((t) => t.value === formData.invoice_type) || null}
                            placeholder=""
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Invoicing Period <span className="text-red-500">*</span></label>
                        <CreatableSelect
                            name="invoicing_period"
                            inputId="invoicing_period"
                            options={invoicingPeriodPresetOptions}
                            styles={selectStyles}
                            value={getInvoicingPeriodSelectValue()}
                            inputValue={invoicingPeriodInputValue}
                            menuIsOpen={invoicingPeriodInputValue.trim() === "" && invoicingPeriodMenuOpen}
                            onMenuOpen={() => setInvoicingPeriodMenuOpen(true)}
                            onMenuClose={() => setInvoicingPeriodMenuOpen(false)}
                            onChange={(option) => {
                                if (!option) {
                                    setInvoicingPeriodInputValue("");
                                    setFormData((prev) => ({
                                        ...prev,
                                        invoicing_period: "",
                                        payment_period: "",
                                    }));
                                    return;
                                }
                                const n = Number(option.value);
                                const invoicingPeriod = Number.isFinite(n) && n > 0 ? n : "";
                                setInvoicingPeriodInputValue("");
                                setFormData((prev) => ({
                                    ...prev,
                                    invoicing_period: invoicingPeriod,
                                    // Keep credit period in sync with invoicing period.
                                    // User can still edit it; it will be overwritten if invoicing period changes again.
                                    payment_period: invoicingPeriod,
                                }));
                            }}
                            onInputChange={(inputValue, meta) => {
                                // Close dropdown while typing (avoid showing "Use X" create-option).
                                if (meta?.action === "input-change") {
                                    setInvoicingPeriodInputValue(inputValue);
                                    setInvoicingPeriodMenuOpen(false);
                                    const t = String(inputValue ?? "").trim();
                                    if (!t) {
                                        setFormData((prev) => ({ ...prev, invoicing_period: "", payment_period: "" }));
                                        return inputValue;
                                    }

                                    const n = Number(t);
                                    if (Number.isInteger(n) && n > 0) {
                                        setFormData((prev) => ({ ...prev, invoicing_period: n, payment_period: n }));
                                    }
                                } else if (meta?.action === "set-value" || meta?.action === "menu-close") {
                                    setInvoicingPeriodInputValue("");
                                }
                                return inputValue;
                            }}
                            placeholder="Type or select 1 / 15 / 30"
                            isClearable
                            // Hide the "Use X" create-option text while typing.
                            // The created option will still be selected (label uses the input value).
                            formatCreateLabel={() => " "}
                            isValidNewOption={(inputValue) => {
                                const t = String(inputValue).trim();
                                if (!t) return false;
                                const n = Number(t);
                                return Number.isInteger(n) && n > 0;
                            }}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Credit Period <span className="text-red-500">*</span></label>
                        <input
                            name="payment_period"
                            type="number"
                            className={fieldClass}
                            value={formData.payment_period}
                            onChange={handleInputNumberChange}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Vat Number</label>
                        <input
                            name="vat_number"
                            className={fieldClass}
                            value={formData.vat_number}
                            onChange={handleInputChange}
                        />
                    </div>

                </div>
            </div>

            {/* Locations Section */}
            <div>
                <div className="flex items-center gap-x-3 mb-4">
                    <p className="text-m font-bold text-gray-800 whitespace-nowrap">Locations</p>
                    <div className="flex-1 border-t border-blue-300" />
                </div>

                {locations.map((location, locIndex) => (
                    <div key={locIndex} className="flex flex-col gap-y-4 mb-6">

                        {/* Location fields */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="flex flex-col">
                                <label className={labelClass}>Location name</label>
                                <input
                                    className={fieldClass}
                                    value={location.location_name}
                                    onChange={(e) => handleLocationChange(locIndex, "location_name", e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Delivery Address</label>
                                <input
                                    className={fieldClass}
                                    value={location.location_address}
                                    onChange={(e) => handleLocationChange(locIndex, "location_address", e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Transport charges(Rate) <span className="text-red-500">*</span></label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className={fieldClass}
                                    value={location.transport_rate}
                                    onChange={(e) => handleLocationChange(locIndex, "transport_rate", e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Location Telephone</label>
                                <input
                                    className={`${fieldClass} ${location.location_telephone?.length > 0 && location.location_telephone?.length < 10 ? 'border-red-500 focus:border-red-500' : ''}`}
                                    value={location.location_telephone}
                                    maxLength={10}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, "");
                                        if (val.length <= 10) {
                                            handleLocationChange(locIndex, "location_telephone", val);
                                        }
                                    }}
                                    placeholder="e.g. 0112345678"
                                />
                                {/* show error message if the length of the phone number is less than 10 */}
                                {location.location_telephone?.length > 0 && location.location_telephone?.length < 10 && (
                                    <span className="text-red-500 text-xs mt-1 font-medium">
                                        Telephone number must be 10 digits.
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Location Email</label>
                                <input
                                    type="email" // Browser එකට email එකක් කියලා අඳුරගන්න ලේසියි
                                    className={fieldClass}
                                    value={location.location_email}
                                    onChange={(e) => handleLocationChange(locIndex, "location_email", e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Contact Persons — each row is one contact person */}
                        {location.contact_persons.map((contact, contactIndex) => (
                            <div key={contactIndex} className="grid grid-cols-3 gap-x-4">
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Name</label>
                                    <input
                                        className={fieldClass}
                                        value={contact.contact_person_name}
                                        onChange={(e) =>
                                            handleContactPersonChange(locIndex, contactIndex, "contact_person_name", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Phone Number</label>
                                    <input
                                        className={`${fieldClass} ${contact.contact_person_phone.length > 0 && contact.contact_person_phone.length < 10 ? 'border-red-500' : ''}`}
                                        value={contact.contact_person_phone}
                                        // maxLength={10} cannot use 10 digits as it will not allow to type more than 10 digits
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, ""); // remove all non-digits
                                            // if the length of the value is less than or equal to 10, then update the state
                                            if (val.length <= 10) {
                                                handleContactPersonChange(
                                                    locIndex,
                                                    contactIndex,
                                                    "contact_person_phone",
                                                    val
                                                );
                                            }
                                        }}
                                        placeholder="e.g. 0712345678"
                                    />
                                    {/* show error message if the length of the phone number is less than 10 */}
                                    {contact.contact_person_phone.length > 0 && contact.contact_person_phone.length < 10 && (
                                        <span className="text-red-500 text-xs mt-1 font-medium">
                                            Phone number must be exactly 10 digits.
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Email</label>
                                    <div className="relative">
                                        <input
                    
                                            className={`${fieldClass} pr-8 ${contact.contact_person_email && !contact.contact_person_email.includes("@")
                                                    ? 'border-red-500 focus:ring-red-500'
                                                    : ''
                                                }`}
                                            value={contact.contact_person_email}
                                            onChange={(e) =>
                                                handleContactPersonChange(locIndex, contactIndex, "contact_person_email", e.target.value)
                                            }
                                            placeholder="infor@sparklelaundry.lk"
                                        />
                                    </div>

                                    
                                    {contact.contact_person_email && !contact.contact_person_email.includes("@") && (
                                        <span className="text-red-500 text-[10px] mt-0.5 font-medium">
                                            Please enter a valid email
                                        </span>
                                    )}

                                    {/* Show "Add Another" label only on the last contact row */}
                                    {contactIndex === location.contact_persons.length - 1 && (
                                        <span
                                            className="text-xs text-primary text-right mt-0.5 cursor-pointer hover:underline select-none font-bold"
                                            onClick={() => handleAddContactPerson(locIndex)}
                                        >
                                            + Add Another
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
                <hr />

                <button
                    type="button"
                    className="text-primary font-semibold text-m cursor-pointer hover:underline mt-1"
                    onClick={handleAddLocation}
                >
                    + Add Another Location
                </button>
            </div>

            {/* Service Type Section */}
            <div>
                <div className="flex items-center gap-x-3 mb-4">
                    <p className="text-m font-bold text-gray-800 whitespace-nowrap">Service Type</p>
                    <div className="flex-1 border-t border-blue-300" />
                </div>

                {serviceTypes.map((st, index) => (
                    <div key={index} className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4 items-end">
                        <div className="flex flex-col">
                            <label className={labelClass}>Service Types <span className="text-red-500">*</span></label>
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
                            <label className={labelClass}>Percentage <span className="text-red-500">*</span></label>
                            <div className="flex items-center gap-x-3">
                                <input
                                    type="number"
                                    step="0.01"
                                    className={`${fieldClass} ${st.service_type === "Normal" ? "bg-gray-100 cursor-not-allowed" : ""}`}
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
                    className="text-primary font-semibold text-m cursor-pointer hover:underline mt-1"
                    onClick={handleAddServiceType}
                >
                    + Add Another Service Type
                </button>
            </div>

            {/* Error */}
            {errorMessage && (
                <p className="text-center text-red-500 text-sm font-semibold">{errorMessage}</p>
            )}

            {/* Actions */}
            <div className="flex flex-row gap-x-5 text-base mt-2">
                <button
                    type="submit"
                    className="font-semibold text-white bg-primary rounded-full py-2.5 w-full cursor-pointer"
                    disabled={isLoading}
                >
                    {isLoading ? <BeatLoader color="#fff" size={10} /> : "Apply"}
                </button>
                <button
                    type="button"
                    className="font-semibold text-primary bg-white border border-primary rounded-full py-2.5 w-full cursor-pointer"
                    onClick={handleClose}
                    disabled={isLoading}
                >
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default CorporateCustomerCreateForm;