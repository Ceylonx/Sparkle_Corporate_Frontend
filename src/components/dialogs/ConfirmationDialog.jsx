import { BeatLoader } from "react-spinners";

const ConfirmationDialog = ({ title, text, item, onClose, onSubmit, isLoading }) => {
    return (
        <div className="absolute z-50 top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl border-4 border-dark-gray w-1/3 h-fit flex flex-col p-5">
                <h1 className="text-3xl font-bold text-center mb-5">{title}</h1>
                <p className="text-xl text-center px-14">{text} {item ? "\"" : ""}<span className="font-bold">{item}</span>{item ? "\"" : ""}?</p>

                <div className="flex flex-row gap-x-5 justify-center mt-5">
                    <button className="bg-black/50 text-white rounded-2xl w-fit px-5 py-2 text-xl font-bold cursor-pointer" onClick={onClose}>Close</button>
                    <button className="bg-primary text-white rounded-2xl w-fit px-5 py-2 text-xl font-bold cursor-pointer" onClick={onSubmit}>{isLoading ? <BeatLoader color="#FFFFFF" size={10} /> : "Confirm"}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationDialog;