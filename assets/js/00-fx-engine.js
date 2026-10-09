/* Semantropic FX Engine 0.6.0 — lightweight DOM/Web Animations effects. */
(function(){
  const reduced=()=>window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function layer(){let el=document.querySelector('.sem-fx-layer');if(!el){el=document.createElement('div');el.className='sem-fx-layer';document.body.appendChild(el)}return el}
  function burst(kind='good',opts={}){
    if(reduced())return;
    const root=layer(),count=Math.max(6,Math.min(28,Number(opts.count||12)));
    const rect=opts.from&&opts.from.getBoundingClientRect?opts.from.getBoundingClientRect():null;
    const cx=rect?rect.left+rect.width/2:window.innerWidth/2,cy=rect?rect.top+rect.height/2:window.innerHeight/2;
    for(let i=0;i<count;i++){
      const p=document.createElement('i');p.className='sem-fx-particle '+kind;p.style.left=cx+'px';p.style.top=cy+'px';root.appendChild(p);
      const angle=(Math.PI*2*i/count)+(Math.random()-.5)*.35,dist=42+Math.random()*78,dx=Math.cos(angle)*dist,dy=Math.sin(angle)*dist;
      p.animate([{transform:'translate(-50%,-50%) scale(.45)',opacity:0},{offset:.18,transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.2)`,opacity:0}],{duration:520+Math.random()*280,easing:'cubic-bezier(.2,.7,.2,1)'}).finished.finally(()=>p.remove());
    }
  }
  function ring(kind='power',from=null){if(reduced())return;const r=document.createElement('i');r.className='sem-fx-ring';r.style.color=kind==='bad'?'#ff6f87':kind==='win'?'#ffe486':kind==='coin'?'#ffd166':'#6fe4ff';if(from?.getBoundingClientRect){const b=from.getBoundingClientRect();r.style.left=(b.left+b.width/2)+'px';r.style.top=(b.top+b.height/2)+'px'}document.body.appendChild(r);r.animate([{transform:'translate(-50%,-50%) scale(.35)',opacity:.9},{transform:'translate(-50%,-50%) scale(1.8)',opacity:0}],{duration:500,easing:'ease-out'}).finished.finally(()=>r.remove())}
  window.SemantropicFX={burst,ring};
})();
