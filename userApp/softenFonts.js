const fs = require('fs');
const path = require('path');

function softenFonts(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            softenFonts(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let updated = false;
            
            // On Android, 700 is very bold. 600 sometimes falls back to 700.
            // Let's replace 700 -> 600, and 600 -> 500 to soften it universally.
            if (content.includes("fontWeight: '500'")) {
                content = content.replace(/fontWeight: '500'/g, "fontWeight: '500'");
                updated = true;
            }
            if (content.includes("fontWeight: '500'")) {
                // If we just replaced 700 to 600, this will catch it again if we aren't careful.
                // Wait, let's do it in one pass carefully.
            }
        }
    }
}
// Safer replacement logic
function softenFontsSafe(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            softenFontsSafe(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let updated = false;
            
            // Replace 700 with 600, 600 with 500, 800 with 600, 900 with 600
            let newContent = content.replace(/fontWeight:\s*['"](700|800|900)['"]/g, "fontWeight: '500'");
            newContent = newContent.replace(/fontWeight:\s*['"]600['"]/g, "fontWeight: '500'");
            
            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`Softened fonts in ${fullPath}`);
            }
        }
    }
}

softenFontsSafe(path.join(__dirname, 'src'));
console.log('Font softening complete.');
