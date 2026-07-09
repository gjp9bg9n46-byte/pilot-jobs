// Normalize react-pdf per-generation nonces (CreationDate + /ID) to compare CONTENT bytes.
const fs = require('fs'), crypto = require('crypto');
function norm(buf) {
  let s = buf.toString('latin1');
  s = s.replace(/D:\d{14}Z/g, 'D:00000000000000Z');                       // CreationDate
  s = s.replace(/\/ID \[<[0-9a-fA-F]{32}> <[0-9a-fA-F]{32}>\]/g, '/ID [<00000000000000000000000000000000> <00000000000000000000000000000000>]'); // trailer ID
  return Buffer.from(s, 'latin1');
}
const [a, b] = [process.argv[2], process.argv[3]].map(f => norm(fs.readFileSync(f)));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const equal = Buffer.compare(a, b) === 0;
console.log(`normalized sha(${process.argv[2]})=${sha(a)}`);
console.log(`normalized sha(${process.argv[3]})=${sha(b)}`);
console.log(equal ? 'NORMALIZED-IDENTICAL ✓ (content byte-for-byte equal; only CreationDate/ID nonces differed)'
                  : `NORMALIZED-DIFFER ✗ (content differs! len ${a.length} vs ${b.length})`);
if (!equal) { let i=0; while(i<Math.min(a.length,b.length)&&a[i]===b[i]) i++; console.log(`first content diff at byte ${i}: ...${a.slice(Math.max(0,i-30),i+30).toString('latin1')}... vs ...${b.slice(Math.max(0,i-30),i+30).toString('latin1')}...`); }
process.exit(equal ? 0 : 1);
