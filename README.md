# Bourbon Buddies Club

This is a no-build, GitHub Pages-ready clubhouse. The tone is intentional; the password protection is real only after completing the Firebase setup below.

## What is included

- A responsive member clubhouse with a tasting calendar, searchable bottle notes, theme ideas, and rules imported from the supplied workbook.
- A Firebase Email/Password sign-in gate. No shared password is embedded in the site.
- One deliberately editable file: `data/club-data.js`. Edit the lists there to update the public-facing club content, then publish the change.

## Important privacy rule

GitHub Pages hosts a static website. Anyone can download its published HTML, JavaScript, and data files—even if the page visually shows a sign-in form. For that reason, this project intentionally excludes member phone numbers, emails, birthdays, accounting data, and newsletter links from the workbook.

Use Firebase Firestore (not `club-data.js`) for any content that must truly stay private. Configure Firestore rules to require a signed-in user. The login screen protects access to the site experience, while Firebase rules protect private database content.

## Set up secure club logins (free Firebase plan)

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. In **Authentication → Sign-in method**, enable **Email/Password**. Create the member accounts in **Authentication → Users**. Do not use a single shared password.
3. In **Project settings → Your apps**, add a Web app and copy its Firebase configuration values.
4. Open `app.js` and replace all four `PASTE_YOUR_...` values in `firebaseConfig` with those values.
5. In **Authentication → Settings → Authorized domains**, add your future GitHub Pages address: `YOUR-GITHUB-NAME.github.io`.
6. Test locally by opening the site through a local web server, then publish using the steps below. The sign-in will not work until step 5 is complete.

Firebase web configuration values are not secrets. The protection comes from Firebase Authentication and properly configured Firestore Security Rules. Never put a Firebase service-account key, a member spreadsheet, or a shared password in this repository.

## Publish free with GitHub Pages

1. Create a new **public** repository on GitHub, for example `bourbon-buddies-club`. Do not initialize it with a README.
2. Copy every file in this folder into that new repository and commit/push them. GitHub Desktop is the easiest option if you do not use Git yet.
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Choose `main` and `/ (root)`, then Save.
4. GitHub displays the free address after a minute or two: `https://YOUR-GITHUB-NAME.github.io/bourbon-buddies-club/`.
5. Add `YOUR-GITHUB-NAME.github.io` to Firebase Authorized domains, as described above, and test a member account.

## Keep it current

For public club highlights, edit `data/club-data.js`: add a schedule object, bottle object, rule, or theme. Commit and push. GitHub Pages redeploys automatically.

For genuinely private material—member directory, dues, reimbursements, or newsletters—set up a Firestore collection after Firebase login is working. Store it there and use Firebase Security Rules that require `request.auth != null`, with a separate admin role for editing.

## Private Firestore sections

The site now loads the directory, ledger, and newsletters from Firestore only after the signed-in user has an active invitation document. Create these collections in Firestore; do **not** put this information into this GitHub repository.

| Collection | Document ID | Required fields |
|---|---|---|
| `members` | Firebase Authentication UID | `active` (boolean), `role` (`admin` or `member`) |
| `privateDirectory` | Any unique ID | `name`, `title`, `phone`, `email` |
| `accounting` | Any unique ID | `date` (Firestore Timestamp), `description`, `status`, `member`, `amount` (number), `notes` |
| `newsletters` | Any unique ID | `date` (Firestore Timestamp), `title`, `url` (HTTPS URL) |
| `bottleReviews` | Auto-created by the website | `bottle`, `reviewer`, `dateReviewed`, `nose`, `palate`, `score`, `overall`, `authorUid` |
| `themeIdeas` | Imported from the workbook and auto-created by the website | `theme`, `lastUsed` (optional Timestamp), `used` (boolean), `authorUid`, `createdAt` |

Create each user yourself in Firebase Authentication. Copy their UID and create `members/UID` with `active: true`. An authenticated account without that document is immediately signed out by the site; Firestore rules must enforce the same restriction.

Paste this ruleset into **Firestore Database → Rules**, then publish it:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function member() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/members/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.active == true;
    }
    function admin() {
      return member() &&
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.role == 'admin';
    }
    match /members/{userId} {
      allow get: if request.auth != null && request.auth.uid == userId;
      allow create, update, delete: if admin();
    }
    match /privateDirectory/{document=**} {
      allow read: if member();
      allow write: if admin();
    }
    match /accounting/{document=**} {
      allow read: if member();
      allow write: if admin();
    }
    match /newsletters/{document=**} {
      allow read: if member();
      allow write: if admin();
    }
    match /bottleReviews/{reviewId} {
      allow read: if member();
      allow create: if member()
        && request.resource.data.authorUid == request.auth.uid
        && request.resource.data.bottle is string
        && request.resource.data.reviewer is string
        && request.resource.data.dateReviewed is timestamp
        && request.resource.data.nose is string
        && request.resource.data.palate is string
        && request.resource.data.overall is string
        && request.resource.data.score is number
        && request.resource.data.score >= 0
        && request.resource.data.score <= 100;
      allow update, delete: if admin() ||
        (member() && resource.data.authorUid == request.auth.uid);
    }
    match /themeIdeas/{themeId} {
      allow read: if member();
      allow create: if member()
        && request.resource.data.authorUid == request.auth.uid
        && request.resource.data.theme is string
        && request.resource.data.theme.size() > 0
        && request.resource.data.theme.size() <= 120
        && request.resource.data.createdAt is timestamp;
      allow update, delete: if admin() ||
        (member() && resource.data.authorUid == request.auth.uid);
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

The Firebase Console bypasses those rules, so use it to create the first administrator membership record and import the current spreadsheet data. Test with a member account and an uninvited account before sharing the site address.

## Member bottle reviews

Signed-in members can add a Bottle Note from the website. The reviewer selector is populated from `privateDirectory`; submitted reviews are saved to `bottleReviews` and appear in the existing search results. Publish the updated Firestore rules above before using the form. Members can add reviews and manage only reviews they created; admins can manage every review.

## Member theme ideas

The Theme Ideas page reads `themeIdeas` from Firestore after sign-in. The one-time importer brings in the original workbook’s **Tasting Ideas** records, including each recorded last-used date. New ideas submitted from the page are saved in the same collection. Publish the `themeIdeas` rule above before importing or adding an idea.

## One-time XLSX import

`tools/import_private_xlsx.py` maps the original workbook into `privateDirectory`, `accounting`, `newsletters`, `bottleReviews`, and `themeIdeas`. It does not create Firebase Authentication users or `members` invitation records, because those require the Firebase UID for each person.

1. In Firebase Console, open **Project settings → Service accounts → Firebase Admin SDK** and generate a new private key. Save it outside this repository, for example in your Downloads folder. This file provides administrator access to your Firebase project; never email it, commit it, or upload it.
2. Open PowerShell in the project folder and install the two local Python packages:

   ```powershell
   python -m pip install firebase-admin openpyxl
   ```

3. Check the import without writing any data:

   ```powershell
   python tools\import_private_xlsx.py --workbook "K:\Downloads\Bourbon Buddies Club Hub (BBC).xlsx"
   ```

4. If the counts look correct, run the actual import. Replace the key path below with the location where you saved your Firebase service-account JSON file:

   ```powershell
   python tools\import_private_xlsx.py --workbook "K:\Downloads\Bourbon Buddies Club Hub (BBC).xlsx" --service-account "C:\Users\YOUR-NAME\Downloads\service-account.json" --apply
   ```

The importer uses repeatable document IDs, so running it again with the same workbook updates the same Firestore records rather than creating duplicates. Review the imported records in Firestore before inviting members. Delete the private key when you no longer need it, or keep it in a password-protected local location outside the website repository.

## Before you share the URL

- Verify that only intended member email accounts exist in Firebase Authentication.
- Use unique passwords and enable Google/Microsoft account security or password-manager generated passwords.
- Confirm no sensitive data appears in `data/club-data.js`, commit history, or the GitHub repository.
- Test sign-in and sign-out in an incognito browser window.
