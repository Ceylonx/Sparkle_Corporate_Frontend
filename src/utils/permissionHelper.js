/**
 * Permission Helper Utilities
 * Provides functions to check user permissions stored in localStorage.
 * Permissions are stored as a comma-separated string under the key "permissions".
 * e.g., "SalesRetail_Customer_View, SalesRetail_Customer_Create, SalesRetail_Order_View"
 */

/**
 * Check if user has a specific permission
 * @param {string} permission - Permission to check (e.g., "SalesRetail_Customer_Create")
 * @returns {boolean}
 */
export const hasPermission = (permission) => {
    const permissions = localStorage.getItem("permissions");
    if (!permissions) return false;

    const permissionList = permissions.split(',').map(p => p.trim());
    return permissionList.includes(permission);
};

/**
 * Check if user has ANY of the specified permissions
 * @param {string[]} perms - Array of permissions to check
 * @returns {boolean}
 */
export const hasAnyPermission = (perms) => {
    return perms.some(permission => hasPermission(permission));
};

/**
 * Check if user has ALL of the specified permissions
 * @param {string[]} perms - Array of permissions to check
 * @returns {boolean}
 */
export const hasAllPermissions = (perms) => {
    return perms.every(permission => hasPermission(permission));
};

/**
 * Check if user can perform an action — strictly based on their assigned permissions.
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export const canPerformAction = (permission) => {
    return hasPermission(permission);
};

/**
 * Single canonical superadmin check. Exact match after trim + case-fold +
 * whitespace-collapse, so it tolerates both "superadmin" and "Super Admin"
 * spellings, while still rejecting anything that merely CONTAINS "superadmin"
 * (e.g. a role literally named "Junior SuperAdmin") - unlike the loose
 * `.includes("superadmin")` pattern this replaces.
 * @param {string} role
 * @returns {boolean}
 */
export const isSuperadminRole = (role) => {
    return String(role || "").trim().toLowerCase().replace(/\s+/g, "") === "superadmin";
};
