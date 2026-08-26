const Utils={
  uid:()=>Math.random().toString(36).substr(2,9),
  clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),
  degToRad:d=>d*Math.PI/180,
  radToDeg:r=>r*180/Math.PI,
  hexToHsl:hex=>{
    let r=0,g=0,b=0;
    if(hex.length===4){r=parseInt(hex[1]+hex[1],16);g=parseInt(hex[2]+hex[2],16);b=parseInt(hex[3]+hex[3],16)}
    else{r=parseInt(hex.substr(1,2),16);g=parseInt(hex.substr(3,2),16);b=parseInt(hex.substr(5,2),16)}
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    let h=0,s=0,l=(max+min)/2;
    if(max!==min){
      const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);
      switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break}
      h/=6
    }
    return[h*360,s*100,l*100]
  },
  hslToHex:(h,s,l)=>{
    s/=100;l/=100;
    const k=n=>(n+h/30)%12;
    const a=s*Math.min(l,1-l);
    const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
    const toHex=c=>{const hex=Math.round(c*255).toString(16);return hex.length===1?'0'+hex:hex};
    return'#'+toHex(f(0))+toHex(f(8))+toHex(f(4))
  },
  getMousePos:(canvas,e)=>{const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top}},
  dist:(a,b)=>Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2),
  transformPoint:(pt,m)=>{return{x:m[0]*pt.x+m[2]*pt.y+m[4],y:m[1]*pt.x+m[3]*pt.y+m[5]}},
  getObjectBounds:(obj)=>{
    if(obj.type==='path'&&obj.points){
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      obj.points.forEach(p=>{minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)});
      return{x:minX,y:minY,width:maxX-minX,height:maxY-minY}
    }
    if(obj.type==='line'&&obj.x1!==undefined){
      const minX=Math.min(obj.x1,obj.x2),minY=Math.min(obj.y1,obj.y2),maxX=Math.max(obj.x1,obj.x2),maxY=Math.max(obj.y1,obj.y2);
      return{x:minX,y:minY,width:maxX-minX,height:maxY-minY}
    }
    return{x:obj.x,y:obj.y,width:obj.width||0,height:obj.height||0}
  }
};
