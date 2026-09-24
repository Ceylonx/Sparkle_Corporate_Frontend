import axios from "axios";

const API_BASE_URL_HR = import.meta.env.VITE_SERVER_API_HR;
const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getEmployeeShifts(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL_HR}/shifts/employee_shift`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching employee shifts");
        }
    } catch (error) {
        console.error("Error fetching employee shifts:", error);
        throw error;
    }
};

/**
 * Convert a base64 data URL (e.g. from webcam screenshot) to a File for multipart upload.
 */
function dataUrlToFile(dataUrl, filename = "signature.png") {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    try {
        const res = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!res) return null;
        const mime = res[1] || "image/png";
        const bstr = atob(res[2]);
        let n = bstr.length;
        const u8 = new Uint8Array(n);
        while (n--) u8[n] = bstr.charCodeAt(n);
        const blob = new Blob([u8], { type: mime });
        const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
        return new File([blob], filename.replace(/\.[^.]+$/, "") + "." + ext, { type: mime });
    } catch (e) {
        console.warn("dataUrlToFile failed:", e);
        return null;
    }
}

/**
 * Create a minimal 1x1 PNG as File (for day end when no new signature is captured).
 */
function createPlaceholderSignatureFile() {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([new Blob([arr], { type: "image/png" })], "day-end-placeholder.png", { type: "image/png" });
}

/**
 * POS attendance API: POST multipart form-data to HR backend.
 * Body fields: employeeId, signature_url (file), timestamp, cashAmount, shift, branchId, branchName.
 * Payload may contain: employeeId (or user_id), timestamp (or we use now), cashAmount (or cash_in_hand),
 * shift, branchId (or branch_id), branchName (or selectedBranchName), imageBase64 (data URL) or signatureFile (File).
 */
export async function markPosAttendance(payload) {
    try {
        let formData;
        if (payload instanceof FormData) {
            formData = payload;
        } else {
            formData = new FormData();
            const employeeId = payload.employeeId ?? payload.user_id ?? "";
            const timestamp = payload.timestamp ?? new Date().toISOString();
            const cashAmount = payload.cashAmount ?? payload.cash_in_hand ?? "";
            const shift = payload.shift ?? "";
            const branchId = payload.branchId ?? payload.branch_id ?? payload.selectedBranchId ?? "";
            const branchName = payload.branchName ?? payload.selectedBranchName ?? "";

            formData.append("employeeId", String(employeeId));
            formData.append("timestamp", String(timestamp));
            formData.append("cashAmount", String(cashAmount));
            formData.append("shift", String(shift));
            formData.append("branchId", String(branchId));
            formData.append("branchName", String(branchName));

            let signatureFile = payload.signatureFile ?? null;
            if (!signatureFile && payload.imageBase64 && payload.imageBase64 !== "skip") {
                signatureFile = dataUrlToFile(payload.imageBase64, "attendance-signature.png");
            }
            if (!signatureFile && (payload.image_url && payload.image_url !== "No")) {
                signatureFile = dataUrlToFile(payload.image_url, "attendance-signature.png");
            }
            if (!signatureFile) {
                signatureFile = createPlaceholderSignatureFile();
            }
            formData.append("signature_url", signatureFile);
        }

        const response = await axios.post(
            `${API_BASE_URL_HR}/attendance/pos_attendance`,
            formData
        );

        if (response && (response.status === 200 || response.status === 201)) {
            return response;
        } else {
            console.error("Error marking attendance");
        }
    } catch (error) {
        console.error("Error marking attendance:", error);
        throw error;
    }
};

// New system handover attendance endpoint (JSON body, main API)
// Expected payload:
// {
//   user_id: string,
//   branch_id: number,
//   cash_in_hand: number,
//   image_url: string
// }
export async function markSystemHandoverAttendance(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/attendence/system-handover-attendence`,
            payload
        );

        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        } else {
            console.error("Error marking system handover attendance");
        }
    } catch (error) {
        console.error("Error marking system handover attendance:", error);
        throw error;
    }
};

export async function getCashInHand(payload) {
    try {
        const response = await axios.get(`${API_BASE_URL_HR}/attendance/pos`, {
            params: {
                startDate: payload.startDate,
                endDate: payload.endDate,
                branchId: payload.branchId,
                employeeId: payload.employeeId
            },
        });

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching cash in hand");
        }
    } catch (error) {
        console.error("Error fetching  cash in hand:", error);
        throw error;
    }
};

/**
 * Fetch all branches (with outlet name, address, telephone) for the given user.
 * GET /attendence/get-all-branches/:userId
 * Used e.g. to display outlet details on collection order.
 */
export async function getBranchesForAttendance(userId) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/attendence/get-all-branches/${userId}`
        );
        if (response && (response.status === 200 || response.status === 201)) {
            const body = response.data;
            return body && typeof body === "object" ? body : null;
        }
        return null;
    } catch (error) {
        console.error("Error fetching branches for attendance:", error);
        return null;
    }
}

/**
 * Fetch next-day opening balance (cash in hand) for attendance.
 * POST body: { employee_id: string, branch_id: number }
 * Used to pre-fill and lock the "Cash in Hand" field on the attendance page.
 */
export async function getNextDayOpeningBalance(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/attendence/next-day-opening-balance`,
            {
                employee_id: payload.employee_id,
                branch_id: payload.branch_id,
            }
        );
        if (response && (response.status === 200 || response.status === 201)) {
            return response;
        }
        console.error("Error fetching next-day opening balance");
        return response;
    } catch (error) {
        console.error("Error fetching next-day opening balance:", error);
        throw error;
    }
}