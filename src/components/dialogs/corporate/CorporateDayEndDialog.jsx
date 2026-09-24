import { useEffect, useMemo, useState } from "react";
import { BeatLoader } from "react-spinners";
import { getCorporateDayEndDetails, dayEndCorporate } from "../../../services/corporate/CorporateDashboardServices";

const CorporateDayEndDialog = ({ handleClose }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [dayEndData, setDayEndData] = useState(null);
    const [depositedAmount, setDepositedAmount] = useState("0");
    const loggedInUserId = localStorage.getItem("userId") || "";
    const loggedInUserName = localStorage.getItem("userName") || "";
    const [bankAccountNumber, setBankAccountNumber] = useState("");
    const defaultDepositedPerson = loggedInUserName ? loggedInUserName : (loggedInUserId ? `User ${loggedInUserId}` : "");
    const [depositedPerson, setDepositedPerson] = useState(defaultDepositedPerson);
    const [remarks, setRemarks] = useState("");
    const depositAmountNum = Number(depositedAmount || 0);
    const isDepositRequired = depositAmountNum > 0;

    const fetchDayEndDetails = async () => {
        try {
            setIsLoading(true);
            setErrorMessage("");

            const storedUserId = (localStorage.getItem("userId") || "").toString().trim();
            if (!storedUserId) {
                setErrorMessage("User ID is required.");
                setIsLoading(false);
                return;
            }

            const response = await getCorporateDayEndDetails({ user_id: storedUserId });

            const cashSales = Number(response?.cashSalesToday || 0);
            const cardSales = Number(response?.cardSalesToday || 0);
            const totalSales = Number(response?.totalSalesToday || 0);

            setDayEndData({
                // Corporate has no branches or per-employee cash-drawer shifts, so there is no
                // opening float carried over from a previous day like Retail's day start.
                day_start: 0,
                cash_sales: cashSales,
                card_sales: cardSales,
                total_sales: totalSales,
                cash_in_hand: cashSales,
            });
        } catch (error) {
            console.error("Error fetching corporate day end details:", error);
            const backendMessage = error?.response?.data?.message;
            setErrorMessage(backendMessage || "Failed to load day end details. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDayEndDetails();
    }, []);

    const bankAccountOptions = useMemo(() => ([
        { value: "157013577220001", type: "SY-C/A", label: "157013577220001 (SY-C/A)" },
        { value: "157013577220002", type: "SY-C/A", label: "157013577220002 (SY-C/A)" },
        { value: "100240011603", type: "NTB-C/A", label: "100240011603 (NTB-C/A)" },
        { value: "cashHandedOver", type: "Cash Handed Over", label: "Cash Handed Over" }
    ]), []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const storedUserId = (localStorage.getItem("userId") || "").toString().trim();
        if (!storedUserId) {
            setErrorMessage("User ID is required.");
            return;
        }

        if (!depositedAmount || Number(depositedAmount) < 0) {
            setErrorMessage("Please enter a valid deposited amount.");
            return;
        }

        if (Number(depositedAmount) > 0) {
            if (!bankAccountNumber) {
                setErrorMessage("Please select a bank account number.");
                return;
            }
        }

        if (!depositedPerson) {
            setErrorMessage("Please select the deposited person.");
            return;
        }

        setErrorMessage("");

        try {
            setIsSubmitting(true);

            const selectedAccount = bankAccountOptions.find(opt => opt.value === bankAccountNumber);
            const payload = {
                user_id: storedUserId,
                cash_in_hand: Number(depositedAmount),
                bank_acc_number: isDepositRequired ? bankAccountNumber : "",
                bank_name: isDepositRequired ? (selectedAccount?.type || "") : "",
                cash_sales: Number(dayEndData?.cash_sales ?? 0),
                card_sales: Number(dayEndData?.card_sales ?? 0),
                deposited_person: depositedPerson,
                remarks: remarks ? remarks : "",
            };

            const response = await dayEndCorporate(payload);

            if (response?.message) {
                alert(response.message);
            }

            handleClose(true);
        } catch (error) {
            console.error("Error submitting corporate day end:", error);
            setErrorMessage(error?.response?.data?.message || "Day end failed. Please check amounts and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCurrency = (value) =>
        `Rs. ${Number(value || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-black/10 max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="px-8 pt-6 pb-4 border-b border-black/10 flex items-center justify-between">
                    <h2 className="text-2xl font-bold tracking-wide text-center w-full">
                        DAY END
                    </h2>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-10">
                        <BeatLoader color="#1470F9" size={12} />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="px-8 pb-6 pt-4 space-y-6">
                        {/* Summary values */}
                        <div className="rounded-2xl border border-black/10 overflow-hidden">
                            <div className="bg-black/5 px-5 py-2 text-sm font-semibold text-black/70">
                                Today summary
                            </div>
                            <div className="px-5 py-3 grid grid-cols-2 gap-y-2 text-base">
                                <p className="text-black/70">Cash sales</p>
                                <p className="text-right font-semibold tabular-nums">
                                    {formatCurrency(dayEndData?.cash_sales)}
                                </p>

                                <p className="text-black/70">Card sales</p>
                                <p className="text-right font-semibold tabular-nums">
                                    {formatCurrency(dayEndData?.card_sales)}
                                </p>

                                <p className="text-black/70 border-t border-dashed border-black/20 pt-2 mt-1">
                                    Total sales
                                </p>
                                <p className="text-right font-semibold tabular-nums border-t border-dashed border-black/20 pt-2 mt-1">
                                    {formatCurrency(dayEndData?.total_sales)}
                                </p>

                                <p className="text-black/70 border-t border-black/10 pt-2 mt-1">
                                    Cash in hand
                                </p>
                                <p className="text-right font-bold tabular-nums border-t border-black/10 pt-2 mt-1">
                                    {formatCurrency(dayEndData?.cash_in_hand)}
                                </p>
                            </div>
                        </div>

                        {/* Deposited amount input */}
                        <div className="flex flex-col gap-2">
                            <span className="text-sm font-semibold text-black/70">Deposited amount</span>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-black/50">Enter the deposited cash total</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="border border-black/30 rounded-lg px-3 py-1.5 w-40 text-right text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/60"
                                    value={depositedAmount}
                                    onChange={(e) => setDepositedAmount(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Bank deposit details */}
                        <div className="rounded-2xl border border-black/10 overflow-hidden">
                            <div className="bg-black/5 px-5 py-2 text-sm font-semibold text-black/70">
                                Bank deposit details
                            </div>
                            <div className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm items-center">
                                <label className="text-black/70">Bank Account Number</label>
                                <select
                                    className="border border-black/20 rounded-lg px-3 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                                    value={bankAccountNumber}
                                    onChange={(e) => setBankAccountNumber(e.target.value)}
                                >
                                    <option value="">Select account number</option>
                                    {bankAccountOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>

                                <label className="text-black/70">Deposited/Hand Over Person</label>
                                <input
                                    type="text"
                                    className="border border-black/20 rounded-lg px-3 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                                    placeholder="Enter deposited person"
                                    value={depositedPerson}
                                    onChange={(e) => setDepositedPerson(e.target.value)}
                                />

                                <label className="text-black/70">Remarks</label>
                                <input
                                    type="text"
                                    className="border border-black/20 rounded-lg px-3 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                                    placeholder="Optional remarks"
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                />
                            </div>
                        </div>

                        {errorMessage && (
                            <p className="text-center text-red-500 text-sm font-semibold">{errorMessage}</p>
                        )}

                        {/* Actions */}
                        <div className="flex justify-center gap-4 pt-2">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="min-w-[130px] rounded-full py-2.5 px-5 text-lg font-semibold text-white bg-primary shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? "Submitting..." : "Submit"}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleClose(false)}
                                disabled={isSubmitting}
                                className="min-w-[130px] rounded-full py-2.5 px-5 text-lg font-semibold border border-black/40 text-black hover:bg-black/5 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default CorporateDayEndDialog;
