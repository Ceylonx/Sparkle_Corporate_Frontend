import axios from "axios";
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { getUserById, getUserRoleById } from "../services/UserServices";

const ProtectedRoutes = () => {
    const navigate = useNavigate();

    const token = localStorage.getItem("token");
    const uid = localStorage.getItem("userId");

    if (!token && !uid) {
        window.location.href = `${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/login`;
    }

    axios.defaults.headers.common['Authorization'] = `bearer ${token}`;

    const refreshUserRole = async () => {
        const userData = await getUserById(localStorage.getItem('userId'));
        const userRole = await getUserRoleById(userData.user.role_id);
        localStorage.setItem("userName", userData.user.name);
        localStorage.setItem("userEmail", userData.user.email);
        localStorage.setItem("role", userData.user.role_name);
        localStorage.setItem("moduleAccess", userRole.data.roleDetails.modue_access);
        localStorage.setItem("permissions", userRole.data.roleDetails.permissions);
        try {
            window.dispatchEvent(new Event("sparkle-permissions-changed"));
        } catch {
            /* ignore */
        }
    };

    useEffect(() => {
        refreshUserRole();

    }, [navigate]);

    return <Outlet />
}

export default ProtectedRoutes;