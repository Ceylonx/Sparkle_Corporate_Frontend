import { useEffect, useState } from "react";

export function useCorporateMenuItems() {
    const [permissions, setPermissions] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            const stored = localStorage.getItem("permissions");
            if (stored) {
                try {
                    setPermissions(stored);
                    clearInterval(interval); // stop once found
                } catch {
                    // ignore parse error
                }
            }
        }, 500);

        return () => clearInterval(interval);
    }, []);

    return [
        {
            name: 'Dashboard',
            page: '/salesCorporate/corporate/dashboard',
            icon: 'material-symbols:home-rounded',
            permission: 'SalesCooperate_Dashboard_View',
            available: permissions?.includes("SalesCooperate_Dashboard_View") ?? false,
        },
        {
            name: 'Customers',
            page: '/salesCorporate/corporate/customers',
            icon: 'gridicons:user',
            permission: 'SalesCooperate_Customer_View',
            available: permissions?.includes("SalesCooperate_Customer_View") ?? false,
        },
        {
            name: 'Collection Order',
            page: '/salesCorporate/corporate/pickup-entry',
            icon: 'streamline-ultimate:paper-write-bold',
            permission: 'SalesCooperate_Pickup_Entry_View',
            available: permissions?.includes("SalesCooperate_Pickup_Entry_View") ?? false,
        },
        {
            name: 'Production',
            page: '/salesCorporate/corporate/production',
            icon: 'ix:package-filled',
            permission: 'SalesCooperate_Service_Order_View',
            available: permissions?.includes("SalesCooperate_Production_View") ?? false,
        },
        {
            name: 'Delivery',
            page: '/salesCorporate/corporate/delivery',
            icon: 'material-symbols-light:delivery-truck-bolt',
            permission: 'SalesCooperate_Delivery_View',
            available: permissions?.includes("SalesCooperate_Delivery_View") ?? false,
        },
        {
            name: 'Invoicing',
            page: '/salesCorporate/corporate/invoicing',
            icon: 'fa7-solid:file-invoice-dollar',
            permission: 'SalesCooperate_Invoicing_View',
            available: permissions?.includes("SalesCooperate_Invoicing_View") ?? false,
        },
        {
            name: 'Credit/Debit Notes',
            page: '/salesCorporate/corporate/credit-debit-notes',
            icon: 'mdi:note-text',
            permission: 'SalesCooperate_Invoicing_View',
            available: permissions?.includes("SalesCooperate_Invoicing_View") ?? false,
        },
        {
            name: 'Customer Payment',
            page: '/salesCorporate/corporate/receive-payment',
            icon: 'streamline-ultimate:cash-payment-bills-bold',
            permission: 'SalesCooperate_Receive_Payment_View',
            available: permissions?.includes("SalesCooperate_Receive_Payment_View") ?? false,
        },
        // {
        //     name: 'Deposit Now',
        //     page: '/salesCorporate/corporate/deposit-now',
        //     icon: 'mdi:bank-transfer',
        //     permission: 'SalesCooperate_Deposit_Now_View',
        //     available: permissions?.includes("SalesCooperate_Receive_Payment_View") ?? false,
        // },
        // {
        //     name: 'Report',
        //     page: '/salesCorporate/corporate/report',
        //     icon: 'mdi:report-box',
        //     permission: 'SalesCooperate_Report_View',
        //     available: permissions?.includes("SalesCooperate_Report_View") ?? false,
        // },
        {
            name: 'Settings',
            page: '/salesCorporate/corporate/settings',
            icon: 'icon-park-solid:setting',
            permission: 'SalesCooperate_Settings_View',
            available: permissions?.includes("SalesCooperate_Settings_View") ?? false,
        },
    ];
};