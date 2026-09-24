import { Outlet, useNavigate } from "react-router-dom";
import { hasPermission } from "./permissionHelper";

const ProtectedRoutesRetail = () => {
    const navigate = useNavigate();
    const employeeId = localStorage.getItem("employeeId");

    if (hasPermission("SalesRetail_Attendance_Tracking_View")) {
        if (!employeeId) {
            navigate("/salesCorporate/retail/attendance");
        }
    } else {
        // Role does not require attendance tracking - default the outlet branch
        localStorage.setItem("selectedBranchId", "10");
        localStorage.setItem("selectedBranchName", "Orugodawatta");
    }

    return <Outlet />;
};

export default ProtectedRoutesRetail;