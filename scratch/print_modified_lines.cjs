const fs = require('fs');
const file = 'src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');

for (let i = 2885; i < 2915; i++) {
    if (lines[i] !== undefined) {
        console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
    }
}
