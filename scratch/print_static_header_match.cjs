const fs = require('fs');
const file = 'c:/Users/ROG/Desktop/aws_sprakle-sales/src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const billFrameIdx = content.indexOf('<div className="corporate-period-invoice-bill-frame');
const billFrameEndIdx = content.indexOf('>', billFrameIdx) + 1;
const tableStartPos = billFrameEndIdx;

const staticHeaderFullStr = content.substring(
    tableStartPos,
    content.indexOf('                                        {pivotAndSummary.serviceBlocks.length === 0')
);

console.log('staticHeaderFullStr match length:', staticHeaderFullStr.length);
console.log('First 100 chars:\n', JSON.stringify(staticHeaderFullStr.substring(0, 100)));
console.log('Last 100 chars:\n', JSON.stringify(staticHeaderFullStr.substring(staticHeaderFullStr.length - 100)));
