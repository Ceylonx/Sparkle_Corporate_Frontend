import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MdSearch } from "react-icons/md";
import { Icon } from "@iconify/react/dist/iconify.js";
import Select from "react-select";
import { BeatLoader } from "react-spinners";
import { getAllCorporateCustomers } from "../../services/CustomerServices";
import {
    getDepositedReceiptsByCustomerId,
    getPendingDepositsByCustomerId,
} from "../../services/corporate/CorporateReceivePaymentServices";

const ALL_CUSTOMERS_VALUE = "__ALL__";

const extractCustomerList = (response) => {
    const data = response?.data;
    if (Array.isArray(data)) return data;
    const list =
        data?.customers ??
        data?.corporate_customers ??
        data?.all_corporate_customers ??
        data?.allCustomers ??
        data?.results ??
        data?.data ??
        [];
    return Array.isArray(list) ? list : [];
};

const extractPendingDepositList = (data) => {
    if (!data) return [];
    const candidates = [
        data.pending_deposit_list,
        data.pending_deposits,
        data.deposits,
        Array.isArray(data) ? data : null,
        data.data,
    ];
    for (const c of candidates) {
        if (Array.isArray(c)) return c;
    }
    return [];
};

const extractDepositedReceiptList = (data) => {
    if (!data) return [];
    const candidates = [
        data.deposited_receipt_list,
        data.deposited_receipts,
        data.deposited_list,
        data.receipts,
        Array.isArray(data) ? data : null,
        data.data,
    ];
    for (const c of candidates) {
        if (Array.isArray(c)) return c;
    }
    return [];
};

const parseAmount = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const formatRowDate = (receipt) => {
    const raw = receipt.printed_at ?? receipt.invoicing_date ?? receipt.created_at ?? receipt.deposited_date;
    if (!raw) return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString("en-CA");
};

/** Stable key when merging rows from multiple customer_id API calls */
const receiptDedupeKey = (r) =>
    `${String(r.receipt_id ?? r.id ?? r.invoice_id ?? "")}::${String(r.customer_id ?? "")}`;

const getCustomerRowId = (c) => c?.customer_id ?? c?.customerId ?? c?.id;

const getCorporateCustomerIds = (list) => {
    const ids = (list ?? [])
        .map((c) => getCustomerRowId(c))
        .filter((id) => id != null && String(id).trim() !== "");
    return [...new Set(ids.map(String))];
};

const SalesCorporateDepositNow = () => {
    const location = useLocation();
    const [selectedTab, setSelectedTab] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFilter, setDateFilter] = useState("");
    const [pendingDeposits, setPendingDeposits] = useState([]);
    const [depositedReceipts, setDepositedReceipts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerFilter, setSelectedCustomerFilter] = useState(ALL_CUSTOMERS_VALUE);
    const [isLoadingDeposits, setIsLoadingDeposits] = useState(false);
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
    const [selectedReceipts, setSelectedReceipts] = useState([]);
    const [depositDate, setDepositDate] = useState(new Date().toISOString().split("T")[0]);
    const [remark, setRemark] = useState("");

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "9999px",
            borderColor: state.isFocused ? "#1470F9" : "rgb(20 112 249 / 0.35)",
            minHeight: "42px",
            boxShadow: "none",
            "&:hover": { borderColor: state.isFocused ? "#1470F9" : "rgb(20 112 249 / 0.35)" },
        }),
        placeholder: (base) => ({ ...base, color: "#6B7280" }),
        singleValue: (base) => ({ ...base, color: "#000000" }),
    };

    useEffect(() => {
        const loadCustomers = async () => {
            try {
                setIsLoadingCustomers(true);
                const userId = localStorage.getItem("userId");
                const response = await getAllCorporateCustomers(userId);
                setCustomers(extractCustomerList(response));
            } catch (error) {
                console.error("Error fetching corporate customers:", error);
                setCustomers([]);
            } finally {
                setIsLoadingCustomers(false);
            }
        };
        loadCustomers();
    }, []);

    useEffect(() => {
        setSelectedReceipts([]);
    }, [selectedTab, selectedCustomerFilter]);

    // API: .../get-pending-deposits/{customer_id}/0 — path uses corporate customer_id (e.g. CORP1).
    // When "All customers" is selected, wait until the corporate customer list has loaded; otherwise customerIds is [] and no request runs.
    useEffect(() => {
        if (selectedTab !== 1) {
            return;
        }

        let cancelled = false;

        const fetchPending = async () => {
            if (selectedCustomerFilter === ALL_CUSTOMERS_VALUE && isLoadingCustomers) {
                setIsLoadingDeposits(true);
                return;
            }

            const branchId = 0;
            const customerIds =
                selectedCustomerFilter === ALL_CUSTOMERS_VALUE
                    ? getCorporateCustomerIds(customers)
                    : [String(selectedCustomerFilter)];

            if (customerIds.length === 0) {
                if (!cancelled) {
                    setPendingDeposits([]);
                    setIsLoadingDeposits(false);
                }
                return;
            }

            try {
                setIsLoadingDeposits(true);

                if (customerIds.length === 1) {
                    const response = await getPendingDepositsByCustomerId(customerIds[0], branchId);
                    if (cancelled) return;
                    setPendingDeposits(extractPendingDepositList(response?.data));
                    return;
                }

                const settled = await Promise.allSettled(
                    customerIds.map((customerId) => getPendingDepositsByCustomerId(customerId, branchId))
                );
                if (cancelled) return;

                const merged = [];
                const seen = new Set();
                for (const result of settled) {
                    if (result.status !== "fulfilled") continue;
                    const rows = extractPendingDepositList(result.value?.data);
                    for (const row of rows) {
                        const key = receiptDedupeKey(row);
                        if (seen.has(key)) continue;
                        seen.add(key);
                        merged.push(row);
                    }
                }
                setPendingDeposits(merged);
            } catch (error) {
                console.error("Error fetching pending deposits:", error);
                if (!cancelled) setPendingDeposits([]);
            } finally {
                if (!cancelled) setIsLoadingDeposits(false);
            }
        };

        fetchPending();
        return () => {
            cancelled = true;
        };
    }, [selectedTab, selectedCustomerFilter, customers, isLoadingCustomers, location.pathname]);

    useEffect(() => {
        if (selectedTab !== 2) {
            return;
        }

        let cancelled = false;

        const fetchDeposited = async () => {
            if (selectedCustomerFilter === ALL_CUSTOMERS_VALUE && isLoadingCustomers) {
                setIsLoadingDeposits(true);
                return;
            }

            const branchId = 0;
            const customerIds =
                selectedCustomerFilter === ALL_CUSTOMERS_VALUE
                    ? getCorporateCustomerIds(customers)
                    : [String(selectedCustomerFilter)];

            if (customerIds.length === 0) {
                if (!cancelled) {
                    setDepositedReceipts([]);
                    setIsLoadingDeposits(false);
                }
                return;
            }

            try {
                setIsLoadingDeposits(true);

                if (customerIds.length === 1) {
                    const response = await getDepositedReceiptsByCustomerId(customerIds[0], branchId);
                    if (cancelled) return;
                    setDepositedReceipts(extractDepositedReceiptList(response?.data));
                    return;
                }

                const settled = await Promise.allSettled(
                    customerIds.map((customerId) => getDepositedReceiptsByCustomerId(customerId, branchId))
                );
                if (cancelled) return;

                const merged = [];
                const seen = new Set();
                for (const result of settled) {
                    if (result.status !== "fulfilled") continue;
                    const rows = extractDepositedReceiptList(result.value?.data);
                    for (const row of rows) {
                        const key = receiptDedupeKey(row);
                        if (seen.has(key)) continue;
                        seen.add(key);
                        merged.push(row);
                    }
                }
                setDepositedReceipts(merged);
            } catch (error) {
                console.error("Error fetching deposited receipts:", error);
                if (!cancelled) setDepositedReceipts([]);
            } finally {
                if (!cancelled) setIsLoadingDeposits(false);
            }
        };

        fetchDeposited();
        return () => {
            cancelled = true;
        };
    }, [selectedTab, selectedCustomerFilter, customers, isLoadingCustomers, location.pathname]);

    const customerSelectOptions = [
        { value: ALL_CUSTOMERS_VALUE, label: "All customers" },
        ...customers.flatMap((c) => {
            const id = getCustomerRowId(c);
            if (id == null || String(id).trim() === "") return [];
            const name = c.company_name ?? c.customer_company_name ?? id;
            return [{ value: String(id), label: `${name} (${id})` }];
        }),
    ];

    const selectedCustomerOption =
        customerSelectOptions.find((o) => o.value === selectedCustomerFilter) ?? customerSelectOptions[0];

    const sourceReceipts = selectedTab === 1 ? pendingDeposits : depositedReceipts;

    const filteredReceipts = sourceReceipts.filter((r) => {
        const matchesSearch = searchQuery
            ? [
                  r.receipt_id,
                  r.invoice_id,
                  r.pickup_entry_id,
                  r.company_name,
                  r.customer_company_name,
                  r.customer_id,
                  r.phone_number,
                  r.deposit_ref,
              ].some((field) => field != null && String(field).toLowerCase().includes(searchQuery.toLowerCase()))
            : true;

        const rowDateStr = formatRowDate(r);
        const matchesDate = dateFilter
            ? (r.printed_at && String(r.printed_at).slice(0, 10) === dateFilter) ||
              (r.invoicing_date && String(r.invoicing_date).slice(0, 10) === dateFilter) ||
              rowDateStr === dateFilter
            : true;

        return matchesSearch && matchesDate;
    });

    const rowKey = (receipt) => String(receipt.receipt_id ?? receipt.id ?? receipt.invoice_id);

    const toggleSelectReceipt = (key) => {
        setSelectedReceipts((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
    };

    const toggleSelectAll = () => {
        const keys = filteredReceipts.map(rowKey);
        if (selectedReceipts.length === keys.length && keys.length > 0) {
            setSelectedReceipts([]);
        } else {
            setSelectedReceipts(keys);
        }
    };

    const selectedAmount = filteredReceipts
        .filter((r) => selectedReceipts.includes(rowKey(r)))
        .reduce((sum, r) => sum + parseAmount(r.paid_amount ?? r.total_amount), 0);

    return (
        <div className="flex flex-col gap-y-5">
            <div className="flex flex-col">
                <h1 className="text-3xl font-bold text-primary">Deposit Now</h1>
                <p className="text-xl text-black/50">Deposit Your Payments after Make a Receipt</p>
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-2">
                <h2
                    className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? "border-b-3 font-semibold" : ""}`}
                    onClick={() => setSelectedTab(1)}
                >
                    Pending Deposits
                </h2>
                <h2
                    className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? "border-b-3 font-semibold" : ""}`}
                    onClick={() => setSelectedTab(2)}
                >
                    Deposited
                </h2>
            </div>

            <div className="flex flex-row gap-x-5 items-center flex-wrap">
                <div className="flex flex-row border border-primary rounded-full h-fit min-w-[200px] flex-1 max-w-md bg-white">
                    <div className="flex justify-center items-center rounded-l-full px-5">
                        <MdSearch className="size-6 text-primary" />
                    </div>
                    <input
                        className="grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                    />
                </div>

                <div className="min-w-[220px] flex-1 max-w-sm">
                    <Select
                        styles={selectStyles}
                        options={customerSelectOptions}
                        value={selectedCustomerOption}
                        onChange={(opt) => setSelectedCustomerFilter(opt?.value ?? ALL_CUSTOMERS_VALUE)}
                        isLoading={isLoadingCustomers}
                        placeholder="Customer"
                    />
                </div>

                <div className="flex flex-row items-center gap-x-2 border border-primary rounded-full px-4 py-1 bg-white text-lg cursor-pointer">
                    <Icon icon="mdi:calendar" className="text-primary size-5" />
                    <input
                        type="date"
                        className="focus:outline-none bg-transparent text-black/70"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                    />
                </div>
            </div>

            <p className="text-xl font-semibold">Receipt List</p>

            {isLoadingDeposits ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-primary">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            ) : (
                <div className="rounded-xl bg-white overflow-hidden border border-primary">
                    {selectedTab === 2 ? (
                        <>
                            <div className="text-base grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-2 px-3 items-center">
                                <p>RECEIPT ID</p>
                                <p>DATE</p>
                                <p className="col-span-2">CUSTOMER</p>
                                <p>PAYMENT METHOD</p>
                                <p>AMOUNT</p>
                                <p>REFERENCE</p>
                                <p className="text-center">ACTION</p>
                            </div>

                            {filteredReceipts.length === 0 && (
                                <div className="flex items-center justify-center py-10 text-black/40 text-lg">
                                    No deposited receipts found.
                                </div>
                            )}

                            {filteredReceipts.map((receipt, index) => {
                                const key = rowKey(receipt);
                                return (
                                    <div
                                        key={`${key}-${index}`}
                                        className={`grid grid-cols-8 gap-x-3 text-base py-2 px-3 items-center ${
                                            index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                        }`}
                                    >
                                        <p className="font-medium">{receipt.receipt_id ?? "—"}</p>
                                        <p className="font-medium">{formatRowDate(receipt)}</p>
                                        <div className="col-span-2 flex flex-col">
                                            <p className="font-medium">
                                                {receipt.company_name ?? receipt.customer_company_name ?? "—"}
                                            </p>
                                            <p className="text-sm text-black/50">{receipt.customer_id ?? ""}</p>
                                        </div>
                                        <p className="font-medium">{receipt.payment_method ?? "—"}</p>
                                        <p className="font-medium">
                                            Rs{" "}
                                            {parseAmount(receipt.paid_amount ?? receipt.total_amount).toLocaleString(
                                                undefined,
                                                { maximumFractionDigits: 2, minimumFractionDigits: 2 }
                                            )}
                                        </p>
                                        <p className="font-medium text-black/50">
                                            {receipt.invoice_id ?? receipt.pickup_entry_id ?? receipt.deposit_ref ?? "—"}
                                        </p>
                                        <div className="flex flex-row gap-x-3 justify-center items-center">
                                            <div className="flex flex-col items-center cursor-pointer">
                                                <Icon icon="lsicon:view-filled" className="text-blue-500 size-5" />
                                                <p className="text-xs">View</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    ) : (
                        <>
                            <div className="text-base grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-2 px-3 items-center">
                                <div className="flex items-center justify-center">
                                    <input
                                        type="checkbox"
                                        checked={
                                            filteredReceipts.length > 0 &&
                                            selectedReceipts.length === filteredReceipts.length
                                        }
                                        onChange={toggleSelectAll}
                                        className="size-4 accent-white cursor-pointer"
                                    />
                                </div>
                                <p>RECEIPT ID</p>
                                <p>DATE</p>
                                <p className="col-span-2">CUSTOMER</p>
                                <p>PAYMENT METHOD</p>
                                <p>AMOUNT</p>
                                <p>REFERENCE</p>
                                <p className="text-center">ACTION</p>
                            </div>

                            {filteredReceipts.length === 0 && (
                                <div className="flex items-center justify-center py-10 text-black/40 text-lg">
                                    No pending deposits found.
                                </div>
                            )}

                            {filteredReceipts.map((receipt, index) => {
                                const key = rowKey(receipt);
                                const isSelected = selectedReceipts.includes(key);
                                return (
                                    <div
                                        key={key}
                                        className={`grid grid-cols-9 gap-x-3 text-base py-2 px-3 items-center ${
                                            index % 2 === 0 ? "bg-white" : "bg-primary/10"
                                        }`}
                                    >
                                        <div className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectReceipt(key)}
                                                className="size-4 accent-primary cursor-pointer"
                                            />
                                        </div>
                                        <p className="font-medium">{receipt.receipt_id ?? "—"}</p>
                                        <p className="font-medium">{formatRowDate(receipt)}</p>
                                        <div className="col-span-2 flex flex-col">
                                            <p className="font-medium">{receipt.company_name ?? "—"}</p>
                                            <p className="text-sm text-black/50">{receipt.customer_id ?? ""}</p>
                                        </div>
                                        <p className="font-medium">{receipt.payment_method ?? "—"}</p>
                                        <p className="font-medium">
                                            Rs{" "}
                                            {parseAmount(receipt.paid_amount ?? receipt.total_amount).toLocaleString(
                                                undefined,
                                                { maximumFractionDigits: 2, minimumFractionDigits: 2 }
                                            )}
                                        </p>
                                        <p className="font-medium text-black/50">
                                            {receipt.invoice_id ?? receipt.pickup_entry_id ?? "—"}
                                        </p>
                                        <div className="flex flex-row gap-x-3 justify-center items-center">
                                            <div className="flex flex-col items-center cursor-pointer">
                                                <Icon icon="lsicon:view-filled" className="text-blue-500 size-5" />
                                                <p className="text-xs">View</p>
                                            </div>
                                            <div className="flex flex-col items-center cursor-pointer">
                                                <Icon icon="mdi:bank-transfer" className="text-primary size-5" />
                                                <p className="text-xs">Deposit Now</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {selectedTab === 1 && (
                <div className="flex flex-col gap-y-4 bg-white border border-primary/20 rounded-xl p-5 shadow-sm">
                    <div className="flex flex-row gap-x-6 items-end justify-between flex-wrap">
                        <div className="flex flex-col gap-y-1">
                            <label className="text-base text-black/60 font-medium">Deposit Date</label>
                            <div className="flex flex-row items-center gap-x-2 border border-primary/30 rounded-lg px-3 py-1.5 bg-white">
                                <input
                                    type="date"
                                    className="focus:outline-none bg-transparent text-base text-black"
                                    value={depositDate}
                                    onChange={(e) => setDepositDate(e.target.value)}
                                />
                                <Icon icon="mdi:calendar" className="text-primary size-5" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-y-1 flex-1 min-w-[200px]">
                            <label className="text-base text-black/60 font-medium">Remark</label>
                            <input
                                type="text"
                                className="border border-primary/30 rounded-lg px-3 py-1.5 text-base focus:outline-none bg-white text-black/60"
                                placeholder="Note ..."
                                value={remark}
                                onChange={(e) => setRemark(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col items-end gap-y-1">
                            <label className="text-base text-black/60 font-medium">Selected Amount</label>
                            <p className="text-2xl font-bold text-primary">
                                Rs{" "}
                                {selectedAmount.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                    minimumFractionDigits: 2,
                                })}
                            </p>
                        </div>
                    </div>

                    <button
                        disabled={selectedReceipts.length === 0}
                        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-xl hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Mark as Deposited &amp; Generate Bank Voucher
                    </button>
                </div>
            )}
        </div>
    );
};

export default SalesCorporateDepositNow;
