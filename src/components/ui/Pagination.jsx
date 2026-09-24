import React from 'react';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages && page !== currentPage) {
            onPageChange(page);
        }
    };

    const renderPageNumbers = () => {
        const pageWindow = 5;
        const half = Math.floor(pageWindow / 2);
        let start = Math.max(currentPage - half, 1);
        let end = start + pageWindow - 1;

        if (end > totalPages) {
            end = Math.max(totalPages, 1);
            start = Math.max(end - pageWindow + 1, 1);
        }

        const pages = [];

        if (start > 1) {
            pages.push(
                <button
                    key={1}
                    onClick={() => handlePageChange(1)}
                    className={`px-3 py-1 rounded-lg border border-primary/20 ${currentPage === 1
                        ? "bg-primary text-white font-bold"
                        : "bg-white text-black/60"
                        }`}
                >
                    1
                </button>
            );

            if (start > 2) {
                pages.push(<span key="start-ellipsis" className="px-1 flex items-end">...</span>);
            }
        }

        for (let i = start; i <= end; i++) {
            pages.push(
                <button
                    key={i}
                    onClick={() => handlePageChange(i)}
                    className={`px-3 py-1 rounded-lg border border-primary/20 ${i === currentPage
                        ? "bg-primary text-white font-bold"
                        : "bg-white text-black/60"
                        }`}
                >
                    {i}
                </button>
            );
        }

        if (end < totalPages) {
            if (end < totalPages - 1) {
                pages.push(<span key="end-ellipsis" className="px-1 flex items-end">...</span>);
            }

            pages.push(
                <button
                    key={totalPages}
                    onClick={() => handlePageChange(totalPages)}
                    className={`px-3 py-1 rounded-lg border border-primary/20 ${currentPage === totalPages
                        ? "bg-primary text-white font-bold"
                        : "bg-white text-black/60"
                        }`}
                >
                    {totalPages}
                </button>
            );
        }

        return pages;
    };

    return (
        <div className="flex justify-end gap-2 flex-wrap">
            <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage <= 1}
                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
            >
                First
            </button>
            <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
            >
                Previous
            </button>
            {renderPageNumbers()}
            <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
            >
                Next
            </button>
            <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage >= totalPages || totalPages === 0}
                className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
            >
                Last
            </button>
        </div>
    );
};

export default Pagination;
