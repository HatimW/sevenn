import { openDB } from './idb.js';
import { buildTokens } from '../search.js';

function prom(req){
  if (!req) return Promise.resolve(undefined);
  if (typeof req.then === 'function') return req;
  return new Promise((resolve,reject)=>{
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

export async function exportJSON(){
  const db = await openDB();
  const tx = db.transaction(['items','blocks','exams','settings']);
  const items = await prom(tx.objectStore('items').getAll());
  const blocks = await prom(tx.objectStore('blocks').getAll());
  const exams = await prom(tx.objectStore('exams').getAll());
  const settingsArr = await prom(tx.objectStore('settings').getAll());
  const settings = settingsArr.find(s => s.id === 'app') || { id:'app', dailyCount:20, theme:'dark' };
  return { items, blocks, exams, settings };
}

export async function importJSON(dbDump){
  try {
    const db = await openDB();
    const tx = db.transaction(['items','blocks','exams','settings'],'readwrite');
    const items = tx.objectStore('items');
    const blocks = tx.objectStore('blocks');
    const exams = tx.objectStore('exams');
    const settings = tx.objectStore('settings');

    await Promise.all([
      prom(items.clear()),
      prom(blocks.clear()),
      prom(exams.clear()),
      prom(settings.clear())
    ]);

    if (dbDump.settings) await prom(settings.put({ ...dbDump.settings, id:'app' }));
    if (Array.isArray(dbDump.blocks)) {
      for (const b of dbDump.blocks) {
        await prom(blocks.put(b));
      }
    }
    if (Array.isArray(dbDump.items)) {
      for (const it of dbDump.items) {
        it.tokens = buildTokens(it);
        await prom(items.put(it));
      }
    }
    if (Array.isArray(dbDump.exams)) {
      for (const ex of dbDump.exams) {
        await prom(exams.put(ex));
      }
    }

    await new Promise((resolve,reject)=>{ tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); });
    return { ok:true, message:'Import complete' };
  } catch (e) {
    return { ok:false, message:e.message };
  }
}

function escapeCSV(value){
  return '"' + String(value).replace(/"/g,'""') + '"';
}

export async function exportAnkiCSV(profile, cohort){
  const rows = [];
  if (profile === 'cloze') {
    const regex = /\{\{c\d+::(.*?)\}\}/g;
    for (const item of cohort) {
      const title = item.name || item.concept || '';
      for (const [key, val] of Object.entries(item)) {
        if (typeof val !== 'string') continue;
        let m;
        while ((m = regex.exec(val))) {
          const answer = m[1];
          const question = val.replace(regex, '_____');
          rows.push([question, answer, title]);
        }
      }
    }
  } else {
    const qaMap = {
      disease: [
        ['etiology','Etiology of NAME?'],
        ['pathophys','Pathophysiology of NAME?'],
        ['clinical','Clinical features of NAME?'],
        ['diagnosis','Diagnosis of NAME?'],
        ['treatment','Treatment of NAME?'],
        ['complications','Complications of NAME?']
      ],
      drug: [
        ['class','Class of NAME?'],
        ['moa','Mechanism of action of NAME?'],
        ['uses','Uses of NAME?'],
        ['sideEffects','Side effects of NAME?'],
        ['contraindications','Contraindications of NAME?']
      ],
      concept: [
        ['definition','Definition of NAME?'],
        ['mechanism','Mechanism of NAME?'],
        ['clinicalRelevance','Clinical relevance of NAME?'],
        ['example','Example of NAME?']
      ]
    };
    for (const item of cohort) {
      const title = item.name || item.concept || '';
      const mappings = qaMap[item.kind] || [];
      for (const [field, tmpl] of mappings) {
        const val = item[field];
        if (!val) continue;
        const question = tmpl.replace('NAME', title);
        rows.push([question, val, title]);
      }
    }
  }
  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
  return new Blob([csv], { type:'text/csv' });
}

