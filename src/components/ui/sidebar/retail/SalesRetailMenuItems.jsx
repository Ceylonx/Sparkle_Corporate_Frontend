import { useEffect, useState } from "react";
import {
    canAccessDispatchNoteManagement,
    canAccessSettingsManagement,
    canAccessTransferNoteManagement,
    parsePermissionTokens,
} from "../../../../utils/retailSubTabPermissions";
import { isSuperadminRole } from "../../../../utils/permissionHelper";

export function useRetailMenuItems() {
    const [permissions, setPermissions] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            const stored = localStorage.getItem("permissions");
            if (stored) {
                try {
                    setPermissions(stored);
                    clearInterval(interval);
                } catch {
                    // ignore
                }
            }
        }, 500);
        return () => clearInterval(interval);
    }, []);

    const check = (perm) => permissions ? permissions.includes(perm) : false;
    const userRole = typeof localStorage !== "undefined" ? localStorage.getItem("role") || "" : "";
    const isSuperadmin = isSuperadminRole(userRole);
    const permissionTokens = parsePermissionTokens(permissions);
    const transferNoteMenuAvailable = canAccessTransferNoteManagement(permissionTokens, isSuperadmin, permissions);
    const dispatchNoteMenuAvailable = canAccessDispatchNoteManagement(permissionTokens, isSuperadmin);
    const settingsMenuAvailable = canAccessSettingsManagement(permissionTokens);

    return [
        {
            name: 'Dashboard',
            page: '/salesCorporate/retail/dashboard',
            icon: 'material-symbols:home-rounded',
            permission: 'SalesRetail_Dashboard_View',
            available: check("SalesRetail_Dashboard_View"),
        },
        {
            name: 'Customers',
            page: '/salesCorporate/retail/customers',
            icon: 'gridicons:user',
            permission: 'SalesRetail_Customer_View',
            available: check("SalesRetail_Customer_View"),
        },
        {
            name: 'Order Entry',
            page: '/salesCorporate/retail/order-entry',
            icon: 'mdi:cart',
            permission: 'SalesRetail_Order_View',
            available: check("SalesRetail_Order_View"),
        },
        {
            name: 'Service Order',
            page: '/salesCorporate/retail/service-order',
            icon: 'ix:package-filled',
            permission: 'SalesRetail_Service_View',
            available: check("SalesRetail_Service_View"),
        },
        {
            name: 'Transfer Note',
            page: '/salesCorporate/retail/to-production',
            icon: 'streamline-flex:production-belt-time-solid',
            permission: 'SalesRetail_To_Production_View',
            available: transferNoteMenuAvailable,
        },
        {
            name: 'Dispatch Note',
            page: '/salesCorporate/retail/back-to-outlet',
            icon: 'mdi:package-check',
            permission: 'SalesRetail_Back_to_Outlet_View',
            available: dispatchNoteMenuAvailable,
        },
        {
            name: 'Invoice',
            page: '/salesCorporate/retail/invoice',
            icon: 'game-icons:jet-pack',
            permission: 'SalesRetail_Invoice_View',
            available: check("SalesRetail_Invoice_View"),
        },
        {
            name: 'Settings',
            page: '/salesCorporate/retail/settings',
            icon: 'icon-park-solid:setting',
            permission: 'SalesRetail_Settings_View',
            available: settingsMenuAvailable,
        },
    ];
};