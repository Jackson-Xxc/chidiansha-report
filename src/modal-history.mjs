// One same-URL history entry protects the open dialog stack. No entry is
// retained when the last dialog closes, so ordinary page navigation still works.
export function createModalHistory(win){
 const key='chidianshaModal',token=win.crypto.randomUUID();
 const layers=[];
 let armed=false,returning=false,scheduled=false;
 const ownsEntry=()=>win.history.state?.[key]===token;
 function reconcile(){
  scheduled=false;
  if(returning)return;
  if(layers.length){
   if(!ownsEntry())win.history.pushState({...win.history.state,[key]:token},'',win.location.href);
   armed=true;
  }else if(ownsEntry()){
   armed=false;returning=true;win.history.back();
  }else armed=false;
 }
 function schedule(){
  if(!scheduled){scheduled=true;win.queueMicrotask(reconcile);}
 }
 win.addEventListener('popstate',()=>{
  if(returning){returning=false;schedule();return;}
  if(armed&&!ownsEntry()){
   armed=false;
   // The callback unmounts the visible dialog. Remove it now so the effect's
   // later cleanup cannot consume a second history entry.
   const top=layers.pop();
   top?.close();
  }
  schedule();
 });
 return {
  register(close){
   const layer={close};layers.push(layer);schedule();
   return ()=>{
    const index=layers.indexOf(layer);
    if(index!==-1)layers.splice(index,1);
    schedule();
   };
  }
 };
}
