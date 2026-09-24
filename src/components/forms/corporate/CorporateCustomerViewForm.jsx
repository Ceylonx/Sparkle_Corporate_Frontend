import { useEffect, useState } from "react";
import Select from "react-select";

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

const CorporateCustomerViewForm = ({ customerData }) => {
    const [locations, setLocations] = useState([emptyLocation()]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [formData, setFormData] = useState({
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
        assigned_taxes_display: "",
        discount: "",
    });

    const invoiceTypeOptions = [
        { value: "Daily Invoice", label: "Daily Invoice" },
        { value: "Period Invoice", label: "Period Invoice" },
    ];

    const selectStyles = {
        control: (base) => ({
            ...base,
            backgroundColor: "#F9FAFB", // gray-50 for read-only look
            borderRadius: "0.75rem",
            borderColor: "#E5E7EB",
            padding: "0.25rem 0.5rem",
            boxShadow: "none",
            cursor: "default",
        }),
        placeholder: (base) => ({ ...base, color: "#9CA3AF" }),
        singleValue: (base) => ({ ...base, color: "#374151" }),
    };

    useEffect(() => {
        if (customerData) {
            setFormData({
                company_name: customerData.company_name || customerData.customer_company_name || "-",
                customer_br_number: customerData.customer_BR_number || "-",
                customer_br_date: customerData.customer_BR_date || "-",
                address: customerData.customer_address || "-",
                phone_number: customerData.customer_phone || "-",
                email: customerData.customer_email || "-",
                vat_number: customerData.customer_vat_number || "-",
                invoice_type: customerData.customer_invoice_type || "-",
                invoicing_period: customerData.customer_invoicing_period != null && customerData.customer_invoicing_period !== "" ? String(customerData.customer_invoicing_period) : "-",
                payment_period: customerData.customer_payment_period != null && customerData.customer_payment_period !== "" ? String(customerData.customer_payment_period) : "-",
                discount: customerData.discount != null && customerData.discount !== "" ? `${customerData.discount}%` : "-",
                assigned_taxes_display: (() => {
                    if (Array.isArray(customerData.assigned_taxes) && customerData.assigned_taxes.length > 0) {
                        return customerData.assigned_taxes
                            .map((t) => `${t.tax_name} (${Number(t.tax_rate).toFixed(2)}%)`)
                            .join(", ");
                    }
                    const tt = (customerData.tax_type || "").trim();
                    return tt && tt.toLowerCase() !== "no tax" ? tt : "No Tax";
                })(),
            });

            if (customerData.locations && Array.isArray(customerData.locations)) {
                setLocations(customerData.locations.map(loc => ({
                    location_name: loc.location_name || "-",
                    location_address: loc.location_address || "-",
                    location_telephone: loc.location_phone || loc.location__telephone || "-",
                    location_email: loc.location_email || "-",
                    transport_rate: loc.transport_rate != null && loc.transport_rate !== "" ? String(loc.transport_rate) : "-",
                    contact_persons: (loc.location_contact_persons || loc.contact_persons || [emptyContactPerson()]).map(cp => ({
                        contact_person_name: cp.contact_person_name || "-",
                        contact_person_phone: cp.contact_person_phone || "-",
                        contact_person_email: cp.contact_person_email || "-",
                    })),
                })));
            }

            if (customerData.service_types && Array.isArray(customerData.service_types)) {
                setServiceTypes(customerData.service_types.map(st => ({
                    service_type: st.service_type || "-",
                    percentage: st.percentage != null ? `${st.percentage}%` : "-",
                })));
            } else {
                setServiceTypes([]);
            }
        }
    }, [customerData]);

    const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-base bg-gray-50 text-gray-700 cursor-default focus:outline-none placeholder-gray-400";
    const labelClass = "text-sm font-semibold text-gray-600 mb-1 ml-1";

    return (
        <div className="flex flex-col gap-y-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                <div className="flex flex-col">
                    <label className={labelClass}>Company Name</label>
                    <input className={inputClass} value={formData.company_name} readOnly />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer BR Number</label>
                    <input className={inputClass} value={formData.customer_br_number} readOnly />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer BR Date</label>
                    <input className={inputClass} value={formData.customer_br_date} readOnly />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Registered Address</label>
                    <input className={inputClass} value={formData.address} readOnly />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer Phone Number</label>
                    <input className={inputClass} value={formData.phone_number} readOnly />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Customer Email</label>
                    <input className={inputClass} value={formData.email} readOnly />
                </div>
                <div className="flex flex-col">
                    <label className={labelClass}>Discount (%)</label>
                    <input className={inputClass} value={formData.discount} readOnly />
                </div>
                {/* <div className="flex flex-col">
                    <label className={labelClass}>Assigned taxes</label>
                    <input className={inputClass} value={formData.assigned_taxes_display} readOnly />
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
                            styles={selectStyles}
                            value={invoiceTypeOptions.find(t => t.value === formData.invoice_type) || null}
                            isDisabled
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Invoicing Period</label>
                        <input className={inputClass} value={formData.invoicing_period} readOnly />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Credit Period</label>
                        <input className={inputClass} value={formData.payment_period} readOnly />
                    </div>
                    <div className="flex flex-col">
                        <label className={labelClass}>Vat Number</label>
                        <input className={inputClass} value={formData.vat_number} readOnly />
                    </div>
                </div>
            </div>


            <div>
                <div className="flex items-center gap-x-3 mb-5 mt-2">
                    <p className="text-xl font-bold text-gray-800 whitespace-nowrap">Locations</p>
                    <div className="flex-1 border-t border-blue-200" />
                </div>
                {locations.map((location, locIndex) => (
                    <div key={locIndex} className="bg-gray-50/50 p-6 rounded-2xl mb-6 border border-gray-100">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-5 mb-5">
                            <div className="flex flex-col">
                                <label className={labelClass}>Location name</label>
                                <input className={inputClass} value={location.location_name} readOnly />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Delivery Address</label>
                                <input className={inputClass} value={location.location_address} readOnly />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Transport charges(Rate)</label>
                                <input className={inputClass} value={location.transport_rate} readOnly />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Location Telephone</label>
                                <input className={inputClass} value={location.location_telephone} readOnly />
                            </div>
                            <div className="flex flex-col">
                                <label className={labelClass}>Location Email</label>
                                <input className={inputClass} value={location.location_email} readOnly />
                            </div>
                        </div>

                        {location.contact_persons.map((contact, cpIndex) => (
                            <div key={cpIndex} className="grid grid-cols-3 gap-x-4 mt-4 items-end">
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Name</label>
                                    <input className={inputClass} value={contact.contact_person_name} readOnly />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Phone Number</label>
                                    <input className={inputClass} value={contact.contact_person_phone} readOnly />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelClass}>Contact Person Email</label>
                                    <input className={inputClass} value={contact.contact_person_email} readOnly />
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            <div>
                <div className="flex items-center gap-x-3 mb-5 mt-2">
                    <p className="text-xl font-bold text-gray-800 whitespace-nowrap">Service Types</p>
                    <div className="flex-1 border-t border-blue-200" />
                </div>
                {serviceTypes.length === 0 ? (
                    <p className="text-sm text-gray-500 italic ml-1">No service types assigned.</p>
                ) : (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        {serviceTypes.map((st, index) => (
                            <div key={index} className="grid grid-cols-2 gap-x-4">
                                <div className="flex flex-col">
                                    <label className={labelClass}>Service Type</label>
                                    <input className={inputClass} value={st.service_type} readOnly />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelClass}>Percentage</label>
                                    <input className={inputClass} value={st.percentage} readOnly />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CorporateCustomerViewForm;
