const fs = require('fs');
const file = 'src/pages/corporate/invoicing/CorporateInvoicePreview.jsx';
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// 1. Add renderInvoiceHeader helper function before renderDoc definition
const renderDocStr = '    const pricedLineCount = (pricedLines || []).length;\n\n    const renderDoc = () => {';
const headerFunc = fs.readFileSync('C:\\Users\\ROG\\.gemini\\antigravity-ide\\brain\\84a3a99d-a637-412e-b62c-eed86bb82e1d\\scratch\\header_code.txt', 'utf8').replace(/\r\n/g, '\n');
content = content.replace(renderDocStr, headerFunc);

// 2. Add print styles under @media print
const printStyleStr = '@media print {\n                    .tax-inv-handover-panel {\n                      break-before: page !important;\n                    }\n                    @page {\n                      size: A4 portrait !important;\n                      margin: 8mm 8mm 5mm 8mm !important;\n                    }';
const printStylesReplacement = `@media print {
                    table.print-main-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        border: none !important;
                    }
                    thead.print-main-thead {
                        display: table-header-group !important;
                    }
                    tbody.print-main-tbody {
                        display: table-row-group !important;
                    }
                    .tax-inv-handover-panel {
                      break-before: page !important;
                    }
                    @page {
                      size: A4 portrait !important;
                      margin: 8mm 8mm 5mm 8mm !important;
                    }`;
content = content.replace(printStyleStr, printStylesReplacement);

// 3. Wrap with table and hide static header inside tbody
const staticHeaderFullStr = content.substring(
    content.indexOf('<div\n                className={`tax-inv-page1-screen print:tax-inv-page1-print'),
    content.indexOf('            {/* Unified Sectioned Table */}')
);
const tableOpen = `<table className="w-full border-none border-collapse print-main-table">
                <thead className="hidden print:table-header-group print-main-thead">
                    <tr>
                        <td className="border-none p-0">
                            {renderInvoiceHeader(true)}
                        </td>
                    </tr>
                </thead>
                <tbody className="print-main-tbody">
                    <tr>
                        <td className="border-none p-0">
                            {renderInvoiceHeader(false)}
                            <div
                                className={\`tax-inv-page1-screen print:tax-inv-page1-print print:corporate-tax-invoice-page1-print \${manyLines ? "print:tax-inv-page1-print--many-lines" : ""}\`}
                            >
`;
content = content.replace(staticHeaderFullStr, tableOpen);

// 4. Close table before outer div closes
const footerBlock = `            <div className="flex flex-row justify-between w-full text-[11px] uppercase text-black/80 mt-6 mb-1 shrink-0">
                <p />
                <p className="ms-auto font-semibold tracking-tight">POWERED BY CEYLONX CORPORATION</p>
            </div>
        </div>`;
const footerReplacement = `            <div className="flex flex-row justify-between w-full text-[11px] uppercase text-black/80 mt-6 mb-1 shrink-0">
                <p />
                <p className="ms-auto font-semibold tracking-tight">POWERED BY CEYLONX CORPORATION</p>
            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>`;
content = content.replace(footerBlock, footerReplacement);

fs.writeFileSync(file, content, 'utf8');
console.log("Successfully applied all modifications to new CorporateInvoicePreview.jsx!");
