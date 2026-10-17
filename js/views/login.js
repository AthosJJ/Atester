/* Écran de connexion : se connecter, créer un compte, mot de passe oublié.
   E-mail et mot de passe uniquement ; les champs sont reconnus par le
   trousseau iCloud et le gestionnaire de mots de passe d'Android. Une fois
   connecté, app.js prend le relais (onAuthStateChanged). */
import { icon } from '../components/icons.js';
import { signIn, signUp, resetPassword, authMessage, MIN_PASSWORD } from '../services/account.js';
import { legacySummary } from '../services/legacy.js';
import { esc } from '../utils.js';

let el = null;
let mode = 'signin';
let busy = false;

const $l = (sel) => el.querySelector(sel);

function say(text, tone = 'error') {
  const msg = $l('[data-r="msg"]');
  msg.className = 'login-msg ' + (tone === 'ok' ? 'ok-text' : 'error-text');
  msg.textContent = text;
}

function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  $l('.seg').style.setProperty('--i', signup ? 1 : 0);
  el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  const pw = $l('[name="password"]');
  pw.autocomplete = signup ? 'new-password' : 'current-password';
  $l('[data-r="pw-hint"]').hidden = !signup;
  $l('[data-r="submit"]').textContent = signup ? 'Créer mon compte' : 'Se connecter';
  $l('[data-act="forgot"]').hidden = signup;
  say('');
}

function setBusy(on, label) {
  busy = on;
  const btn = $l('[data-r="submit"]');
  btn.disabled = on;
  if (on) btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(label)}`;
  else btn.textContent = mode === 'signup' ? 'Créer mon compte' : 'Se connecter';
}

async function submit() {
  if (busy) return;
  const email = $l('[name="email"]').value.trim();
  const password = $l('[name="password"]').value;
  if (!email) { say('Indique ton adresse e-mail.'); $l('[name="email"]').focus(); return; }
  if (!password) { say('Indique ton mot de passe.'); $l('[name="password"]').focus(); return; }
  if (mode === 'signup' && password.length < MIN_PASSWORD) {
    say(`Choisis un mot de passe d’au moins ${MIN_PASSWORD} caractères.`);
    $l('[name="password"]').focus();
    return;
  }
  if (!navigator.onLine) { say('Pas de connexion : la connexion à ton compte demande le réseau.'); return; }
  say('');
  setBusy(true, mode === 'signup' ? 'Création du compte…' : 'Connexion…');
  try {
    if (mode === 'signup') await signUp(email, password);
    else await signIn(email, password);
    // La suite (chargement des données) est lancée par app.js.
  } catch (err) {
    setBusy(false);
    say(authMessage(err));
  }
}

async function forgot() {
  if (busy) return;
  const input = $l('[name="email"]');
  const email = input.value.trim();
  if (!email) {
    say('Indique ton adresse e-mail ci-dessus, puis touche « Mot de passe oublié ? ».');
    input.focus();
    return;
  }
  if (!navigator.onLine) { say('Pas de connexion : réessaie quand le réseau sera revenu.'); return; }
  busy = true;
  try {
    await resetPassword(email);
    say(`Si un compte existe pour ${email}, un e-mail pour choisir un nouveau mot de passe vient de partir. Pense à regarder dans les indésirables.`, 'ok');
  } catch (err) {
    say(authMessage(err));
  } finally {
    busy = false;
  }
}

function build() {
  el = document.createElement('section');
  el.className = 'login';
  el.id = 'login';
  el.setAttribute('aria-label', 'Connexion');
  el.innerHTML = `
    <div class="login-wrap">
      <div class="login-mark" aria-hidden="true">${icon('check', { size: 38, stroke: 3 })}</div>
      <h1 class="login-title">À tester</h1>
      <p class="login-sub">Les recommandations qu’on te fait, sur tous tes appareils.</p>
      <p class="login-note" data-r="legacy" hidden></p>
      <div class="seg" role="group" aria-label="Connexion ou création de compte" style="--n:2;--i:0">
        <span class="seg-thumb" aria-hidden="true"></span>
        <button type="button" data-mode="signin" aria-pressed="true">Se connecter</button>
        <button type="button" data-mode="signup" aria-pressed="false">Créer un compte</button>
      </div>
      <form class="login-form" novalidate>
        <label class="field">
          <span class="field-label">Adresse e-mail</span>
          <input class="input" type="email" name="email" autocomplete="username" inputmode="email"
            autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="prenom@exemple.fr">
        </label>
        <label class="field">
          <span class="field-label">Mot de passe</span>
          <span class="input-wrap">
            <input class="input" type="password" name="password" autocomplete="current-password" enterkeyhint="go">
            <button type="button" class="rbtn" data-act="toggle-pw" aria-label="Afficher le mot de passe">${icon('eye', { size: 18 })}</button>
          </span>
          <span class="hint" data-r="pw-hint" hidden>${MIN_PASSWORD} caractères minimum.</span>
        </label>
        <p class="login-msg" data-r="msg" role="alert"></p>
        <button type="submit" class="btn btn-primary block" data-r="submit">Se connecter</button>
        <button type="button" class="text-btn login-forgot" data-act="forgot">Mot de passe oublié ?</button>
      </form>
      <p class="login-foot">${icon('lock-keyhole', { size: 15 })}Tes recommandations sont enregistrées dans ton compte et restent disponibles hors connexion.</p>
    </div>`;
  document.body.appendChild(el);

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode], [data-act]');
    if (!t) return;
    if (t.dataset.mode) { if (t.dataset.mode !== mode) setMode(t.dataset.mode); return; }
    if (t.dataset.act === 'forgot') forgot();
    if (t.dataset.act === 'toggle-pw') {
      const pw = $l('[name="password"]');
      pw.type = pw.type === 'password' ? 'text' : 'password';
      t.innerHTML = icon(pw.type === 'password' ? 'eye' : 'eye-off', { size: 18 });
      t.setAttribute('aria-label', pw.type === 'password' ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
    }
  });
  $l('form').addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  $l('[name="email"]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $l('[name="password"]').focus(); }
  });
}

export function showLogin() {
  if (!el) build();
  el.hidden = false;
  document.documentElement.classList.add('signed-out');
  setBusy(false);
  // Données de l'ancienne version sur cet appareil : on rassure avant la connexion.
  legacySummary().then((sum) => {
    if (!sum || !el) return;
    const note = $l('[data-r="legacy"]');
    const what = sum.recos > 1 ? `Les ${sum.recos} recommandations déjà enregistrées sur cet appareil y restent`
      : sum.recos === 1 ? 'La recommandation déjà enregistrée sur cet appareil y reste'
        : 'Les données déjà enregistrées sur cet appareil y restent';
    note.textContent = `Nouveau : un compte pour retrouver tes recommandations sur tous tes appareils. ${what} : tu pourras les importer dans ton compte depuis les réglages.`;
    note.hidden = false;
  });
}

export function hideLogin() {
  document.documentElement.classList.remove('signed-out');
  if (!el) return;
  el.remove();
  el = null;
}
