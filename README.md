# Tab Overview

A Chrome, Brave, and Firefox extension that replaces the new tab page with an
overview of every open tab, tab group, and window. Everything runs locally.

![Tab Overview window view](screenshot.png)

![Tab Overview sorted view](screenshot-sorted.png)

![Tab Overview archive view](screenshot-archive.png)

## Is this feasible?

Yes. Chrome and Firefox have supported new tab page overrides for years, and
Manifest V3 exposes everything this needs:

| What | API |
| --- | --- |
| Replace the new tab page | `chrome_url_overrides.newtab` in `manifest.json` |
| Read tabs, titles, URLs, windows | `chrome.tabs` + `chrome.windows` (`"tabs"` permission) |
| Read tab groups and colors | `chrome.tabGroups` (`"tabGroups"` permission) |
| Track when tabs were opened | `chrome.tabs.onCreated` + `chrome.storage.session` (`"storage"` permission) |
| Keep archived tabs | `chrome.storage.local` (`"storage"` + `"unlimitedStorage"` permissions) |
| Local favicons | `chrome-extension://<id>/_favicon/` (`"favicon"` permission) in Chrome, the tab's `data:` favicon in Firefox |

No host permissions and no network access are required. Brave, Edge, and other
Chromium browsers support the same manifest and APIs.

One `manifest.json` serves Chrome and Firefox. The `background` key lists both
`service_worker` and `scripts`: Chrome uses the service worker and ignores
`scripts`, and Firefox runs `background.js` as a background script. The
`browser_specific_settings.gecko` block gives Firefox the extension ID it
requires for Manifest V3.

## Install

### Chrome and Brave

1. Open `chrome://extensions` (or `brave://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open a new tab.

If you later change the files, click the reload button on the extension card.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `manifest.json` in this folder.
3. Open a new tab.

Firefox removes temporary add-ons when it restarts. A permanent install needs a
signed build, either listed on addons.mozilla.org (AMO) or signed for unlisted
self-distribution with `web-ext sign`. To check and package the extension:

```
npx web-ext lint
npx web-ext build --ignore-files "screenshot*.png"
```

The package is written to `web-ext-artifacts/`.

## Features

- The top bar switches between **Open tabs** and the **Archive**, each with
  its tab count, and holds the search box. Below it, a toolbar holds the view
  switch (Windows, called Batches in the archive, and Sorted), a summary of
  what is shown, and the actions for the current page and view: **Archive
  all** for open tabs, **Export** and **Import** in the archive, and **New
  group** in the Sorted view.
- Every window, with the current window first.
- A **Sorted** view that groups all tabs across windows by category: AI,
  Shopping, Development, Work, News & Reading, Social, Media, Games, Finance,
  Crypto & DeFi, Learning, Making, Travel, Health, Homelab, and Other.
- Custom groups: your own Sorted view categories, defined by domains and
  optional keywords. They are listed before the built-in categories, in your
  order and with your color. A group with no tabs is hidden. **Show N empty
  groups** in the Sorted toolbar lists every custom group, and the choice is
  remembered. The group whose editor is open always shows. The ⋯ button on a tab puts its site in a group,
  creates a new group for it, or takes it out of its group. The pencil button
  on a custom group's section opens its editor in place, to rename, recolor,
  reorder, and delete the group and edit its domains and keywords. Color and
  order changes save at once, and the name, domains, and keywords save when
  you leave the field. **Done** or Escape closes the editor. **New group** in
  the Sorted toolbar adds a group and opens its editor. Opening an editor
  clears the search. Custom groups apply to open and archived tabs.
- Tab groups shown with their Chrome title and color.
- Shows how long ago each tab was opened, with the exact time in the tooltip.
- Pinned, audible, muted, and sleeping (discarded) tabs are marked.
- Click a tab to switch to it and focus its window.
- Close a tab with the × button, or middle-click the tab card.
- Search by tab title, URL, or group name. Press `/` anywhere to focus search.
- Collapse a group in the overview; the state is remembered locally. This does
  not change the group's collapsed state in the browser's tab strip.
- Collapse a category in the sorted view; the state is remembered locally.
- The selected view and collapse choices persist across page loads.
- Live updates as tabs are opened, closed, moved, grouped, or renamed.
- **Suspend** closes a tab in the browser and keeps it on the **Open tabs**
  page, dimmed, in its window and tab group. Use **Suspend tab** in a tab's ⋯
  menu, or the suspend button beside a tab group, a window, or a Sorted view
  category. The same tabs stay open as with **Archive all**: pinned tabs,
  private-window tabs, and pages that can't be reopened later. A tab is closed
  only after it was saved, and a tab that navigated in the meantime stays open.
  Click a suspended tab to reopen it in place and switch to it, or remove it
  with the × button. **Reopen N** on a section reopens its suspended tabs in the
  background, unloaded where the browser allows it, in their tab groups.
  Suspended tabs follow their group by title and color, because group and
  window ids don't survive a restart. If neither their window nor their group is
  open, they are listed under **Suspended from closed windows** and reopen into
  the current window. Search and the Sorted view include them, and **Archive
  all** and a section archive take them along.
- The × button beside a tab group or a Sorted view category closes its open
  tabs after you confirm, without archiving or suspending them. Pinned tabs
  stay open, and suspended tabs stay suspended.
- **Archive all** closes every open tab and keeps it in the archive. Pinned
  tabs, private-window tabs, the overview itself, and pages that can't be
  reopened later (anything not `http:` or `https:`) stay open. A tab is closed
  only after the archive was saved.
- Archive one section: the archive button beside a tab group, a window, or a
  Sorted view category (built-in or custom) archives just that section, with
  the same rules as **Archive all**. A search narrows what is shown, not what a
  section archive takes. The batch is named after the section, such as
  "Research", "Window 2", or "Shopping", and keeps its windows and tab groups.
  The page stays on the open tabs, with a link to the new batch.
- The **Archive** view shows archived tabs with the same grouping: one section
  per archive batch with its windows and tab groups, or the **Sorted** view
  across all batches. Search works the same way as for open tabs.
- Click an archived tab to reopen it, or remove it with the × button.
  **Restore** reopens a whole batch, one window per archived window, with its
  tab groups. In Firefox the restored tabs stay unloaded until you open them.
- **Export**, in the archive toolbar, downloads the archive, your custom
  groups, and your suspended tabs as a JSON backup file. **Import** adds the
  batches, groups, and suspended tabs from a backup and skips the ones that are
  already there. A group you already have is kept as it is, not overwritten.
  The `customGroups` and `suspended` fields are optional, so backups made
  before they existed still import.
- Automatic light and dark theme.

## How the sorted view categorizes tabs

Custom groups are checked first, in this order:

1. Domains. The custom group with the most specific matching domain entry
   wins. An entry with a path beats a bare hostname, and a longer entry beats
   a shorter one. A hostname such as `example.com` also matches its
   subdomains, like `docs.example.com`. An entry with a path, such as
   `github.com/your-org`, matches that host when the address path is
   `/your-org` or starts with `/your-org/`.
2. Keywords. Otherwise, the first custom group in your order with a keyword
   in the tab title or address path wins. Keywords match whole words, so
   `budget` does not match `budgeting`.
3. Otherwise the built-in categories decide.

Domain entries are cleaned when you save them: letters are lowercased, and
`https://`, `www.`, and a trailing `/` are removed. Duplicate and empty lines
are dropped. Ports are ignored, so `localhost` covers every local port. A
domain belongs to one group: adding it to a group, from the ⋯ menu or the
group's editor, takes it out of any other group.

The built-in categories are decided locally from the tab's hostname and
title/URL keywords.
Known domains carry more weight than keywords, and topic keywords can override
generic news or social domains. For example:

- An Amazon product page stays in Shopping even if its title mentions AI.
- An AI article on a news site goes to AI.
- A GitHub repository stays in Development unless its title is strongly AI-related.
- Games, Crypto & DeFi, Making, and Homelab match by domain only, so a page
  never lands there because of a word in its title.
- Homelab also takes web pages on private IPv4 addresses (`192.168.x.x`,
  `10.x.x.x`, `172.16–31.x.x`), on `.local`, `.lan`, `.home.arpa`, and
  `.internal` names, and on dotless intranet names like `http://nas:8096`.
  `localhost` and `127.0.0.1` go to Development, since they're usually dev
  servers.
- Unknown sites fall back to title keywords, then Other.

Nothing reads the page content, makes a network request, or sends data anywhere.
The rules live in `categories.js`, so you can add domains or keywords there.

## Permissions and privacy

- `tabs` — read tab titles, URLs, favicons, and window membership. Chrome shows
  this as "Read your browsing history" at install time. The extension never
  stores or transmits that data.
- `tabGroups` — read tab group titles, colors, and membership.
- `favicon` — load favicons from Chrome's local favicon cache. No favicon
  requests are made to websites. This permission is Chrome-only. Firefox ignores
  it with a warning, and the page uses the `data:` favicon Firefox already
  provides for each tab, so Firefox makes no favicon requests to websites either.
- `storage` — keep tab open timestamps in session storage, and the tab archive,
  suspended tabs, and custom groups in the extension's local storage. Session data is cleared when the browser
  exits. Neither leaves the machine.
- `unlimitedStorage` — let the archive grow past Chrome's 10 MB local storage
  quota. Archived favicons are stored as image data.

The archive, custom groups, and suspended tabs live in the extension's local
storage. Archive batches are stored under `archive:batch:<id>` keys, suspended
tabs under `suspended:<id>` keys, and custom groups as one ordered array under
`customGroups`. They survive browser restarts, and none of them is synced.
Removing the extension deletes them, so use **Export** to keep a backup file
before you uninstall or reinstall it.

The background service worker records tab open times and removes them when tabs
close. There are no analytics, no external requests, and no host permissions. The
page reads browser state when it opens and listens for local tab events while it
is visible.

## Limitations

- Chrome does not expose window names, so windows are labeled "Current window",
  "Window 2", and so on.
- Only the current browser profile is visible. Other profiles and incognito
  windows are separate; enable **Allow in Incognito** on the extension card if
  you want the overview there.
- The new tab page itself is excluded from the list.
- If another extension also overrides the new tab page, Chrome only allows one.
- Chrome does not expose the original creation time of tabs that were already
  open before the extension was installed or before the browser restarted. Those
  tabs show "Before tracking". New tabs are tracked precisely from the moment
  they open.
- Categorization is a heuristic, so a page can land in the wrong category. Put
  its site in a custom group, or edit `categories.js` to tune the built-in
  domain and keyword rules.
- A browser restart restores the tab group state from Chrome's session; the
  overview's local group-collapse choices are stored in `localStorage`.
- Firefox 140 or newer is required. Tab groups use Firefox's tab groups feature,
  which shipped in Firefox 139.
- Pages without a favicon show a letter badge in both browsers.
- Archived and suspended tabs keep their title, address, and (in Firefox)
  favicon. Page state such as scroll position, form input, and back/forward
  history is not kept.
- A suspended tab's place among its neighbors is approximate. It comes from
  the tab's index when it was suspended, so tabs moved or reopened since then
  can shift it. Its window and tab group are not affected. **Reopen N** adds
  tabs at the end of the window.
- Window ids don't last across a restart, so after one, or after an import,
  suspended tabs go by their tab group, and otherwise to **Suspended from closed
  windows**.
- In the archive, a window's grouped tabs are listed before its ungrouped tabs,
  and a restored window opens them in that order.

## Files

```
manifest.json     Manifest V3 definition for Chrome and Firefox, new tab override, and background worker
background.js     Records tab open times and cleans them up, and clears saved window ids on a new browser session
categories.js     Domain and keyword rules for the sorted view, and custom group matching
custom-groups.js  Custom group storage, validation, and edits
newtab.html       Page shell
newtab.css        Light/dark responsive styling
newtab.js         Data loading, rendering, search, views, and tab actions
archive.js        Tab archive and suspended tab storage, archive all, restore, export, and import
suspend.js        Suspended tab placement, suspending, and reopening
icons/            Extension icons (SVG source + PNG sizes)
screenshot.png    Window view preview
screenshot-sorted.png  Sorted view preview
screenshot-archive.png  Archive view preview
```

## License

MIT — see [LICENSE](LICENSE).
