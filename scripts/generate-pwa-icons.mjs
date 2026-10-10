/* Dependency-free brand-icon PNG generator (192, 512, maskable and iOS). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const shield = [[13,25],[32,14],[51,25],[51,40],[32,51],[13,40],[13,25]];
const check = [[23,33],[30,40],[43,25]];
function distance(x,y,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
}
function onStroke(x,y,points,width) {
  for(let i=1;i<points.length;i++) if(distance(x,y,points[i-1],points[i]) <= width/2)return true;
  return false;
}
function inRoundedRect(x,y) {
  const cx=Math.max(18,Math.min(46,x)),cy=Math.max(18,Math.min(46,y));
  return (x-cx)**2+(y-cy)**2<=18**2;
}
function sample(x,y,maskable) {
  if (!maskable && !inRoundedRect(x,y)) return [0,0,0,0];
  const scale=maskable?0.79:1;
  const sx=(x-32)/scale+32,sy=(y-32)/scale+32;
  if(onStroke(sx,sy,check,5)) return [255,255,255,255];
  if(onStroke(sx,sy,shield,5)) return [99,225,192,255];
  return [20,36,59,255];
}
function crc32(buf) {
  let value=0xffffffff;
  for(const byte of buf) {
    value^=byte;
    for(let i=0;i<8;i++) value=(value>>>1)^(-(value&1)&0xedb88320);
  }
  return (value^0xffffffff)>>>0;
}
function chunk(name,data) {
  const size=Buffer.alloc(4);size.writeUInt32BE(data.length);
  const type=Buffer.from(name);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  return Buffer.concat([size,type,data,crc]);
}
function makePNG(size,maskable=false) {
  const rows=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++) {
    const start=y*(size*4+1);rows[start]=0;
    for(let x=0;x<size;x++) {
      const channels=[0,0,0,0];
      for(const oy of [0.25,0.75]) for(const ox of [0.25,0.75]) {
        const pixel=sample((x+ox)*64/size,(y+oy)*64/size,maskable);
        for(let c=0;c<4;c++) channels[c]+=pixel[c];
      }
      for(let c=0;c<4;c++) rows[start+1+x*4+c]=Math.round(channels[c]/4);
    }
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
mkdirSync('public/icons',{recursive:true});
for(const [path,size,mask] of [
  ['public/icons/icon-192.png',192,false],
  ['public/icons/icon-512.png',512,false],
  ['public/icons/icon-maskable-512.png',512,true],
  ['public/apple-touch-icon.png',180,false]
]) { writeFileSync(path,makePNG(size,mask)); console.log(path); }
