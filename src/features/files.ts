import { answerKeys, languages, type Worksheet, type Block, type Line, type ReturnedWork } from '../parse/types';
import { migrateWorksheet } from './worksheet';

export const MAX_FILE_BYTES = 40 * 1024 * 1024;
function fail(message = 'Invalid worksheet structure.'): never { throw Error(message); }
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const string = (v: unknown, max = 50000): string => typeof v === 'string' && v.length <= max ? v : fail('Invalid or oversized text.');
const integer = (v: unknown, min = 0) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) < 10000000 ? Number(v) : fail('Invalid page or source statistics.');
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 10000000 ? v : fail('Invalid source geometry.');
const strings = (v: unknown): string[] => Array.isArray(v) && v.length <= 2000 ? v.map(s => string(s)) : fail();
const id = (v: unknown) => /^[\w-]{1,200}$/.test(string(v, 200)) && !['__proto__','prototype','constructor'].includes(String(v)) ? String(v) : fail('Invalid identifier.');
const image = (v: unknown) => /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(string(v, MAX_FILE_BYTES)) ? String(v) : fail('Only embedded raster images are accepted.');
const kinds = new Set(['title','heading','instructions','passage','multiple-choice','checkbox','true-false','fill-blank','short-answer','identity','figure','table','word-bank','matching']);
function box(v: unknown) { const b = object(v); return { x: finite(b.x), y: finite(b.y), width: finite(b.width), height: finite(b.height) }; }
function boxes(v: unknown) { if (!Array.isArray(v) || v.length > 2000) return fail(); return v.map(box); }
function line(v: unknown): Line {
  const l = object(v);
  const out: Line = { ...box(l), text: string(l.text), page: integer(l.page, 1), pageWidth: finite(l.pageWidth), pageHeight: finite(l.pageHeight), confidence: finite(l.confidence) };
  if (!out.pageWidth || !out.pageHeight || out.confidence > 100) fail('Invalid line geometry or confidence.');
  for (const k of ['reviewed','checkbox'] as const) if (l[k] !== undefined) { if (typeof l[k] !== 'boolean') fail(); out[k] = l[k]; }
  if (l.crop !== undefined) out.crop = image(l.crop);
  if (l.fontSize !== undefined) out.fontSize = finite(l.fontSize);
  if (l.blanks !== undefined) out.blanks = boxes(l.blanks);
  if (l.glyph !== undefined) out.glyph = box(l.glyph);
  if (l.optionBoxes !== undefined) {
    if (!Array.isArray(l.optionBoxes) || l.optionBoxes.length > 2000) fail();
    out.optionBoxes = l.optionBoxes.map(v => { const o = object(v); return {text: string(o.text), box: box(o.box), ...(o.letter === undefined ? {} : {letter: box(o.letter)})}; });
  }
  if (l.cellBoxes !== undefined) { if (!Array.isArray(l.cellBoxes) || l.cellBoxes.length > 2000) fail(); out.cellBoxes = l.cellBoxes.map(boxes); }
  return out;
}
function record(v: unknown, allowed?: Set<string>): Record<string, string> {
  const obj = object(v), out: Record<string, string> = {};
  if (Object.keys(obj).length > 10000) fail();
  for (const [k, v] of Object.entries(obj)) { id(k); if (['__proto__','constructor','prototype'].includes(k) || (allowed && !allowed.has(k))) fail('Answers or comments do not match this worksheet.'); out[k] = string(v); }
  return out;
}
export function validateWorksheet(value: unknown): Worksheet {
  const d = object(value), original = object(d.original);
  if (!Object.hasOwn(languages, String(d.language)) || !Array.isArray(d.blocks) || !d.blocks.length || d.blocks.length > 1000) fail();
  if (!['pdf','image','text','word'].includes(String(original.source)) || (original.tagged !== null && typeof original.tagged !== 'boolean')) fail();
  const seen = new Set<string>();
  const blocks: Block[] = d.blocks.map(value => {
    const b = object(value), blockId = id(b.id);
    if (seen.has(blockId) || !kinds.has(String(b.kind)) || !Array.isArray(b.lines) || b.lines.length > 10000) fail('Invalid or duplicate worksheet block.');
    seen.add(blockId);
    const out: Block = {id: blockId, kind: b.kind as Block['kind'], text: string(b.text), page: integer(b.page, 1), lines: b.lines.map(line)};
    for (const k of ['figureText','figureDescription','hint'] as const) if (b[k] !== undefined) out[k] = string(b[k]);
    if (b.image !== undefined) out.image = image(b.image);
    for (const k of ['options','pairs'] as const) if (b[k] !== undefined) out[k] = strings(b[k]);
    if (b.cells !== undefined) { if (!Array.isArray(b.cells) || b.cells.length > 2000) fail(); out.cells = b.cells.map(strings); }
    if (b.key !== undefined) {
      const key = object(b.key), valid = new Set(answerKeys(out)); out.key = {};
      for (const [k,v] of Object.entries(key)) { if (!valid.has(k)) fail('Answer key does not match a field.'); out.key[k] = strings(v); }
    }
    return out;
  });
  if (blocks.flatMap(answerKeys).length > 10000) fail("Too many answer fields.");
  const doc: Worksheet = {
    id: id(d.id), name: string(d.name,5000), language: d.language as Worksheet['language'], blocks,
    original: {source: original.source as Worksheet['original']['source'], characters: integer(original.characters), headings: integer(original.headings), fields: integer(original.fields), pages: integer(original.pages,1), tagged: original.tagged as boolean | null},
    answers: record(d.answers, new Set([...blocks.flatMap(answerKeys), ...blocks.filter(b=>b.kind==='figure').map(b=>b.id)])), updated: typeof d.updated === 'number' && Number.isFinite(d.updated) ? d.updated : 0,
  };
  if (d.previews !== undefined) {
    if (!Array.isArray(d.previews) || d.previews.length > 500) fail();
    const pages = new Set<number>();
    doc.previews = d.previews.map(v=> {const p = object(v), page = integer(p.page,1), width = finite(p.width), height = finite(p.height); if (!width || !height || pages.has(page)) fail('Invalid source preview.'); pages.add(page); return {page,width,height,image:image(p.image)};});
  }
  for (const k of ['shareId','sourceId','versionId','attemptId'] as const) if (d[k] !== undefined) doc[k] = id(d[k]);
  if (d.studentCode !== undefined) doc.studentCode = string(d.studentCode,80);
  for (const k of ['assignment','studentCopy'] as const) if (d[k] !== undefined) { if (typeof d[k] !== 'boolean') fail(); doc[k] = d[k]; }
  if (d.teacherSettings !== undefined) { const s = object(d.teacherSettings); if (!['practice','assignment'].includes(String(s.purpose))) fail(); const selfCheck = strings(s.selfCheck); selfCheck.forEach(id); doc.teacherSettings = {purpose:s.purpose as 'practice'|'assignment',selfCheck}; }
  if (d.returnedWork !== undefined) { if(!Array.isArray(d.returnedWork) || d.returnedWork.length>1000) fail(); doc.returnedWork = d.returnedWork.map(v => validateReturn(v)); if(new Set(doc.returnedWork.map(r=>r.id)).size!==doc.returnedWork.length) fail('Duplicate return identifiers.'); }
  if (d.feedback !== undefined) {const f=object(d.feedback); doc.feedback={comments:record(f.comments,seen),overall:string(f.overall)};}
  if (d.editNotes !== undefined) {
    if (!Array.isArray(d.editNotes) || d.editNotes.length > 1000) fail('Invalid answer recovery notes.');
    doc.editNotes = d.editNotes.map(value => {
      const note = object(value);
      const prior = validateWorksheet({...doc,blocks:note.before,answers:note.answers,teacherSettings:undefined,returnedWork:undefined,feedback:undefined,editNotes:undefined});
      const afterIds = strings(note.afterIds); afterIds.forEach(id);
      return {id:id(note.id),blockId:id(note.blockId),text:string(note.text),answers:prior.answers,before:prior.blocks,afterIds,index:integer(note.index)};
    });
  }
  if (doc.blocks.some(b=>b.page>doc.original.pages || b.lines.some(l=>l.page>doc.original.pages)) || doc.previews?.some(p=>p.page>doc.original.pages)) fail("Source geometry refers to a missing page.");
  return migrateWorksheet(doc);
}
export function safeName(name: string) { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().slice(0,100) || 'worksheet'; }
export const answerFilename = (doc: Worksheet) => `${safeName(doc.name)}${doc.studentCode ? '_'+safeName(doc.studentCode) : ''}_answers.html`;
export async function worksheetVersion(doc: Worksheet) {
  if (doc.studentCopy && doc.versionId) return doc.versionId;
  const data = JSON.stringify({name:doc.name, language:doc.language, blocks:doc.blocks.map(b=>{const {key: _key,hint:_hint,...rest}=b; return rest;})});
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function studentWorksheet(source: Worksheet): Promise<Worksheet> {
  const doc = migrateWorksheet(structuredClone(source));
  const assignment = doc.teacherSettings ? doc.teacherSettings.purpose === 'assignment' : doc.assignment;
  const selected = doc.teacherSettings?.selfCheck;
  // Explicitly whitelist student content. Teacher notes, recovery data and returned work never travel.
  return {
    id:doc.id, name:doc.name, language:doc.language, original:doc.original, previews:doc.previews,
    updated:doc.updated, answers:{}, assignment:!!assignment, studentCopy:true, versionId:await worksheetVersion(doc),
    blocks:doc.blocks.map(b=>{const {key,hint,...content}=b; return {...content,...(!assignment && (!selected || selected.includes(b.id)) ? {key,hint} : {})};}),
  } satisfies Worksheet;
}
export function masterFile(doc: Worksheet) { return JSON.stringify({format:'unflatten',version:1,doc},null,2); }
function parse(text: string) {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) fail('File exceeds the 40 MB import limit.');
  try { return JSON.parse(text); } catch { return fail('This is not a valid Unflatten JSON file.'); }
}
export function importWorksheet(text: string, html = false) {
  let value: unknown;
  if (html) {
    // Read JSON only; never insert imported HTML or run its scripts.
    const match = text.match(/<script\b(?=[^>]*\bid=["']worksheet-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
    if (!match || new TextEncoder().encode(text).length > MAX_FILE_BYTES) fail('Missing embedded worksheet data, or file exceeds 40 MB.');
    value = object(parse(match[1])).doc;
  } else {
    const data = object(parse(text));
    if (data.format !== 'unflatten' || data.version !== 1) fail('Unsupported backup format or version. Use a version 1 Unflatten master file.');
    value = data.doc;
  }
  const doc = validateWorksheet(value);
  // Import is always independent, including when the original is already in the library.
  if (!doc.studentCopy) doc.sourceId ??= doc.id;
  doc.id = crypto.randomUUID(); delete doc.shareId; doc.updated = Date.now();
  return doc;
}
export function duplicateWorksheet(source: Worksheet) {
  const doc = structuredClone(source); doc.id = crypto.randomUUID(); doc.name += ' — copy'; doc.answers = {}; doc.updated = Date.now();
  delete doc.shareId; delete doc.returnedWork; delete doc.feedback; delete doc.editNotes; delete doc.studentCode; delete doc.attemptId;
  return doc;
}
export interface ReturnFile {format:'unflatten-return'|'unflatten-feedback';version:1;work:ReturnedWork;}
function validateReturn(value: unknown, doc?: Worksheet): ReturnedWork {
  const w = object(value);
  return { id:id(w.id), worksheetVersion:id(w.worksheetVersion), studentCode:string(w.studentCode,80), answers:record(w.answers,doc ? new Set(doc.blocks.flatMap(answerKeys)) : undefined), comments:record(w.comments,doc ? new Set(doc.blocks.map(b=>b.id)) : undefined), overall:string(w.overall) };
}
export function readReturn(text: string): ReturnFile {
  const f=object(parse(text)); if(!['unflatten-return','unflatten-feedback'].includes(String(f.format)) || f.version!==1) fail('Unsupported return or feedback file.');
  return {format:f.format as ReturnFile['format'],version:1,work:validateReturn(f.work)};
}
export async function returnFile(doc: Worksheet): Promise<ReturnFile> {
  return {format:'unflatten-return',version:1,work:{id:doc.attemptId||doc.id,worksheetVersion:await worksheetVersion(doc),studentCode:doc.studentCode||'',answers:structuredClone(doc.answers),comments:{},overall:''}};
}
export async function importReturns(doc: Worksheet, texts: string[]) {
  const version = await worksheetVersion(doc), files = texts.map(readReturn);
  // Validate the whole batch before mutating the master. Version mismatches remain visible to the teacher, never merged.
  if(files.some(f=>f.format!=='unflatten-return')) fail('Choose student return files, not feedback files.');
  for(const f of files) if(f.work.worksheetVersion===version) validateReturn(f.work,doc);
  const list = structuredClone(doc.returnedWork || []);
  let added=0;
  for(const {work} of files) {
    const previous=list.find(r=>r.id===work.id);
    if(previous) { if(previous.worksheetVersion!==work.worksheetVersion) fail('This return identifier belongs to a different worksheet version.'); previous.answers=work.answers; previous.studentCode=work.studentCode; }
    else {list.push(work);added++;}
  }
  if(list.length>1000) fail('Too many returned files.');
  doc.returnedWork=list; return added;
}
export async function applyFeedback(doc: Worksheet, text: string) {
  const f=readReturn(text);
  if(f.format!=='unflatten-feedback' || f.work.worksheetVersion!==await worksheetVersion(doc)) fail('Feedback is for a different worksheet version. Nothing was changed.');
  if(f.work.id!==(doc.attemptId||doc.id) || f.work.studentCode!==(doc.studentCode||'')) fail('Feedback is for a different student copy. Nothing was changed.');
  validateReturn(f.work,doc);
  doc.feedback={comments:f.work.comments,overall:f.work.overall}; // Never replace revised answers.
}
