import { expect, it } from 'vitest';
import type { Worksheet } from '../src/parse/types';
import { studentWorksheet, masterFile, importWorksheet, duplicateWorksheet, returnFile, importReturns, applyFeedback, worksheetVersion, readReturn, validateWorksheet, MAX_FILE_BYTES } from '../src/features/files';
import { standaloneDocument } from '../src/standalone-document';
import { defaults } from '../src/ui/view';
import { deleteBlock, undoAffectedEdit } from '../src/features/review';
import { fromText } from '../src/parse/input';
import { renameWorksheet } from '../src/features/worksheet';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/6kAAAAASUVORK5CYII=';
function sheet(): Worksheet {return {
  id:'teacher',name:'Lesson',language:'en',updated:100,answers:{'q-0':'teacher answer'},
  original:{source:'image',characters:0,headings:0,fields:0,pages:1,tagged:null},
  previews:[{page:1,width:100,height:200,image:png}],
  blocks:[{id:'q',kind:'fill-blank',text:'1. Write ____.',page:1,key:{'q-0':['SECRET_KEY_912']},hint:'SECRET_HINT',lines:[{text:'1. Write ____.',x:10,y:10,width:50,height:20,page:1,pageWidth:100,pageHeight:200,confidence:50,blanks:[{x:30,y:10,width:20,height:20}],glyph:{x:10,y:10,width:5,height:5}}]},
    {id:'q2',kind:'short-answer',text:'2. Explain.',page:1,lines:[],key:{q2:['SECOND_KEY']}},
    {id:'fig',kind:'figure',text:'A figure',page:1,lines:[],image:png,figureDescription:'An arrow points up.'}],
  teacherSettings:{purpose:'assignment',selfCheck:['q']},
};}
it('assignment contains only blank student content, no keys, hints, recovery or teacher returns',async()=>{
  const doc=sheet(); doc.returnedWork=[{id:'private',worksheetVersion:'old',studentCode:'PRIVATE',answers:{'q-0':'PRIVATE'},comments:{q:'SECRET_COMMENT'},overall:'PRIVATE'}];
  doc.feedback={comments:{q:'SECRET_COMMENT'},overall:'PRIVATE'};
  const before=JSON.stringify(doc), copy=await studentWorksheet(doc), raw=JSON.stringify(copy);
  expect(raw).not.toMatch(/SECRET|PRIVATE|SECOND_KEY|teacher answer|"key"|"feedback"|"returnedWork"/);
  expect(copy.previews).toEqual(doc.previews);expect(copy.blocks[2].figureDescription).toBe('An arrow points up.');
  expect(JSON.stringify(doc)).toBe(before);
  doc.teacherSettings!.purpose='practice';
  const practice=await studentWorksheet(doc);expect(practice.blocks[0].key).toEqual(doc.blocks[0].key);expect(practice.blocks[1].key).toBeUndefined();
});
it('versioned master and own HTML round trip preserve keys, settings, content and original geometry',()=>{
  const doc=sheet(); const imported=importWorksheet(masterFile(doc));
  expect(imported.id).not.toBe(doc.id);expect(imported.blocks).toEqual(doc.blocks);expect(imported.previews).toEqual(doc.previews);expect(imported.teacherSettings).toEqual(doc.teacherSettings);
  const html=standaloneDocument({doc,p:defaults,instance:'test',resources:{},licence:''},'', 'throw Error("must never execute")');
  expect(importWorksheet(html,true).blocks).toEqual(doc.blocks);
  const copy=duplicateWorksheet(doc);copy.blocks[0].text='changed';copy.previews![0].width=90;
  expect(doc.blocks[0].text).toBe('1. Write ____.');expect(doc.previews![0].width).toBe(100);expect(copy.answers).toEqual({});
});
it('master import and duplication keep every source line exactly once',async()=>{
  const doc=await fromText('Class lesson\n1. Plants need ____.\n2. Explain why.\n____','en');
  // The pasted title and question 2 already have lines; prepare() replaces only question 1's line.
  expect(doc.blocks.map(b=>({kind:b.kind,lines:b.lines.map(l=>l.text)}))).toEqual([
    {kind:'title',lines:['Class lesson']},
    {kind:'fill-blank',lines:['1. Plants need ____.']},
    {kind:'short-answer',lines:['2. Explain why.']},
  ]);
  const before=structuredClone(doc.blocks);
  const restored=importWorksheet(masterFile(doc)), copy=duplicateWorksheet(restored);
  expect(restored.blocks).toEqual(before);expect(copy.blocks).toEqual(before);
});
it('class duplicate owns every nested field, including geometry, keys and newly entered answers/comments',()=>{
  const original=sheet();
  const block=original.blocks[0], line=block.lines[0];
  original.blocks.unshift({id:'title',kind:'title',text:'Lesson',page:1,lines:[]});
  block.options=['First','Second'];block.pairs=['Left','Right'];block.cells=[['Heading'],['Cell']];
  block.figureText='Figure text';
  Object.assign(line,{
    reviewed:true,crop:png,fontSize:12,checkbox:true,
    optionBoxes:[{text:'First',box:{x:1,y:2,width:3,height:4},letter:{x:5,y:6,width:7,height:8}}],
    cellBoxes:[[{x:9,y:10,width:11,height:12}]],
  });
  original.feedback={comments:{q:'Original feedback'},overall:'Original overall'};
  original.returnedWork=[{id:'return',worksheetVersion:'version',studentCode:'A',answers:{'q-0':'Original student answer'},comments:{q:'Original comment'},overall:'Original return'}];
  original.editNotes=[{id:'note',blockId:'q',text:'Recovery',answers:{'q-0':'Recovered answer'},before:[structuredClone(block)],afterIds:['q'],index:1}];
  original.shareId='shared';original.studentCode='A';original.attemptId='attempt';
  const before=structuredClone(original), copy=duplicateWorksheet(original);
  expect(copy.id).not.toBe(original.id);
  expect(copy.blocks).toEqual(original.blocks);expect(copy.previews).toEqual(original.previews);
  expect(copy.original).toEqual(original.original);expect(copy.teacherSettings).toEqual(original.teacherSettings);
  // Another class starts blank; prior students' answers, feedback and recovery
  // notes are deliberately omitted, rather than carried into the new class.
  expect(copy.answers).toEqual({});
  for(const field of ['shareId','returnedWork','feedback','editNotes','studentCode','attemptId'] as const) expect(copy[field]).toBeUndefined();
  renameWorksheet(copy,'Different class');
  expect(copy.name).toBe('Different class');expect(copy.blocks).toEqual(before.blocks);
  expect(original).toEqual(before);
  // Populate cleared maps with the same keys, then mutate all their leaves too.
  copy.answers['q-0']='New class answer';
  copy.feedback={comments:{q:'New feedback'},overall:'New overall'};
  copy.returnedWork=[{id:'return',worksheetVersion:'version',studentCode:'B',answers:{'q-0':'New student answer'},comments:{q:'New comment'},overall:'New return'}];
  copy.editNotes=[{id:'note',blockId:'q',text:'New recovery',answers:{'q-0':'New recovered answer'},before:[structuredClone(copy.blocks[1])],afterIds:['q'],index:1}];
  // Walk every object/array, changing every primitive leaf and array structure.
  // This covers all nested fields in the fixture, not just selected examples.
  function mutateEveryField(value: unknown): unknown {
    if(Array.isArray(value)) {
      value.forEach((item,index)=>{value[index]=mutateEveryField(item);});
      value.push('new item');
    } else if(value!==null && typeof value==='object') {
      const record=value as Record<string,unknown>;
      for(const key of Object.keys(record)) record[key]=mutateEveryField(record[key]);
    } else if(typeof value==='string') return value+' changed';
    else if(typeof value==='number') return value+1;
    else if(typeof value==='boolean') return !value;
    else return true;
    expect(original).toEqual(before);
    return value;
  }
  mutateEveryField(copy);
  expect(original).toEqual(before);
});
it('renaming either worksheet only changes its library name, never source title text or lines',()=>{
  const original=sheet();
  original.blocks.unshift({id:'title',kind:'title',text:'Printed lesson',page:1,lines:[{...structuredClone(original.blocks[0].lines[0]),text:'Printed lesson'}]});
  const before=structuredClone(original), copy=duplicateWorksheet(original), copyBefore=structuredClone(copy);
  renameWorksheet(copy,'Different class');
  expect(copy).toEqual({...copyBefore,name:'Different class'});expect(original).toEqual(before);
  renameWorksheet(original,'Teacher master');
  expect(original).toEqual({...before,name:'Teacher master'});expect(copy).toEqual({...copyBefore,name:'Different class'});
});
it('rejects format, size, duplicate ids, nonfinite geometry, remote images, wrong fields and scripts posing as data',()=>{
  const doc=sheet();
  for(const mutate of [
    (d:Worksheet)=>{d.blocks.push(structuredClone(d.blocks[0]));},
    (d:Worksheet)=>{d.blocks[0].lines[0].width=-1;},
    (d:Worksheet)=>{d.previews![0].image='https://example.com/a.png';},
    (d:Worksheet)=>{d.answers.bad='stray';},
    (d:Worksheet)=>{d.blocks[0].key={no_field:['bad']};},
    (d:Worksheet)=>{d.previews![0].width=0;},
  ]) {const invalid=structuredClone(doc);mutate(invalid);expect(()=>importWorksheet(masterFile(invalid))).toThrow();}
  expect(()=>validateWorksheet({...doc,language:'constructor'})).toThrow();
  expect(()=>importWorksheet('{"format":"unflatten","version":2}')).toThrow(/version/);
  expect(()=>importWorksheet('x'.repeat(MAX_FILE_BYTES+1))).toThrow(/40 MB/);
  expect(()=>importWorksheet('<script id="worksheet-data">alert(1)</script>',true)).toThrow();
  expect(()=>importWorksheet('{')).toThrow(/JSON/);
});
it('two returns, deduplication, version flags, comments and revisions never overwrite master or student answers',async()=>{
  const master=sheet(), masterBefore=JSON.stringify(master.blocks), first=await studentWorksheet(master), second=await studentWorksheet(master);
  first.attemptId='attempt-a';first.studentCode='A';first.answers={'q-0':'a',q2:'answer two A'};
  second.attemptId='attempt-b';second.studentCode='B';second.answers={'q-0':'b',q2:'answer two B'};
  const a=await returnFile(first), b=await returnFile(second), text=(v:unknown)=>JSON.stringify(v);
  expect(await importReturns(master,[text(a),text(b)])).toBe(2);
  expect(await importReturns(master,[text(a)])).toBe(0);expect(master.returnedWork).toHaveLength(2);
  master.returnedWork![0].comments.q2='Please expand question 2.';master.returnedWork![0].overall='Good start.';
  const feedback={format:'unflatten-feedback',version:1,work:master.returnedWork![0]};
  first.answers.q2='student revision';await applyFeedback(first,text(feedback));
  expect(first.answers.q2).toBe('student revision');expect(first.feedback?.comments.q2).toBe('Please expand question 2.');
  expect(master.returnedWork![0].answers.q2).toBe('answer two A');expect(master.returnedWork![1].answers.q2).toBe('answer two B');
  expect(JSON.stringify(master.blocks)).toBe(masterBefore);expect(master.answers['q-0']).toBe('teacher answer');
  await expect(applyFeedback(second,text(feedback))).rejects.toThrow(/different student/);
  master.blocks[0].text+=' New version';expect(await worksheetVersion(master)).not.toBe(a.work.worksheetVersion);
  const wrong=await returnFile(first); wrong.work.id='old-version-attempt';wrong.work.worksheetVersion='different-version';
  await importReturns(master,[text(wrong)]);expect(master.returnedWork!.at(-1)!.worksheetVersion).toBe('different-version');
  const before=JSON.stringify(master.returnedWork);
  await expect(importReturns(master,[text(a),'broken'])).rejects.toThrow();expect(JSON.stringify(master.returnedWork)).toBe(before);
  expect(()=>readReturn(text({...a,work:{...a.work,answers:{__proto__:'bad',nonexistent:3}}}))).toThrow();
});

it('master import preserves v3.2-A recoverable answers after a structural edit',()=>{
  const doc=sheet();deleteBlock(doc,'q');
  expect(doc.editNotes?.[0].answers['q-0']).toBe('teacher answer');
  const restored=importWorksheet(masterFile(doc));
  expect(restored.editNotes).toEqual(doc.editNotes);
  undoAffectedEdit(restored,restored.editNotes![0].id);
  expect(restored.answers['q-0']).toBe('teacher answer');
  expect(restored.blocks.find(b=>b.id==='q')?.key).toEqual({'q-0':['SECRET_KEY_912']});
});
