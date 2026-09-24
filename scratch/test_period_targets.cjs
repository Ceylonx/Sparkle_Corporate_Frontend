const fs = require('fs');
const file = 'src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const tableIdx = content.lastIndexOf('</table>');
console.log(JSON.stringify(content.substring(tableIdx - 100, tableIdx + 200)));
