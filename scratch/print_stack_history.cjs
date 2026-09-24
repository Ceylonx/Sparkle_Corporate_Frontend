const fs = require('fs');
const file = 'c:/Users/ROG/Desktop/aws_sprakle-sales/src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');

let stack = [];
for (let i = 2280; i < 2940; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const matches = line.match(/<\/?([a-zA-Z1-6\-]+)\b[^>]*>/g) || [];
    for (const match of matches) {
        const isClose = match.startsWith('</');
        const spaceIdx = match.indexOf(' ');
        const tagName = isClose ? match.substring(2, match.length - 1).trim() : (spaceIdx === -1 ? match.substring(1, match.length - 1) : match.substring(1, spaceIdx));
        
        if (tagName === 'div') {
            if (isClose) {
                const popped = stack.pop();
                console.log(`Line ${i+1}: popped </div> matching <div line=${popped?.line}>`);
            } else if (!match.endsWith('/>')) {
                stack.push({ line: i + 1 });
                console.log(`Line ${i+1}: pushed <div className="...">`);
            }
        }
    }
}
