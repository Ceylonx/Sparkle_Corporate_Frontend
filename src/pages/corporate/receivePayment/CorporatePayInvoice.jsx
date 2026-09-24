import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import CorporatePaymentReceipt from "../../../components/printables/CorporatePaymentReceipt";
import {
    getCustomerPayment,
    getPendingDepositsByCustomerId,
} from "../../../services/corporate/CorporateReceivePaymentServices";
import { BeatLoader } from "react-spinners";

const CorporatePayInvoice = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const invoiceRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingDeposits, setPendingDeposits] = useState([]);
    const [formData, setFormData] = useState({
        invoice_id: "",
        company_name: "",
        customer_id: "",
        customer_name: "",
        phone_number: "",
        items: [],
        total_amount: 0,
        payment_method: "",
        cash_amount: 0,
        card_amount: 0,
        card_type: "",
        bank: "",
        discount: 0,
        is_discount_percentage: 0,
        balance_due: 0,
        notes: "",
        terms_and_conditions: "",
        vat_status: "",
    });

    useEffect(() => {
        const invoiceState = location.state?.invoice;
        if (!invoiceState) {
            setIsLoading(false);
            return;
        }

        const customerId = invoiceState.customer_id;

        // Fetch full invoice data with properly structured items
        getCustomerPayment({ customer_id: customerId, offset: 0 })
            .then(res => {
                const invoiceList = res?.data?.invoice_list || [];
                const matched = invoiceList.find(inv => String(inv.invoice_id) === String(id))
                    || invoiceState;

                const items = (matched.items || []).map(item => {
                    const qty = Number(item.corp_item_quantity || item.quantity_invoicing || item.quantity || 0);
                    const rate = Number(item.corp_item_price || item.unit_price || item.price || item.rate || 0);
                    return {
                        item_name: item.corp_item_name || item.item_name || "Unknown Item",
                        item_category: item.item_category_name || item.item_category || "Unknown",
                        service_type_id: item.service_types?.[0]?.service_type_id || null,
                        quantity: qty,
                        rate,
                        amount: qty * rate,
                    };
                });

                setFormData({
                    invoice_id: matched.invoice_id || id,
                    company_name: matched.company_name || invoiceState.company_name || "",
                    customer_id: customerId,
                    customer_name: matched.signed_by || matched.customer_name || invoiceState.signed_by || "",
                    phone_number: matched.phone_number || invoiceState.phone_number || "",
                    items,
                    total_amount: Number(matched.total_amount) || 0,
                    payment_method: matched.payment_method || invoiceState.payment_method || "",
                    cash_amount: Number(matched.cash_amount) || 0,
                    card_amount: Number(matched.card_amount) || 0,
                    card_type: matched.card_type || "",
                    bank: matched.bank || "",
                    discount: Number(matched.discount) || 0,
                    is_discount_percentage: matched.is_discount_percentage || 0,
                    balance_due: Number(matched.balance_due) || 0,
                    notes: matched.notes || "",
                    terms_and_conditions: matched.terms_and_conditions || "",
                    vat_status: matched.vat_status || "",
                });
            })
            .catch(() => {
                // Fallback to navigation state data
                const items = (invoiceState.items || []).map(item => {
                    const qty = Number(item.corp_item_quantity || item.quantity_invoicing || item.quantity || 0);
                    const rate = Number(item.corp_item_price || item.unit_price || item.price || item.rate || 0);
                    return {
                        item_name: item.corp_item_name || item.item_name || "Unknown Item",
                        item_category: item.item_category_name || item.item_category || "Unknown",
                        service_type_id: item.service_types?.[0]?.service_type_id || null,
                        quantity: qty,
                        rate,
                        amount: qty * rate,
                    };
                });

                setFormData({
                    invoice_id: invoiceState.invoice_id || id,
                    company_name: invoiceState.company_name || "",
                    customer_id: customerId,
                    customer_name: invoiceState.signed_by || invoiceState.customer_name || "",
                    phone_number: invoiceState.phone_number || "",
                    items,
                    total_amount: Number(invoiceState.total_amount) || 0,
                    payment_method: invoiceState.payment_method || "",
                    cash_amount: Number(invoiceState.cash_amount) || 0,
                    card_amount: Number(invoiceState.card_amount) || 0,
                    card_type: invoiceState.card_type || "",
                    bank: invoiceState.bank || "",
                    discount: Number(invoiceState.discount) || 0,
                    is_discount_percentage: invoiceState.is_discount_percentage || 0,
                    balance_due: Number(invoiceState.balance_due) || 0,
                    notes: invoiceState.notes || "",
                    terms_and_conditions: invoiceState.terms_and_conditions || "",
                    vat_status: invoiceState.vat_status || "",
                });
            })
            .finally(() => {
                setIsLoading(false);
            });

        if (customerId) {
            getPendingDepositsByCustomerId(customerId)
                .then(res => setPendingDeposits(res?.data?.pending_deposits || []))
                .catch(() => setPendingDeposits([]));
        }
    }, []);

    const handlePrint = useReactToPrint({ contentRef: invoiceRef });

    return (
        <div className="flex flex-col">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft
                    className="size-6 text-primary cursor-pointer"
                    onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                />
                <h1 className="text-3xl text-primary font-bold">
                    Customer Payments / Pending Payment Invoices / {id}
                </h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Record new laundry pickup with item counts by category</p>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-x-4">
                    {/* Receipt Preview */}
                    <main className="col-span-3 border-r border-black/20 pe-4">
                        <CorporatePaymentReceipt ref={invoiceRef} data={formData} />

                        <div className="flex flex-row text-xl my-5 justify-between items-center">
                            <button
                                type="button"
                                className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                                onClick={() => navigate("/salesCorporate/corporate/receive-payment")}
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                                onClick={handlePrint}
                            >
                                Print Receipt
                            </button>
                        </div>
                    </main>

                    {/* Sidebar */}
                    <aside className="ps-3 flex flex-col gap-y-4">
                        <div className="bg-primary rounded-xl p-5 flex flex-col gap-y-3">
                            <h3 className="text-lg font-bold text-white">Order in Pending Deposits</h3>

                            {pendingDeposits.length > 0 ? (
                                <div className="flex flex-col gap-y-2">
                                    {pendingDeposits.map((deposit, idx) => (
                                        <div key={idx} className="bg-white/10 rounded-lg p-3 text-white text-sm">
                                            <p className="font-medium">{deposit.invoice_id || deposit.deposit_id}</p>
                                            <p className="text-white/70 text-xs">
                                                Rs. {Number(deposit.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-white/60 text-sm">No pending deposits available</p>
                            )}

                            <button
                                className="w-full bg-[#0f2a6e] text-white font-semibold py-2 rounded-lg hover:bg-[#0a1f52] transition-colors"
                                onClick={() => navigate("/salesCorporate/corporate/deposit-now")}
                            >
                                Deposit Now
                            </button>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
};

export default CorporatePayInvoice;
