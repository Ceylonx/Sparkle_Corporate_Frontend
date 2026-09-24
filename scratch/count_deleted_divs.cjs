const fs = require('fs');
const file = 'c:/Users/ROG/Desktop/aws_sprakle-sales/src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const startIndex = content.indexOf('<div className="corporate-period-invoice-bill-frame');
const endIndex = content.lastIndexOf('POWERED BY CEYLONX CORPORATION');

const bodyText = content.substring(startIndex, endIndex);

const openDivs = (bodyText.match(/<div\b/g) || []).length;
const closeDivs = (bodyText.match(/<\/div>/g) || []).length;

console.log('openDivs in body:', openDivs);
console.log('closeDivs in body:', closeDivs);
console.log('difference (open - close):', openDivs - closeDivs);
