import { createDialKit, createDialRoot } from './vendor/dialkit.js';
import { createWorld } from './composer-world.js';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const stage = $('stage'), frameEl = $('frame');
const STORAGE = 'healthier-compositions-v1';
const actorDefaults = {
  blue: {horizontal:0, vertical:52, size:40},
  green: {horizontal:73.5, vertical:18, size:4.6},
  orange: {horizontal:89, vertical:65, size:10.9}
};
function makeScene(id, name, mode) {
  return {id,name,mode,width:mode==='hero'?1200:1920,height:mode==='hero'?850:1080,scale:100,locked:true,
    actors:clone(actorDefaults),subject:'blue',line1:mode==='iso'?'Headline here.':'A new world',line2:mode==='iso'?'':'of frontier medicine.',
    typeSize:mode==='iso'?5:7.35,space:{x:50,y:50,w:50,h:25},guide:true,paused:false,
    camera:{el:mode==='stage'?.9:Math.atan(1/Math.SQRT2),az:mode==='stage'?1.1:Math.PI/4,zoom:mode==='stage'?1.4:1,tx:0,tz:0},cast:null};
}
let library={active:'frontier',scenes:[makeScene('frontier','Frontier medicine','hero'),makeScene('isometric','Isometric headline','iso'),makeScene('fixed','Fixed stage','stage')]};
let storageIssue=false;
try {
  const saved=JSON.parse(localStorage.getItem(STORAGE));
  if(saved?.scenes?.length && saved.scenes.every(s=>s.id&&s.camera&&s.actors&&s.space&&['hero','iso','stage'].includes(s.mode)))library=saved;
} catch {storageIssue=true;}
for(const scene of library.scenes) {
  if(scene.modelVersion===2)continue;
  if(scene.actors.blue.horizontal===8&&scene.actors.blue.vertical===41&&scene.actors.blue.size===24.5)scene.actors.blue=clone(actorDefaults.blue);
  if(scene.actors.orange.vertical===53.5&&scene.actors.orange.size===10.9)scene.actors.orange=clone(actorDefaults.orange);
  scene.modelVersion=2;
}
let current=library.scenes.find(s=>s.id===library.active)||library.scenes[0];
let world,kit,unsubscribe,syncing=false,drag,loadVersion=0;
createDialRoot({mode:'inline',target:$('dialRoot'),theme:'light'});
function persist() {
  library.active=current.id;
  try {localStorage.setItem(STORAGE,JSON.stringify(library));$('saveStatus').textContent='Saved in this browser';}
  catch {$('saveStatus').textContent='Browser save unavailable — export JSON to keep your work';}
}
const choice=(value,options)=>({type:'select',default:value,options});
const action=label=>({type:'action',label});
function configuration() {
  const a=current.actors[current.subject],s=current.space,c=current.camera;
  const config={composition:choice(current.id,library.scenes.map(s=>({value:s.id,label:s.name||'Untitled composition'}))),name:current.name,saveCopy:action('Save a copy'),exportJSON:action('Export JSON')};
  if(current.mode==='hero')config.character={selected:choice(current.subject,[{value:'blue',label:'Blue square'},{value:'green',label:'Green hexagon'},{value:'orange',label:'Orange star'}]),horizontal:[a.horizontal,-30,130,.1],vertical:[a.vertical,-30,130,.1],size:[a.size,2,48,.1],reset:action('Reset character')};
  if(current.mode!=='stage')config.headline={firstLine:current.line1,secondLine:current.line2,typeSize:[current.typeSize,1,12,.05]};
  if(current.mode==='iso')config.headlineArea={x:[s.x,0,100,.1],y:[s.y,0,100,.1],width:[s.w,10,90,.1],height:[s.h,10,80,.1],showGuide:current.guide};
  if(current.mode!=='hero') {
    config.camera={_collapsed:true,zoom:[c.zoom,.4,3,.01],horizontalPan:[c.tx,-15,15,.5],depthPan:[c.tz,-15,15,.5]};
    if(current.mode==='stage')Object.assign(config.camera,{elevation:[c.el,.05,1.57,.005],azimuth:[c.az,0,6.285,.005]});
    config.playback={paused:current.paused,clearTrails:action('Clear trails')};
    if(current.mode==='stage')Object.assign(config.playback,{clearStage:action('Clear stage'),addCharacters:action('Add characters')});
  }
  config.frame={_collapsed:true,width:[current.width,16,8192,1],height:[current.height,16,8192,1],lockAspectRatio:current.locked,viewScale:[current.scale,10,200,1],preset:choice('custom',['custom','1200x850','1920x1080','1080x1080','1080x1350','1600x900'])};
  return config;
}
function rebuildPanel() {
  unsubscribe?.();kit?.destroy();
  const config=configuration();
  kit=createDialKit('Scene composer',config,{id:'composer-'+current.id,persist:true,onAction:handleAction});
  // Composition saves are authoritative; DialKit also retains its native versions.
  const resolve=config=>Object.fromEntries(Object.entries(config).filter(([key,value])=>!key.startsWith('_')&&value?.type!=='action').map(([key,value])=>[key,Array.isArray(value)?value[0]:value?.type==='select'?value.default:typeof value==='object'?resolve(value):value]));
  kit.setValues(resolve(config));
  unsubscribe=kit.subscribe(applyValues,false);
}
function syncValues(values) {syncing=true;try{kit.setValues(values);}finally{syncing=false;}}
function applyValues(v) {
  if(syncing)return;
  if(v.composition!==current.id) {persist();current=library.scenes.find(s=>s.id===v.composition)||current;queueMicrotask(loadScene);persist();return;}
  current.name=v.name;
  if(v.character && v.character.selected!==current.subject) {current.subject=v.character.selected;const a=current.actors[current.subject];syncValues({character:{horizontal:a.horizontal,vertical:a.vertical,size:a.size}});world?.render();selection();persist();return;}
  if(v.character)for(const key of ['horizontal','vertical','size'])current.actors[current.subject][key]=v.character[key];
  if(v.headline){current.line1=v.headline.firstLine;current.line2=v.headline.secondLine;current.typeSize=v.headline.typeSize;}
  let changedSpace=false;
  if(v.headlineArea){const h=v.headlineArea;changedSpace=current.space.x!==h.x||current.space.y!==h.y||current.space.w!==h.width||current.space.h!==h.height;current.space={x:h.x,y:h.y,w:h.width,h:h.height};current.guide=h.showGuide;normalizeSpace();}
  if(v.camera){Object.assign(current.camera,{zoom:v.camera.zoom,tx:v.camera.horizontalPan,tz:v.camera.depthPan});if(current.mode==='stage')Object.assign(current.camera,{el:v.camera.elevation,az:v.camera.azimuth});}
  if(v.playback)current.paused=v.playback.paused;
  const f=v.frame,ratio=current.width/current.height;
  current.locked=f.lockAspectRatio;current.scale=f.viewScale;
  if(f.preset!=='custom'){[current.width,current.height]=f.preset.split('x').map(Number);syncValues({frame:{width:current.width,height:current.height,preset:'custom'}});}
  else if(f.width!==current.width){current.width=f.width;current.height=current.locked?clamp(Math.round(f.width/ratio),16,8192):f.height;syncValues({frame:{height:current.height}});}
  else if(f.height!==current.height){current.height=f.height;current.width=current.locked?clamp(Math.round(f.height*ratio),16,8192):f.width;syncValues({frame:{width:current.width}});}
  if(changedSpace)world?.clearTrails();
  syncLayout();sizeFrame();persist();
}
function handleAction(path) {
  if(path==='saveCopy'){const copy=clone(current);copy.id=crypto.randomUUID();copy.name=(current.name||'Composition')+' copy';library.scenes.push(copy);current=copy;queueMicrotask(loadScene);}
  if(path==='exportJSON'){const url=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=(current.name.replace(/[^a-z0-9_-]/gi,'-')||'composition')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(path==='character.reset'){current.actors[current.subject]=clone(actorDefaults[current.subject]);syncValues({character:current.actors[current.subject]});world?.render();selection();}
  if(path==='playback.clearTrails')world?.clearTrails();
  if(path==='playback.clearStage')world?.clear();
  if(path==='playback.addCharacters')world?.seed();
  persist();
}
function normalizeSpace(){const s=current.space;s.x=clamp(s.x,s.w/2,100-s.w/2);s.y=clamp(s.y,s.h/2,100-s.h/2);}
function syncLayout() {
  const s=current.space;
  Object.assign($('textSpace').style,{left:s.x-s.w/2+'%',top:s.y-s.h/2+'%',width:s.w+'%',height:s.h+'%'});
  $('headline').firstElementChild.textContent=current.line1;$('headline').lastElementChild.textContent=current.line2;$('headline').style.fontSize=current.typeSize+'cqw';
  $('isoHeadline').textContent=[current.line1,current.line2].filter(Boolean).join('\n');$('isoHeadline').style.fontSize=current.typeSize+'cqw';
  document.body.classList.toggle('guideOn',current.guide);
}
function selection() {
  if(!world||current.mode!=='hero')return;
  const b=world.actorBounds(current.subject);if(!b)return;
  const left=clamp(b.left,0,98),top=clamp(b.top,0,98),right=clamp(b.right,left+2,100),bottom=clamp(b.bottom,top+2,100);
  Object.assign($('selection').style,{left:left+'%',top:top+'%',width:right-left+'%',height:bottom-top+'%'});
}
function sizeFrame() {
  const css=getComputedStyle(stage),padX=parseFloat(css.paddingLeft)+parseFloat(css.paddingRight),padY=parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
  const fit=Math.min((stage.clientWidth-padX)/current.width,(stage.clientHeight-padY)/current.height);
  const k=Math.max(.001,fit)*(document.body.classList.contains('preview')?1:current.scale/100);
  frameEl.style.width=Math.max(1,Math.round(current.width*k))+'px';frameEl.style.height=Math.max(1,Math.round(current.height*k))+'px';
  $('dimensions').textContent=current.width+' × '+current.height;world?.resize();selection();
}
async function loadScene() {
  const version=++loadVersion;world?.stop();document.body.dataset.mode=current.mode;
  $('hero').hidden=current.mode!=='hero';$('textSpace').hidden=current.mode!=='iso';$('selection').hidden=current.mode!=='hero';
  rebuildPanel();syncLayout();sizeFrame();
  $('hint').textContent='Loading the Playground characters…';
  if(!world)try{world=await worldPromise;}catch(e){console.error(e);$('hint').textContent='Could not load the Playground. Check your connection and WebGL support, then reload.';return;}
  if(version!==loadVersion)return;
  world.load();sizeFrame();
  $('hint').textContent=current.mode==='hero'?'Drag a character to move it. Drag its corner to resize.':current.mode==='iso'?'Drag the headline area or its corner. Characters keep clear during playback.':'Click the floor to add a character; drag one to move it.';
}
const worldPromise=createWorld({getState:()=>current,onChange:persist});
$('dialRoot').addEventListener('focusout',event=>{
  if(event.target.getAttribute('aria-label')!=='Name')return;
  current.name=current.name.trim()||'Untitled composition';
  // Refresh the composition menu after a rename without remounting the editor.
  syncing=true;
  try {kit.updateConfig(configuration());kit.setValue('name',current.name);}
  finally {syncing=false;}
  persist();
});
frameEl.onpointerdown=e=>{
  if(document.body.classList.contains('preview')||e.button!==0||!e.isPrimary||!world)return;
  const space=e.target.closest('#textSpace'),resizeActor=e.target.id==='resizeActor';
  const key=current.mode==='hero'?world.pickHero(e):null;
  if(!key&&!resizeActor&&!space)return;
  if(key&&key!==current.subject){current.subject=key;syncValues({character:{selected:key,...current.actors[key]}});selection();}
  drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,actor:clone(current.actors[current.subject]),space:clone(current.space),kind:space?(e.target.id==='resizeSpace'?'resizeSpace':'space'):resizeActor?'resizeActor':'actor'};
  frameEl.setPointerCapture(e.pointerId);e.preventDefault();
};
frameEl.onpointermove=e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  const dx=(e.clientX-drag.x)*100/frameEl.clientWidth,dy=(e.clientY-drag.y)*100/frameEl.clientHeight,a=current.actors[current.subject];
  if(drag.kind==='actor'){a.horizontal=clamp(drag.actor.horizontal+dx,-30,130);a.vertical=clamp(drag.actor.vertical+dy,-30,130);}
  if(drag.kind==='resizeActor')a.size=clamp(drag.actor.size+dx,2,48);
  if(drag.kind==='space'){current.space.x=drag.space.x+dx;current.space.y=drag.space.y+dy;}
  if(drag.kind==='resizeSpace'){current.space.w=clamp(drag.space.w+2*dx,10,90);current.space.h=clamp(drag.space.h+2*dy,10,80);}
  if(drag.kind==='actor'||drag.kind==='resizeActor')syncValues({character:{horizontal:a.horizontal,vertical:a.vertical,size:a.size}});
  else {normalizeSpace();const s=current.space;syncValues({headlineArea:{x:s.x,y:s.y,width:s.w,height:s.h}});world.clearTrails();}
  syncLayout();world.render();selection();persist();
};
frameEl.onlostpointercapture=()=>{drag=null;};
frameEl.onpointerup=e=>{if(drag&&frameEl.hasPointerCapture(e.pointerId))frameEl.releasePointerCapture(e.pointerId);};
let previewTimer;
function showExit(){document.body.classList.add('show-exit');clearTimeout(previewTimer);previewTimer=setTimeout(()=>document.body.classList.remove('show-exit'),1700);}
function preview(on){document.body.classList.toggle('preview',on);if(on){showExit();$('exit').focus({preventScroll:true});$('exit').blur();}else $('preview').focus();sizeFrame();}
$('preview').onclick=()=>preview(true);$('exit').onclick=()=>preview(false);
document.addEventListener('pointermove',()=>{if(document.body.classList.contains('preview'))showExit();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('preview'))preview(false);});
new ResizeObserver(sizeFrame).observe(stage);
await loadScene();if(storageIssue)$('saveStatus').textContent='Could not read previous browser save';else persist();
