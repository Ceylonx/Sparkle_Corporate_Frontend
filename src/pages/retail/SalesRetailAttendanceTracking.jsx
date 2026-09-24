import logo from "../../assets/logo.png";
import cxLogo from "../../assets/cx_logo.png";
import backgroundShape from "../../assets/background_shape.svg";
import backgroundShapeRotate from "../../assets/background_shape_rotate.svg";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Select from "react-select";
import Webcam from "react-webcam";
import { Icon } from "@iconify/react/dist/iconify.js";
import { getCashInHand, getEmployeeShifts, getNextDayOpeningBalance, markPosAttendance, markSystemHandoverAttendance } from "../../services/Retail/RetailEmployeeServices";
import { getAllBranches } from "../../services/Retail/RetailOrderServices";
import { BeatLoader } from "react-spinners";
import { hasPermission } from "../../utils/permissionHelper";


const SalesRetailAttendanceTracking = () => {
    const navigate = useNavigate();
    const webcamRef = useRef(null);
    const [selectedOption, setSelectedOption] = useState(-1);
    const [image, setImage] = useState(null);
    const [now, setNow] = useState(new Date());
    const [errorMessage, setErrorMessage] = useState("");
    const [employeeData, setEmployeeData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [branches, setBranches] = useState([]);
    const [branchesData, setBranchesData] = useState([]);
    const [isLoadingBranches, setIsLoadingBranches] = useState(false);

    const [data, setData] = useState({
        branchId: "",
        cashAmount: "",
        shift: "",
    });
    const [cashInHandLoading, setCashInHandLoading] = useState(false);
    const [cashInHandError, setCashInHandError] = useState("");

    // Fetch branches from API
    const fetchAllBranches = async () => {
        try {
            setIsLoadingBranches(true);
            const response = await getAllBranches();
            
            if (response) {
                let branchesData = [];
                
                // Handle different possible response structures
                if (Array.isArray(response)) {
                    branchesData = response;
                } else if (response.data && Array.isArray(response.data)) {
                    branchesData = response.data;
                } else if (response.branches && Array.isArray(response.branches)) {
                    branchesData = response.branches;
                } else if (response.results && Array.isArray(response.results)) {
                    branchesData = response.results;
                } else {
                    // Try to find any array property
                    const keys = Object.keys(response);
                    for (const key of keys) {
                        if (Array.isArray(response[key])) {
                            branchesData = response[key];
                            break;
                        }
                    }
                }
                
                // Store raw branches data and transform to Select component format
                if (Array.isArray(branchesData) && branchesData.length > 0) {
                    setBranchesData(branchesData);
                    const branchesOptions = branchesData.map((branch) => ({
                        value: branch.branch_id || branch.id || branch.branchId,
                        label: branch.branch_name || branch.name || branch.branchName || `Branch ${branch.branch_id || branch.id}`,
                        branch_id: branch.branch_id || branch.id || branch.branchId
                    }));
                    setBranches(branchesOptions);
                } else {
                    setBranchesData([]);
                    setBranches([]);
                }
            }
        } catch (error) {
            console.error("Error fetching branches:", error);
            setBranches([]);
        } finally {
            setIsLoadingBranches(false);
        }
    };

    // Use branches from API, fallback to empty array if not loaded
    const branchOptions = branches.length > 0 ? branches : [];

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem", // rounded-xl
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db", // gray-300
            padding: "0rem 0.25rem", // py-2 px-3
            boxShadow: "none",
            "&:hover": {
                borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            },
        }),
        placeholder: (base) => ({
            ...base,
            color: "#6B7280", // gray-400
        }),
        singleValue: (base) => ({
            ...base,
            color: "#000000",
        }),
    };

    const fetchEmployeeShifts = async () => {
        try {
            const EmployeeId = localStorage.getItem("employeeId");
            console.log("EmployeeId:", EmployeeId);
            const payload = {
                employeeId: EmployeeId
            }
            const response = await getEmployeeShifts(payload);
            console.log("response Shift:", response);
            const employeeCode = response?.data?.data?.employee?.code;
            if (employeeCode) fetchCashInHand(employeeCode);
            setEmployeeData(response?.data?.data ?? null);
        } catch (error) {
            console.error("Error fetching employee shifts");
        }
    };

    const fetchCashInHand = async (employeeId) => {
        try {
            const payload = {
                startDate: new Date().toISOString().split("T")[0],
                endDate: new Date().toISOString().split("T")[0],
                branchId: Number(localStorage.getItem("selectedBranchId")),
                employeeId: employeeId
            }
            const response = await getCashInHand(payload);
            // Temporarily disabled auto-skip to dashboard
            // User will manually control when to skip attendance
            // if (response.data[0].history.length !== 0) {
            //     localStorage.setItem("employeeId", employeeId);
            //     navigate("/salesCorporate/retail/dashboard")
            // }

        } catch (error) {
            console.error("Error fetching employee shifts");
        }
    };

    // Extract opening balance from API response (handles various response shapes)
    const extractOpeningBalance = (response) => {
        const res = response?.data;
        if (res == null) return null;
        if (typeof res === "number" && !Number.isNaN(res)) return res;
        const inner = res?.data;
        if (typeof inner === "number" && !Number.isNaN(inner)) return inner;
        const keys = [
            "opening_balance", "next_day_opening_balance", "cash_in_hand",
            "openingBalance", "nextDayOpeningBalance", "cashInHand",
            "balance", "amount", "value",
        ];
        for (const key of keys) {
            const v = inner?.[key] ?? res?.[key];
            if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
        }
        // Single numeric value anywhere in object
        const obj = typeof inner === "object" && inner !== null ? inner : res;
        if (obj && typeof obj === "object") {
            for (const val of Object.values(obj)) {
                if (typeof val === "number" && !Number.isNaN(val)) return val;
                if (typeof val === "string" && val !== "" && !Number.isNaN(Number(val))) return Number(val);
            }
        }
        return null;
    };

    // Fetch next-day opening balance when branch is selected (cash in hand from API)
    useEffect(() => {
        const userId = localStorage.getItem("userId");
        if (!data.branchId || !userId) {
            setData(prev => (prev.cashAmount ? { ...prev, cashAmount: "" } : prev));
            setCashInHandError("");
            return;
        }
        let cancelled = false;
        setData(prev => ({ ...prev, cashAmount: "" }));
        setCashInHandLoading(true);
        setCashInHandError("");
        getNextDayOpeningBalance({
            employee_id: userId,
            branch_id: Number(data.branchId),
        })
            .then((response) => {
                if (cancelled) return;
                const value = extractOpeningBalance(response);
                if (value != null && value !== "") {
                    setData(prev => ({ ...prev, cashAmount: String(value) }));
                } else {
                    setCashInHandError("No opening balance in response");
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message;
                    setCashInHandError(msg ? `Could not load: ${msg}` : "Could not load opening balance");
                }
            })
            .finally(() => {
                if (!cancelled) setCashInHandLoading(false);
            });
        return () => { cancelled = true; };
    }, [data.branchId]);

    useEffect(() => {
        const attendanceDevice = (localStorage.getItem("attendance_device") || "").toLowerCase();
        // Skip attendance tracking page if attendance_device is Finger Print Machine
        if (attendanceDevice === "finger print machine") {
            localStorage.setItem("selectedBranchId", "10");
            localStorage.setItem("selectedBranchName", "Orugodawatta");
            localStorage.setItem("isDayStarted", "true");
            navigate("/salesCorporate/retail/dashboard");
            return;
        }

        // Role does not require attendance tracking: skip the form, default the branch
        if (!hasPermission("SalesRetail_Attendance_Tracking_View")) {
            const role = (localStorage.getItem("role") || "").toLowerCase();
            localStorage.setItem("selectedBranchId", "10");
            localStorage.setItem("selectedBranchName", "Orugodawatta");
            localStorage.setItem("isDayStarted", "true");
            navigate(role.includes("wip") ? "/salesCorporate/retail/to-production" : "/salesCorporate/retail/dashboard");
            return;
        }

        // Check if day is already started and attendance date matches today
        const isDayStarted = localStorage.getItem("isDayStarted") === "true";
        
        // If day is started and attendance date is today, skip attendance screen
        if (isDayStarted) {
            navigate("/salesCorporate/retail/dashboard");
            return;
        }

        fetchEmployeeShifts();
        fetchAllBranches();

        const interval = setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => clearInterval(interval);
    }, [navigate]);

    const capture = useCallback(() => {
        const imageSrc = webcamRef.current.getScreenshot(); // base64 string
        setImage(imageSrc); // store base64 for preview
    }, [webcamRef]);

    const markAttendance = async () => {
        try {
            if (!data.branchId) {
                setErrorMessage("Please select branch.");
                return;
            } else if (!data.shift) {
                setErrorMessage("Please select shift.");
                return;
            } else if (!data.cashAmount) {
                setErrorMessage(cashInHandLoading ? "Loading opening balance..." : "Cash in hand is required. Select a branch to load it.");
                return;
            }

            const userId = localStorage.getItem("userId");
            if (!userId) {
                setErrorMessage("User not found. Please login again.");
                return;
            }

            setIsLoading(true);
            setErrorMessage("");

            const selectedBranch = branchesData.find(branch =>
                (branch.branch_id || branch.id || branch.branchId) === data.branchId
            );
            const selectedBranchName = selectedBranch
                ? (selectedBranch.branch_name || selectedBranch.name || selectedBranch.branchName)
                : "";

            const employeeId = employeeData?.employee?.code ?? localStorage.getItem("employeeId") ?? userId;
            if (employeeData?.employee?.code) {
                localStorage.setItem("employeeId", employeeData.employee.code);
            }
            localStorage.setItem("selectedBranchId", data.branchId);
            localStorage.setItem("selectedBranchName", selectedBranchName);

            const payload = {
                user_id: userId,
                branch_id: Number(data.branchId),
                cash_in_hand: Number(data.cashAmount),
                image_url: image && image !== "skip" ? image : "No",
                selectedBranchId: Number(data.branchId),
                selectedBranchName: selectedBranchName,
            };

            // Prefer main API (JSON); fallback to HR pos_attendance API (multipart with signature_url file)
            let response;
            try {
                response = await markSystemHandoverAttendance(payload);
            } catch (mainError) {
                const status = mainError?.response?.status;
                const isNetworkOrNotFound = !status || status === 404 || status === 502;
                if (isNetworkOrNotFound) {
                    const posPayload = {
                        employeeId,
                        timestamp: new Date().toISOString(),
                        cashAmount: Number(data.cashAmount),
                        shift: data.shift ?? "",
                        branchId: String(data.branchId),
                        branchName: selectedBranchName,
                        imageBase64: image && image !== "skip" ? image : null,
                    };
                    response = await markPosAttendance(posPayload);
                } else {
                    throw mainError;
                }
            }

            // When main API succeeds, also call HR pos_attendance API (senior requirement) with signature image
            if (response) {
                try {
                    const posPayload = {
                        employeeId,
                        timestamp: new Date().toISOString(),
                        cashAmount: Number(data.cashAmount),
                        shift: data.shift ?? "",
                        branchId: String(data.branchId),
                        branchName: selectedBranchName,
                        imageBase64: image && image !== "skip" ? image : null,
                    };
                    await markPosAttendance(posPayload);
                } catch (posErr) {
                    console.warn("HR pos_attendance call after mark attendance:", posErr?.response?.data || posErr?.message);
                }
            }

            // Mark that the day has started
            localStorage.setItem("isDayStarted", "true");
            navigate("/salesCorporate/retail/dashboard");
        } catch (error) {
            const res = error?.response;
            console.error("Attendance error:", {
                status: res?.status,
                statusText: res?.statusText,
                data: res?.data,
                message: error?.message,
            });
            const data = res?.data;
            const backendMessage =
                typeof data?.message === "string" ? data.message
                    : typeof data?.error === "string" ? data.error
                        : Array.isArray(data?.message) ? data.message.join(" ")
                            : data?.detail ?? error?.message;
            const statusHint = res?.status ? ` (${res.status})` : "";
            setErrorMessage(backendMessage ? `${backendMessage}${statusHint}` : `Failed to mark attendance. Please try again.${statusHint}`);
        } finally {
            setIsLoading(false);
        }
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    return (
        <div className="flex flex-col relative min-h-screen">
            <img className="fixed origin-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 z-0 pointer-events-none" src={backgroundShape} />
            <img className="fixed origin-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 z-0 pointer-events-none -rotate-45" src={backgroundShapeRotate} />

            <div className="flex flex-col items-center gap-5 z-10">
                <Link to={'/salesCorporate/'} className="absolute left-8 top-5 flex flex-row gap-x-1 items-center text-primary text-3xl font-bold">
                    <Icon icon={'ion:arrow-back-circle'} />
                    <p>Back</p>
                </Link>

                <div className="absolute right-5 top-3 text-black/50 font-bold text-2xl">
                    <p>{now.toLocaleTimeString()}</p>
                    <p>{now.toLocaleDateString()}</p>
                </div>

                <img src={logo} className="w-80" />

                <h1 className="font-bold text-4xl text-primary">Attendance Tracking</h1>

                {image === null ?
                    <div className="flex flex-col bg-white border border-dashed border-primary w-1/4 rounded-xl overflow-hidden">
                        <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="rounded-lg shadow-md"
                        />

                        <div className="flex flex-row gap-2 my-2 mx-auto">
                            <button
                                onClick={capture}
                                className="px-4 py-2 bg-primary text-white rounded-lg font-semibold cursor-pointer"
                            >
                                Capture
                            </button>
                            <button
                                onClick={() => setImage("skip")}
                                className="px-4 py-2 bg-gray-400 text-white rounded-lg font-semibold cursor-pointer"
                            >
                                Skip
                            </button>
                        </div>
                    </div> :
                    image === "skip" ?
                    <div className="flex flex-col bg-white border border-dashed border-gray-300 w-1/4 rounded-xl overflow-hidden p-4 items-center justify-center">
                        <p className="text-gray-500 mb-2">Camera image skipped</p>
                        <button
                            onClick={() => setImage(null)}
                            className="px-4 py-2 bg-primary text-white rounded-lg font-semibold cursor-pointer"
                        >
                            Capture Image
                        </button>
                    </div> :
                    <div className="flex flex-col bg-white border border-dashed border-primary w-1/4 rounded-xl overflow-hidden">
                        <img src={image} />

                        <button
                            onClick={() => setImage(null)}
                            className="my-2 mx-auto px-4 py-2 bg-primary text-white rounded-lg font-semibold cursor-pointer"
                        >
                            Retake
                        </button>
                    </div>
                }

                <Select
                    className="w-1/4"
                    placeholder="Select Branch"
                    options={branchOptions}
                    styles={selectStyles}
                    filterOption={selectFilter}
                    onChange={(option) => {
                        // Ensure branch_id is properly set
                        const selectedBranch = branchesData.find(branch => 
                            (branch.branch_id || branch.id || branch.branchId) === option?.value ||
                            (branch.branch_id || branch.id || branch.branchId) === option?.branch_id
                        );
                        const branchId = selectedBranch ? (selectedBranch.branch_id || selectedBranch.id || selectedBranch.branchId) : (option?.value || null);
                        setData(prev => ({
                            ...prev,
                            branchId: branchId ? Number(branchId) : null
                        }));
                    }}
                    value={branchOptions.find(branch => branch.value === data.branchId)}
                />

                <Select
                    className="w-1/4"
                    placeholder="Select Shift"
                    options={employeeData?.shifts?.map(shift => ({
                        value: shift.ShiftType,
                        label: shift.ShiftType
                    }))}
                    styles={selectStyles}
                    filterOption={selectFilter}
                    onChange={(option) =>
                        setData(prev => ({
                            ...prev,
                            shift: option ? option.value : null
                        }))
                    }
                    value={employeeData?.shifts
                        ?.map(shift => ({
                            value: shift.ShiftType,
                            label: shift.ShiftType
                        }))
                        ?.find(s => s.value === data.shift)}
                />

                <div className="w-1/4 relative">
                    <input
                        className="w-full bg-gray-100 py-2 px-3 rounded-xl border border-gray-300 focus:outline-none read-only:cursor-not-allowed"
                        placeholder={cashInHandLoading ? "Loading..." : "Cash in Hand"}
                        type="number"
                        min={0}
                        step={0.01}
                        readOnly
                        value={data.cashAmount}
                        aria-label="Cash in Hand (from opening balance)"
                    />
                    {cashInHandLoading && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <BeatLoader color="#1470F9" size={8} />
                        </span>
                    )}
                </div>
                {cashInHandError && <p className="text-amber-600 text-sm -mt-1">{cashInHandError}</p>}

                <p className="text-red-500">{errorMessage}</p>
                <button
                    className="bg-primary text-white text-3xl font-bold rounded-lg py-1 px-5 mt-3 cursor-pointer w-1/4"
                    onClick={() => markAttendance()}
                    disabled={isLoading}
                >{isLoading ? <BeatLoader color="#fff" size={10} /> : "Next"}</button>
            </div>

            <a
                href="https://ceylonx.lk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-row mt-auto mb-3 ms-auto items-center gap-x-2 me-3"
            >
                <p className="text-black/50 font-bold">Powered by</p>
                <img src={cxLogo} className="h-3" />
            </a>
        </div >
    );
};

export default SalesRetailAttendanceTracking;