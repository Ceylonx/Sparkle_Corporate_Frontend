import { useRef, useState } from "react";
import { BsUpload } from "react-icons/bs";

const FileInput = ({ onUpload, button, accept = ".xls,.xlsx" }) => {
    const fileInputRef = useRef(null);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);

    const handleInputTrigger = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            e.target.value = null;
        }
        setUploadedFile(file);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setDragActive(false);

        if (event.dataTransfer.files.length > 0) {
            setUploadedFile(event.dataTransfer.files[0]);
            if (onChange) onChange(event.dataTransfer.files[0]);
        }
    };

    const handleUpload = () => {
        onUpload(uploadedFile);
        setUploadedFile(null);
    }

    return (
        <div
            className={`flex flex-col border border-dashed ${dragActive ? "border-blue" : "border-black/70"} rounded-3xl py-5`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
        >
            {uploadedFile ?
                <div className="flex flex-col items-center justify-center gap-y-3">
                    <BsUpload className="text-black/50 size-8" />
                    <p className="text-xl text-black/70 text-center">Drag & drop an Excel file here to change the file, or click to select</p>
                    <p className="text-xl text-black/50">Accepted formats: .xlsx, .xls</p>
                    <p className="text-2xl">{uploadedFile.name} - {(uploadedFile.size / (1024 * 1024)).toFixed(2)}MB</p>
                    <div className="flex felx-row gap-x-5">
                        <button className="cursor-pointer bg-black/50 text-white text-xl font-bold px-10 py-2 rounded-2xl" onClick={handleInputTrigger}>Change File</button>
                        <button className="cursor-pointer bg-primary text-white text-xl font-bold px-10 py-2 rounded-2xl" onClick={handleUpload}>Upload</button>
                    </div>
                </div> :
                <div className="flex flex-col items-center justify-center gap-y-3">
                    <BsUpload className="text-black/50 size-8" />
                    <p className="text-xl text-black/70 text-center">Drag & drop an Excel file here, or click to select</p>
                    <p className="text-xl text-black/50">Accepted formats: .xlsx, .xls</p>
                    <button className="cursor-pointer bg-primary text-white text-xl font-bold px-10 py-2 rounded-2xl" onClick={handleInputTrigger}>{button}</button>
                </div>
            }
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={accept}
                className="hidden"
            />
        </div>
    );
};

export default FileInput;