import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import CorporateInvoicePrint from "../../printables/CorporateInvoicePrint";
import { getAllCorporateSettings } from "../../../services/corporate/CorporateSettingsServices";

const CorporateViewInvoice = ({ handleClose, data }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [settings, setSettings] = useState({});
    const invoiceRef = useRef(null);

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const userId = localStorage.getItem("userId");
                const res = await getAllCorporateSettings(userId);
                setSettings(res?.data?.settings?.[0] || {});
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const updatedData = {
        ...data,
        items: typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []),
        notes: (!data.notes || data.notes.toString().toLowerCase().trim() === "d" || data.notes.toString().toLowerCase().trim() === "null") ? (settings?.receipt_notes || "") : data.notes,
        terms_and_conditions: (!data.terms_and_conditions || data.terms_and_conditions.toString().toLowerCase().trim() === "d" || data.terms_and_conditions.toString().toLowerCase().trim() === "null") ? (settings?.receipt_terms || "") : data.terms_and_conditions
    };

    const handlePrint = useReactToPrint({
        contentRef: invoiceRef
    });

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">View Order</h1>

                <CorporateInvoicePrint ref={invoiceRef} data={updatedData} />

                <div className="flex flex-row">
                    <button className="cursor-pointer bg-primary text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handlePrint} disabled={isLoading}>Print</button>

                    <button className="cursor-pointer bg-black/50 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handleClose} disabled={isLoading}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default CorporateViewInvoice;