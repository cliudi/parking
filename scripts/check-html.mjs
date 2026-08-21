import fs from 'node:fs';

const files = ['index.html', 'admin.html', 'privacy.html', 'terms.html'];
const requiredUserIds = [
  'map',
  'bottomnav',
  'searchHistoryPanel',
  'onboarding',
  'duplicateMask',
  'duplicateResults',
];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());

  for (const source of scripts) new Function(source);

  if (file === 'index.html') {
    for (const id of requiredUserIds) {
      if (!html.includes(`id="${id}"`)) throw new Error(`${file}: missing #${id}`);
    }
    for (const fn of ['finishOnboarding', 'showSearchHistory', 'openFavoriteSort', 'showDuplicateDialog']) {
      if (!html.includes(`function ${fn}`)) throw new Error(`${file}: missing ${fn}()`);
    }
    for (const link of ['privacy.html', 'terms.html']) {
      if (!html.includes(`href="${link}"`)) throw new Error(`${file}: missing link to ${link}`);
    }
  }

  console.log(`${file}: inline JavaScript OK (${scripts.length})`);
}
