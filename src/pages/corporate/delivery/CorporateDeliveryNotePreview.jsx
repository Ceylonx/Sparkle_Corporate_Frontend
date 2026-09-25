import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useReactToPrint } from "react-to-print";
import { BeatLoader } from "react-spinners";
import SignatureCanvas from "react-signature-canvas";
import Swal from "sweetalert2";
import CorporateDeliveryNote from "../../../components/printables/CorporateDeliveryNote";
import {
    getDeliveryNoteById,
    updateDeliveryNoteApprovalStatus,
    updateDeliveryNote,
    cancelDeliveryNote,
} from "../../../services/corporate/CorporateDeliveryServices";

const formatLogTimestamp = (isoString) => {
    try {
        const date = new Date(isoString);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${yyyy}-${mm}-${dd} ${hours}:${minutes} ${ampm}`;
    } catch (_) {
        return isoString;
    }
};

const CorporateDeliveryNotePreview = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const deliveryNoteRef = useRef(null);
    const sigCanvasRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isApprovalLoading, setIsApprovalLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [note, setNote] = useState(null);
    const [customer, setCustomer] = useState(null);

    // Approval state
    const [approvalStatus, setApprovalStatus] = useState("Created");
    const [status, setStatus] = useState("Active");
    const [createdByName, setCreatedByName] = useState("");
    const [checkedByUser, setCheckedByUser] = useState(null);
    const [checkedBySignature, setCheckedBySignature] = useState(null);
    const [approvedByUser, setApprovedByUser] = useState(null);
    const [approvedBySignature, setApprovedBySignature] = useState(null);
    const [signingForStatus, setSigningForStatus] = useState(null);
    const [activityLog, setActivityLog] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);

    // Set by get-delivery-note-by-id when the note's invoice already has a Credit/Debit Note or
    // payment entry — editing delivered quantities then would desync them (backend rejects too).
    const editLock = note?.edit_lock || null;
    const isEditLocked = !!editLock?.locked;

    const handleEditDeliveryNote = () => {
        if (isEditLocked) {
            Swal.fire({
                icon: "warning",
                title: "Delivery Note Locked",
                text: editLock?.message || "This delivery note's invoice already has credit/debit notes or payments.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        navigate(`/salesCorporate/corporate/delivery/entry/${note?.pickup_entry_id}`, {
            state: { edit_note_id: note?.delivery_id }
        });
    };

    const fetchNote = async () => {
        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            const response = await getDeliveryNoteById({
                user_id: userId,
                delivery_note_id: id,
            });
            const fetchedNote = response?.data?.delivery_note;
            if (!fetchedNote) {
                setErrorMessage("Delivery note not found.");
                return;
            }
            setNote(fetchedNote);

            // Build customer object from embedded data
            setCustomer({
                company_name: fetchedNote.customer_company_name,
                customer_id: fetchedNote.customer_id,
                customer_phone: fetchedNote.customer_phone,
                customer_address: fetchedNote.customer_address,
                vat_no: fetchedNote.vat_no,
                email: fetchedNote.email,
                place_of_supply: fetchedNote.place_of_supply,
            });

            // Hydrate approval state
            setApprovalStatus(fetchedNote.approval_status || "Created");
            setStatus(fetchedNote.status || "Active");
            setCheckedByUser(fetchedNote.checked_by_user || null);
            setCheckedBySignature(fetchedNote.checked_by_signature || null);
            setApprovedByUser(fetchedNote.approved_by_user || null);
            setApprovedBySignature(fetchedNote.approved_by_signature || null);
            setActivityLog(Array.isArray(fetchedNote.activity_log) ? fetchedNote.activity_log : []);

            // Created by — extract from first activity log entry
            const createdEntry = Array.isArray(fetchedNote.activity_log)
                ? fetchedNote.activity_log.find((l) => l.type === "Created")
                : null;
            setCreatedByName(createdEntry?.user || fetchedNote.delivered_by || "");
        } catch (error) {
            console.error("Error fetching delivery note:", error);
            setErrorMessage("Failed to load delivery note.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNote();
    }, [id]);

    const handlePrint = useReactToPrint({
        contentRef: deliveryNoteRef,
        documentTitle: `Delivery note  - ${customer?.company_name || "Customer"}`
    });

    const handleChecked = async (signature) => {
        const userId = localStorage.getItem("userId");
        if (!userId || !id) return;
        try {
            setIsApprovalLoading(true);
            const result = await updateDeliveryNoteApprovalStatus({
                user_id: userId,
                delivery_note_id: id,
                new_status: "Checked",
                signature: signature,
            });

            setApprovalStatus("Checked");
            setCheckedByUser(result.actor);
            setCheckedBySignature(signature);
            setActivityLog((prev) => [
                ...prev,
                {
                    type: "Checked",
                    user: result.actor,
                    timestamp: new Date().toISOString(),
                    description: "checked the delivery note",
                    changes: [],
                },
            ]);

            Swal.fire({
                icon: "success",
                title: "Delivery Note Checked Successfully!",
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9",
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then((result) => {
                if (result.isConfirmed) {
                    navigate("/salesCorporate/corporate/delivery", { state: { initialTab: 2 } });
                }
            });
        } catch (error) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text:
                    error?.response?.data?.message ??
                    "Failed to mark as Checked",
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleApproved = async (signature) => {
        const userId = localStorage.getItem("userId");
        if (!userId || !id) return;
        try {
            setIsApprovalLoading(true);
            const result = await updateDeliveryNoteApprovalStatus({
                user_id: userId,
                delivery_note_id: id,
                new_status: "Approved",
                signature: signature,
            });

            setApprovalStatus("Approved");
            setApprovedByUser(result.actor);
            setApprovedBySignature(signature);
            setActivityLog((prev) => [
                ...prev,
                {
                    type: "Approved",
                    user: result.actor,
                    timestamp: new Date().toISOString(),
                    description: "approved the delivery note",
                    changes: [],
                },
            ]);

            Swal.fire({
                icon: "success",
                title: "Delivery Note Approved Successfully!",
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#1470F9",
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then((result) => {
                if (result.isConfirmed) {
                    navigate("/salesCorporate/corporate/delivery", { state: { initialTab: 2 } });
                }
            });
        } catch (error) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text:
                    error?.response?.data?.message ??
                    "Failed to mark as Approved",
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleCancel = async () => {
        const userId = localStorage.getItem("userId");
        if (!userId || !id) return;

        const result = await Swal.fire({
            title: "Are you sure?",
            text: "You won't be able to revert this!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Yes, cancel it!"
        });

        if (result.isConfirmed) {
            try {
                setIsApprovalLoading(true);
                await cancelDeliveryNote({
                    user_id: userId,
                    delivery_note_id: id,
                });

                setStatus("Deactive");

                setActivityLog((prev) => [
                    ...prev,
                    {
                        type: "Cancelled",
                        user: localStorage.getItem("userName") || userId,
                        timestamp: new Date().toISOString(),
                        description: "cancelled the delivery note",
                        changes: [],
                    },
                ]);

                await Swal.fire({
                    icon: "success",
                    title: "Cancelled!",
                    text: "The delivery note has been cancelled.",
                    confirmButtonColor: "#1470F9"
                });

                navigate("/salesCorporate/corporate/delivery", { state: { initialTab: 1 } });
            } catch (error) {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: error?.response?.data?.message ?? "Failed to cancel delivery note",
                    confirmButtonColor: "#1470F9",
                });
            } finally {
                setIsApprovalLoading(false);
            }
        }
    };

    const handleConfirmSignature = () => {
        if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
            Swal.fire({
                icon: "warning",
                title: "Signature Required",
                text: "Please draw your signature first.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const signatureBase64 = sigCanvasRef.current
            .getCanvas()
            .toDataURL("image/png");
        setShowSignatureModal(false);
        if (signingForStatus === 'Checked') {
            setCheckedBySignature(signatureBase64);
            handleChecked(signatureBase64);
        } else if (signingForStatus === 'Approved') {
            setApprovedBySignature(signatureBase64);
            handleApproved(signatureBase64);
        }
    };

    const printableData = note
        ? {
              delivery_note_id: note.delivery_id || note.delivery_note_id,
              delivery_id: note.delivery_id || note.delivery_note_id,
              delivery_type: note.delivery_type || note.pickup_entry?.delivery_type || 'Normal',
              room_no: note.room_no || note.pickup_entry?.room_no || '—',
              gate_pass_no: note.gate_pass_no || note.pickup_entry?.gate_pass_no || '—',
              place_of_supply: note.place_of_supply,
              pickup_entry_id: note.pickup_entry_id,
              created_at: note.created_at,
              delivered_by: note.delivered_by,
              delivered_by_name: note.delivered_by,
              created_by_user: note.created_by_user,
              approval_status: approvalStatus,
              status: status,
              received_by: note.received_by,
              delivered_location: note.delivered_location,
              signature_url: note.signature_url,
              checked_by_user:
                  checkedByUser ||
                  (checkedBySignature
                      ? localStorage.getItem("userName")
                      : null) ||
                  note.checked_by_user,
              checked_by_signature:
                  checkedBySignature || note.checked_by_signature,
              checked_at: activityLog.find(l => l.type === 'Checked')?.timestamp || note.checked_at,
              approved_by_user:
                  approvedByUser ||
                  (approvedBySignature
                      ? localStorage.getItem("userName")
                      : null) ||
                  note.approved_by_user,
              approved_by_signature:
                  approvedBySignature || note.approved_by_signature,
              approved_at: activityLog.find(l => l.type === 'Approved')?.timestamp || note.approved_at,
          }
        : {};

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-40">
                <BeatLoader color="#1470F9" size={20} />
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft
                    className="size-6 text-primary cursor-pointer"
                    onClick={() =>
                        navigate("/salesCorporate/corporate/delivery", {
                            state: { initialTab: 2 },
                        })
                    }
                />
                <h1 className="text-3xl text-primary font-bold">
                    Delivery Note Preview
                </h1>
            </div>
            <p className="text-black/50 text-xl mb-4">
                View delivery note, manage approval, and print.
            </p>

            <div className="grid grid-cols-4 mt-5">
                {/* ─── Main: printable note ─── */}
                <main className="col-span-3 border-r border-black/20 pe-3">
                    {note && customer ? (
                        <CorporateDeliveryNote
                            ref={deliveryNoteRef}
                            data={printableData}
                            items={note.items || []}
                            customer={customer}
                        />
                    ) : (
                        <div className="text-center py-20 text-black/50">
                            {errorMessage || "Loading preview data..."}
                        </div>
                    )}

                    {/* Bottom action buttons */}
                    <div className="flex flex-row text-xl my-5 justify-between gap-x-5">
                        <button
                            type="button"
                            className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={() =>
                                navigate("/salesCorporate/corporate/delivery", {
                                    state: { initialTab: 2 },
                                })
                            }
                        >
                            Back
                        </button>
                        {status === 'Active' && approvalStatus !== 'Approved' ? (
                            <button
                                type="button"
                                className="font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-full py-2 w-1/3 cursor-pointer flex justify-center items-center"
                                onClick={handleCancel}
                                disabled={isApprovalLoading}
                            >
                                {isApprovalLoading ? (
                                    <BeatLoader size={8} color="#dc2626" />
                                ) : (
                                    "Cancel Delivery Note"
                                )}
                            </button>
                        ) : (
                            <div className="w-1/3"></div>
                        )}
                        <button
                            type="button"
                            className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={handlePrint}
                            disabled={!note}
                        >
                            Print Note
                        </button>
                    </div>
                </main>

                {/* ─── Sidebar: Approval Workflow ─── */}
                <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px]">

                    {/* Edit Delivery Note Button — locked once cancelled, or once the note's
                        invoice has a Credit/Debit Note or payment entry (note.edit_lock). */}
                    <button
                        disabled={status === 'Deactive' || isEditLocked}
                        onClick={handleEditDeliveryNote}
                        title={isEditLocked ? editLock?.message || "" : undefined}
                        className={`font-bold py-3 rounded-full text-lg shadow-sm transition-colors w-full ${
                            status === 'Deactive' || isEditLocked
                                ? 'bg-black/10 text-black/40 cursor-not-allowed'
                                : 'bg-[#E5EFFE] text-[#000000] hover:bg-[#d4e4fd] cursor-pointer flex justify-center items-center'
                        }`}
                    >
                        {status === 'Deactive' ? '🔒 Cancelled' : isEditLocked ? '🔒 Locked' : 'Edit Delivery Note'}
                    </button>
                    {status !== 'Deactive' && isEditLocked && (
                        <div className="-mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            <p className="font-semibold">Can't edit — invoice {editLock?.invoice_id} has:</p>
                            <ul className="list-disc list-inside mt-1 break-words">
                                {(editLock?.reasons || []).map((reason, idx) => (
                                    <li key={idx}>{reason}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Created By */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Created By :</p>
                        <div className="flex flex-row items-center gap-x-2">
                            <Icon
                                icon="mdi:check-circle"
                                className="text-[#00E676] text-xl"
                            />
                            <span className="text-black/70 text-sm truncate">
                                {createdByName || "—"}
                            </span>
                        </div>
                    </div>

                    {/* Checked By */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Checked By :</p>
                        {checkedByUser ? (
                            <div className="flex flex-row items-center gap-x-2">
                                <Icon
                                    icon="mdi:check-circle"
                                    className="text-[#1470F9] text-xl"
                                />
                                <span className="text-black/70 text-sm truncate">
                                    {checkedByUser}
                                </span>
                            </div>
                        ) : (
                            <button
                                disabled={
                                    approvalStatus !== "Created" ||
                                    isApprovalLoading ||
                                    status === "Deactive"
                                }
                                onClick={() => {
                                    handleChecked(null);
                                }}
                                className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors bg-white w-full text-lg ${
                                    approvalStatus === "Created" &&
                                    !isApprovalLoading &&
                                    status === "Active"
                                        ? "border-[#1470F9] text-[#1470F9] hover:bg-blue-50 cursor-pointer"
                                        : "border-black/20 text-black/30 cursor-not-allowed"
                                }`}
                            >
                                {isApprovalLoading ? (
                                    <BeatLoader size={8} color="#1470F9" />
                                ) : (
                                    "Checked"
                                )}
                            </button>
                        )}
                    </div>
 
                    {/* Approved By */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Approved By :</p>
                        {approvedByUser ? (
                            <div className="flex flex-row items-center gap-x-2">
                                <Icon
                                    icon="mdi:check-circle"
                                    className="text-[#00E676] text-xl"
                                />
                                <span className="text-black/70 text-sm truncate">
                                    {approvedByUser}
                                </span>
                            </div>
                        ) : (
                            <button
                                disabled={
                                    approvalStatus !== "Checked" ||
                                    isApprovalLoading ||
                                    status === "Deactive"
                                }
                                onClick={() => {
                                    handleApproved(null);
                                }}
                                className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors w-full text-lg ${
                                    approvalStatus === "Checked" &&
                                    !isApprovalLoading &&
                                    status === "Active"
                                        ? "bg-primary text-white hover:bg-blue-600 cursor-pointer"
                                        : "border-black/20 text-black/30 bg-white cursor-not-allowed"
                                }`}
                            >
                                {isApprovalLoading ? (
                                    <BeatLoader size={8} color="#ffffff" />
                                ) : (
                                    "Approved"
                                )}
                            </button>
                        )}
                    </div>

                    {/* Activity Log */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">
                            Activity Log :
                        </p>
                        <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                            {activityLog.length === 0 ? (
                                <div className="px-4 py-3 text-black/40 text-sm">
                                    No activity yet.
                                </div>
                            ) : (
                                activityLog.map((log, idx) => {
                                    const formattedTime = formatLogTimestamp(
                                        log.timestamp
                                    );
                                    return (
                                        <div
                                            key={idx}
                                            className={`px-4 py-2 text-sm text-black/70 ${
                                                idx > 0
                                                    ? "border-t border-black/20"
                                                    : ""
                                            }`}
                                        >
                                            <span className="font-semibold text-[13px]">
                                                {formattedTime}
                                            </span>
                                            {": "}
                                            {log.user}{" "}
                                            {log.type === "Created"
                                                ? "created the delivery note"
                                                : log.type === "Checked"
                                                ? "checked the delivery note"
                                                : log.type === "Approved"
                                                ? "approved the delivery note"
                                                : log.description || log.type}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Delivery Details */}
                    <div className="flex flex-col gap-y-1">
                        <label className="text-black font-semibold text-[15px]">
                            Delivered Location :
                        </label>
                        <input
                            value={note?.delivered_location || ""}
                            disabled
                            readOnly
                            placeholder="No location specified"
                            className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                        />
                    </div>
                    <div className="flex flex-col gap-y-1">
                        <label className="text-black font-semibold text-[15px]">
                            Received By :
                        </label>
                        <input
                            value={note?.received_by || ""}
                            disabled
                            readOnly
                            placeholder="No receiver specified"
                            className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                        />
                    </div>
                </aside>
            </div>

            {/* ─── Signature Modal ─── */}
            {showSignatureModal && (
                <div className="fixed inset-0 h-screen w-screen z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
                    <div className="bg-white rounded-[24px] w-full max-w-[450px] shadow-2xl flex flex-col p-8 transition-all relative">
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                            {signingForStatus === 'Approved' ? 'Approved By Signature' : 'Checked By Signature'}
                        </h2>
                        <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                            Please draw your signature in the box below to confirm this request.
                        </p>

                        <div className="w-full h-[180px] border border-dashed border-gray-300 rounded-xl overflow-hidden bg-white mb-3">
                            <SignatureCanvas
                                ref={sigCanvasRef}
                                penColor="black"
                                canvasProps={{
                                    className: "w-full h-full cursor-crosshair"
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => sigCanvasRef.current.clear()}
                            className="text-gray-400 hover:text-gray-600 text-sm underline underline-offset-4 self-start cursor-pointer transition-colors mb-6"
                        >
                            Clear Signature
                        </button>

                        <div className="flex flex-row gap-x-4 w-full">
                            <button
                                type="button"
                                onClick={() => setShowSignatureModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSignature}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorporateDeliveryNotePreview;
