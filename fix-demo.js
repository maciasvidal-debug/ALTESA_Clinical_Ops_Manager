const fs = require('fs');

let html = fs.readFileSync('demo.html', 'utf8');
const regex = /:HL\["([^"]+)"/g;

let matches;
while ((matches = regex.exec(html)) !== null) {
  console.log(matches[1]);
}
