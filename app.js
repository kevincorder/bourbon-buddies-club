import { club } from './data/club-data.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Paste your Firebase web-app settings here. These identifiers are public by design.
// Authentication plus Firestore Security Rules protect the private records.
const firebaseConfig = { apiKey:'AIzaSyDx55W3kB4b9wSzctS-BiPjyDbx1141LGo', authDomain:'bourbon-buddies-b5ecc.firebaseapp.com', projectId:'bourbon-buddies-b5ecc', appId:'1:543014516471:web:6a95226abd4e50179185f2' };
const configured = !Object.values(firebaseConfig).some(value => value.includes('PASTE_'));
const $ = selector => document.querySelector(selector);
const dateFormat = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const moneyFormat = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const asDate = value => new Date(`${value}T12:00:00Z`);
const privateDate = value => value?.toDate ? value.toDate() : new Date(`${value}T12:00:00Z`);
const hasPrivateDate = value => !Number.isNaN(privateDate(value).getTime());
const formatPrivateDate = value => hasPrivateDate(value) ? dateFormat.format(privateDate(value)) : 'Undated';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };

function renderPublicClub() {
  const today = new Date();
  const schedule = [...club.schedule].sort((a,b) => asDate(a.date)-asDate(b.date));
  const next = schedule.find(event => asDate(event.date) >= today) || schedule.at(-1);
  $('#next-date').textContent = dateFormat.format(asDate(next.date)); $('#next-theme').textContent = next.theme; $('#next-location').textContent = next.location;
  $('#schedule-list').innerHTML = [...schedule].reverse().map(event => `<article class="schedule-item ${event === next ? 'upcoming':''}"><time class="schedule-date">${dateFormat.format(asDate(event.date))}</time><div><strong>${escapeHtml(event.theme)}</strong><small>${escapeHtml(event.location)}${event.winner ? ` · Crowd favorite: ${escapeHtml(event.winner)}`:''}</small></div><p class="selection">${escapeHtml(event.selection)}</p></article>`).join('');
  $('#idea-list').innerHTML = club.ideas.map(([idea,used]) => `<span class="chip ${used?'used':''}">${escapeHtml(idea)}${used?' · previously poured':''}</span>`).join('');
  $('#rule-list').innerHTML = club.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('');
  const showBottles = search => { const q=search.toLowerCase(); $('#bottle-list').innerHTML = club.bottles.filter(b => Object.values(b).join(' ').toLowerCase().includes(q)).map(b => `<article class="bottle-card"><header><div><strong>${escapeHtml(b.bottle)}</strong><p>Reviewed by ${escapeHtml(b.reviewer)}</p></div><span class="score">${escapeHtml(b.score)}</span></header><p><b>Nose:</b> ${escapeHtml(b.nose)}</p><p><b>Palate:</b> ${escapeHtml(b.palate)}</p></article>`).join('') || '<p>No bottle in the cabinet matches that search.</p>'; };
  $('#bottle-search').oninput = event => showBottles(event.target.value); showBottles('');
}

function renderPrivateData([directory, ledger, newsletters]) {
  const people = directory.docs.map(item => item.data()).sort((a,b) => String(a.name).localeCompare(String(b.name)));
  $('#directory-list').innerHTML = people.length ? people.map(person => `<article class="member-card"><strong>${escapeHtml(person.name)}</strong><p>${escapeHtml(person.title)}</p><p>${escapeHtml(person.phone)}<br><a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></p></article>`).join('') : '<p class="loading">No directory entries yet.</p>';
  const entries = ledger.docs.map(item => item.data()).filter(entry => hasPrivateDate(entry.date)).sort((a,b) => privateDate(b.date)-privateDate(a.date));
  $('#ledger-list').innerHTML = entries.length ? entries.map(entry => `<article class="ledger-row"><time>${formatPrivateDate(entry.date)}</time><div><strong>${escapeHtml(entry.description)}</strong><small>${escapeHtml(entry.member)} · ${escapeHtml(entry.status)}${entry.notes ? ` · ${escapeHtml(entry.notes)}`:''}</small></div><span class="amount">${moneyFormat.format(Number(entry.amount) || 0)}</span></article>`).join('') : '<p class="loading">No ledger entries yet.</p>';
  const letters = newsletters.docs.map(item => item.data()).sort((a,b) => privateDate(b.date)-privateDate(a.date));
  $('#newsletter-list').innerHTML = letters.length ? letters.map(letter => { const url=safeUrl(letter.url); return url ? `<a class="newsletter-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(letter.title)}<span>${formatPrivateDate(letter.date)} →</span></a>` : `<div class="newsletter-link">${escapeHtml(letter.title)}<span>${formatPrivateDate(letter.date)}</span></div>`; }).join('') : '<p class="loading">No newsletters yet.</p>';
}

async function loadPrivateData(database) {
  try { renderPrivateData(await Promise.all([getDocs(collection(database,'privateDirectory')),getDocs(collection(database,'accounting')),getDocs(collection(database,'newsletters'))])); }
  catch (error) {
    console.error('Private Firestore load failed:', error);
    const code = escapeHtml(error?.code || 'unknown-error');
    const detail = escapeHtml(error?.message || 'No diagnostic message returned.');
    const message = `<p class="loading">Private information is unavailable (${code}: ${detail}). Ask the club admin to check the Firestore access rules.</p>`;
    ['#directory-list','#ledger-list','#newsletter-list'].forEach(selector => { $(selector).innerHTML = message; });
  }
}

if (!configured) {
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); $('#login-message').textContent = 'The bar is not open yet—complete the Firebase setup in README.md first.'; });
} else {
  const app = initializeApp(firebaseConfig); const auth = getAuth(app); const database = getFirestore(app);
  onAuthStateChanged(auth, async user => {
    if (!user) { $('#login-view').hidden=false; $('#club-view').hidden=true; return; }
    try {
      const membership = await getDoc(doc(database,'members',user.uid));
      if (!membership.exists() || membership.data().active !== true) { $('#login-message').textContent='This account has not been invited to the club site.'; await signOut(auth); return; }
      $('#login-view').hidden=true; $('#club-view').hidden=false; renderPublicClub(); await loadPrivateData(database);
    } catch { $('#login-message').textContent='We could not verify club access. Ask the club admin to check your invitation.'; await signOut(auth); }
  });
  $('#login-form').addEventListener('submit', async event => { event.preventDefault(); $('#login-message').textContent=''; try { await signInWithEmailAndPassword(auth, $('#email').value, $('#password').value); } catch { $('#login-message').textContent = 'That email/password combination did not work. Try again or ask the club admin.'; } });
  $('#sign-out').addEventListener('click', () => signOut(auth));
}
