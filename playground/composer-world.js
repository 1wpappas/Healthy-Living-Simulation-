// Host the Playground itself: its canvas, renderer, assembled characters,
// simulation, trail settings and phrase layer all remain the source of truth.
export async function createWorld({getState,onChange}) {
  const iframe=document.createElement('iframe');iframe.id='sourceWorld';iframe.title='Playground source';iframe.tabIndex=-1;iframe.setAttribute('aria-hidden','true');
  const ready=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Playground source timed out')),30000);
    iframe.onload=()=>{clearTimeout(timeout);const api=iframe.contentWindow.__composerSource;api?resolve(api):reject(new Error('Playground source did not initialize'));};
    iframe.onerror=()=>{clearTimeout(timeout);reject(new Error('Playground source could not load'));};
  });
  iframe.src='./index.html?composerSource=1&preset=sketch&world=flat-grid';document.body.append(iframe);
  const source=await ready,{THREE,scene,camera,canvas,labels}=source;
  const frame=document.getElementById('frame');
  document.getElementById('cv').replaceWith(canvas);canvas.id='cv';canvas.setAttribute('aria-label','Composition using the Playground renderer');
  labels.id='composerLabels';frame.append(labels);
  const V3=THREE.Vector3,zero=new V3(),ray=new THREE.Raycaster(),plane=new THREE.Plane(new V3(0,1,0),0);
  const keys=['green','orange','mint','blue','red'];
  let fixed=[],heroActors={},raf=0,previous=0,time=0,dragGuy,viewportKey='';
  function attach(key) {
    const g=source.createCharacter(key);g.pos.set(0,0,0);
    g.conePose(1/60,0,0,zero,g.phase,zero);
    g.shadow.position.set(0,.006,0);
    const group=new THREE.Group();group.add(g.body,g.head,g.shadow);scene.add(group);
    return {g,group};
  }
  function dispose(actor) {
    actor.group.removeFromParent();
    actor.g.eyes.forEach(eye=>eye.geometry.dispose());actor.g.oldMats.forEach(m=>m.dispose());actor.g.shadow.material.dispose();
  }
  function projectedBox(object) {
    const box=new THREE.Box3().setFromObject(object),points=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(screen(new V3(x,y,z)));
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  }
  function screen(p) {const v=p.clone().project(camera),[x,y]=source.project(v.x,v.y);return {x:(x+1)*50,y:(1-y)*50};}
  function point(x,y) {const [nx,ny]=source.unproject(x/50-1,1-y/50);ray.setFromCamera(new THREE.Vector2(nx,ny),camera);return ray.ray.intersectPlane(plane,new V3());}
  function layoutHero() {
    const s=getState();
    for(const [key,actor] of Object.entries(heroActors)) {
      const a=s.actors[key];actor.group.position.set(0,0,0);actor.group.scale.setScalar(1);actor.group.updateMatrixWorld(true);
      const headBox=projectedBox(actor.g.head);
      const scale=a.size/Math.max(.01,headBox.right-headBox.left);
      // Scale the complete assembled character once. Never stretch or separate parts.
      actor.group.scale.setScalar(scale);actor.group.updateMatrixWorld(true);
      const headCenter=new THREE.Box3().setFromObject(actor.g.head).getCenter(new V3());
      // Solve a ground-plane translation so the intact head lands on the art-directed point.
      const target=point(a.horizontal,a.vertical),headGround=point(screen(headCenter).x,screen(headCenter).y);
      if(target&&headGround)actor.group.position.copy(target).sub(headGround);
      actor.group.updateMatrixWorld(true);
    }
  }
  function allowed(x,z,r) {
    const s=getState();if(s.mode!=='iso')return true;
    const base=screen(new V3(x,0,z)),top=screen(new V3(x,r*2.5,z));
    const padding=100*r/(camera.right-camera.left)*camera.zoom+1.5,a=s.space;
    // This predicate plugs into the original spawn and route planner. The full
    // head/body envelope clears the screen-aligned area, including its margins.
    return base.x+padding<a.x-a.w/2||base.x-padding>a.x+a.w/2||base.y+padding<a.y-a.h/2||top.y-padding>a.y+a.h/2;
  }
  function resize() {
    const s=getState(),w=Math.max(1,frame.clientWidth),h=Math.max(1,frame.clientHeight);
    const c=s.mode==='hero'?{el:Math.atan(1/Math.SQRT2),az:Math.PI/4,zoom:1,tx:0,tz:0}:s.camera;
    source.resize(w,h,c);
    const next=JSON.stringify([w/h,c,s.space]);
    if(s.mode==='iso'&&viewportKey&&viewportKey!==next)source.constrain();
    viewportKey=next;render();
  }
  function snapshot() {if(getState().mode==='stage'){getState().cast=fixed.map(a=>({key:a.g.ch.key,x:a.g.pos.x,z:a.g.pos.z}));onChange();}}
  function clearTrails(){source.clearTrails();if(getState().mode==='iso')source.constrain();}
  function clear(){fixed.forEach(dispose);fixed=[];snapshot();}
  function add(key,x,z) {const actor=attach(key);actor.g.pos.set(x,0,z);fixed.push(actor);return actor;}
  function seed(){for(let i=0;i<4&&fixed.length<24;i++)add(keys[fixed.length%5],(i-1.5)*2,(i%2-.5)*3);snapshot();}
  function pose(actor,dt) {const g=actor.g;g.conePose(dt,time,0,zero,time+g.phase,zero);g.shadow.position.set(g.pos.x,.006,g.pos.z);}
  function render() {if(getState().mode==='hero')layoutHero();source.render(frame);}
  function tick(now) {
    raf=requestAnimationFrame(tick);const dt=Math.min(.05,(now-previous)/1000||1/60);previous=now;
    const s=getState();
    if(!s.paused){time+=dt;if(s.mode==='iso')source.advance(dt);else if(s.mode==='stage')fixed.forEach(a=>pose(a,dt));}
    render();
  }
  function stop(){cancelAnimationFrame(raf);}
  function load() {
    stop();fixed.forEach(dispose);fixed=[];Object.values(heroActors).forEach(dispose);heroActors={};
    const s=getState();source.setMode(s.mode,allowed);viewportKey='';resize();
    if(s.mode==='hero')for(const key of ['blue','green','orange'])heroActors[key]=attach(key);
    else if(s.mode==='iso') {
      source.resetSimulation();source.constrain();
      // Same warm-up as the Playground, with the headline constraint already active.
      for(let n=0;n<240;n++)source.advance(1/60);
    } else {
      if(s.cast)for(const item of s.cast)add(item.key,item.x,item.z);else seed();
      fixed.forEach(a=>pose(a,1/60));
    }
    resize();previous=performance.now();raf=requestAnimationFrame(tick);
  }
  function actorBounds(key) {const a=heroActors[key];return a?projectedBox(a.group):null;}
  function pointerRay(e){const r=canvas.getBoundingClientRect(),[x,y]=source.unproject((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(new THREE.Vector2(x,y),camera);}
  function pickHero(e){pointerRay(e);let best=null,distance=Infinity;for(const [key,a]of Object.entries(heroActors)){const hit=ray.intersectObjects([a.g.body,a.g.head],true)[0];if(hit&&hit.distance<distance){best=key;distance=hit.distance;}}return best;}
  canvas.onpointerdown=e=>{
    if(getState().mode!=='stage'||e.button!==0||document.body.classList.contains('preview'))return;
    pointerRay(e);const hit=ray.intersectObjects(fixed.flatMap(a=>[a.g.body,a.g.head]),true)[0];
    if(hit)dragGuy=fixed.find(a=>{let p=hit.object;while(p){if(p===a.group)return true;p=p.parent;}return false;});
    else {const p=ray.ray.intersectPlane(plane,new V3());if(p&&fixed.length<24){add(keys[fixed.length%5],p.x,p.z);snapshot();}}
    if(dragGuy)canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{if(!dragGuy)return;pointerRay(e);const p=ray.ray.intersectPlane(plane,new V3());if(p){dragGuy.g.pos.copy(p);pose(dragGuy,1/60);snapshot();}};
  canvas.onpointerup=e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);dragGuy=null;};canvas.onlostpointercapture=()=>{dragGuy=null;};
  // Read-only facts for the visible diagnostics: this is the live source renderer.
  return {load,stop,resize,render,clear,seed,clearTrails,pickHero,actorBounds,sourceSettings:source.settings};
}
