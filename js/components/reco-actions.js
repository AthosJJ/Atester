/* Actions courantes sur une recommandation, avec annulation :
   marquer comme testé (panneau de note), remettre à tester, « Pas pour moi »,
   favori, suppression, menu contextuel (appui long). */
import { getReco, setStatus, toggleFavorite, deleteReco, restoreReco } from '../store/recommendations.js';
import { subcat } from '../store/settings.js';
import { STATUS } from '../config.js';
import { toast } from './toast.js';
import { openSheet, actionSheet, confirmSheet } from './bottom-sheet.js';
import { starInput, bindStarInput } from './rating.js';
import { celebrate } from './celebrate.js';
import { icon } from './icons.js';
import { esc, inkOn, haptic } from '../utils.js';

/* Branchés par app.js (évite les imports circulaires avec les vues). */
export const hooks = { edit: null, open: null, afterDelete: null };

const undoWith = (snapshot) => ({ label: 'Annuler', run: () => restoreReco(snapshot) });

/* Panneau « Testé ! » : note et avis facultatifs, puis Valider. */
export function openDoneSheet(id, { onDone = null } = {}) {
  const reco = getReco(id);
  if (!reco) return null;
  const S = STATUS[reco.category];
  const sub = subcat(reco.category, reco.subcategory);
  const snapshot = { ...reco };
  const s = openSheet({
    label: S.mark,
    body: `
      <div class="done-hero">
        <div class="check-disc" style="--c:${sub.color};--ci:${inkOn(sub.color)}">${icon('check', { size: 40, stroke: 3 })}</div>
        <h3>${esc(S.cheer)}</h3>
        <p>${esc(reco.title)}</p>
      </div>
      <div class="field" style="text-align:center">
        <span class="field-label" style="justify-content:center">Ta note <span class="opt">· facultative</span></span>
        ${starInput(reco.rating || 0)}
      </div>
      <label class="field">
        <span class="field-label">Mon avis <span class="opt">facultatif</span></span>
        <textarea class="textarea" rows="3" placeholder="Ce que tu en as pensé…">${esc(reco.myReview)}</textarea>
      </label>`,
    foot: `<button type="button" class="btn btn-ok block" data-ok>${icon('check', { size: 20, stroke: 2.8 })}Valider</button>`
  });
  const stars = bindStarInput(s.body.querySelector('.stars'), { value: reco.rating || 0 });
  s.foot.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const review = s.body.querySelector('textarea').value.trim();
    await setStatus(id, 'done', { rating: stars.get() || null, myReview: review });
    haptic();
    celebrate(r.left + r.width / 2, r.top, [sub.color, '#F2A33A', '#2E8B57', '#E07A5F']);
    s.close('ok');
    toast(`${S.done} : ${reco.title}`, { icon: 'check', tone: 'ok', action: undoWith(snapshot) });
    onDone?.();
  });
  return s;
}

export async function markTodo(id) {
  const r = getReco(id);
  if (!r) return;
  const snapshot = { ...r };
  await setStatus(id, 'todo');
  toast(`Remis ${STATUS[r.category].todo.toLowerCase()}`, { icon: 'rotate-ccw', action: undoWith(snapshot) });
}

export async function markDropped(id) {
  const r = getReco(id);
  if (!r) return;
  const snapshot = { ...r };
  await setStatus(id, 'dropped');
  toast('Classé « Pas pour moi »', { icon: 'thumbs-down', action: undoWith(snapshot) });
}

export async function toggleFav(id) {
  const r = await toggleFavorite(id);
  if (!r) return;
  haptic();
  toast(r.favorite ? 'Épinglé en favori' : 'Retiré des favoris', { icon: 'star' });
}

/* Balayage vers la gauche : testé si « à tester », sinon retour à « à tester ». */
export function swipeStatus(id) {
  const r = getReco(id);
  if (!r) return;
  if (r.status === 'todo') openDoneSheet(id);
  else markTodo(id);
}

export async function deleteWithUndo(id) {
  const r = getReco(id);
  if (!r) return false;
  const ok = await confirmSheet({
    title: `Supprimer « ${r.title} » ?`,
    message: 'Tu pourras annuler pendant quelques secondes.',
    confirm: 'Supprimer', danger: true, icon: 'trash-2'
  });
  if (!ok) return false;
  const snapshot = await deleteReco(id);
  hooks.afterDelete?.(id);
  toast('Supprimé', { icon: 'trash-2', action: undoWith(snapshot), duration: 5000 });
  return true;
}

/* Menu de l'appui long sur une carte ou une affiche. */
export async function contextMenu(id) {
  const r = getReco(id);
  if (!r) return;
  const S = STATUS[r.category];
  const actions = [];
  if (r.status === 'todo') actions.push({ label: S.mark, icon: 'circle-check', value: 'done', primary: true });
  else actions.push({ label: S.back, icon: 'rotate-ccw', value: 'todo' });
  actions.push({ label: r.favorite ? 'Retirer des favoris' : 'Épingler en favori', icon: 'star', value: 'fav' });
  if (r.status !== 'dropped') actions.push({ label: 'Pas pour moi', icon: 'thumbs-down', value: 'dropped' });
  actions.push({ label: 'Voir la fiche', icon: 'eye', value: 'open' });
  actions.push({ label: 'Modifier', icon: 'pencil', value: 'edit' });
  actions.push({ label: 'Supprimer', icon: 'trash-2', value: 'delete', danger: true });
  const v = await actionSheet({ title: r.title, actions });
  if (v === 'done') openDoneSheet(id);
  else if (v === 'todo') markTodo(id);
  else if (v === 'fav') toggleFav(id);
  else if (v === 'dropped') markDropped(id);
  else if (v === 'open') hooks.open?.(id);
  else if (v === 'edit') hooks.edit?.(id);
  else if (v === 'delete') deleteWithUndo(id);
}
