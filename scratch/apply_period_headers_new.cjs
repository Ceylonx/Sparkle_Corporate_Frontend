const fs = require('fs');
const file = 'src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// 1. Add renderInvoiceHeader helper function before verticalCellClass definition
const verticalCellClassStr = '    const verticalCellClass =';
const headerFunc = fs.readFileSync('C:\\Users\\ROG\\.gemini\\antigravity-ide\\brain\\84a3a99d-a637-412e-b62c-eed86bb82e1d\\scratch\\period_header_code.txt', 'utf8').replace(/\r\n/g, '\n');
content = content.replace(verticalCellClassStr, headerFunc + '\n' + verticalCellClassStr);

// 2. Add print styles under @media print
const printStyleStr = `@media print {
                        .corporate-period-invoice-shell {
                          background-color: #ffffff !important;
                        }`;
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
                        .corporate-period-invoice-shell {
                          background-color: #ffffff !important;
                        }`;
content = content.replace(printStyleStr, printStylesReplacement);

// 3. Wrap with table (inside corporate-period-invoice-bill-frame div)
const billFrameIdx = content.indexOf('<div className="corporate-period-invoice-bill-frame');
const billFrameEndIdx = content.indexOf('>', billFrameIdx) + 1;
const tableStartPos = billFrameEndIdx;

const staticHeaderFullStr = content.substring(
    tableStartPos,
    content.indexOf('                                        {pivotAndSummary.serviceBlocks.length === 0')
);
const tableOpen = `
                                    <table className="w-full border-none border-collapse print-main-table">
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
`;
content = content.replace(staticHeaderFullStr, tableOpen);

// 4. Delete the custom print header inside handover page (using spacing-independent markers)
const startIdx = content.indexOf('{/* Print-only page header */}');
const endIdx = content.indexOf('Hand Over Details &mdash; Goods Received Confirmation');
const h2Idx = content.lastIndexOf('<h2', endIdx);

if (startIdx !== -1 && h2Idx !== -1 && startIdx < h2Idx) {
    const lineStartIdx = content.lastIndexOf('\n', startIdx) + 1;
    const lineEndIdx = content.lastIndexOf('\n', h2Idx) + 1;
    
    const originalHeader = content.substring(lineStartIdx, lineEndIdx);
    const replacement = `                                              {/* Handover header is automatically printed via the main repeated print thead header */}
                                              `;
    content = content.replace(originalHeader, replacement);
} else {
    console.error("Error: Could not locate custom header inside handover page!");
}

// 5. Close table inside corporate-period-invoice-bill-frame div right after the footer block closes
const footerDivIdx = content.lastIndexOf('POWERED BY CEYLONX CORPORATION');
const closeHandoverIdx = content.indexOf('</div>', footerDivIdx);

if (footerDivIdx !== -1 && closeHandoverIdx !== -1) {
    const endOfFooterBlock = content.substring(footerDivIdx, closeHandoverIdx + 6);
    const footerReplacement = `POWERED BY CEYLONX CORPORATION</p>
                                         </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>`;
    content = content.replace(endOfFooterBlock, footerReplacement);
} else {
    console.error("Error: Could not find footer block indexes!");
}

fs.writeFileSync(file, content, 'utf8');
console.log("Successfully applied all modifications to new CorporatePeriodInvoicePreview.jsx!");
