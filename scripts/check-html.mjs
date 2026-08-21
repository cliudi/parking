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
    for (const fn of ['finishOnboarding', 'showSearchHistory', 'openFavoriteSort', 'showDuplicateDialog', 'setMinFreeMinutes', 'setLanguage', 'renderSubmissionPhotoPreview']) {
      if (!html.includes(`function ${fn}`)) throw new Error(`${file}: missing ${fn}()`);
    }
    for (const language of ['ru:{', 'I18N.uz', 'I18N.en']) {
      if (!html.includes(language)) throw new Error(`${file}: missing ${language}`);
    }
    for (const localizedUi of ['language-option', "languageTitle:'", "mySubmissions:'", "navAsk:'", "notificationNew:'", "routeHow:'", "selectPointFirst:'", "photoPreview:'"]) {
      if (!html.includes(localizedUi)) throw new Error(`${file}: missing localized UI ${localizedUi}`);
    }
    for (const link of ['privacy.html', 'terms.html']) {
      if (!html.includes(`href="${link}"`)) throw new Error(`${file}: missing link to ${link}`);
    }
  }

  if (file === 'admin.html') {
    for (const id of ['sourceFilter', 'photoFilter', 'updatedFromFilter', 'updatedToFilter', 'usersNav', 'usersPanel', 'userRows']) {
      if (!html.includes(`id="${id}"`)) throw new Error(`${file}: missing #${id}`);
    }
    for (const fn of ['loadAdminUsers', 'loadParkingsLegacy', 'adminPageArgs', 'setSidebarOpen']) {
      if (!html.includes(`function ${fn}`)) throw new Error(`${file}: missing ${fn}()`);
    }
    for (const sidebarUi of ['height:100dvh', 'overflow-y:auto', 'aria-expanded="false"']) {
      if (!html.includes(sidebarUi)) throw new Error(`${file}: missing sidebar behavior ${sidebarUi}`);
    }
  }

  console.log(`${file}: inline JavaScript OK (${scripts.length})`);
}
