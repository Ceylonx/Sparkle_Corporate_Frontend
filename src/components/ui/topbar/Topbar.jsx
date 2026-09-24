import logo from "../../../assets/logo.png";
import { MdNotifications } from "react-icons/md";
import { MdSearch } from "react-icons/md";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import UserOptions from "./UserOptions";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import RetailDayEndDialog from "../../dialogs/retail/RetailDayEndDialog";
import CorporateDayEndDialog from "../../dialogs/corporate/CorporateDayEndDialog";
import OrderStatusModal from "../../dialogs/retail/OrderStatusModal";
import CorporatePickupTrackingModal from "../../dialogs/corporate/CorporatePickupTrackingModal";
import { getAllBranches } from "../../../services/Retail/RetailOrderServices";

const Topbar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const [showUserOptions, setShowUserOptions] = useState(false);
    const [displayBranchName, setDisplayBranchName] = useState(() => localStorage.getItem("selectedBranchName") || "");

    // On live, selectedBranchName may not be set (e.g. no attendance flow). Sync from branches when we have selectedBranchId.
    useEffect(() => {
        const storedName = localStorage.getItem("selectedBranchName");
        const storedId = localStorage.getItem("selectedBranchId");
        if (storedName) {
            setDisplayBranchName(storedName);
            return;
        }
        if (!storedId) return;
        let cancelled = false;
        (async () => {
            try {
                const response = await getAllBranches();
                const list = Array.isArray(response) ? response : response?.data ?? response?.branches ?? response?.results ?? [];
                const branch = list.find(b => String(b.branch_id || b.id || b.branchId) === String(storedId));
                const name = branch ? (branch.branch_name || branch.name || branch.branchName) : "";
                if (!cancelled && name) {
                    localStorage.setItem("selectedBranchName", name);
                    setDisplayBranchName(name);
                }
            } catch (e) {
                console.error("Topbar: could not sync branch name", e);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const [showUserCreateDialog, setShowUserCreateDialog] = useState(false);
    const [showViewUsersDialog, setShowViewUsersDialog] = useState(false);
    const [showDayEndDialog, setShowDayEndDialog] = useState(false);
    const [orderStatusSearchQuery, setOrderStatusSearchQuery] = useState("");
    const [showOrderStatusModal, setShowOrderStatusModal] = useState(false);
    const [showCorporatePickupModal, setShowCorporatePickupModal] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState("");

    const handleLogout = () => {
        localStorage.clear();
        window.location.href = `${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/login`;
    };

    const handleDayEnd = () => {
        setShowUserOptions(false); // Close the dropdown
        setShowDayEndDialog(true);
    };

    const handleOrderStatusSearch = (e) => {
        if (e.key === "Enter" && orderStatusSearchQuery.trim()) {
            const query = orderStatusSearchQuery.trim();
            setSelectedOrderId(query);
            
            if (query.toUpperCase().startsWith("PE_")) {
                setShowOrderStatusModal(false);
                setShowCorporatePickupModal(true);
            } else {
                setShowCorporatePickupModal(false);
                setShowOrderStatusModal(true);
            }
        }
    };

    return (
        <div className="flex flex-row w-full items-center gap-x-10 px-8 py-1">
            {location.pathname === "/salesCorporate/retail/order-entry/add-new-order" &&
                <div className="flex flex-row gap-x-3 items-center">
                    <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/order-entry`)} />
                    <h1 className="text-3xl text-primary font-bold">Order Entry/Add New Order</h1>
                </div>
            }

            {location.pathname.startsWith("/salesCorporate/retail/order-entry/update-order/") &&
                <div className="flex flex-row gap-x-3 items-center">
                    <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/order-entry`)} />
                    <h1 className="text-3xl text-primary font-bold">Order Entry/Edit Order/{id}</h1>
                </div>
            }

            <div className="relative grow flex flex-row items-center justify-end gap-x-5 p-3 transtion-all duration-300">
                {/* Order Status Search Bar */}
                <div className="flex flex-row border border-primary rounded-full bg-white shadow-md min-w-[220px]">
                    <div className="flex justify-center items-center rounded-l-full px-3 py-1.5">
                        <MdSearch className="size-4 text-primary" />
                    </div>
                    <input
                        type="text"
                        placeholder="Find order status here..."
                        value={orderStatusSearchQuery}
                        onChange={(e) => setOrderStatusSearchQuery(e.target.value)}
                        onKeyDown={handleOrderStatusSearch}
                        className="px-3 py-1.5 rounded-r-full outline-none text-sm flex-1 min-w-0 focus:ring-0 border-0 bg-transparent"
                    />
                </div>
                {/* Notification icon temporarily hidden — not needed yet, re-enable when ready to use.
                <Icon icon={"mingcute:notification-line"} className="size-8 p-1 text-black/50" />
                */}
                <Icon icon={"mdi:user"} className="bg-primary/20 text-primary rounded-full p-1 size-8 cursor-pointer" onClick={() => setShowUserOptions(true)} />
            </div>

            {showUserOptions &&
                <div className="fixed z-40 top-0 left-0 bg-black/50 w-screen h-screen" onClick={() => setShowUserOptions(false)}></div>
            }

            {showUserOptions &&
                <UserOptions handleLogout={handleLogout} handleDayEnd={handleDayEnd} branchName={displayBranchName} />
            }

            {showDayEndDialog && (
                location.pathname.startsWith("/salesCorporate/corporate") ? (
                    <CorporateDayEndDialog
                        handleClose={() => setShowDayEndDialog(false)}
                    />
                ) : (
                    <RetailDayEndDialog
                        handleClose={(success) => {
                            setShowDayEndDialog(false);
                            if (success) {
                                // On successful day end, log out user (clear everything including attendance)
                                localStorage.clear();
                                window.location.href = `${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/login`;
                            }
                        }}
                    />
                )
            )}

            {showOrderStatusModal &&
                <OrderStatusModal
                    orderId={selectedOrderId}
                    onClose={() => {
                        setShowOrderStatusModal(false);
                        setOrderStatusSearchQuery("");
                        setSelectedOrderId("");
                    }}
                />
            }

            {showCorporatePickupModal && 
                <CorporatePickupTrackingModal 
                    pickupId={selectedOrderId}
                    onClose={() => {
                        setShowCorporatePickupModal(false);
                        setOrderStatusSearchQuery("");
                        setSelectedOrderId("");
                    }}
                />
            }
        </div>
    );
};

export default Topbar;