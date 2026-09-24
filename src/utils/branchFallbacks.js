export const BRANCH_FALLBACKS = {
    1: { name: "Thimbirigasyaya", location_address: "No. 460 Thimbirigasyaya Rd, Colombo 00005", location_telephone: "114701148" },
    2: { name: "Kotahena", location_address: "No. 290 George R. De Silva Mawatha, Colombo 01300", location_telephone: "114701440" },
    3: { name: "Wattala", location_address: "Arpico Super Center, Old Negombo Rd, Wattala", location_telephone: "114701543" },
    4: { name: "Panadura", location_address: "No 346 Galle Rd Panadura", location_telephone: "114701478" },
    5: { name: "Battaramulla", location_address: "No. 964/1 Pannipitiya Road, Battaramulla", location_telephone: "114701291" },
    6: { name: "Pagoda", location_address: "No. 35/33, Pagoda Rd, Nugegoda", location_telephone: "114701483" },
    7: { name: "Kiribathgoda", location_address: "No. 281/A Kandy - Colombo Rd, Kiribathgoda", location_telephone: "114701467" },
    8: { name: "Nawala", location_address: "No. 192 Nawala Rd, Sri Jayawardenepura Kotte", location_telephone: "114701150" },
    9: { name: "Seeduwa", location_address: "No. 532, Negambo Road, Seeduwa", location_telephone: "114701167" },
    10: { name: "Orugodawatta", location_address: "No.391, Avissawealla Road, Wellampitiya", location_telephone: "114701566" },
    11: { name: "Marien Drive", location_address: "No. 532/3j, 1 Marine Drive, Colombo 00300", location_telephone: "114215115" },
    13: { name: "Pickup & Delivery - 01", location_address: "", location_telephone: "" },
    14: { name: "Pickup & Delivery - 02", location_address: "", location_telephone: "" },
    15: { name: "Havelock Town", location_address: "No. 592 Havelock Rd, Colombo 00600", location_telephone: "114701437" },
};

export function getOutletInfoForBranch(branchId) {
    if (branchId == null) return null;
    const fallback = BRANCH_FALLBACKS[Number(branchId)];
    if (!fallback) return null;
    return {
        name: fallback.name || "",
        address: fallback.location_address || "",
        telephone: fallback.location_telephone || "",
    };
}

export function applyBranchFallback(info, branchId) {
    const fallback = branchId != null ? BRANCH_FALLBACKS[Number(branchId)] : null;
    if (!fallback) return info;
    if (!info) {
        return {
            name: fallback.name || "",
            address: fallback.location_address || "",
            telephone: fallback.location_telephone || "",
        };
    }
    return {
        name: info.name || fallback.name || "",
        address: (info.address && String(info.address).trim() !== "") ? info.address : (fallback.location_address || ""),
        telephone: (info.telephone && String(info.telephone).trim() !== "") ? info.telephone : (fallback.location_telephone || ""),
    };
}
