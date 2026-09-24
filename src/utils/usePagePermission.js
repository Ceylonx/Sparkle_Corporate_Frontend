import { useEffect, useState } from "react";
import { hasAnyPermission, isSuperadminRole } from "./permissionHelper";

/**
 * usePagePermission(requiredPermission, options?)
 * Gates an entire page component on one or more SalesRetail_* tokens, reacting
 * to permission changes the same way SalesRetailInvoice.jsx already does
 * (storage/focus/sparkle-permissions-changed events), so a role edit followed
 * by re-login is picked up without a manual page reload.
 * @param {string|string[]} requiredPermission - single token, or array ("any of")
 * @param {{ allowSuperadmin?: boolean }} [options] - default false: no bypass
 *   unless a page explicitly opts in.
 * @returns {{ allowed: boolean }}
 */
export function usePagePermission(requiredPermission, options = {}) {
    const { allowSuperadmin = false } = options;
    const required = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

    const compute = () => {
        if (allowSuperadmin && isSuperadminRole(localStorage.getItem("role"))) return true;
        return hasAnyPermission(required);
    };

    const [allowed, setAllowed] = useState(compute);

    useEffect(() => {
        const sync = () => setAllowed(compute());
        sync();
        const onStorage = (e) => {
            if (e.key === "permissions" || e.key === "role" || e.key == null) sync();
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", sync);
        window.addEventListener("sparkle-permissions-changed", sync);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("focus", sync);
            window.removeEventListener("sparkle-permissions-changed", sync);
        };
    }, [required.join("|"), allowSuperadmin]);

    return { allowed };
}
