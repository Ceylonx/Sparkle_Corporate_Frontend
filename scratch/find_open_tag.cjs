const fs = require('fs');
const file = 'c:/Users/ROG/Desktop/aws_sprakle-sales/src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx';
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');

let stack = [];
for (let i = 2280; i < 2940; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const matches = line.match(/<\/?([a-zA-Z1-6\-]+)\b[^>]*>/g) || [];
    for (const match of matches) {
        if (match.startsWith('</')) {
            const tagName = match.substring(2, match.length - 1).trim();
            const popped = stack.pop();
            console.log(`Line ${i+1}: closed </${tagName}>, popped ${popped?.name} opened on line ${popped?.line}`);
        } else if (!match.endsWith('/>')) {
            const spaceIdx = match.indexOf(' ');
            const tagName = spaceIdx === -1 ? match.substring(1, match.length - 1) : match.substring(1, spaceIdx);
            if (tagName !== 'img' && tagName !== 'input' && tagName !== 'br' && tagName !== 'col' && tagName !== 'hr') {
                stack.push({ name: tagName, line: i + 1, text: match });
            }
        }
    }
}

console.log("\nRemaining open tags stack at line 2940:");
stack.forEach(t => console.log(`Line ${t.line}: <${t.name}> -> ${t.text}`));
