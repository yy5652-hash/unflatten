import { mountWorksheet, download } from './ui/controller';
import { defaults } from './ui/view';
import { migrateWorksheet } from './features/worksheet';
import { answerFilename } from './features/files';
import { standaloneDocument, type StandaloneSeed } from './standalone-document';
const seed = JSON.parse(document.querySelector('#worksheet-data')!.textContent!) as StandaloneSeed;
(globalThis as unknown as {unflattenResources:Record<string,unknown>}).unflattenResources=seed.resources;
let doc=seed.doc;
const p={...defaults,...seed.p}, key=`unflatten-export-${seed.instance}`, tempKey=key+'-temporary';
let temporary=false, hadSaved=false;
try {
  const session=JSON.parse(sessionStorage.getItem(tempKey)||'null');
  const saved=JSON.parse(localStorage.getItem(key)||'null'); hadSaved=!!saved;
  if(session?.id===doc.id) {doc=session;temporary=true;}
  else if(saved?.id===doc.id && saved.updated>doc.updated) doc=saved;
} catch {}
doc=migrateWorksheet(doc); doc.studentCopy=true; doc.attemptId ??= crypto.randomUUID();
const root=document.querySelector<HTMLElement>('#main')!;
const unmount=mountWorksheet(root,doc,p,{
  standalone:true, temporary,
  save:()=>{ (temporary?sessionStorage:localStorage).setItem(temporary?tempKey:key,JSON.stringify(doc)); },
  sessionMode:async value=>{
    temporary=value;
    if(value) {if(!hadSaved) localStorage.removeItem(key); doc.attemptId=crypto.randomUUID();}
    else sessionStorage.removeItem(tempKey);
  },
  endSession:()=>{
    sessionStorage.removeItem(tempKey); unmount();
    root.innerHTML='<section><h1>Session ended</h1><p>Temporary work cleared. Close this file before the next student starts.</p></section>';
    // Clear the in-memory work and embedded answer data too. A later reopening of the downloaded file is a separate copy.
    doc.answers={}; delete doc.studentCode; delete doc.feedback; delete doc.attemptId;
    document.querySelector('#worksheet-data')!.textContent='';
  },
  preferences:()=>{},
  html:async(copy,filename)=>{
    const html=standaloneDocument({...seed,doc:copy,p,instance:crypto.randomUUID()},document.querySelector('#worksheet-style')!.textContent!,document.querySelector('#worksheet-runtime')!.textContent!);
    download(filename||answerFilename(copy),html,'text/html;charset=utf-8');
  },
});
