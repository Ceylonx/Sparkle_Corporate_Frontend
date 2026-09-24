const fs = require('fs');
const lines = fs.readFileSync('src/pages/corporate/invoicing/CorporatePeriodInvoicePreview.jsx', 'utf8').split('\n');

let openTags = [];
let startIndex = 2225; // around the start of printRef

for (let i = startIndex; i < 2960; i++) {
    const line = lines[i];
    
    const matches = line.match(/<\/?([a-zA-Z1-6\-]+)\b[^>]*>/g) || [];
    for (const match of matches) {
        if (match.startsWith('</')) {
            const tagName = match.substring(2, match.length - 1).trim();
            const lastOpen = openTags.pop();
            if (lastOpen !== tagName) {
                console.log(`Mismatch on line ${i + 1}: closed </${tagName}>, but expected </${lastOpen}>. Open tags: ${openTags.join(', ')}`);
                openTags.push(lastOpen); // restore
            }
        } else if (!match.endsWith('/>')) { // ignore self-closing
            // Get tag name
            const spaceIdx = match.indexOf(' ');
            const tagName = spaceIdx === -1 ? match.substring(1, match.length - 1) : match.substring(1, spaceIdx);
            if (tagName !== 'img' && tagName !== 'input' && tagName !== 'br' && tagName !== 'col' && tagName !== 'hr') {
                openTags.push(tagName);
            }
        }
    }
}

console.log("Remaining open tags at line 2960:", openTags.join(', '));
