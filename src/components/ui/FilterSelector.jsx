const FilterSelector = ({ value, options, onChange, disabled = false, placeholder, className }) => {
    const hasEmptyOption = options?.some((o) => o.value === "" || o.value == null);
    const selectClass =
        className ||
        "px-5 bg-white border border-black/20 rounded-xl text-xl";
    return (
        <select
            className={selectClass}
            onChange={onChange}
            value={value}
            disabled={disabled}
            style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}}
        >
            {!hasEmptyOption && <option value={''} className="text-black">{placeholder || 'All'}</option>}
            {options?.map((option, index) => (
                <option key={index} value={option.value} className="text-black">{option.label}</option>
            ))}
        </select>
    );
};

export default FilterSelector;