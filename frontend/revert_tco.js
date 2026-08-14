const fs = require('fs');
const p = 'src/pages/TcoCalculator.tsx';
let c = fs.readFileSync(p, 'utf8');

// Find the InstrumentSlider block and remove it
const lines = c.split('\n');
const startIdx = lines.findIndex(l => l.trim() === '<InstrumentSlider');
if (startIdx === -1) {
  console.log('InstrumentSlider not found!');
  process.exit(1);
}

// Find the closing line
let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i].trim() === '/>') {
    endIdx = i;
    break;
  }
}
if (endIdx === -1) {
  console.log('Closing tag not found!');
  process.exit(1);
}

console.log('Removing lines', startIdx + 1, 'to', endIdx + 1);
// Remove the InstrumentSlider block and the blank line after it
lines.splice(startIdx, endIdx - startIdx + 1);
// Also remove the blank line after (if present)
if (lines[startIdx] === '') {
  lines.splice(startIdx, 1);
}

fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('Done! InstrumentSlider removed.');
