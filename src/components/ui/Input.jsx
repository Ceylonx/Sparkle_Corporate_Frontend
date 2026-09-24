import { useState } from "react";
import { BsEye, BsEyeSlash } from "react-icons/bs";
import { MdSearch } from "react-icons/md";

const Input = ({ variant, classnames, placeholder, value, onChange, required, id, name, label, disabled, options, step, min=0 }) => {
    const [showPassword, setShowPassword] = useState(false);

    switch (variant) {
        case 'large-text':
            return (
                <div className="flex flex-col gap-y-3">
                    {label &&
                        <label className="text-2xl font-semibold" htmlFor={id}>{label}</label>
                    }
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`px-5 py-2 text-2xl border border-black/50 rounded-lg ${classnames}`}
                        type="text"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'large-password':
            return (
                <div className="relative">
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`w-full px-5 py-2 text-2xl border border-black/50 rounded-lg ${classnames}`}
                        type={showPassword ? "text" : "password"}
                        onChange={onChange}
                        value={value}
                        required={required}
                    />

                    {showPassword ?
                        <BsEyeSlash className="absolute right-3 top-1/2 -translate-y-1/2   size-6 cursor-pointer" onClick={() => setShowPassword(!showPassword)} /> :
                        <BsEye className="absolute right-3 top-1/2 -translate-y-1/2 size-6 cursor-pointer" onClick={() => setShowPassword(!showPassword)} />
                    }
                </div>
            );
        case 'search-topbar':
            return (
                <div className="flex flex-row border border-gray rounded-full h-fit w-1/3">
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`grow h-fit px-5 py-1 text-2xl rounded-l-full ${classnames}`}
                        type="text"
                        onChange={onChange}
                        value={value}
                    />
                    <div className="flex justify-center items-center bg-gray rounded-r-full px-5">
                        <MdSearch className="size-8 text-white" />
                    </div>
                </div>
            );
        case 'search':
            return (
                <div className="flex flex-row border border-gray rounded-xl h-fit w-2/3">
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`grow h-fit px-5 py-2 text-2xl rounded-l-xl ${classnames}`}
                        type="text"
                        onChange={onChange}
                        value={value}
                    />
                    <div className="flex justify-center items-center bg-gray rounded-r-xl px-5">
                        <MdSearch className="size-8 text-white" />
                    </div>
                </div>
            );
        case 'text':
            return (
                <div className="flex flex-col gap-y-1">
                    {label &&
                        <label className="text-xl font-semibold" htmlFor={name}>{label}</label>
                    }
                    <input
                        id={name}
                        name={name}
                        placeholder={placeholder}
                        className={`px-4 py-1 text-xl border border-black/20 rounded-lg bg-white ${classnames}`}
                        type="text"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'number':
            return (
                <div className="flex flex-col gap-y-1 w-full">
                    {label &&
                        <label className="text-xl font-semibold" htmlFor={name}>{label}</label>
                    }
                    <input
                        id={name}
                        name={name}
                        placeholder={placeholder}
                        className={`px-4 py-1 text-xl border border-black/20 rounded-lg bg-white ${classnames}`}
                        type="number"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                        min={min}
                        step={step}
                    />
                </div>
            );
        case 'email':
            return (
                <div className="flex flex-col gap-y-1">
                    {label &&
                        <label className="text-xl font-semibold" htmlFor={name}>{label}</label>
                    }
                    <input
                        id={name}
                        name={name}
                        placeholder={placeholder}
                        className={`px-4 py-1 text-xl border border-black/20 rounded-lg bg-white ${classnames}`}
                        type="email"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'phone':
            return (
                <div className="flex flex-col gap-y-1">
                    {label &&
                        <label className="text-xl font-semibold" htmlFor={name}>{label}</label>
                    }
                    <input
                        id={name}
                        name={name}
                        placeholder={placeholder}
                        className={`px-4 py-1 text-xl border border-black/20 rounded-lg bg-white ${classnames}`}
                        type="tel"
                        maxLength={10}
                        inputMode="numeric"
                        pattern="(\+94\d{9}|0\d{9})"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'compact-text':
            return (
                <div className="grid grid-cols-4 gap-x-5">
                    {label &&
                        <label className="text-xl font-semibold my-auto" htmlFor={id}>{label}</label>
                    }
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`col-span-3 w-full px-5 py-1 text-xl border border-black/50 rounded-full ${classnames}`}
                        type="text"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'compact-number':
            return (
                <div className="grid grid-cols-4 gap-x-5">
                    {label &&
                        <label className="text-xl font-semibold my-auto" htmlFor={id}>{label}</label>
                    }
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`col-span-3 w-full px-5 py-1 text-xl border border-black/50 rounded-full ${classnames}`}
                        type="number"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'compact-password':
            return (
                <div className="grid grid-cols-4 gap-x-5">
                    {label &&
                        <label className="text-xl font-semibold my-auto" htmlFor={id}>{label}</label>
                    }
                    <div className="relative col-span-3">
                        <input
                            name={name}
                            placeholder={placeholder}
                            className={`w-full px-5 py-1 text-xl border border-black/50 rounded-full ${classnames}`}
                            type={showPassword ? "text" : "password"}
                            onChange={onChange}
                            value={value}
                            required={required}
                        />

                        {showPassword ?
                            <BsEyeSlash className="absolute right-3 top-1/2 -translate-y-1/2   size-6 cursor-pointer" onClick={() => setShowPassword(!showPassword)} /> :
                            <BsEye className="absolute right-3 top-1/2 -translate-y-1/2 size-6 cursor-pointer" onClick={() => setShowPassword(!showPassword)} />
                        }
                    </div>
                </div>
            );
        case 'compact-email':
            return (
                <div className="grid grid-cols-4 gap-x-5">
                    {label &&
                        <label className="text-xl font-semibold my-auto" htmlFor={id}>{label}</label>
                    }
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`col-span-3 w-full px-5 py-1 text-xl border border-black/50 rounded-full ${classnames}`}
                        type="email"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'compact-phone':
            return (
                <div className="grid grid-cols-4 gap-x-5">
                    {label &&
                        <label className="text-xl font-semibold my-auto" htmlFor={id}>{label}</label>
                    }
                    <input
                        name={name}
                        placeholder={placeholder}
                        className={`col-span-3 w-full px-5 py-1 text-xl border border-black/50 rounded-full ${classnames}`}
                        type="tel"
                        maxLength={10}
                        inputMode="numeric"
                        pattern="\d{0,10}"
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    />
                </div>
            );
        case 'compact-select':
            return (
                <div className="grid grid-cols-4 gap-x-5">
                    {label &&
                        <label className="text-xl font-semibold my-auto" htmlFor={id}>{label}</label>
                    }
                    <select
                        name={name}
                        className={`col-span-3 w-full px-5 py-1 text-xl border border-black/50 rounded-full ${classnames}`}
                        onChange={onChange}
                        value={value}
                        required={required}
                        disabled={disabled}
                    >
                        <option value='' disabled>{placeholder}</option>
                        {options.map((option, index) => (
                            <option key={index} value={option.value}>{option.name}</option>
                        ))}
                    </select>
                </div>
            );
        default:
            break;
    }
};

export default Input;