import { club } from './data/club-data.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = { apiKey:'AIzaSyDx55W3kB4b9wSzctS-BiPjyDbx1141LGo', authDomain:'bourbon-buddies-b5ecc.firebaseapp.com', projectId:'bourbon-buddies-b5ecc', appId:'1:543014516471:web:6a95226abd4e50179185f2' };
const configured = !Object.values(firebaseConfig).some(value => value.includes('PASTE_'));
const $ = selector => document.querySelector(selector);
const dateFormat = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const currencyFormat = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const asDate = value => new Date(`${value}T12:00:00Z`);
const privateDate = value => value?.toDate ? value.toDate() : new Date(`${value}T12:00:00Z`);
const hasPrivateDate = value => !Number.isNaN(privateDate(value).getTime());
const formatPrivateDate = value => hasPrivateDate(value) ? dateFormat.format(privateDate(value)) : 'Undated';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
let submittedReviews = [];
let submittedThemes = [];
let scheduleNotes = [];
let firestoreSchedule = [];
let clubFunds = null;
let firestoreDatabase = null;
let signedInUser = null;
let signedInAdmin = false;

function allReviews() { return submittedReviews.length ? submittedReviews : club.bottles; }

function renderLeaderboard() {
  const list = $('#leaderboard-list');
  if (!list) return;
  const grouped = new Map();
  allReviews().forEach(review => {
    const bottle = String(review.bottle || '').trim(); const score = Number(review.score);
    if (!bottle || !Number.isFinite(score)) return;
    const key = bottle.toLowerCase(); const entry = grouped.get(key) || { bottle, scores:[] };
    entry.scores.push(score); grouped.set(key, entry);
  });
  const leaders = [...grouped.values()].map(entry => ({ ...entry, average:entry.scores.reduce((total, score) => total + score, 0) / entry.scores.length })).sort((a,b) => b.average - a.average || b.scores.length - a.scores.length || a.bottle.localeCompare(b.bottle)).slice(0,3);
  list.innerHTML = leaders.map((entry, index) => `<article class="leader-card"><span class="leader-rank">#${index + 1}</span><div><strong>${escapeHtml(entry.bottle)}</strong><p>${entry.scores.length} ${entry.scores.length === 1 ? 'review' : 'reviews'} · club average</p></div><span class="leader-score">${entry.average.toFixed(0)}</span></article>`).join('') || '<p class="loading">No scored reviews yet.</p>';
}

function renderBottleFilters() {
  const select = $('#bottle-reviewer');
  if (!select) return;
  const current = select.value;
  const reviewers = [...new Set(allReviews().map(review => String(review.reviewer || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  select.innerHTML = '<option value="">All reviewers</option>' + reviewers.map(reviewer => `<option value="${escapeHtml(reviewer)}">${escapeHtml(reviewer)}</option>`).join('');
  select.value = reviewers.includes(current) ? current : '';
}

function renderBottleList() {
  const list = $('#bottle-list');
  if (!list) return;
  const q = $('#bottle-search')?.value.toLowerCase() || '';
  const reviewer = $('#bottle-reviewer')?.value || '';
  const sort = $('#bottle-sort')?.value || 'newest';
  const matches = allReviews().filter(review => Object.values(review).join(' ').toLowerCase().includes(q) && (!reviewer || review.reviewer === reviewer));
  matches.sort((a,b) => {
    if (sort === 'score') return Number(b.score) - Number(a.score) || String(a.bottle).localeCompare(String(b.bottle));
    if (sort === 'bottle') return String(a.bottle).localeCompare(String(b.bottle));
    return privateDate(b.dateReviewed).getTime() - privateDate(a.dateReviewed).getTime();
  });
  list.innerHTML = matches.map(review => `<article class="bottle-card"><header><div><strong>${escapeHtml(review.bottle)}</strong><p>Reviewed by ${escapeHtml(review.reviewer)}</p></div><span class="score">${escapeHtml(review.score)}</span></header>${review.dateReviewed ? `<p><b>Date:</b> ${formatPrivateDate(review.dateReviewed)}</p>`:''}<p><b>Nose:</b> ${escapeHtml(review.nose)}</p><p><b>Palate:</b> ${escapeHtml(review.palate)}</p>${review.overall ? `<p><b>Overall:</b> ${escapeHtml(review.overall)}</p>`:''}</article>`).join('') || '<p>No bottle in the cabinet matches that search.</p>';
}

function renderThemeIdeas() {
  const list = $('#idea-list');
  if (!list) return;
  const seen = new Set();
  const sourceIdeas = submittedThemes.length ? submittedThemes : club.ideas.map(([theme, used]) => ({ theme, used }));
  const ideas = sourceIdeas
    .filter(idea => {
      const key = String(idea.theme || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  list.innerHTML = ideas.map(idea => `<span class="chip ${idea.used ? 'used' : ''}">${escapeHtml(idea.theme)}${idea.used ? ' · previously poured' : ''}</span>`).join('') || '<p class="loading">No theme ideas yet.</p>';
}

function renderClubContent() {
  const schedule = [...(firestoreSchedule.length ? firestoreSchedule : club.schedule)].sort((a,b) => asDate(a.date)-asDate(b.date));
  const next = schedule.find(event => asDate(event.date) >= new Date()) || schedule.at(-1);
  if ($('#next-date')) { $('#next-date').textContent=dateFormat.format(asDate(next.date)); $('#next-theme').textContent=next.theme; $('#next-location').textContent=next.location; }
  if ($('#club-funds')) $('#club-funds').textContent = clubFunds === null ? 'Loading…' : Number.isFinite(clubFunds) ? currencyFormat.format(clubFunds) : 'Not synced yet';
  if ($('#schedule-list')) $('#schedule-list').innerHTML = [...schedule].reverse().map(event => { const note = scheduleNotes.find(item => String(item.theme || '').trim() === String(event.theme || '').trim() && hasPrivateDate(item.date) && privateDate(item.date).toISOString().slice(0,10) === event.date); const noteUrl = safeUrl(event.tastingNotesUrl || note?.url); return `<article class="schedule-item ${event === next ? 'upcoming':''}"><time class="schedule-date">${dateFormat.format(asDate(event.date))}</time><div><strong>${escapeHtml(event.theme)}</strong><small><b>Location:</b> ${escapeHtml(event.location)}</small></div><div class="schedule-details"><p><b>Tasting Selection:</b> ${escapeHtml(event.selection)}</p><p><b>Most Popular:</b> ${escapeHtml(event.popular || 'Not recorded')}</p>${noteUrl ? `<p><a class="tasting-notes-link" href="${escapeHtml(noteUrl)}" target="_blank" rel="noopener noreferrer">Open tasting notes →</a></p>` : `<p><b>Notes:</b> ${escapeHtml(event.notes || '—')}</p>`}</div></article>`; }).join('');
  renderThemeIdeas();
  if ($('#rule-list')) $('#rule-list').innerHTML = club.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('');
  if ($('#bottle-search')) $('#bottle-search').oninput = renderBottleList;
  if ($('#bottle-reviewer')) $('#bottle-reviewer').onchange = renderBottleList;
  if ($('#bottle-sort')) $('#bottle-sort').onchange = renderBottleList;
  if ($('#review-date')) $('#review-date').value = new Date().toISOString().slice(0,10);
  renderBottleFilters();
  renderLeaderboard();
  renderBottleList();
}

function renderReviewers(people) {
  const select = $('#reviewer');
  if (!select) return;
  select.innerHTML = '<option value="">Choose your name</option>' + people.map(person => `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`).join('');
}

function renderPrivateData(directory, newsletters, reviewSnapshot, themeSnapshot, scheduleSnapshot, tastingSnapshot, fundsSnapshot) {
  const people = directory ? directory.docs.map(item => item.data()).sort((a,b) => String(a.name).localeCompare(String(b.name))) : [];
  if ($('#directory-list')) $('#directory-list').innerHTML = people.length ? people.map(person => `<article class="member-card"><strong>${escapeHtml(person.name)}</strong><p>${escapeHtml(person.title)}</p>${person.onlyDramsUsername ? `<p><b>OnlyDrams:</b> ${escapeHtml(person.onlyDramsUsername)}</p>` : ''}<p>${escapeHtml(person.phone)}<br><a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></p></article>`).join('') : '<p class="loading">No directory entries yet.</p>';
  renderReviewers(people);
  if ($('#newsletter-list')) {
    const letters = newsletters ? newsletters.docs.map(item => item.data()).sort((a,b) => privateDate(b.date)-privateDate(a.date)) : [];
    $('#newsletter-list').innerHTML = letters.length ? letters.map(letter => { const url=safeUrl(letter.url); return url ? `<a class="newsletter-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(letter.title)}<span>${formatPrivateDate(letter.date)} →</span></a>` : `<div class="newsletter-link">${escapeHtml(letter.title)}<span>${formatPrivateDate(letter.date)}</span></div>`; }).join('') : '<p class="loading">No newsletters yet.</p>';
  }
  if (reviewSnapshot) { submittedReviews = reviewSnapshot.docs.map(item => ({...item.data(), reviewer:item.data().reviewer || 'Club member'})).sort((a,b) => privateDate(b.dateReviewed)-privateDate(a.dateReviewed)); renderBottleFilters(); renderLeaderboard(); renderBottleList(); }
  if (themeSnapshot) {
    submittedThemes = themeSnapshot.docs.map(item => item.data()).sort((a,b) => String(a.theme || '').localeCompare(String(b.theme || '')));
    renderThemeIdeas();
  }
  if (scheduleSnapshot) { scheduleNotes = scheduleSnapshot.docs.map(item => item.data()); renderClubContent(); }
  if (tastingSnapshot) {
    firestoreSchedule = tastingSnapshot.docs.map(item => { const tasting = item.data(); return {...tasting, date:hasPrivateDate(tasting.date) ? privateDate(tasting.date).toISOString().slice(0,10) : tasting.date}; });
    renderClubContent();
  }
  if (fundsSnapshot) { clubFunds = fundsSnapshot.exists() ? Number(fundsSnapshot.data().availableFunds) : undefined; renderClubContent(); }
}

async function loadPrivateData() {
  const needDirectory = Boolean($('#directory-list') || $('#reviewer'));
  const needNewsletters = Boolean($('#newsletter-list'));
  const needReviews = Boolean($('#bottle-list'));
  const needThemes = Boolean($('#idea-list'));
  const needScheduleNotes = Boolean($('#schedule-list'));
  const needTastings = Boolean($('#next-date') || $('#schedule-list'));
  const needFunds = Boolean($('#club-funds'));
  if (!needDirectory && !needNewsletters && !needReviews && !needThemes && !needScheduleNotes && !needTastings && !needFunds) return;
  try {
    const [directory, newsletters, reviews, themes, notes, tastings, funds] = await Promise.all([
      needDirectory ? getDocs(collection(firestoreDatabase,'privateDirectory')) : Promise.resolve(null),
      needNewsletters ? getDocs(collection(firestoreDatabase,'newsletters')) : Promise.resolve(null),
      needReviews ? getDocs(collection(firestoreDatabase,'bottleReviews')) : Promise.resolve(null),
      needThemes ? getDocs(collection(firestoreDatabase,'themeIdeas')) : Promise.resolve(null),
      needScheduleNotes ? getDocs(collection(firestoreDatabase,'scheduleNotes')) : Promise.resolve(null),
      needTastings ? getDocs(collection(firestoreDatabase,'tastings')) : Promise.resolve(null),
      needFunds ? getDoc(doc(firestoreDatabase,'clubStats','current')) : Promise.resolve(null),
    ]);
    renderPrivateData(directory, newsletters, reviews, themes, notes, tastings, funds);
  } catch (error) {
    console.error('Private Firestore load failed:', error);
    const code = escapeHtml(error?.code || 'unknown-error'); const detail = escapeHtml(error?.message || 'No diagnostic message returned.');
    const message = `<p class="loading">Private information is unavailable (${code}: ${detail}). Ask the club admin to check the Firestore access rules.</p>`;
    ['#directory-list','#newsletter-list','#idea-list'].forEach(selector => { if ($(selector)) $(selector).innerHTML = message; });
    if ($('#review-message')) $('#review-message').textContent = 'Reviews are unavailable until the Firestore rules for bottleReviews are published.';
    if ($('#theme-message')) $('#theme-message').textContent = 'Theme ideas are unavailable until the Firestore rules for themeIdeas are published.';
  }
}

async function submitTasting(event) {
  event.preventDefault();
  if (!firestoreDatabase || !signedInAdmin) return;
  const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const message = $('#tasting-message');
  const date = asDate($('#tasting-date').value); const tastingNotesUrl = $('#tasting-notes-url').value.trim();
  if (Number.isNaN(date.getTime()) || (tastingNotesUrl && !safeUrl(tastingNotesUrl))) { message.textContent = 'Enter a valid date and, if included, an HTTPS tasting-notes link.'; return; }
  button.disabled = true; message.textContent = 'Adding meeting to the calendar…';
  try {
    await addDoc(collection(firestoreDatabase,'tastings'), { date:Timestamp.fromDate(date), location:$('#tasting-location').value.trim(), theme:$('#tasting-theme').value.trim(), selection:$('#tasting-selection').value.trim(), popular:$('#tasting-popular').value.trim(), notes:$('#tasting-notes').value.trim(), tastingNotesUrl, createdAt:Timestamp.now(), authorUid:signedInUser.uid });
    form.reset(); message.textContent = 'Meeting added to the calendar.'; await loadPrivateData();
  } catch (error) { message.textContent = error?.code === 'permission-denied' ? 'Firestore denied this change. Confirm this account has the admin role.' : 'Could not add the meeting. Try again.'; }
  finally { button.disabled = false; }
}

async function submitTheme(event) {
  event.preventDefault();
  if (!firestoreDatabase || !signedInUser) return;
  const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const message = $('#theme-message');
  const theme = $('#theme-name').value.trim();
  if (!theme) { message.textContent = 'Give the next pour a name first.'; return; }
  button.disabled = true; message.textContent = 'Adding that idea to the barrel…';
  try {
    await addDoc(collection(firestoreDatabase,'themeIdeas'), { theme, authorUid:signedInUser.uid, createdAt:Timestamp.now() });
    form.reset(); message.textContent = 'Theme idea added. The trivia winner may now take the credit.'; await loadPrivateData();
  } catch (error) { message.textContent = error?.code === 'permission-denied' ? 'Firestore denied this idea. Ask the club admin to publish the themeIdeas rule.' : 'Could not save the theme idea. Try again.'; }
  finally { button.disabled = false; }
}

async function submitReview(event) {
  event.preventDefault();
  if (!firestoreDatabase || !signedInUser) return;
  const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const message = $('#review-message');
  const score = Number($('#review-score').value); const date = asDate($('#review-date').value);
  if (!Number.isInteger(score) || score < 0 || score > 100 || Number.isNaN(date.getTime())) { message.textContent = 'Enter a whole-number score from 0 to 100 and a valid date.'; return; }
  button.disabled = true; message.textContent = 'Saving your tasting note…';
  try {
    await addDoc(collection(firestoreDatabase,'bottleReviews'), { bottle:$('#review-bottle').value.trim(), reviewer:$('#reviewer').value, dateReviewed:Timestamp.fromDate(date), nose:$('#review-nose').value.trim(), palate:$('#review-palate').value.trim(), score, overall:$('#review-overall').value.trim(), authorUid:signedInUser.uid, createdAt:Timestamp.now() });
    form.reset(); $('#review-date').value = new Date().toISOString().slice(0,10); message.textContent = 'Tasting note added to the cabinet.'; await loadPrivateData();
  } catch (error) { message.textContent = error?.code === 'permission-denied' ? 'Firestore denied this review. Ask the club admin to publish the bottleReviews rule.' : 'Could not save the review. Try again.'; }
  finally { button.disabled = false; }
}

if (!configured) {
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); $('#login-message').textContent = 'The bar is not open yet—complete the Firebase setup in README.md first.'; });
} else {
  const app = initializeApp(firebaseConfig); const auth = getAuth(app); firestoreDatabase = getFirestore(app);
  onAuthStateChanged(auth, async user => {
    if (!user) { signedInUser=null; signedInAdmin=false; $('#login-view').hidden=false; $('#club-view').hidden=true; return; }
    try {
      const membership = await getDoc(doc(firestoreDatabase,'members',user.uid));
      if (!membership.exists() || membership.data().active !== true) { $('#login-message').textContent='This account has not been invited to the club site.'; await signOut(auth); return; }
      signedInUser=user; signedInAdmin=membership.data().role === 'admin'; $('#login-view').hidden=true; $('#club-view').hidden=false; if ($('#tasting-admin')) $('#tasting-admin').hidden=!signedInAdmin; renderClubContent(); await loadPrivateData();
    } catch { $('#login-message').textContent='We could not verify club access. Ask the club admin to check your invitation.'; await signOut(auth); }
  });
  $('#login-form').addEventListener('submit', async event => { event.preventDefault(); $('#login-message').textContent=''; try { await signInWithEmailAndPassword(auth, $('#email').value, $('#password').value); } catch { $('#login-message').textContent = 'That email/password combination did not work. Try again or ask the club admin.'; } });
  if ($('#review-form')) $('#review-form').addEventListener('submit', submitReview);
  if ($('#theme-form')) $('#theme-form').addEventListener('submit', submitTheme);
  if ($('#tasting-form')) $('#tasting-form').addEventListener('submit', submitTasting);
  $('#sign-out').addEventListener('click', () => signOut(auth));
}
