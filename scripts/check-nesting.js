const fs = require('fs');
const path = require('path');

function checkFile(full) {
  const content = fs.readFileSync(full, 'utf8');
  // Check for <p> tags that contain <div
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(content)) !== null) {
    const inner = match[1];
    if (/<(div|table|ul|ol|h[1-6]|form|section)\b/i.test(inner)) {
      const line = content.substring(0, match.index).split('\n').length;
      console.log(`INVALID BLOCK INSIDE <p> in ${full}:${line}`);
      console.log(match[0].slice(0, 150) + '...\n');
    }
  }

  // Check for <button> inside <button>
  const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  while ((match = btnRegex.exec(content)) !== null) {
    if (/<button\b/i.test(match[1])) {
      const line = content.substring(0, match.index).split('\n').length;
      console.log(`INVALID BUTTON INSIDE BUTTON in ${full}:${line}`);
    }
  }

  // Check for <a> inside <a> or <Link> inside <Link>
  const linkRegex = /<(a|Link)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((match = linkRegex.exec(content)) !== null) {
    if (/<(a|Link)\b/i.test(match[2])) {
      const line = content.substring(0, match.index).split('\n').length;
      console.log(`INVALID LINK INSIDE LINK in ${full}:${line}`);
    }
  }
}

function checkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      checkDir(full);
    } else if (f.endsWith('.tsx') || f.endsWith('.jsx')) {
      checkFile(full);
    }
  }
}

checkDir('./apps/web/src');
