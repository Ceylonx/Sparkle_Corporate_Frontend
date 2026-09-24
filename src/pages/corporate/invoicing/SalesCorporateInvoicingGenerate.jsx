import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useMemo } from "react";
import { BeatLoader } from "react-spinners";
import { useReactToPrint } from "react-to-print";
import { generateCorporateInvoice, getInvoicingHistoryByCustomerId, trackPickupEntryById } from "../../../services/corporate/CorporateInvoicingServices";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { Icon } from "@iconify/react/dist/iconify.js";
import {
    getAllCorporateSettings,
    getCorporateTaxes,
    getCorporatePriceListByCustomer,
    getAllCorporateItems,
} from "../../../services/corporate/CorporateSettingsServices";
import {
    getCorporateCustomerById,
    unwrapCorporateCustomerGetByIdResponse,
    getAllCorporateCustomers,
} from "../../../services/CustomerServices";
import {
    pickCorporateTaxRatePercent,
    buildCollectionNoteLinesFromApiOrderItems,
} from "../../../utils/corporateCollectionNotePricing";
import { computeCorporateTaxInvoiceSummary, taxSummaryToGenerateInvoiceAmounts, invoiceBindNumber } from "../../../utils/corporateTaxInvoiceMath";
import CorporateInvoicePreview from "./CorporateInvoicePreview";
import Swal from "sweetalert2";

const CORPORATE_INVOICE_BANK_OPTIONS = [
    { value: "BOC", label: "BOC" },
    { value: "Commercial Bank", label: "Commercial Bank" },
    { value: "Peoples Bank", label: "Peoples Bank" },
    { value: "Sampath Bank", label: "Sampath Bank" },
    { value: "HNB", label: "HNB" },
];

const DEFAULT_TERMS = 'Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only';

function normalizeCorporateItemsForPricing(rawItems) {
    return (rawItems ?? [])
        .map((item) => ({
            item_type_id: String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
            item_type_name: item.corp_item_name ?? item.item_type_name ?? "-",
            corp_item_auto_id: item.corp_item_auto_id,
            item_category_id: item.item_category_id,
            corp_item_id: item.corp_item_id || String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
            service_type: item.service_type,
            service_types: item.service_types,
        }))
        .filter((item) => item.item_type_id);
}

function formatPickupDateLabel(raw) {
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) {
        return d.toLocaleDateString('en-CA').replace(/-/g, "/");
    }
    return String(raw).replace(/-/g, "/");
}

function pickFirstString(obj, keys) {
    if (!obj) return "";
    for (const k of keys) {
        const v = obj[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

const SalesCorporateInvoicingGenerate = () => {
    const { type, customerId } = useParams();
    const navigate = useNavigate();

    const [invoiceData, setInvoiceData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [discount, setDiscount] = useState("");
    const [transportRateOverride, setTransportRateOverride] = useState("");
    const [itemNote, setItemNote] = useState("");
    const [termsConditions, setTermsConditions] = useState('Please make payment either via Online transfer to our bank account or by cheque made payable to " C L Solutions ( Pvt ) Ltd " and crossed as A/c Payee only');
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [manualInvoiceId, setManualInvoiceId] = useState("");
    const [realInvoiceId, setRealInvoiceId] = useState(null);
    const printRef = useRef(null);
    const [customerProfile, setCustomerProfile] = useState(null);
    const [taxRates, setTaxRates] = useState({ sscl: 0, vat: 0 });
    const [corporateSettings, setCorporateSettings] = useState(null);
    const [customerPriceList, setCustomerPriceList] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [selectedBank, setSelectedBank] = useState("");
    const [allCorporateCustomers, setAllCorporateCustomers] = useState([]);
    const [corporateCustomerListLoading, setCorporateCustomerListLoading] = useState(true);

    useEffect(() => {
        const userId = localStorage.getItem("userId");
        if (!userId) {
            setCorporateCustomerListLoading(false);
            setAllCorporateCustomers([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setCorporateCustomerListLoading(true);
            try {
                const response = await getAllCorporateCustomers(userId);
                if (cancelled) return;
                const list =
                    response?.data?.allCustomers ??
                    response?.data?.customers ??
                    response?.data?.corporate_customers ??
                    response?.data?.data ??
                    [];
                setAllCorporateCustomers(Array.isArray(list) ? list : []);
            } catch (e) {
                console.error("Failed to load corporate customer list:", e);
                if (!cancelled) setAllCorporateCustomers([]);
            } finally {
                if (!cancelled) setCorporateCustomerListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const matchedCustomer = useMemo(() => {
        const trackingId = invoiceData?.customer_id;
        if (trackingId == null || String(trackingId).trim() === "") return null;
        if (!Array.isArray(allCorporateCustomers) || allCorporateCustomers.length === 0) return null;
        const tid = String(trackingId).trim();
        return (
            allCorporateCustomers.find((c) => {
                const cid = c?.customer_id != null ? String(c.customer_id).trim() : "";
                const caid = c?.customer_auto_id != null ? String(c.customer_auto_id).trim() : "";
                return cid === tid || caid === tid;
            }) ?? null
        );
    }, [invoiceData, allCorporateCustomers]);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: "",
        onAfterPrint: () => {
            setTimeout(() => navigate(-1), 100);
        },
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const userId = localStorage.getItem("userId");

                let defaultSettings = {};
                try {
                    const settingsData = await getAllCorporateSettings(userId);
                    defaultSettings = settingsData?.data?.settings?.[0] || {};
                    setCorporateSettings(defaultSettings);
                } catch (e) {
                    console.error("Failed to fetch settings", e);
                }

                const pendingResponse = await getInvoicingHistoryByCustomerId(userId, customerId, 0);
                const historyData = pendingResponse?.data?.invoice_history?.[0];

                if (historyData) {
                    const firstEntryId = historyData.pickup_entry_id;

                    const res = await trackPickupEntryById(userId, firstEntryId);
                    const entryData = res?.data?.data;

                    if (entryData) {
                        setInvoiceData(entryData);

                        const finalNotes = (!entryData.notes || entryData.notes.toString().toLowerCase().trim() === "d" || entryData.notes.toString().toLowerCase().trim() === "null") ? (defaultSettings?.receipt_notes || "") : entryData.notes;
                        const finalTerms = (!entryData.terms_and_conditions || entryData.terms_and_conditions.toString().toLowerCase().trim() === "d" || entryData.terms_and_conditions.toString().toLowerCase().trim() === "null") ? (defaultSettings?.receipt_terms || DEFAULT_TERMS) : entryData.terms_and_conditions;

                        setItemNote(finalNotes);
                        setTermsConditions(finalTerms);

                        if (entryData.items?.length) {
                            const validItems = entryData.items.filter((item) => {
                                const invoiceQty = item.delivered_qty !== undefined && item.delivered_qty !== null
                                    ? Number(item.delivered_qty)
                                    : item.final_packed_qty !== undefined && item.final_packed_qty !== null
                                    ? Number(item.final_packed_qty)
                                    : Number(item.corp_item_quantity || 0);
                                return invoiceQty > 0;
                            });
                            setSelectedItems(new Set(validItems.map((item) => item.corp_item_id)));
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching invoice history:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [customerId, type]);

    useEffect(() => {
        const userId = localStorage.getItem("userId");
        if (!userId || !customerId) return;
        let cancelled = false;
        (async () => {
            const [custRes, taxRes] = await Promise.allSettled([
                getCorporateCustomerById({
                    user_id: userId,
                    customer_auto_id: customerId,
                }),
                getCorporateTaxes(userId, { activeOnly: true }),
            ]);
            if (cancelled) return;
            if (custRes.status === "fulfilled") {
                const data = unwrapCorporateCustomerGetByIdResponse(custRes.value);
                setCustomerProfile(data && typeof data === "object" ? data : null);
                const d = Number(data?.discount || 0);
                if (d > 0) {
                    setDiscount((prev) => (prev === "" ? `${d}%` : prev));
                }
            }
            if (taxRes.status === "fulfilled") {
                const taxes = taxRes.value?.taxes ?? [];
                setTaxRates({
                    sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
                    vat: pickCorporateTaxRatePercent(taxes, "VAT"),
                });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [customerId]);

    useEffect(() => {
        const userId = localStorage.getItem("userId");
        const cid = invoiceData?.customer_id;
        if (!userId || !cid) {
            setCustomerPriceList([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [plRes, itemsRes] = await Promise.allSettled([
                    getCorporatePriceListByCustomer({ user_id: userId, customer_id: cid }),
                    getAllCorporateItems(userId),
                ]);
                if (cancelled) return;
                if (plRes.status === "fulfilled") {
                    const list =
                        plRes.value?.data?.price_list ??
                        plRes.value?.data?.corporate_price_lists ??
                        plRes.value?.data ??
                        [];
                    setCustomerPriceList(Array.isArray(list) ? list : []);
                } else {
                    setCustomerPriceList([]);
                }
                if (itemsRes.status === "fulfilled") {
                    const raw = itemsRes.value?.data?.corporate_items ?? [];
                    setItemTypes(normalizeCorporateItemsForPricing(raw));
                } else {
                    setItemTypes([]);
                }
            } catch (e) {
                console.error("Price list / items fetch failed", e);
                if (!cancelled) {
                    setCustomerPriceList([]);
                    setItemTypes([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [invoiceData?.customer_id]);

    const selectedItemsData = useMemo(() => {
        return (invoiceData?.items ?? []).filter((item) => {
            if (!selectedItems.has(item.corp_item_id)) return false;
            const invoiceQty = item.delivered_qty !== undefined && item.delivered_qty !== null
                ? Number(item.delivered_qty)
                : item.final_packed_qty !== undefined && item.final_packed_qty !== null
                ? Number(item.final_packed_qty)
                : Number(item.corp_item_quantity || 0);
            return invoiceQty > 0;
        });
    }, [invoiceData?.items, selectedItems]);

    const pricedLines = useMemo(() => {
        if (!selectedItemsData.length || !invoiceData) return [];
        const itemsWithPickup = selectedItemsData.map((it) => ({
            ...it,
            pickup_date: it.pickup_date || invoiceData.pickup_date || invoiceData.created_at,
        }));
        const taxType =
            customerProfile?.tax_type ??
            (customerProfile?.customer && typeof customerProfile.customer === "object" ? customerProfile.customer.tax_type : null) ??
            invoiceData.tax_type ??
            "";
        const built = buildCollectionNoteLinesFromApiOrderItems({
            items: itemsWithPickup,
            customerPriceList,
            deliveryTypeRaw: invoiceData.delivery_type ?? invoiceData.deliveryType,
            customerServiceTypes: customerProfile?.service_types ?? [],
            corporateTaxRates: { sscl: (taxRates?.sscl || 2.5), vat: (taxRates?.vat || 18) },
            itemTypes,
            taxType,
            deliveryPercentageFallback: invoiceData.delivery_percentage ?? invoiceData.deliveryPercentage,
            isInvoicing: true,
        });
        return built.map((row, idx) => {
            const src = itemsWithPickup[idx];
            const pd = src?.pickup_date;
            const label = formatPickupDateLabel(pd) || "—";
            const ms = pd ? Date.parse(pd) : 0;
            return {
                ...row,
                pickup_date: pd,
                pickup_label: label,
                pickup_sort: Number.isFinite(ms) ? ms : 0,
            };
        });
    }, [
        selectedItemsData,
        invoiceData,
        customerPriceList,
        customerProfile?.service_types,
        customerProfile?.tax_type,
        customerProfile?.customer,
        taxRates,
        itemTypes,
    ]);

    const supplierLegal = useMemo(
        () => ({
            companyName: pickFirstString(corporateSettings, [
                "supplier_company_name",
                "company_legal_name",
                "laundry_company_name",
                "registered_company_name",
            ]),
            vatNo: pickFirstString(corporateSettings, ["supplier_vat_no", "company_vat_no", "company_vat_number"]),
            address: pickFirstString(corporateSettings, ["supplier_address", "registered_address", "company_address"]),
            operationAddress: pickFirstString(corporateSettings, [
                "operation_address",
                "supplier_operation_address",
                "laundry_address",
            ]),
            hotline: pickFirstString(corporateSettings, ["hotline", "company_phone", "supplier_phone"]),
            email: pickFirstString(corporateSettings, ["company_email", "supplier_email", "info_email"]),
        }),
        [corporateSettings]
    );

    const effectiveDiscountPercent = useMemo(() => {
        if (String(discount).includes("%")) {
            return parseFloat(String(discount).replace("%", "")) || 0;
        }
        if (discount !== "" && !Number.isNaN(Number(discount))) {
            return Number(discount);
        }
        return parseFloat(matchedCustomer?.discount ?? customerProfile?.discount ?? 0);
    }, [discount, matchedCustomer?.discount, customerProfile?.discount]);

    const placeOfSupply = useMemo(() => {
        return invoiceData?.delivered_location || invoiceData?.deliveredLocation || invoiceData?.place_of_supply || invoiceData?.placeOfSupply || "";
    }, [invoiceData]);

    const locationRate = useMemo(() => {
        if (transportRateOverride !== "" && !Number.isNaN(Number(transportRateOverride))) {
            return Number(transportRateOverride);
        }
        return parseFloat(invoiceData?.entry_transport_rate) || 0;
    }, [invoiceData, transportRateOverride]);

    const damageDeduction = useMemo(() => {
        return parseFloat(
            (pricedLines || []).reduce((sum, it) => {
                const itemDamageQty = Number(it.damaged_qty || it.damage_quantity || 0);
                return sum + (itemDamageQty * Number(it.rate || 0));
            }, 0).toFixed(2)
        );
    }, [pricedLines]);

    const invoiceSummary = useMemo(() => {
        const laundry = parseFloat(
            pricedLines.reduce((s, it) => s + (Number(it.orderValue) || 0), 0).toFixed(2)
        );
        const invoicingPeriod = matchedCustomer?.customer_invoicing_period || customerProfile?.customer_invoicing_period || 1;
        const isDaily = type === "daily" || String(matchedCustomer?.customer_invoice_type || customerProfile?.customer_invoice_type || "").toLowerCase().includes("daily");
        return computeCorporateTaxInvoiceSummary({
            laundryCharges: laundry - damageDeduction,
            customerDiscountPct: effectiveDiscountPercent,
            transportRate: locationRate,
            customerInvoiceType: isDaily ? "Daily Invoice" : "Period Invoice",
            invoicingPeriod: parseFloat(invoicingPeriod),
            ssclRatePct: taxRates.sscl,
            vatRatePct: taxRates.vat,
            transportMultiplierOverride: isDaily ? 1 : parseFloat(invoicingPeriod),
        });
    }, [
        pricedLines,
        damageDeduction,
        effectiveDiscountPercent,
        locationRate,
        matchedCustomer,
        customerProfile,
        taxRates,
        type,
    ]);

    const handleGenerateInvoice = async () => {
        if (!invoiceData || selectedItems.size === 0) {
            alert("Please select at least one item");
            return;
        }

        try {
            setIsSubmitting(true);
            const invoiceItems = selectedItemsData
                .filter((item) => {
                    const rawQty = item.delivered_qty ?? item.final_packed_qty ?? item.corp_item_quantity ?? 0;
                    return rawQty > 0;
                })
                .map((item) => ({
                    corp_item_id: item.corp_item_id,
                    quantity_invoicing: Number(item.delivered_qty ?? item.final_packed_qty ?? item.corp_item_quantity ?? 0),
                }));

            const amounts = taxSummaryToGenerateInvoiceAmounts(invoiceSummary);

            const payload = {
                user_id: String(localStorage.getItem("userId") || ""),
                company_name: String(invoiceData.customer_company_name || invoiceData.company_name || ""),
                customer_id: String(invoiceData.customer_id || ""),
                phone_number: String(invoiceData.customer_phone || ""),
                invoicing_type: type === "daily" ? "Daily Invoice" : "Period Invoice",
                payment_method: "CASH",
                card_type: "",
                bank: String(selectedBank || ""),
                discount: invoiceBindNumber(effectiveDiscountPercent),
                vat_status: "",
                terms_and_conditions: String(termsConditions || ""),
                notes: String(itemNote || ""),
                signed_by: String(invoiceData.signed_by || ""),
                ...amounts,
                advanced_amount: 0,
                cash_amount: amounts.grand_total,
                card_amount: 0,
                pickup_entries: [
                    {
                        pickup_entry_id: String(invoiceData.pickup_entry_id || ""),
                        items: selectedItemsData
                            .filter((item) => {
                                const rawQty = item.delivered_qty ?? item.final_packed_qty ?? item.corp_item_quantity;
                                return rawQty > 0;
                            })
                            .map((item) => ({
                                corp_item_id: item.corp_item_id ?? item.item_id ?? "",
                                quantity_invoicing: invoiceBindNumber(item.delivered_qty ?? item.final_packed_qty ?? item.corp_item_quantity),
                            })),
                    },
                ],
                ...(manualInvoiceId && manualInvoiceId.trim() !== ""
                    ? { manual_invoice_id: manualInvoiceId.trim() }
                    : {}),
            };

            const response = await generateCorporateInvoice(payload);
            if (response?.data?.success) {
                const newInvoiceId = response?.data?.invoice_id;
                if (newInvoiceId) {
                    setRealInvoiceId(newInvoiceId);
                }

                await Swal.fire({
                    title: "Success!",
                    text: "Invoice created successfully.",
                    icon: "success",
                    confirmButtonText: "OK",
                    confirmButtonColor: "#1470F9"
                });

                requestAnimationFrame(() => {
                    handlePrint();
                });
            } else {
                throw new Error(response?.data?.message || "Failed to generate invoice");
            }
        } catch (error) {
            console.error("Error generating invoice:", error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <BeatLoader color="#1470F9" size={20} />
            </div>
        );
    }

    if (!invoiceData) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="text-red-500 text-center">
                    <p className="text-lg font-semibold">Error: Invoice Data Not Found</p>
                    <p className="text-sm text-black/60 mt-2">Please select a customer from the invoicing list first.</p>
                </div>
                <button onClick={() => navigate(-1)} className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90">
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate("/salesCorporate/corporate/invoicing")} />
                <h1 className="text-3xl text-primary font-bold">
                    {type === "daily" ? "Daily Invoicing Customers" : "Period Invoicing Customers"}{invoiceData ? ` / ${invoiceData.customer_company_name || invoiceData.company_name || "-"} / ${invoiceData.invoice_id || invoiceData.pickup_entry_id || "-"}` : ""}
                </h1>
            </div>
            <p className="text-xl text-black/50 mb-5">Generate invoice for corporate orders.</p>

            <div>
                <div className="flex flex-row gap-x-3 items-center">
                    <Icon icon={"material-symbols:refresh"} className="bg-primary/20 text-primary rounded-full p-1 size-6" />
                    <h2 className="text-2xl font-semibold">Bill Preview</h2>
                </div>

                <div className="grid grid-cols-4 mt-5">
                    <main className="col-span-3 border-r border-black/20 pe-3">
                        <CorporateInvoicePreview
                            ref={printRef}
                            order={invoiceData}
                            customerProfile={customerProfile}
                            matchedCustomer={matchedCustomer}
                            corporateCustomerListLoading={corporateCustomerListLoading}
                            pricedLines={pricedLines}
                            supplierLegal={supplierLegal}
                            ssclRatePct={taxRates.sscl}
                            vatRatePct={taxRates.vat}
                            effectiveDiscountPercent={effectiveDiscountPercent}
                            transportMultiplierOverride={type === "daily" || String(matchedCustomer?.customer_invoice_type || customerProfile?.customer_invoice_type || "").toLowerCase().includes("daily") ? 1 : parseFloat(matchedCustomer?.customer_invoicing_period || customerProfile?.customer_invoicing_period || 1)}
                            notes={itemNote}
                            terms_and_conditions={termsConditions}
                            realInvoiceId={realInvoiceId}
                        />

                        <div className="flex flex-row text-xl my-5 justify-between">
                            <button
                                type="button"
                                className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-[30%] cursor-pointer"
                                onClick={() => navigate(-1)}
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                className="font-semibold text-white bg-primary rounded-full py-2 w-[30%] cursor-pointer"
                                onClick={handleGenerateInvoice}
                                disabled={isSubmitting || !invoiceData}
                            >
                                {isSubmitting ? <BeatLoader color="white" size={10} /> : "Create Invoice & Print"}
                            </button>
                        </div>
                    </main>

                    <aside className="px-3">

                        <div className="grow flex flex-col mb-3">
                            <label className="text-xl font-semibold text-black mb-1" htmlFor="discount">Discount:</label>
                            <input
                                id="discount"
                                type="text"
                                value={discount}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (/^[0-9.%]*$/.test(val)) {
                                        setDiscount(val);
                                    }
                                }}
                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg outline-none"
                                placeholder="Value or Percentage (%)"
                            />
                        </div>
                        <div className="grow flex flex-col mb-3">
                            <label className="text-xl font-semibold text-black mb-1" htmlFor="transport-charge">Transport Rate:</label>
                            <input
                                id="transport-charge"
                                type="text"
                                value={transportRateOverride}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (/^[0-9.]*$/.test(val)) {
                                        setTransportRateOverride(val);
                                    }
                                }}
                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg outline-none"
                                placeholder="Transport charge amount"
                            />
                        </div>

                        <div className="grow flex flex-col mb-3">
                            <label className="text-xl font-semibold text-black mb-1" htmlFor="tAndC">Enter Terms & Conditions :</label>
                            <textarea
                                id="tAndC"
                                value={termsConditions}
                                onChange={(e) => setTermsConditions(e.target.value)}
                                rows={4}
                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg outline-none resize-none"
                                placeholder="Enter terms & conditions"
                            />
                        </div>
                        {/* <div className="grow flex flex-col mb-3">
                            <label className="text-xl font-semibold text-black mb-1" htmlFor="manual-invoice-id-sales">
                                Manual Invoice ID :
                                <span className="ml-1 text-sm font-normal text-black/40">(Optional)</span>
                            </label>
                            <input
                                id="manual-invoice-id-sales"
                                type="text"
                                value={manualInvoiceId}
                                onChange={(e) => setManualInvoiceId(e.target.value)}
                                className="border border-black/20 bg-white px-3 rounded-xl py-1 text-lg outline-none"
                                placeholder="e.g., 26JUL_H1OW_7"
                            />
                            <p className="text-xs text-black/40 mt-0.5">Leave blank to auto-generate the next Invoice ID.</p>
                        </div> */}
                        {/* <button className="w-full py-1 rounded-xl border border-primary bg-white text-primary text-lg font-medium shadow-sm mt-3">
                            Apply
                        </button> */}
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default SalesCorporateInvoicingGenerate;
