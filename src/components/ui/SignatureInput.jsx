import React, { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

const SignatureInput = ({ handleAddSignature, handleClose }) => {
    const sigCanvas = useRef({});

    const clear = () => sigCanvas.current.clear();

    const save = () => {
        sigCanvas.current.getCanvas().toBlob((blob) => {
            if (blob) {
                const file = new File([blob], "signature.png", { type: "image/png" });
                handleAddSignature(file);
            }
        }, "image/png");
    };

    return (
        <div className="fixed inset-0 h-screen w-screen z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
            <div className="bg-white rounded-[24px] w-full max-w-[450px] shadow-2xl flex flex-col p-8 transition-all">
                <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                    Confirmation Signature
                </h2>
                <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                    Please draw your signature in the box below to confirm this request.
                </p>

                <div className="w-full h-[180px] border border-dashed border-gray-300 rounded-xl overflow-hidden bg-white mb-3">
                    <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{
                            className: "w-full h-full cursor-crosshair"
                        }}
                    />
                </div>

                <button
                    type="button"
                    onClick={clear}
                    className="text-gray-400 hover:text-gray-600 text-sm underline underline-offset-4 self-start cursor-pointer transition-colors mb-6"
                >
                    Clear Signature
                </button>

                <div className="flex flex-row gap-x-4 w-full">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                    >
                        Confirm & Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignatureInput;
