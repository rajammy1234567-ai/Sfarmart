const fs = require('fs');
const path = require('path');

function replaceFonts(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceFonts(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let updated = false;
            if (content.includes("fontWeight: '500'")) {
                content = content.replace(/fontWeight: '500'/g, "fontWeight: '500'");
                updated = true;
            }
            if (content.includes("fontWeight: '500'")) {
                content = content.replace(/fontWeight: '500'/g, "fontWeight: '500'");
                updated = true;
            }
            if (updated) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated fonts in ${fullPath}`);
            }
        }
    }
}

replaceFonts(path.join(__dirname, 'src'));
console.log('Font replacement complete.');
