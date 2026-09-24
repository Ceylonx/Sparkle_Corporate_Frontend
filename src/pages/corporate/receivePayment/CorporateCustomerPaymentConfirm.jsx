import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useLocation, useNavigate } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import Select from "react-select";
import CorporatePaymentReceipt from "../../../components/printables/CorporatePaymentReceipt";
import { getAllCorporateSettings } from "../../../services/corporate/CorporateSettingsServices";
import { generateCorporateInvoice } from "../../../services/corporate/CorporateInvoicingServices";
import { BeatLoader } from "react-spinners";
import { taxSummaryToGenerateInvoiceAmounts, invoiceBindNumber } from "../../../utils/corporateTaxInvoiceMath";

const CorporateCustomerPaymentConfirm = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const invoiceRef = useRef(null);
    const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const {
        customerInfo = {},
        selectedInvoices = [],
        paymentAmount = 0,
        paymentMethod = "Cash",
        paymentNote = "",
    } = location.state || {};

    const paymentMethodApi = paymentMethod === "Cash" ? "CASH" : "CARD";
    const totalPay = Number(paymentAmount || 0);

    const allItems = selectedInvoices.flatMap(inv =>
        (inv.items || []).map(item => ({
            item_name: item.corp_item_name || "Unknown Item",
            item_category: item.item_category_name || "Unknown",
            service_type_id: item.service_types?.[0]?.service_type_id || null,
            quantity: Number(item.corp_item_quantity || 0),
            rate: Number(item.corp_item_price || 0),
            amount: Number(item.corp_item_quantity || 0) * Number(item.corp_item_price || 0)
        }))
    );

    const [formData, setFormData] = useState({
        invoice_id: selectedInvoices.length === 1
            ? selectedInvoices[0]?.invoice_id || ""
            : selectedInvoices.map(i => i.invoice_id).join(", "),
        company_name: customerInfo.company_name || "",
        customer_id: customerInfo.customer_id || selectedInvoices[0]?.customer_id || "",
        customer_name: customerInfo.customer_name || "",
        phone_number: customerInfo.phone_number || selectedInvoices[0]?.phone_number || "",
        items: allItems,
        total_amount: totalPay,
        payment_method: paymentMethodApi,
        cash_amount: paymentMethodApi === "CASH" ? totalPay : 0,
        card_amount: paymentMethodApi === "CARD" ? totalPay : 0,
        card_type: "",
        bank: "",
        discount: 0,
        is_discount_percentage: 0,
        balance_due: 0,
        notes: paymentNote || "",
        terms_and_conditions: "",
        vat_status: "",
    });

    const vatOptions = [
        { value: "VAT", label: "VAT" },
        { value: "NON-VAT", label: "Non-VAT" },
    ];

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem",
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            padding: "0rem 0.25rem",
            boxShadow: "none",
            "&:hover": { borderColor: state.isFocused ? "#1470F9" : "#d1d5db" },
        }),
        placeholder: (base) => ({ ...base, color: "#6B7280" }),
        singleValue: (base) => ({ ...base, color: "#000000" }),
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await getAllCorporateSettings(localStorage.getItem("userId"));
                const settings = response.data.settings[0];
                setFormData(prev => ({
                    ...prev,
                    notes: prev.notes || settings.receipt_notes || "",
                    terms_and_conditions: prev.terms_and_conditions || settings.receipt_terms || "",
                }));
            } catch (error) {
                console.error("Error fetching corporate settings:", error);
            }
        };
        fetchSettings();
    }, []);

    const handlePrint = useReactToPrint({ contentRef: invoiceRef });

    const handleConfirmPayment = async () => {
        if (!formData.vat_status) {
            setErrorMessage("Please select the VAT status.");
            return;
        }
        setErrorMessage("");
        try {
            setIsLoadingSubmit(true);

            const subTotal = selectedInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);

            const payload = {
                user_id: localStorage.getItem("userId") || "",
                company_name: String(customerInfo.company_name || ""),
                customer_id: String(customerInfo.customer_id || selectedInvoices[0]?.customer_id || ""),
                phone_number: String(customerInfo.phone_number || selectedInvoices[0]?.phone_number || ""),
                invoicing_type: String(selectedInvoices[0]?.invoicing_type || "Daily Invoice"),
                payment_method: paymentMethodApi,
                card_type: "",
                bank: "",
                discount: 0,
                vat_status: String(formData.vat_status || ""),
                terms_and_conditions: String(formData.terms_and_conditions || ""),
                notes: String(formData.notes || ""),
                signed_by: String(customerInfo.customer_name || ""),
                ...taxSummaryToGenerateInvoiceAmounts(null),
                sub_total: invoiceBindNumber(subTotal),
                total_amount: invoiceBindNumber(totalPay),
                grand_total: invoiceBindNumber(totalPay),
                advanced_amount: 0,
                balance_due: invoiceBindNumber(totalPay),
                cash_amount: invoiceBindNumber(paymentMethodApi === "CASH" ? totalPay : 0),
                card_amount: invoiceBindNumber(paymentMethodApi === "CARD" ? totalPay : 0),
                pickup_entries: selectedInvoices.map((inv) => ({
                    pickup_entry_id: inv.pickup_entry_id,
                    items: (inv.items || []).map((item) => ({
                        corp_item_id: item.corp_item_id ?? item.item_id ?? "",
                        quantity_invoicing: invoiceBindNumber(item.corp_item_quantity),
                    })),
                })),
            };

            await generateCorporateInvoice(payload);
            handlePrint();
            navigate("/salesCorporate/corporate/receive-payment");
        } catch (error) {
            console.error("Error confirming payment:", error);
            const msg = error?.response?.data?.message || error?.message || "Failed to process payment.";
            setErrorMessage(msg);
        } finally {
            setIsLoadingSubmit(false);
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft
                    className="size-6 text-primary cursor-pointer"
                    onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                />
                <h1 className="text-3xl text-primary font-bold">
                    Customer Payments / Customer Payment / {customerInfo.company_name}
                </h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Review and confirm payment receipt.</p>

            <div>
                <div className="flex flex-row gap-x-3 items-center mb-3">
                    <Icon
                        icon={"material-symbols:refresh"}
                        className="bg-primary/20 text-primary rounded-full p-1 size-6"
                    />
                    <h2 className="text-2xl font-semibold">Payment Receipt</h2>
                </div>

                <div className="grid grid-cols-4">
                    <main className="col-span-3 border-r border-black/20 pe-3">
                        <CorporatePaymentReceipt ref={invoiceRef} data={formData} />

                        <div className="flex flex-row text-xl my-5 justify-between items-center">
                            <button
                                type="button"
                                className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                                onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                            >
                                Back
                            </button>
                            <p className="text-base text-red-500 font-semibold text-center">{errorMessage}</p>
                            <button
                                type="button"
                                className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                onClick={handleConfirmPayment}
                                disabled={isLoadingSubmit}
                            >
                                {isLoadingSubmit ? <BeatLoader color="#FFFFFF" size={10} /> : "Print Invoice"}
                            </button>
                        </div>
                    </main>

                    <aside className="px-3 flex flex-col gap-y-4">
                        <div className="flex flex-col gap-y-1">
                            <label className="text-xl font-semibold">Vat Status:</label>
                            <Select
                                styles={selectStyles}
                                options={vatOptions}
                                value={vatOptions.find(opt => opt.value === formData.vat_status) || null}
                                onChange={(opt) => setFormData(prev => ({ ...prev, vat_status: opt.value }))}
                                placeholder="Select VAT status"
                            />
                        </div>

                        <div className="flex flex-col gap-y-1">
                            <label className="text-xl font-semibold">Enter Note:</label>
                            <textarea
                                className="border border-black/20 bg-white px-3 rounded-xl py-1"
                                rows={4}
                                value={formData.notes}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>

                        <div className="flex flex-col gap-y-1">
                            <label className="text-xl font-semibold">Enter Terms & Conditions:</label>
                            <textarea
                                className="border border-black/20 bg-white px-3 rounded-xl py-1"
                                rows={4}
                                value={formData.terms_and_conditions}
                                onChange={(e) => setFormData(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
                            />
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default CorporateCustomerPaymentConfirm;
