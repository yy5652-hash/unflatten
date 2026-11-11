import {test,expect,type Page,type TestInfo} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import type {Worksheet} from '../../src/parse/types';
// Playwright setInputFiles/saveAs follow the official input/download APIs.
// All journeys run in the configured desktop and 360 px projects.
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/6kAAAAASUVORK5CYII=';
async function saved(page:Page) {await expect(page.locator('#save-status')).toHaveAttribute('data-pending','false');}
async function stored(page:Page):Promise<Worksheet[]> {
  if (await page.locator("#save-status").count()) await saved(page);
  return page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('unflatten',1);r.onsuccess=()=>resolve(r.result);});
    const docs=await new Promise<Worksheet[]>(resolve=>{const r=db.transaction('worksheets').objectStore('worksheets').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return docs;
  });
}
async function prepare(page:Page) {
  await page.goto('./');await page.locator('#show-paste').click();
  await page.locator('#paste').fill('Class lesson\n1. Plants need ____.\n2. Explain why.\n____');
  await page.locator('#convert-text').click();await expect(page.locator('#worksheet')).toBeVisible();await saved(page);
  await page.evaluate(async(image)=>{
    const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('unflatten',1);r.onsuccess=()=>resolve(r.result);});
    await new Promise<void>(resolve=>{const tx=db.transaction('worksheets','readwrite'),store=tx.objectStore('worksheets'),r=store.get(localStorage.getItem('unflatten-current')!);r.onsuccess=()=>{
      const doc=r.result as Worksheet, q=doc.blocks.find(b=>b.kind==='fill-blank')!;
      q.lines=[{text:q.text,page:1,pageWidth:100,pageHeight:200,x:10,y:20,width:70,height:10,confidence:40,blanks:[{x:60,y:20,width:20,height:10}]}];
      q.key={[q.id+'-0']:['SECRET_KEY_725']};q.hint='SECRET_TEACHER_HINT_726';
      doc.blocks.push({id:'test-figure',kind:'figure',text:'Plant diagram',lines:[],image,page:1});
      doc.previews=[{image,page:1,width:100,height:200}];store.put(doc);
    };tx.oncomplete=()=>resolve();});db.close();
  },png);
  await page.reload();await expect(page.locator('#worksheet')).toBeVisible();await saved(page);
}
async function axe(page:Page) {
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']).analyze();
  expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}
async function download(page:Page,info:TestInfo,selector:string,name:string) {
  const waiting=page.waitForEvent('download');await page.locator(selector).click();const file=await waiting;
  const path=info.outputPath(name);await file.saveAs(path);return {path,name:file.suggestedFilename(),text:await readFile(path,'utf8')};
}
function seed(text:string):Worksheet {return JSON.parse(text.match(/<script id="worksheet-data" type="application\/json">([\s\S]*?)<\/script>/)![1]).doc;}
async function cleanStorage(page:Page) {
  await page.locator('#new-sheet').click();
  await page.evaluate(async()=>{localStorage.clear();sessionStorage.clear();const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('unflatten',1);r.onsuccess=()=>resolve(r.result);});await new Promise<void>(resolve=>{const tx=db.transaction('worksheets','readwrite');tx.objectStore('worksheets').clear();tx.oncomplete=()=>resolve();});db.close();});
  await page.goto('./');
}
async function originalAlignment(page:Page,doc:Worksheet) {
  await page.locator('#toggle-original').click();
  const blocks=(doc.previews||[]).flatMap(p=>doc.blocks.flatMap(b=>b.lines.filter(l=>l.page===p.page).map(()=>b.id)));
  await expect(page.locator('.source-line')).toHaveCount(blocks.length);
  const alignment=await page.locator('.source-line').evaluateAll(lines=>lines.map(line=>({block:(line as HTMLElement).dataset.source,geometry:line.getAttribute('style')})));
  expect(alignment.map(line=>line.block)).toEqual(blocks);
  await page.locator('#close-panel').click();return alignment;
}
async function studentHTML(page:Page,info:TestInfo) {
  await page.locator('#prepare-lesson').click();await page.locator('[data-lesson-step="1"]').click();
  await page.getByLabel('Assignment — remove keys and correctness data').check();
  await page.locator('[data-lesson-step="3"]').click();return download(page,info,'#distribute-html','student.html');
}

test('Prepare: live review fixes, exact read-only assignment preview and clean offline distribution',async({page,context},info)=>{
  await prepare(page);await page.locator('#prepare-lesson').click();
  await expect(page.locator('#lesson-review-count')).toHaveText('1 unresolved line · 1 figure without descriptions');await axe(page);
  await page.locator('[data-lesson-line]').click();await page.locator('#looks-right').click();await page.locator('#done-fixing').click();
  await page.locator('#prepare-lesson').click();await expect(page.locator('#lesson-review-count')).toHaveText('0 unresolved lines · 1 figure without descriptions');
  await page.locator('[data-lesson-figure]').click();await page.getByLabel('Figure description (a helper can add this)').fill('An arrow points from sunlight to a plant.');
  await page.locator('#prepare-lesson').click();await expect(page.locator('#lesson-review-count')).toHaveText('0 unresolved lines · 0 figures without descriptions');
  await page.locator('#lesson-next').click();await page.getByLabel('Assignment — remove keys and correctness data').check();await axe(page);
  await page.locator('#lesson-next').click();await expect(page.locator('#lesson-dialog [data-answer]').first()).toBeDisabled();await axe(page);
  await page.screenshot({path:info.outputPath('preview.png')});
  await page.locator('#lesson-next').click();await axe(page);
  const file=await download(page,info,'#distribute-html','assignment.html'),doc=seed(file.text);
  expect(file.text).not.toContain('SECRET_KEY_725');expect(file.text).not.toContain('SECRET_TEACHER_HINT_726');
  expect(doc.blocks.every(b=>!b.key&&!b.hint)).toBe(true);expect(doc.answers).toEqual({});expect(doc.feedback).toBeUndefined();expect(doc.returnedWork).toBeUndefined();expect(doc.previews).toHaveLength(1);
  const student=await context.newPage();await context.setOffline(true);await student.goto(pathToFileURL(file.path).href);
  await expect(student.getByLabel('Figure description (a helper can add this)')).toHaveValue('An arrow points from sunlight to a plant.');await expect(student.locator('#check-answers')).toHaveCount(0);await axe(student);
});

test('Master: storage restore, HTML import, invalid imports, independent duplicate and repeated source choice',async({page},info)=>{
  await prepare(page);await page.getByLabel('Figure description (a helper can add this)').fill('A plant and sunlight.');
  const before=(await stored(page))[0],alignment=await originalAlignment(page,before);await page.locator('#prepare-lesson').click();
  const master=await download(page,info,'#save-master','master.unflatten.json');expect(master.name).toMatch(/\.unflatten\.json$/);
  await page.locator('[data-lesson-step="3"]').click();const html=await download(page,info,'#distribute-html','copy.html');
  await page.locator('#lesson-close').click();await cleanStorage(page);
  await page.locator('#import-worksheet').setInputFiles(master.path);await expect(page.locator('#worksheet')).toBeVisible();
  const restored=(await stored(page))[0];
  for(const key of ['blocks','previews','original','answers','teacherSettings'] as const) expect(restored[key]).toEqual(before[key]);
  expect(await originalAlignment(page,restored)).toEqual(alignment);
  await page.locator('#prepare-lesson').click();await page.locator('#duplicate-sheet').click();
  await page.locator('#worksheet-title').fill('Different class');await saved(page);
  const copies=await stored(page);expect(copies).toHaveLength(2);
  const original=copies.find(d=>d.id===restored.id)!;expect(original.name).toBe(restored.name);expect(original.blocks).toEqual(before.blocks);
  const duplicate=copies.find(d=>d.name==='Different class')!;expect(duplicate.id).not.toBe(original.id);
  // A class/library rename leaves recognised source content (including its title) intact.
  expect(duplicate.blocks).toEqual(before.blocks);await expect(page.locator('#worksheet-title')).toHaveValue('Different class');
  await expect(page.locator('#worksheet h1')).toHaveText('Class lesson');expect(await originalAlignment(page,duplicate)).toEqual(alignment);
  await page.locator('#new-sheet').click();await expect(page.locator('#library-import')).toBeVisible();
  await page.locator('#library-import').setInputFiles({name:'bad.unflatten.json',mimeType:'application/json',buffer:Buffer.from('{"format":"unflatten","version":99}')});
  await expect(page.getByRole('alert')).toContainText('Unsupported');expect(await stored(page)).toHaveLength(2);
  const invalid=JSON.parse(master.text);invalid.doc.blocks[0].id=invalid.doc.blocks[1].id;
  await page.locator('#import-worksheet').setInputFiles({name:'bad.unflatten.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});expect(await stored(page)).toHaveLength(2);
  await page.locator('#import-worksheet').setInputFiles(html.path);await expect(page.locator('#worksheet')).toBeVisible();
  expect((await stored(page)).find(d=>d.studentCopy)?.previews).toEqual(before.previews);
  await page.locator('#new-sheet').click();
  const reopen=async()=>{await page.locator('#show-paste').click();await page.locator('#paste').fill('Class lesson\n1. Plants need ____.\n2. Explain why.\n____');await page.locator('#convert-text').click();await expect(page.locator('#source-choice-title')).toBeVisible();};
  await reopen();await axe(page);await expect(page.locator('#continue-saved')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('.home-hero')).toBeVisible();
  await reopen();await page.keyboard.press('Enter');await expect(page.locator('#worksheet')).toBeVisible();
  await page.reload();await expect(page.locator('#worksheet')).toBeVisible();await expect(page.locator('#source-choice-title')).toHaveCount(0);
  await page.locator('#new-sheet').click();await reopen();await page.keyboard.press('Tab');await expect(page.locator('#convert-new')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#worksheet')).toBeVisible();expect(await stored(page)).toHaveLength(4);
  // A different source with the same title must open directly, without the saved-source prompt.
  await page.locator('#new-sheet').click();await page.locator('#show-paste').click();await page.locator('#paste').fill('Class lesson\n1. A different question ____.');await page.locator('#convert-text').click();
  await expect(page.locator('#worksheet')).toBeVisible();await expect(page.locator('#source-choice-title')).toHaveCount(0);
});

test('Shared device: temporary work clears completely; persistent student work restores',async({page,context},info)=>{
  await prepare(page);await page.locator('#prepare-lesson').click();await page.locator('[data-lesson-step="3"]').click();await page.locator('#lesson-link').click();
  const link=await page.locator('#lesson-link-result textarea').inputValue();await page.locator('#lesson-close').click();await cleanStorage(page);
  await page.goto(link);await expect(page.locator('#session-choice')).toBeVisible();await page.getByLabel('Temporary — shared computer').check();
  await expect(page.locator('#session-notice')).toHaveText('Temporary session — download before you leave');
  const field=page.locator('#worksheet [data-answer]').first();await field.fill('PRIVATE_STUDENT_A');await saved(page);await page.reload();await expect(field).toHaveValue('PRIVATE_STUDENT_A');await axe(page);
  await page.locator('#toggle-handin').click();await page.locator('#student-code').fill('A12');
  const answers=await download(page,info,'#download-answers','answers.html');expect(answers.name).toBe('Class lesson_A12_answers.html');expect(Object.values(seed(answers.text).answers)).toContain('PRIVATE_STUDENT_A');
  await expect(page.locator('#download-status')).toHaveText('Downloaded. Hand this file to your teacher the way your class usually does.');
  await page.locator('#close-panel').click();await page.locator('#end-session').click();await expect(page.locator('.home-hero')).toBeVisible();
  expect(await stored(page)).toEqual([]);expect(await page.evaluate(()=>({current:localStorage.getItem('unflatten-current'),temporary:sessionStorage.getItem('unflatten-temporary')}))).toEqual({current:null,temporary:null});
  const next=await context.newPage();await next.goto('./');await expect(next.locator('.library-card')).toHaveCount(0);await next.goto(link);
  await expect(next.locator('#worksheet [data-answer]').first()).toHaveValue('');await next.locator('#worksheet [data-answer]').first().fill('STUDENT_B_PERSISTENT');await saved(next);
  await next.reload();await expect(next.locator('#worksheet [data-answer]').first()).toHaveValue('STUDENT_B_PERSISTENT');
});

test('Feedback: two return files, duplicate and wrong-version flags, question 2 comments round-trip offline',async({page,context},info)=>{
  await prepare(page);const original=(await stored(page))[0],full=await studentHTML(page,info);await page.locator('#lesson-close').click();
  const a=await context.newPage(),b=await context.newPage();await a.goto(pathToFileURL(full.path).href);await b.goto(pathToFileURL(full.path).href);
  // Students use different attempts even when the exact same distributed HTML is opened.
  await a.getByLabel('Temporary — shared computer').check();await b.getByLabel('Temporary — shared computer').check();
  for(const [student,code,answer] of [[a,'A','Answer from A'],[b,'B','Answer from B']] as const) {
    await student.locator('#worksheet [data-answer]').first().fill(answer);await student.locator('#worksheet [data-kind="short-answer"] textarea').fill(code+' question two');
    await student.locator('#toggle-handin').click();await student.locator('#student-code').fill(code);
  }
  const ar=await download(a,info,'#download-return','A_return.unflatten.json'),br=await download(b,info,'#download-return','B_return.unflatten.json');
  await page.locator('#prepare-lesson').click();await page.locator('#open-returns').click();await axe(page);
  await page.locator('#return-files').setInputFiles([ar.path,br.path]);await expect(page.locator('#returns-status')).toHaveText('Imported 2 return files.');await expect(page.locator('[data-return-id]')).toHaveCount(2);
  await page.locator('#return-files').setInputFiles(ar.path);await expect(page.locator('[data-return-id]')).toHaveCount(2);
  await page.getByRole('button',{name:'A',exact:true}).click();await page.getByLabel('Comment on question 2',{exact:true}).fill('Explain question two in more detail.');await page.getByLabel('Overall comment',{exact:true}).fill('Good start.');await axe(page);
  const feedback=await download(page,info,'#export-feedback','A_feedback.unflatten.json');
  const wrong=JSON.parse(ar.text);wrong.work.id='other-attempt';wrong.work.worksheetVersion='different-version';
  await page.locator('#return-files').setInputFiles({name:'other_return.unflatten.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(wrong))});await page.getByRole('button',{name:'A — Different worksheet version',exact:true}).click();await expect(page.locator('#returns-dialog .warning')).toContainText('not been merged');
  await a.locator('#feedback-file').setInputFiles(feedback.path);await expect(a.locator('.teacher-feedback')).toHaveCount(2);await expect(a.locator('[data-kind="short-answer"] .teacher-feedback')).toContainText('Explain question two in more detail.');
  await expect(a.locator('#worksheet [data-answer]').first()).toHaveValue('Answer from A');await expect(b.locator('#worksheet [data-answer]').first()).toHaveValue('Answer from B');
  await a.locator('#worksheet [data-kind="short-answer"] textarea').fill('Revised answer');await axe(a);
  // Comments are annotations, independent of the worksheet's own heading structure.
  await expect(a.locator('[data-kind="short-answer"] .teacher-feedback')).toHaveAccessibleName('Teacher comment');
  await expect(a.locator('.teacher-feedback h2, .teacher-feedback h3')).toHaveCount(0);
  const questionOnly=JSON.parse(feedback.text);questionOnly.work.overall='';
  await a.locator('#feedback-file').setInputFiles({name:'question_feedback.unflatten.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(questionOnly))});
  await expect(a.locator('.teacher-feedback')).toHaveCount(1);await axe(a);
  await expect(a.locator('#worksheet [data-kind="short-answer"] textarea')).toHaveValue('Revised answer');
  const master=(await stored(page))[0];expect(master.blocks).toEqual(original.blocks);expect(master.answers).toEqual(original.answers);
  expect(Object.values(master.returnedWork!.find(r=>r.studentCode==='A'&&r.worksheetVersion!=='different-version')!.answers)).toContain('A question two');
  expect(Object.values(master.returnedWork!.find(r=>r.studentCode==='B')!.answers)).toContain('B question two');
});
