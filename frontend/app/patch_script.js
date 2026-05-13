const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '[comercio]/catalogo/CatalogClient.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`             })}
          </div>`, 
`             }}
          />`
);

fs.writeFileSync(file, content);
console.log('Patched correctly');
